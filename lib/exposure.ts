import {
  PM25_LEVEL_THRESHOLDS,
  TRIP_DOSE_THRESHOLDS,
  DAILY_DOSE_THRESHOLDS,
} from "./constants";
import type { ExposureLevel } from "./types";

// Prototype exposure index — NOT a clinical threshold.
// Segment dose = PM2.5 concentration x duration (hours).
export function segmentDose(pm25: number, durationHours: number): number {
  return pm25 * durationHours;
}

export function sumExposure(doses: number[]): number {
  return doses.reduce((a, b) => a + b, 0);
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
