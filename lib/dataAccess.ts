import tripsData from "@/data/trips.json";
import physiologyData from "@/data/physiology.json";
import type {
  Trip,
  HealthRecord,
  Hotspot,
  ExposureLevel,
  RoadType,
  DataMode,
  DataProvenance,
  DataQuality,
  RealDataSummary,
} from "./types";
import { classifyDailyRate, classifyPm25 } from "./exposure";
import { RIDER, DESTINATIONS } from "./constants";
import { getCandidateRoutes } from "./routeAdvisor";
import type { RecommendationInputs } from "./recommendations";
import { getDataModeStatus } from "./dataMode";
import {
  computeRealData,
  ENVIRONMENT_SOURCE_LABEL,
  MOBILITY_SOURCE_LABEL,
  DEMO_SOURCE_LABEL,
} from "./realDataEngine";
import { computeHotspots } from "./hotspots";

// Server-only data access layer. The full 90-day trip dataset (with
// per-segment GPS + environment samples) is several MB — it must never be
// imported from a "use client" file. Pages (Server Components) call these
// aggregation helpers and pass only the small, already-summarised results
// down to client components.
//
// Every function below is mode-aware: it transparently reads from either
// the synthetic demo dataset or a real dataset loaded via realDataEngine,
// but always returns the same shape either way, so pages/components never
// need an if (mode === "real") branch just to read the data. Components
// that must visibly *differentiate* real vs demo (banners, provenance
// labels, "insufficient data" messaging) call getDataProvenance()/
// getDataQuality()/getRealDataSummary() explicitly for that.

const demoTrips = tripsData as unknown as Trip[];
const physiology = physiologyData as unknown as HealthRecord[];

