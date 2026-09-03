import fs from "node:fs";
import path from "node:path";
import type { DataMode } from "./types";

// REAL DATA MODE vs DEMO/SYNTHETIC DATA MODE.
//
// The app ships with a fully synthetic 90-day dataset (data/trips.json,
// physiology.json, hotspots.json, model.json) so it runs with zero external
// dependencies. It can be pointed at real Malaysian data instead by placing
// CSV files under data/real/ — see lib/realDataAdapter.ts for the expected
// schemas and README.md for setup instructions.
//
// Detection is purely file-presence based (no network calls, no build-time
// dependency on external services), so the mode is knowable synchronously
// and safely from a Server Component.

const REAL_ENV_DIR = path.join(process.cwd(), "data", "real", "environment");
const REAL_MOBILITY_DIR = path.join(process.cwd(), "data", "real", "mobility");

function dirHasCsv(dir: string): boolean {
  try {
    return fs.readdirSync(dir).some((f) => f.toLowerCase().endsWith(".csv"));
  } catch {
    return false;
  }
}

export interface DataModeStatus {
  mode: DataMode;
  hasRealEnvironmentData: boolean;
  hasRealMobilityData: boolean;
}

export function getDataModeStatus(): DataModeStatus {
  const hasRealEnvironmentData = dirHasCsv(REAL_ENV_DIR);
  const hasRealMobilityData = dirHasCsv(REAL_MOBILITY_DIR);
  // Exposure calculation needs both a real trajectory and real pollutant
  // readings to match against it — with only one of the two present, the
  // app cannot actually compute a real exposure figure, so it stays in
  // demo mode rather than showing a REAL DATA MODE banner that isn't
  // really driving anything. The Data page still reports whichever half
  // was found.
  return {
    mode: hasRealEnvironmentData && hasRealMobilityData ? "real" : "demo",
    hasRealEnvironmentData,
    hasRealMobilityData,
  };
}
