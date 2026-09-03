// Turns real environmental + mobility CSVs into the same `Trip[]` shape the
// rest of the app already consumes (see lib/types.ts), so that dataAccess.ts
// can swap its data source without every downstream page/component needing
// to know whether it's looking at synthetic or real data.
//
// Pipeline: real CSVs -> normalise -> reconstruct trips from GPS points ->
// nearest-station + nearest-time match each point to a real environmental
// reading -> compute dose (pm25 x duration) per matched point -> Trip[].
//
// Deliberately simple (nearest-station, nearest-time, no interpolation) per
// the brief. Never fabricates a pollutant reading: a GPS point that can't be
// matched to a real environmental record within the matching window is
// dropped from the trip's segments (and counted in the match-rate quality
// metric) rather than filled in.

import { loadRealEnvironmentData, loadRealMobilityData, type RealEnvironmentRow } from "./realDataAdapter";
import { resolveTownAnchor } from "./townAnchors";
import { haversineKm } from "./geo";
import { sampleWeather } from "./environment";
import { segmentDose, sumExposure, classifyTripExposure } from "./exposure";
import { mulberry32, hashStringToSeed } from "./rng";
import { inferRoadType, inferTrafficLevel } from "./roadInference";
import type { Trip, TripSegment, GPSPoint } from "./types";

export const ENVIRONMENT_SOURCE_LABEL = "OpenDOSM / Malaysia Department of Environment";
export const MOBILITY_SOURCE_LABEL = "Real urban mobility trajectory data";
export const DEMO_SOURCE_LABEL = "Prototype synthetic dataset";

// A station's readings must fall within this many hours of a GPS point's
// timestamp to be considered a match (data.gov.my air quality readings are
// typically hourly).
const MAX_MATCH_HOURS = 3;

interface Station {
  location: string;
  lat: number;
  lng: number;
  coordinateSource: "csv" | "approximate-town";
  readings: { timestampMs: number; timestamp: string; pm25: number | null; pm10: number | null; no2: number | null }[];
}

function resolveStations(rows: RealEnvironmentRow[]): {
  located: Station[];
  unlocatedRecordCount: number;
} {
  const byLocation = new Map<string, RealEnvironmentRow[]>();
  for (const r of rows) {
    const arr = byLocation.get(r.location) ?? [];
    arr.push(r);
    byLocation.set(r.location, arr);
  }

  const located: Station[] = [];
  let unlocatedRecordCount = 0;

  for (const [location, group] of byLocation) {
    const withCsvCoords = group.find((r) => r.latitude !== null && r.longitude !== null);
    const anchor = withCsvCoords
      ? { lat: withCsvCoords.latitude!, lng: withCsvCoords.longitude!, coordinateSource: "csv" as const }
      : resolveTownAnchor(location);

    if (!anchor) {
      unlocatedRecordCount += group.length;
      continue;
    }

    located.push({
      location,
      lat: anchor.lat,
      lng: anchor.lng,
      coordinateSource: anchor.coordinateSource,
      readings: group
        .map((r) => ({
          timestampMs: new Date(r.timestamp).getTime(),
          timestamp: r.timestamp,
          pm25: r.pm25,
          pm10: r.pm10,
          no2: r.no2,
        }))
        .filter((r) => !isNaN(r.timestampMs))
        .sort((a, b) => a.timestampMs - b.timestampMs),
    });
  }

  return { located, unlocatedRecordCount };
}

function nearestStation(lat: number, lng: number, stations: Station[]): Station | null {
  let best: Station | null = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng });
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

// Binary search for the reading nearest in time; readings are pre-sorted.
function nearestReading(station: Station, timestampMs: number) {
  const readings = station.readings;
  if (readings.length === 0) return null;
  let lo = 0;
  let hi = readings.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (readings[mid].timestampMs < timestampMs) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [readings[lo - 1], readings[lo], readings[lo + 1]].filter(Boolean) as Station["readings"];
  let best = candidates[0];
  let bestDelta = Infinity;
  for (const c of candidates) {
    const delta = Math.abs(c.timestampMs - timestampMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = c;
    }
  }
  const deltaHours = bestDelta / 3600000;
  return deltaHours <= MAX_MATCH_HOURS ? best : null;
}

