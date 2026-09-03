// Generates the 90-day synthetic demo dataset for ReproTwin.
// Run with: npx tsx scripts/generate-data.ts
// Output: data/trips.json, data/physiology.json, data/hotspots.json
//
// The demo rider is a general urban motorcycle commuter (not a delivery
// worker): two daily commute windows (AM + PM peak) plus an occasional
// midday errand trip, rather than one long evening shift.

import fs from "node:fs";
import path from "node:path";
import { mulberry32, seededGaussian, seededRandomRange } from "../lib/rng";
import { BASE_ROUTES } from "../lib/baseRoutes";
import { resampleRoute } from "../lib/geo";
import {
  inferTrafficLevel,
  sampleWeather,
  samplePollutants,
} from "../lib/environment";
import { segmentDose, sumExposure, classifyTripExposure } from "../lib/exposure";
import { RIDER, DATASET_DAYS } from "../lib/constants";
import { nearestLandmarkLabel } from "../lib/landmarks";
import type {
  Trip,
  TripSegment,
  HealthRecord,
  Hotspot,
  GPSPoint,
} from "../lib/types";

const SEED = 20260902;
const rng = mulberry32(SEED);

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isoAt(date: Date, hourFloat: number): string {
  const d = new Date(date);
  const h = Math.floor(hourFloat);
  const m = Math.round((hourFloat - h) * 60);
  d.setUTCHours(h, m, 0, 0);
  return d.toISOString();
}

// --- Build the 90-day date list (ending today, local "today" treated as UTC
// for simplicity in a demo dataset) ---
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const days: Date[] = [];
for (let i = DATASET_DAYS - 1; i >= 0; i--) {
  const d = new Date(today);
  d.setUTCDate(d.getUTCDate() - i);
  days.push(d);
}

interface TripPlan {
  startHour: number;
  durationMin: number;
}

// Splits a target total riding time across 1-2 trips within a time window
// (e.g. the AM or PM commute peak), leaving small gaps between trips.
function planWindowTrips(
  windowStart: number,
  windowEnd: number,
  totalMinRange: [number, number],
  tripCountRange: [number, number]
): TripPlan[] {
  const totalMinutes = seededRandomRange(rng, totalMinRange[0], totalMinRange[1]);
  const nTrips =
    tripCountRange[0] +
    Math.floor(rng() * (tripCountRange[1] - tripCountRange[0] + 1));
  const weights = Array.from({ length: nTrips }, () => rng() + 0.35);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const durations = weights.map((w) => (w / wSum) * totalMinutes);

  const span = windowEnd - windowStart;
  let cursor = windowStart + seededRandomRange(rng, 0, Math.max(0, span * 0.15));
  const plans: TripPlan[] = [];

  for (const durationMin of durations) {
    if (cursor >= windowEnd - 0.05) break;
    const startHour = Math.min(cursor, windowEnd - 0.05);
    const endHour = Math.min(startHour + durationMin / 60, windowEnd);
    const actualDurationMin = (endHour - startHour) * 60;
    if (actualDurationMin < 4) break;
    plans.push({ startHour, durationMin: actualDurationMin });
    cursor = endHour + seededRandomRange(rng, 3, 10) / 60;
  }
  return plans;
}

