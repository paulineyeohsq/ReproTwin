// Central EnvironmentalDataProvider abstraction — the single place that
// decides which of the three environmental-data modes is actually driving
// a given "current conditions" reading, and returns a fully-provenanced
// EnvironmentalReading (never a bare number).
//
// Priority order (see README.md for the DOE/JAS + OpenDOSM investigation
// this is based on):
//   MODE B (live)       — only if WAQI_TOKEN is configured AND the live
//                          fetch actually succeeds for this request.
//   MODE A (historical) — only if a researcher-supplied DOE/JAS station CSV
//                          is loaded (data/real/environment/*.csv) and a
//                          station can be resolved for this location.
//   MODE C (synthetic)  — the always-available demonstration fallback.
// A higher-tier attempt that fails (no token, network error, no station)
// silently falls through to the next tier — but getEnvironmentalMode() and
// every EnvironmentalReading.mode value always reflect which tier actually
// served the result, so the UI can never show a live/historical badge over
// a synthetic number.

import { fetchLiveReading, isLiveEnvironmentConfigured } from "./liveEnvironment";
import { getLatestHistoricalReading } from "./realDataEngine";
import { getDataModeStatus } from "./dataMode";
import { sampleWeather, samplePollutants, inferTrafficLevel } from "./environment";
import { inferRoadType } from "./roadInference";
import { mulberry32, hashStringToSeed } from "./rng";
import type { EnvironmentalReading, EnvironmentalMode } from "./types";

// Mirrors getEffectiveMode()'s honesty rule in dataAccess.ts: a mode is only
// reported as active if it can actually resolve a reading, not merely
// because credentials/files are present.
export function getEnvironmentalMode(): EnvironmentalMode {
  if (isLiveEnvironmentConfigured()) return "live";
  if (getDataModeStatus().hasRealEnvironmentData) return "historical";
  return "synthetic";
}

function syntheticReading(atMs: number, seed: string): EnvironmentalReading {
  const at = new Date(atMs);
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const rng = mulberry32(hashStringToSeed(seed));
  const roadType = inferRoadType(30); // arterial-ish default for a generic "current location" reading
  const trafficLevel = inferTrafficLevel(hour, roadType, rng);
  const weather = sampleWeather(hour, rng);
  const { pm25, pm10, no2 } = samplePollutants(hour, roadType, trafficLevel, weather.wind_speed, rng);
  const now = new Date().toISOString();
  return {
    pm25,
    pm10,
    no2,
    observedAt: now,
    retrievedAt: now,
    source: "Prototype synthetic environmental model",
    measurement: "estimated",
    mode: "synthetic",
    interpolationMethod: "Simulated — not derived from any monitoring station",
  };
}

export async function getCurrentEnvironmentalReading(lat: number, lng: number): Promise<EnvironmentalReading> {
  if (isLiveEnvironmentConfigured()) {
    const live = await fetchLiveReading(lat, lng);
    if (live) return live;
    // Token configured but this request failed (network/rate-limit/no
    // nearby station) — fall through rather than ever showing a fabricated
    // "live" value.
  }

  const historical = getLatestHistoricalReading(lat, lng);
  if (historical) {
    return {
      pm25: historical.pm25,
      pm10: historical.pm10,
      no2: historical.no2,
      observedAt: historical.observedAt,
      retrievedAt: new Date().toISOString(),
      source: "DOE/JAS station data (researcher-supplied historical CSV)",
      // A nearest-station spatial match, never a co-located sensor.
      measurement: "estimated",
      mode: "historical",
      stationName: historical.stationName,
      distanceKm: historical.distanceKm,
      interpolationMethod: `Nearest monitoring station (${historical.distanceKm} km away) — most recent available reading, not live`,
    };
  }

  return syntheticReading(Date.now(), `current-${lat.toFixed(3)}-${lng.toFixed(3)}-${new Date().toISOString().slice(0, 13)}`);
}