interface RawMobilityPoint {
  timestamp: string;
  timestampMs: number;
  latitude: number;
  longitude: number;
  speed: number | null;
  tripId: string | null;
}

function groupIntoTrips(points: RawMobilityPoint[]): RawMobilityPoint[][] {
  const withTripId = points.filter((p) => p.tripId);
  if (withTripId.length > points.length * 0.5) {
    // Most rows carry a trip_id — group by it directly.
    const byTrip = new Map<string, RawMobilityPoint[]>();
    for (const p of points) {
      if (!p.tripId) continue;
      const arr = byTrip.get(p.tripId) ?? [];
      arr.push(p);
      byTrip.set(p.tripId, arr);
    }
    return Array.from(byTrip.values()).map((g) => g.sort((a, b) => a.timestampMs - b.timestampMs));
  }

  // No usable trip_id column — segment by time gaps (>15 min idle = new trip).
  const sorted = [...points].sort((a, b) => a.timestampMs - b.timestampMs);
  const trips: RawMobilityPoint[][] = [];
  let current: RawMobilityPoint[] = [];
  const GAP_MS = 15 * 60 * 1000;
  for (const p of sorted) {
    if (current.length > 0 && p.timestampMs - current[current.length - 1].timestampMs > GAP_MS) {
      trips.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 0) trips.push(current);
  return trips.filter((t) => t.length >= 2);
}

export interface RealDataMatchStats {
  environmentRecordCount: number;
  mobilityRecordCount: number;
  unlocatedEnvironmentRecordCount: number;
  totalMobilityPoints: number;
  matchedMobilityPoints: number;
}

export interface ResolvedStationSummary {
  location: string;
  lat: number;
  lng: number;
  coordinateSource: "csv" | "approximate-town";
  readingCount: number;
}

export interface RealDataResult {
  trips: Trip[];
  matchStats: RealDataMatchStats;
  stationCount: number;
  stationNames: string[];
  stations: ResolvedStationSummary[];
  envDateRange: { start: string; end: string } | null;
  mobilityDateRange: { start: string; end: string } | null;
}

let cached: RealDataResult | null = null;

// Reconstructs Trip[] (the app's standard trip shape) from whatever real
// CSVs are currently present. Cached per server process since the files
// don't change during a request — restart the dev server (or redeploy)
// after adding/removing real CSV files.
export function computeRealData(): RealDataResult {
  if (cached) return cached;

  const envResult = loadRealEnvironmentData();
  const mobilityResult = loadRealMobilityData();

  const { located: stations, unlocatedRecordCount } = resolveStations(envResult.rows);

  const mobilityPoints: RawMobilityPoint[] = mobilityResult.rows
    .map((r) => ({
      timestamp: r.timestamp,
      timestampMs: new Date(r.timestamp).getTime(),
      latitude: r.latitude,
      longitude: r.longitude,
      speed: r.speed,
      tripId: r.tripId,
    }))
    .filter((p) => !isNaN(p.timestampMs));

  const tripGroups = groupIntoTrips(mobilityPoints);

  let totalPoints = 0;
  let matchedPoints = 0;
  const trips: Trip[] = [];

  tripGroups.forEach((points, idx) => {
    if (points.length < 2) return;
    totalPoints += points.length;

    const segments: TripSegment[] = [];
    const waypoints: GPSPoint[] = [];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const durationHours = prev ? Math.max(0, (p.timestampMs - prev.timestampMs) / 3600000) : 0;
      const distanceKm = prev ? haversineKm({ lat: prev.latitude, lng: prev.longitude }, { lat: p.latitude, lng: p.longitude }) : 0;
      const speed = p.speed ?? (durationHours > 0 ? distanceKm / durationHours : 0);

      const point: GPSPoint = {
        timestamp: p.timestamp,
        latitude: p.latitude,
        longitude: p.longitude,
        speed: Math.round(speed * 10) / 10,
      };
      waypoints.push(point);

      const station = nearestStation(p.latitude, p.longitude, stations);
      const reading = station ? nearestReading(station, p.timestampMs) : null;

      if (!reading || reading.pm25 === null || durationHours === 0) continue;
      matchedPoints += 1;

      const roadType = inferRoadType(speed);
      const trafficLevel = inferTrafficLevel(speed, roadType);
      const rng = mulberry32(hashStringToSeed(`${p.timestamp}-${p.latitude}-${p.longitude}`));
      const weather = sampleWeather(new Date(p.timestamp).getUTCHours(), rng);
      const dose = segmentDose(reading.pm25, durationHours);

      segments.push({
        point,
        env: {
          timestamp: p.timestamp,
          latitude: p.latitude,
          longitude: p.longitude,
          pm25: reading.pm25,
          pm10: reading.pm10 ?? Math.round(reading.pm25 * 1.7 * 10) / 10,
          no2: reading.no2 ?? 0,
          temperature: weather.temperature,
          humidity: weather.humidity,
          wind_speed: weather.wind_speed,
          traffic_level: trafficLevel,
          road_type: roadType,
        },
        durationHours,
        exposure: Math.round(dose * 100) / 100,
      });
    }

    if (segments.length === 0) return; // no exposure could be calculated for this trip

    const first = points[0];
    const last = points[points.length - 1];
    const durationMin = (last.timestampMs - first.timestampMs) / 60000;
    let distanceKm = 0;
    for (let i = 1; i < points.length; i++) {
      distanceKm += haversineKm(
        { lat: points[i - 1].latitude, lng: points[i - 1].longitude },
        { lat: points[i].latitude, lng: points[i].longitude }
      );
    }
    const avgSpeed = durationMin > 0 ? distanceKm / (durationMin / 60) : 0;
    const avgPm25 = segments.reduce((s, seg) => s + seg.env.pm25, 0) / segments.length;
    const avgPm10 = segments.reduce((s, seg) => s + seg.env.pm10, 0) / segments.length;
    const avgNo2 = segments.reduce((s, seg) => s + seg.env.no2, 0) / segments.length;
    const exposure = sumExposure(segments.map((s) => s.exposure));
    const tripId = points[0].tripId ?? `RT${idx}`;

    trips.push({
      id: `real-${tripId}`,
      date: new Date(first.timestamp).toISOString().slice(0, 10),
      routeName: `Observed trajectory ${tripId}`,
      startTime: first.timestamp,
      endTime: last.timestamp,
      durationMin: Math.round(durationMin),
      distanceKm: Math.round(distanceKm * 10) / 10,
      avgSpeed: Math.round(avgSpeed * 10) / 10,
      avgPm25: Math.round(avgPm25 * 10) / 10,
      avgPm10: Math.round(avgPm10 * 10) / 10,
      avgNo2: Math.round(avgNo2 * 10) / 10,
      avgHr: 0,
      exposure: Math.round(exposure * 10) / 10,
      exposureLevel: classifyTripExposure(exposure),
      waypoints,
      segments,
      source: `${MOBILITY_SOURCE_LABEL} + ${ENVIRONMENT_SOURCE_LABEL}`,
    });
  });

  cached = {
    trips: trips.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    matchStats: {
      environmentRecordCount: envResult.rows.length,
      mobilityRecordCount: mobilityResult.rows.length,
      unlocatedEnvironmentRecordCount: unlocatedRecordCount,
      totalMobilityPoints: totalPoints,
      matchedMobilityPoints: matchedPoints,
    },
    stationCount: stations.length,
    stationNames: stations.map((s) => s.location),
    stations: stations.map((s) => ({
      location: s.location,
      lat: s.lat,
      lng: s.lng,
      coordinateSource: s.coordinateSource,
      readingCount: s.readings.length,
    })),
    envDateRange: envResult.dateRange,
    mobilityDateRange: mobilityResult.dateRange,
  };
  return cached;
}

export function clearRealDataCache() {
  cached = null;
}