function buildTrip(day: Date, dateStr: string, plan: TripPlan, tripIndex: number): Trip {
  const startHour = plan.startHour;
  const endHour = Math.min(startHour + plan.durationMin / 60, 23.9);
  const actualDurationMin = (endHour - startHour) * 60;

  const base = BASE_ROUTES[Math.floor(rng() * BASE_ROUTES.length)];
  const reversed = rng() < 0.5;
  const waypointDefs = reversed ? [...base.waypoints].reverse() : base.waypoints;

  const pointCount = Math.max(8, Math.min(28, Math.round(actualDurationMin / 2)));
  const resampled = resampleRoute(waypointDefs, pointCount);
  const distanceKm = resampled[resampled.length - 1]?.cumulativeKm ?? base.distanceKm;
  const avgSpeed = distanceKm / (actualDurationMin / 60);

  const weather = sampleWeather(startHour + (endHour - startHour) / 2, rng);
  const segments: TripSegment[] = [];
  const waypoints: GPSPoint[] = [];

  const segDurationHours = actualDurationMin / 60 / (resampled.length - 1 || 1);

  for (let pi = 0; pi < resampled.length; pi++) {
    const p = resampled[pi];
    const frac = pi / (resampled.length - 1 || 1);
    const hourNow = startHour + frac * (endHour - startHour);
    const timestamp = isoAt(day, hourNow);
    const trafficLevel = inferTrafficLevel(hourNow, p.roadType, rng);
    const { pm25, pm10, no2 } = samplePollutants(
      hourNow,
      p.roadType,
      trafficLevel,
      weather.wind_speed,
      rng
    );
    const speed = Math.max(4, avgSpeed + seededGaussian(rng, 0, 4));

    const point: GPSPoint = {
      timestamp,
      latitude: Math.round(p.lat * 1e5) / 1e5,
      longitude: Math.round(p.lng * 1e5) / 1e5,
      speed: Math.round(speed * 10) / 10,
    };
    waypoints.push(point);

    const dose = segmentDose(pm25, segDurationHours);
    segments.push({
      point,
      env: {
        timestamp,
        latitude: point.latitude,
        longitude: point.longitude,
        pm25,
        pm10,
        no2,
        temperature: weather.temperature,
        humidity: weather.humidity,
        wind_speed: weather.wind_speed,
        traffic_level: trafficLevel,
        road_type: p.roadType,
      },
      durationHours: segDurationHours,
      exposure: Math.round(dose * 100) / 100,
    });
  }

  const exposure = sumExposure(segments.map((s) => s.exposure));
  const avgPm25 = segments.reduce((s, seg) => s + seg.env.pm25, 0) / segments.length;
  const avgPm10 = segments.reduce((s, seg) => s + seg.env.pm10, 0) / segments.length;
  const avgNo2 = segments.reduce((s, seg) => s + seg.env.no2, 0) / segments.length;
  const avgHr = Math.round(108 + avgSpeed * 0.6 + seededGaussian(rng, 0, 6));

  return {
    id: `T${dateStr.replace(/-/g, "")}${String(tripIndex).padStart(2, "0")}`,
    date: dateStr,
    routeName: reversed ? `${base.destination} → ${base.origin}` : base.name,
    startTime: isoAt(day, startHour),
    endTime: isoAt(day, endHour),
    durationMin: Math.round(actualDurationMin),
    distanceKm: Math.round(distanceKm * 10) / 10,
    avgSpeed: Math.round(avgSpeed * 10) / 10,
    avgPm25: Math.round(avgPm25 * 10) / 10,
    avgPm10: Math.round(avgPm10 * 10) / 10,
    avgNo2: Math.round(avgNo2 * 10) / 10,
    avgHr,
    exposure: Math.round(exposure * 10) / 10,
    exposureLevel: classifyTripExposure(exposure),
    waypoints,
    segments,
  };
}

// --- Generate trips: AM commute + PM commute + occasional midday errand ---
const trips: Trip[] = [];
const ridingHoursByDate: Record<string, number> = {};

for (const day of days) {
  const dateStr = toDateStr(day);
  const isWorkingDay = day.getUTCDay() !== RIDER.restDayOfWeek;

  if (!isWorkingDay) {
    ridingHoursByDate[dateStr] = 0;
    continue;
  }

  const plans: TripPlan[] = [
    ...planWindowTrips(6.83, 9.5, [40, 75], [1, 2]), // AM peak, ~06:50-09:30
    ...planWindowTrips(16.75, 20.5, [55, 95], [1, 2]), // PM peak, ~16:45-20:30
  ];
  if (rng() < 0.4) {
    plans.push(...planWindowTrips(11, 15, [15, 30], [1, 1])); // occasional midday errand
  }
  plans.sort((a, b) => a.startHour - b.startHour);

  let tripIndex = 0;
  for (const plan of plans) {
    tripIndex++;
    trips.push(buildTrip(day, dateStr, plan, tripIndex));
  }

  const dayTotalMin = trips
    .filter((t) => t.date === dateStr)
    .reduce((s, t) => s + t.durationMin, 0);
  ridingHoursByDate[dateStr] = Math.round((dayTotalMin / 60) * 100) / 100;
}

// --- Generate physiology (90 days), correlated with previous day's riding ---
const physiology: HealthRecord[] = [];
let prevRestingNoise = 0;
let prevHrvNoise = 0;
let prevSleepNoise = 0;