function todayStr(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

// "real" only once real trips have actually been reconstructed — a stale
// or empty real dataset (files present but nothing matched) silently falls
// back to demo rather than showing a live-looking REAL DATA MODE with no
// real numbers behind it.
export function getEffectiveMode(): DataMode {
  const status = getDataModeStatus();
  if (status.mode !== "real") return "demo";
  return computeRealData().trips.length > 0 ? "real" : "demo";
}

function getActiveTrips(): Trip[] {
  return getEffectiveMode() === "real" ? computeRealData().trips : demoTrips;
}

export function getDataProvenance(): DataProvenance {
  const mode = getEffectiveMode();
  return {
    mode,
    environmentSource: mode === "real" ? ENVIRONMENT_SOURCE_LABEL : DEMO_SOURCE_LABEL,
    mobilitySource: mode === "real" ? MOBILITY_SOURCE_LABEL : DEMO_SOURCE_LABEL,
    // Physiological/wearable data is always synthetic — no real dataset
    // input covers it in this prototype.
    physiologySource: DEMO_SOURCE_LABEL,
  };
}

export function getDataQuality(): DataQuality {
  const status = getDataModeStatus();
  if (getEffectiveMode() !== "real") {
    return {
      environmentalLoaded: status.hasRealEnvironmentData,
      gpsLoaded: status.hasRealMobilityData,
      environmentRecordCount: 0,
      mobilityRecordCount: 0,
      timestampMatchPct: null,
      missingPm25Pct: null,
      missingGpsPct: null,
      unlocatedStationRecordCount: 0,
    };
  }
  const real = computeRealData();
  const { matchStats } = real;
  return {
    environmentalLoaded: true,
    gpsLoaded: true,
    environmentRecordCount: matchStats.environmentRecordCount,
    mobilityRecordCount: matchStats.mobilityRecordCount,
    timestampMatchPct:
      matchStats.totalMobilityPoints > 0
        ? Math.round((matchStats.matchedMobilityPoints / matchStats.totalMobilityPoints) * 1000) / 10
        : null,
    missingPm25Pct:
      matchStats.totalMobilityPoints > 0
        ? Math.round(
            ((matchStats.totalMobilityPoints - matchStats.matchedMobilityPoints) /
              matchStats.totalMobilityPoints) *
              1000
          ) / 10
        : null,
    missingGpsPct: 0,
    unlocatedStationRecordCount: matchStats.unlocatedEnvironmentRecordCount,
  };
}

export function getRealStations() {
  if (getEffectiveMode() !== "real") return [];
  return computeRealData().stations;
}

export function getRealDataSummary(): RealDataSummary | null {
  if (getEffectiveMode() !== "real") return null;
  const real = computeRealData();
  const totalDistanceKm = real.trips.reduce((s, t) => s + t.distanceKm, 0);
  const totalDurationMin = real.trips.reduce((s, t) => s + t.durationMin, 0);
  const totalSpeed = real.trips.reduce((s, t) => s + t.avgSpeed, 0);
  const latestTimestamp =
    real.trips.length > 0
      ? real.trips.reduce((latest, t) => (t.endTime > latest ? t.endTime : latest), real.trips[0].endTime)
      : null;

  return {
    environmentRecordCount: real.matchStats.environmentRecordCount,
    mobilityRecordCount: real.matchStats.mobilityRecordCount,
    tripCount: real.trips.length,
    totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
    avgTripDurationMin: real.trips.length ? Math.round(totalDurationMin / real.trips.length) : 0,
    avgSpeedKmh: real.trips.length ? Math.round((totalSpeed / real.trips.length) * 10) / 10 : 0,
    stationsRepresented: real.stationNames,
    dateRange: real.mobilityDateRange ?? real.envDateRange,
    latestMeasurementTimestamp: latestTimestamp,
  };
}

export function getAllTripDates(): string[] {
  return Array.from(new Set(getActiveTrips().map((t) => t.date))).sort();
}

export interface DailyAggregate {
  date: string;
  exposure: number;
  ridingHours: number;
  avgPm25: number;
}

export function getDailyAggregates(): DailyAggregate[] {
  const activeTrips = getActiveTrips();
  const byDate = new Map<string, { exposure: number; minutes: number; pm25Sum: number; count: number }>();
  for (const t of activeTrips) {
    const e = byDate.get(t.date) ?? { exposure: 0, minutes: 0, pm25Sum: 0, count: 0 };
    e.exposure += t.exposure;
    e.minutes += t.durationMin;
    e.pm25Sum += t.avgPm25;
    e.count += 1;
    byDate.set(t.date, e);
  }
  const dates = getAllTripDates();
  return dates.map((date) => {
    const e = byDate.get(date);
    return {
      date,
      exposure: e ? Math.round(e.exposure * 10) / 10 : 0,
      ridingHours: e ? Math.round((e.minutes / 60) * 100) / 100 : 0,
      avgPm25: e ? Math.round((e.pm25Sum / e.count) * 10) / 10 : 0,
    };
  });
}

function daysCoveredBy(agg: DailyAggregate[]): number {
  if (agg.length === 0) return 0;
  const start = new Date(agg[0].date).getTime();
  const end = new Date(agg[agg.length - 1].date).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

// Returns null when in real mode and the loaded dataset doesn't actually
// span `days` calendar days — callers must show "insufficient real data"
// rather than silently summing whatever partial data exists as if it were
// a full window.
export function getExposureWindowTotal(days: number): number | null {
  const agg = getDailyAggregates();
  if (getEffectiveMode() === "real" && daysCoveredBy(agg) < days) {
    return null;
  }
  const slice = agg.slice(-days);
  return Math.round(slice.reduce((s, d) => s + d.exposure, 0) * 10) / 10;
}

export interface DashboardSnapshot {
  asOfDate: string;
  isToday: boolean;
  currentPm25: number;
  currentExposureLevel: ExposureLevel;
  todaysRidingHours: number;
  todaysExposure: number;
  ninetyDayExposure: number | null;
  thirtyDayExposure: number | null;
  sevenDayExposure: number | null;
}

export function getDashboardSnapshot(): DashboardSnapshot {
  const agg = getDailyAggregates();
  const activeTrips = getActiveTrips();
  const last = agg[agg.length - 1];
  const isToday = last?.date === todayStr();

  const recentTripsToday = activeTrips
    .filter((t) => t.date === last?.date)
    .sort((a, b) => b.startTime.localeCompare(a.startTime));
  const latestTrip =
    recentTripsToday[0] ?? [...activeTrips].sort((a, b) => b.startTime.localeCompare(a.startTime))[0];

  const currentPm25 = latestTrip?.avgPm25 ?? 0;

  return {
    asOfDate: last?.date ?? todayStr(),
    isToday,
    currentPm25,
    currentExposureLevel: classifyPm25(currentPm25),
    todaysRidingHours: last?.ridingHours ?? 0,
    todaysExposure: last?.exposure ?? 0,
    ninetyDayExposure: getExposureWindowTotal(90),
    thirtyDayExposure: getExposureWindowTotal(30),
    sevenDayExposure: getExposureWindowTotal(7),
  };
}

export function getExposureTrend(rangeDays: 7 | 30 | 90): DailyAggregate[] {
  return getDailyAggregates().slice(-rangeDays);
}

export function getLatestPhysiology(): HealthRecord {
  return physiology[physiology.length - 1];
}

export function getPhysiologySeries(rangeDays: number = 90): HealthRecord[] {
  return physiology.slice(-rangeDays);
}

export function getHotspots(): Hotspot[] {
  return computeHotspots(getActiveTrips());
}

export function getTripHistory(limit = 20): Trip[] {
  return [...getActiveTrips()].sort((a, b) => b.startTime.localeCompare(a.startTime)).slice(0, limit);
}

export type TripSummary = Omit<Trip, "segments">;

// Lighter payload for client components — drops the heavy per-segment
// environment samples, keeping only what the Trip History UI needs
// (metadata + waypoints for the route preview map).
export function getTripHistorySummaries(limit = 20): TripSummary[] {
  return getTripHistory(limit).map(({ segments: _segments, ...rest }) => rest);
}

export interface DigitalTwinStats {
  avgRidingHoursPerDay: number;
  ninetyDayExposure: number | null;
  ninetyDayLevel: ExposureLevel | null;
  thirtyDayExposure: number | null;
  sevenDayExposure: number | null;
  highExposureTripCount: number;
  typicalHighExposureWindow: string;
  typicalHighExposureRoad: string;
  exposureTrend: "Increasing" | "Stable" | "Decreasing" | "Insufficient data";
  hrTrend: TrendInfo;
  hrvTrend: TrendInfo;
  sleepTrend: TrendInfo;
  recentAvgSleep: number;
  historicalAvgSleep: number;
}

export interface TrendInfo {
  direction: "Increasing" | "Stable" | "Decreasing";
  current: number;
  changeFromStart: number;
}

function linearTrend(values: number[]): { slope: number } {
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return { slope: den === 0 ? 0 : num / den };
}

function trendInfo(values: number[], stableThreshold: number): TrendInfo {
  const { slope } = linearTrend(values);
  const totalChange = slope * (values.length - 1);
  const direction =
    Math.abs(totalChange) < stableThreshold
      ? "Stable"
      : totalChange > 0
      ? "Increasing"
      : "Decreasing";
  return {
    direction,
    current: Math.round(values[values.length - 1] * 10) / 10,
    changeFromStart: Math.round(totalChange * 100) / 100,
  };
}

export function getDigitalTwinStats(): DigitalTwinStats {
  const activeTrips = getActiveTrips();
  const agg = getDailyAggregates();
  const workingDays = agg.filter((d) => d.ridingHours > 0);
  const avgRidingHoursPerDay =
    workingDays.length > 0
      ? workingDays.reduce((s, d) => s + d.ridingHours, 0) / workingDays.length
      : 0;

  const effectiveMode = getEffectiveMode();
  const daysCovered = daysCoveredBy(agg);
  let exposureTrend: DigitalTwinStats["exposureTrend"];
  if (effectiveMode === "real" && daysCovered < 60) {
    exposureTrend = "Insufficient data";
  } else {
    const last30 = agg.slice(-30).reduce((s, d) => s + d.exposure, 0);
    const prev30 = agg.slice(-60, -30).reduce((s, d) => s + d.exposure, 0);
    const pctChange = prev30 === 0 ? 0 : (last30 - prev30) / prev30;
    exposureTrend = Math.abs(pctChange) < 0.06 ? "Stable" : pctChange > 0 ? "Increasing" : "Decreasing";
  }

  // Peak 4-hour exposure window and dominant road type among high-exposure segments.
  const hourBuckets = new Array(24).fill(0);
  const hourCounts = new Array(24).fill(0);
  const roadExposure: Record<RoadType, number> = { residential: 0, arterial: 0, highway: 0 };
  const allSegExposures: number[] = [];

  for (const t of activeTrips) {
    for (const seg of t.segments) {
      const h = new Date(seg.env.timestamp).getUTCHours();
      hourBuckets[h] += seg.exposure;
      hourCounts[h] += 1;
      allSegExposures.push(seg.exposure);
    }
  }
  const threshold = quantile(allSegExposures, 0.75);
  for (const t of activeTrips) {
    for (const seg of t.segments) {
      if (seg.exposure >= threshold) {
        roadExposure[seg.env.road_type] += seg.exposure;
      }
    }
  }

  let peakStart = 17;
  let peakAvg = -Infinity;
  for (let h = 0; h <= 20; h++) {
    const windowSum = [0, 1, 2, 3].reduce((s, o) => s + hourBuckets[h + o], 0);
    const windowCount = [0, 1, 2, 3].reduce((s, o) => s + hourCounts[h + o], 0);
    const avg = windowCount > 0 ? windowSum / windowCount : -Infinity;
    if (avg > peakAvg) {
      peakAvg = avg;
      peakStart = h;
    }
  }

  const dominantRoad = (Object.entries(roadExposure).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "arterial") as RoadType;

  const hrSeries = physiology.map((p) => p.resting_hr);
  const hrvSeries = physiology.map((p) => p.hrv);
  const sleepSeries = physiology.map((p) => p.sleep_duration);

  const recentAvgSleep =
    physiology.slice(-14).reduce((s, p) => s + p.sleep_duration, 0) / Math.min(14, physiology.length);
  const historicalAvgSleep =
    physiology.reduce((s, p) => s + p.sleep_duration, 0) / physiology.length;

  const ninetyDayExposure = getExposureWindowTotal(90);
  const ninetyDayWorkingDays = Math.max(1, workingDays.length);

  return {
    avgRidingHoursPerDay: Math.round(avgRidingHoursPerDay * 100) / 100,
    ninetyDayExposure,
    ninetyDayLevel:
      ninetyDayExposure === null ? null : classifyDailyRate(ninetyDayExposure / ninetyDayWorkingDays),
    thirtyDayExposure: getExposureWindowTotal(30),
    sevenDayExposure: getExposureWindowTotal(7),
    highExposureTripCount: activeTrips.filter((t) => t.exposureLevel === "High").length,
    typicalHighExposureWindow:
      allSegExposures.length > 0
        ? `${String(peakStart).padStart(2, "0")}:00–${String(peakStart + 4).padStart(2, "0")}:00`
        : "—",
    typicalHighExposureRoad:
      allSegExposures.length === 0
        ? "—"
        : dominantRoad === "arterial"
        ? "Major arterial"
        : dominantRoad === "highway"
        ? "Highway"
        : "Residential",
    exposureTrend,
    hrTrend: trendInfo(hrSeries, 1.5),
    hrvTrend: trendInfo(hrvSeries, 2),
    sleepTrend: trendInfo(sleepSeries, 0.25),
    recentAvgSleep: Math.round(recentAvgSleep * 10) / 10,
    historicalAvgSleep: Math.round(historicalAvgSleep * 10) / 10,
  };
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

// Average pm2.5-based exposure rate per hour-of-day, derived from all
// recorded segments. Used by the What-If Simulator to estimate exposure
// under different riding-hour windows.
export function getHourlyExposureRateProfile(): number[] {
  const activeTrips = getActiveTrips();
  const sums = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  for (const t of activeTrips) {
    for (const seg of t.segments) {
      const h = new Date(seg.env.timestamp).getUTCHours();
      sums[h] += seg.env.pm25;
      counts[h] += 1;
    }
  }
  const overallAvg = activeTrips.flatMap((t) => t.segments.map((s) => s.env.pm25));
  const fallback = overallAvg.length > 0 ? overallAvg.reduce((a, b) => a + b, 0) / overallAvg.length : 0;
  return sums.map((s, h) => (counts[h] > 0 ? s / counts[h] : fallback));
}

export function getRiderProfile() {
  return RIDER;
}

export function getWorkingDayCountLast90(): number {
  return getDailyAggregates().filter((d) => d.ridingHours > 0).length;
}

export function getPeakHourExposureRatio(): number {
  let peakSum = 0;
  let peakCount = 0;
  let otherSum = 0;
  let otherCount = 0;
  for (const t of getActiveTrips()) {
    for (const seg of t.segments) {
      const h = new Date(seg.env.timestamp).getUTCHours();
      const isPeak = (h >= 7 && h < 9) || (h >= 17 && h < 20);
      if (isPeak) {
        peakSum += seg.env.pm25;
        peakCount += 1;
      } else {
        otherSum += seg.env.pm25;
        otherCount += 1;
      }
    }
  }
  const peakAvg = peakCount > 0 ? peakSum / peakCount : 0;
  const otherAvg = otherCount > 0 ? otherSum / otherCount : 1;
  return otherAvg === 0 ? 1 : peakAvg / otherAvg;
}

interface RouteDeltaResult {
  detourMin: number;
  exposureReductionPct: number;
}

// Candidate-route comparison is always the prototype's 4-destination x
// 3-profile demonstration scenario (see lib/routeAdvisor.ts) — real GPS
// data doesn't currently contain enough alternative trajectories between
// the same origin/destination pairs to derive live route alternatives, so
// this stays a labelled prototype scenario in both modes (see the "Route
// alternatives are prototype scenarios" note surfaced on the Routes page).
function getBestLowExposureRouteDelta(): RouteDeltaResult {
  const results = DESTINATIONS.map((dest): RouteDeltaResult => {
    const candidates = getCandidateRoutes(dest);
    const fastest = candidates.find((c) => c.profile === "fastest");
    const lowExposure = candidates.find((c) => c.profile === "low_exposure");
    if (!fastest || !lowExposure || fastest.predictedExposure === 0) {
      return { detourMin: Infinity, exposureReductionPct: 0 };
    }
    return {
      detourMin: lowExposure.travelTimeMin - fastest.travelTimeMin,
      exposureReductionPct:
        ((fastest.predictedExposure - lowExposure.predictedExposure) /
          fastest.predictedExposure) *
        100,
    };
  });
  return results.sort((a, b) => a.detourMin - b.detourMin)[0];
}

export function getMinLowExposureDetourMin(): number {
  return getBestLowExposureRouteDelta().detourMin;
}

export function getLowExposureDiscount(): number {
  const ratios = DESTINATIONS.map((dest) => {
    const candidates = getCandidateRoutes(dest);
    const fastest = candidates.find((c) => c.profile === "fastest");
    const lowExposure = candidates.find((c) => c.profile === "low_exposure");
    if (!fastest || !lowExposure || fastest.avgPm25 === 0) return 1;
    return lowExposure.avgPm25 / fastest.avgPm25;
  });
  return Math.round((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100) / 100;
}

export function getRecommendationInputs(): RecommendationInputs {
  const twin = getDigitalTwinStats();
  const routeDelta = getBestLowExposureRouteDelta();
  return {
    minLowExposureDetourMin: routeDelta.detourMin,
    bestRouteExposureReductionPct: Math.round(routeDelta.exposureReductionPct * 10) / 10,
    peakHourExposureRatio: Math.round(getPeakHourExposureRatio() * 100) / 100,
    exposureTrend: twin.exposureTrend === "Insufficient data" ? "Stable" : twin.exposureTrend,
    ninetyDayLevel: twin.ninetyDayLevel ?? "Low",
    recentAvgSleep: twin.recentAvgSleep,
    historicalAvgSleep: twin.historicalAvgSleep,
  };
}

export interface EnvironmentalSummary {
  avgPm25: number;
  avgPm10: number;
  avgNo2: number;
  recordCount: number;
}

export function getEnvironmentalSummary(rangeDays = 30): EnvironmentalSummary {
  const recentDates = new Set(getAllTripDates().slice(-rangeDays));
  let pm25Sum = 0;
  let pm10Sum = 0;
  let no2Sum = 0;
  let count = 0;
  for (const t of getActiveTrips()) {
    if (!recentDates.has(t.date)) continue;
    for (const seg of t.segments) {
      pm25Sum += seg.env.pm25;
      pm10Sum += seg.env.pm10;
      no2Sum += seg.env.no2;
      count += 1;
    }
  }
  if (count === 0) return { avgPm25: 0, avgPm10: 0, avgNo2: 0, recordCount: 0 };
  return {
    avgPm25: Math.round((pm25Sum / count) * 10) / 10,
    avgPm10: Math.round((pm10Sum / count) * 10) / 10,
    avgNo2: Math.round((no2Sum / count) * 10) / 10,
    recordCount: count,
  };
}

export interface MobilitySummary {
  avgTripsPerDay: number;
  avgTripDistanceKm: number;
  avgSpeedKmh: number;
  totalRidingHours: number;
  frequentRoute: string;
  highExposureRoute: string;
}

export function getMobilitySummary(): MobilitySummary {
  const activeTrips = getActiveTrips();
  const workingDays = getWorkingDayCountLast90();
  const routeCounts = new Map<string, number>();
  const routeExposure = new Map<string, { sum: number; count: number }>();
  let distanceSum = 0;
  let speedSum = 0;
  let minutesSum = 0;

  for (const t of activeTrips) {
    routeCounts.set(t.routeName, (routeCounts.get(t.routeName) ?? 0) + 1);
    const e = routeExposure.get(t.routeName) ?? { sum: 0, count: 0 };
    e.sum += t.exposure;
    e.count += 1;
    routeExposure.set(t.routeName, e);
    distanceSum += t.distanceKm;
    speedSum += t.avgSpeed;
    minutesSum += t.durationMin;
  }

  const frequentRoute =
    Array.from(routeCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";
  const highExposureRoute =
    Array.from(routeExposure.entries())
      .map(([name, e]) => [name, e.sum / e.count] as const)
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  return {
    avgTripsPerDay: Math.round((activeTrips.length / Math.max(1, workingDays)) * 10) / 10,
    avgTripDistanceKm: activeTrips.length ? Math.round((distanceSum / activeTrips.length) * 10) / 10 : 0,
    avgSpeedKmh: activeTrips.length ? Math.round((speedSum / activeTrips.length) * 10) / 10 : 0,
    totalRidingHours: Math.round((minutesSum / 60) * 10) / 10,
    frequentRoute,
    highExposureRoute,
  };
}

export interface NinetyDayTimelinePoint {
  day: number; // 1-N
  date: string;
  cumulativeExposure: number;
}

export interface NinetyDayTimeline {
  series: NinetyDayTimelinePoint[];
  daysCovered: number;
  highExposureTripCount: number;
  avgDailyRidingDuration: number;
  highExposureDayCount: number;
}

export function get90DayTimeline(): NinetyDayTimeline {
  const activeTrips = getActiveTrips();
  const agg = getDailyAggregates();
  let cumulative = 0;
  const series: NinetyDayTimelinePoint[] = agg.map((d, i) => {
    cumulative += d.exposure;
    return {
      day: i + 1,
      date: d.date,
      cumulativeExposure: Math.round(cumulative * 10) / 10,
    };
  });

  const highExposureTripCount = activeTrips.filter((t) => t.exposureLevel === "High").length;
  const workingDays = agg.filter((d) => d.ridingHours > 0);
  const avgDailyRidingDuration =
    workingDays.length > 0
      ? workingDays.reduce((s, d) => s + d.ridingHours, 0) / workingDays.length
      : 0;
  const highExposureDayCount = agg.filter(
    (d) => d.ridingHours > 0 && classifyDailyRate(d.exposure) === "High"
  ).length;

  return {
    series,
    daysCovered: daysCoveredBy(agg),
    highExposureTripCount,
    avgDailyRidingDuration: Math.round(avgDailyRidingDuration * 100) / 100,
    highExposureDayCount,
  };
}
