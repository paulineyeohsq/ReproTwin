import {
  PM25_LEVEL_THRESHOLDS,
  TRIP_DOSE_THRESHOLDS,
  DAILY_DOSE_THRESHOLDS,
} from "./constants";
import type { ExposureLevel, TripSegment } from "./types";

// Prototype exposure index — NOT a clinical threshold.
// Segment dose = PM2.5 concentration x duration (hours).
export function segmentDose(pm25: number, durationHours: number): number {
  return pm25 * durationHours;
}

export function sumExposure(doses: number[]): number {
  return doses.reduce((a, b) => a + b, 0);
}

export function average(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

// The shared, app-wide "average PM2.5" rule: average per distinct real
// monitoring *area* (station) actually encountered, not per raw sample
// point. Nearest-station matching has no distance cap, so many GPS points
// or routing-graph segments along one stretch commonly resolve to the same
// single real station — averaging per sample lets that one reading
// dominate just because of how many points/segments happened to land
// nearest to it, not because of how much of the trip/route it actually
// represents. A segment with no stationName (purely synthetic, no real
// station involved) has nothing to dedupe against, so it counts as its
// own area — this naturally reduces to a plain per-segment average for
// fully synthetic data, which is already correct there (each synthetic
// segment is an independent simulated sample, not a resampling artifact).
export function averageEnvByArea(segments: TripSegment[]): {
  avgPm25: number;
  avgPm10: number;
  avgNo2: number;
} {
  if (segments.length === 0) return { avgPm25: 0, avgPm10: 0, avgNo2: 0 };

  const byArea = new Map<string, { pm25: number; pm10: number; no2: number; count: number }>();
  segments.forEach((seg, i) => {
    const key = seg.env.stationName ?? `__no-station-${i}`;
    const e = byArea.get(key) ?? { pm25: 0, pm10: 0, no2: 0, count: 0 };
    e.pm25 += seg.env.pm25;
    e.pm10 += seg.env.pm10;
    e.no2 += seg.env.no2;
    e.count += 1;
    byArea.set(key, e);
  });

  const areas = [...byArea.values()].map((e) => ({
    pm25: e.pm25 / e.count,
    pm10: e.pm10 / e.count,
    no2: e.no2 / e.count,
  }));

  return {
    avgPm25: average(areas.map((a) => a.pm25)),
    avgPm10: average(areas.map((a) => a.pm10)),
    avgNo2: average(areas.map((a) => a.no2)),
  };
}

function classifyByThresholds(
  value: number,
  thresholds: { low: number; moderate: number }
): ExposureLevel {
  if (value < thresholds.low) return "Low";
  if (value < thresholds.moderate) return "Moderate";
  return "High";
}

// Momentary PM2.5 concentration (µg/m³) — e.g. "current exposure" readouts.
export function classifyPm25(pm25: number): ExposureLevel {
  return classifyByThresholds(pm25, PM25_LEVEL_THRESHOLDS);
}

// A single trip's (or in-progress ride's) cumulative dose.
export function classifyTripExposure(dose: number): ExposureLevel {
  return classifyByThresholds(dose, TRIP_DOSE_THRESHOLDS);
}

// Average daily dose within a multi-day window (e.g. 90-day total / working
// days), so windows of different lengths remain comparable.
export function classifyDailyRate(avgDailyDose: number): ExposureLevel {
  return classifyByThresholds(avgDailyDose, DAILY_DOSE_THRESHOLDS);
}

export function exposureLevelColor(level: ExposureLevel): string {
  switch (level) {
    case "Low":
      return "text-emerald-600 bg-emerald-50 border-emerald-200";
    case "Moderate":
      return "text-amber-600 bg-amber-50 border-amber-200";
    case "High":
      return "text-rose-600 bg-rose-50 border-rose-200";
  }
}