for (let i = 0; i < days.length; i++) {
  const day = days[i];
  const dateStr = toDateStr(day);
  const ridingHours = ridingHoursByDate[dateStr] ?? 0;
  const prevRidingHours =
    i > 0 ? ridingHoursByDate[toDateStr(days[i - 1])] ?? 0 : RIDER.avgRidingHoursPerDay;
  const isRestDay = day.getUTCDay() === RIDER.restDayOfWeek;

  // Slow drift across the 90-day window: mild cumulative-fatigue trend.
  const trend = i / days.length; // 0 -> 1

  const exertionEffect = prevRidingHours - RIDER.avgRidingHoursPerDay; // + means more riding than avg

  const restingNoise = 0.55 * prevRestingNoise + seededGaussian(rng, 0, 1.1);
  const hrvNoise = 0.55 * prevHrvNoise + seededGaussian(rng, 0, 2.2);
  const sleepNoise = 0.5 * prevSleepNoise + seededGaussian(rng, 0, 0.35);
  prevRestingNoise = restingNoise;
  prevHrvNoise = hrvNoise;
  prevSleepNoise = sleepNoise;

  const resting_hr = clamp(
    60 + 2.2 * trend + 0.8 * exertionEffect + restingNoise - (isRestDay ? 1.2 : 0),
    52,
    74
  );
  const hrv = clamp(
    56 - 5 * trend - 2 * exertionEffect + hrvNoise + (isRestDay ? 2.5 : 0),
    32,
    72
  );
  const spo2 = clamp(97.6 + seededGaussian(rng, 0, 0.5), 95, 99.4);
  const respiratory_rate = clamp(
    14.5 + 0.35 * exertionEffect + seededGaussian(rng, 0, 0.6),
    12,
    19
  );
  const sleep_duration = clamp(
    7 - 0.18 * exertionEffect + sleepNoise + (isRestDay ? 0.5 : 0),
    4.5,
    8.5
  );
  const sleep_score = clamp(
    Math.round(78 - 6 * exertionEffect + seededGaussian(rng, 0, 4) + (isRestDay ? 4 : 0)),
    45,
    96
  );
  const steps = Math.round(
    clamp(4200 + ridingHours * 950 + seededGaussian(rng, 0, 500), 1500, 14000)
  );
  const active_calories = Math.round(
    clamp(350 + ridingHours * 210 + seededGaussian(rng, 0, 60), 150, 2400)
  );
  const avg_hr = Math.round(
    clamp(resting_hr + 40 + 0.8 * exertionEffect + seededGaussian(rng, 0, 3), 90, 150)
  );

  physiology.push({
    date: dateStr,
    resting_hr: Math.round(resting_hr),
    avg_hr,
    hrv: Math.round(hrv * 10) / 10,
    spo2: Math.round(spo2 * 10) / 10,
    respiratory_rate: Math.round(respiratory_rate * 10) / 10,
    steps,
    sleep_duration: Math.round(sleep_duration * 10) / 10,
    sleep_score,
    active_calories,
  });
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// --- Hotspots: bin all trip segment points into a grid, rank by visits ---
interface Cell {
  latSum: number;
  lngSum: number;
  pm25Sum: number;
  exposureSum: number;
  count: number;
}
const cellSize = 0.012; // ~1.3km
const cells = new Map<string, Cell>();

for (const trip of trips) {
  for (const seg of trip.segments) {
    const key = `${Math.round(seg.env.latitude / cellSize)}_${Math.round(
      seg.env.longitude / cellSize
    )}`;
    const cell = cells.get(key) ?? {
      latSum: 0,
      lngSum: 0,
      pm25Sum: 0,
      exposureSum: 0,
      count: 0,
    };
    cell.latSum += seg.env.latitude;
    cell.lngSum += seg.env.longitude;
    cell.pm25Sum += seg.env.pm25;
    cell.exposureSum += seg.exposure;
    cell.count += 1;
    cells.set(key, cell);
  }
}

const hotspots: Hotspot[] = Array.from(cells.entries())
  .map(([key, c]) => {
    const lat = c.latSum / c.count;
    const lng = c.lngSum / c.count;
    return {
      id: key,
      label: nearestLandmarkLabel(lat, lng),
      latitude: Math.round(lat * 1e5) / 1e5,
      longitude: Math.round(lng * 1e5) / 1e5,
      avgPm25: Math.round((c.pm25Sum / c.count) * 10) / 10,
      visits: c.count,
      avgExposure: Math.round((c.exposureSum / c.count) * 100) / 100,
    };
  })
  .sort((a, b) => b.visits - a.visits)
  .slice(0, 5);

// --- Write output ---
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

fs.writeFileSync(path.join(dataDir, "trips.json"), JSON.stringify(trips));
fs.writeFileSync(
  path.join(dataDir, "physiology.json"),
  JSON.stringify(physiology, null, 2)
);
fs.writeFileSync(
  path.join(dataDir, "hotspots.json"),
  JSON.stringify(hotspots, null, 2)
);

const totalDays = days.length;
const workingDays = Object.values(ridingHoursByDate).filter((h) => h > 0).length;
const avgRidingHours =
  Object.values(ridingHoursByDate).reduce((a, b) => a + b, 0) / workingDays;
const avgTripsPerDay = trips.length / workingDays;

console.log(`Generated ${trips.length} trips across ${totalDays} days (${workingDays} working days).`);
console.log(`Average riding hours/working day: ${avgRidingHours.toFixed(2)}`);
console.log(`Average trips/working day: ${avgTripsPerDay.toFixed(2)}`);
console.log(`Physiology records: ${physiology.length}`);
console.log(`Hotspots: ${hotspots.length}`);
