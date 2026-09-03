import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";

// Local data adapter for real Malaysian datasets, per the brief: "If direct
// API access is difficult during development, create a local data adapter
// that allows CSV files to be loaded." Drop CSV files into the folders
// below and the app will pick them up automatically (see README.md).
//
// This module only reads/validates files server-side — it never fetches
// anything over the network, so it's safe to call from any server context.

const REAL_ENV_DIR = path.join(process.cwd(), "data", "real", "environment");
const REAL_MOBILITY_DIR = path.join(process.cwd(), "data", "real", "mobility");

// data.gov.my / OpenDOSM air quality dataset columns (subset actually used
// by this prototype; extra columns in the source file are ignored).
// latitude/longitude are optional — most OpenDOSM exports identify a
// station by name only. When absent, lib/realDataEngine.ts falls back to
// an approximate town-level anchor (see lib/townAnchors.ts) or, failing
// that, leaves the station un-locatable rather than guessing.
export interface RealEnvironmentRow {
  location: string;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
  pm25: number | null;
  pm10: number | null;
  no2: number | null;
  so2: number | null;
  o3: number | null;
  co: number | null;
}

// "Real-world urban mobility trajectory data" — e.g. the Greater Kuala
// Lumpur Mobilities dataset, or any GPS trace using this schema.
export interface RealMobilityRow {
  timestamp: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  bearing: number | null;
  tripId: string | null;
  routeId: string | null;
}

function listCsvFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function readCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.trim().toLowerCase(), v])
  );
  for (const key of keys) {
    if (lower[key] !== undefined) return lower[key];
  }
  return undefined;
}

export interface RealDataLoadResult<T> {
  fileCount: number;
  rows: T[];
  dateRange: { start: string; end: string } | null;
}

export function loadRealEnvironmentData(): RealDataLoadResult<RealEnvironmentRow> {
  const files = listCsvFiles(REAL_ENV_DIR);
  const rows: RealEnvironmentRow[] = [];

  for (const file of files) {
    for (const raw of readCsv(file)) {
      const timestamp = pick(raw, "date", "timestamp", "datetime", "dt");
      if (!timestamp) continue;
      rows.push({
        location: pick(raw, "location", "station", "monitoring location") ?? "Unknown station",
        latitude: num(pick(raw, "latitude", "lat")),
        longitude: num(pick(raw, "longitude", "lng", "lon")),
        timestamp,
        pm25: num(pick(raw, "pm25", "pm2.5")),
        pm10: num(pick(raw, "pm10")),
        no2: num(pick(raw, "no2")),
        so2: num(pick(raw, "so2")),
        o3: num(pick(raw, "o3")),
        co: num(pick(raw, "co")),
      });
    }
  }

  return { fileCount: files.length, rows, dateRange: dateRangeOf(rows.map((r) => r.timestamp)) };
}

export function loadRealMobilityData(): RealDataLoadResult<RealMobilityRow> {
  const files = listCsvFiles(REAL_MOBILITY_DIR);
  const rows: RealMobilityRow[] = [];

  for (const file of files) {
    for (const raw of readCsv(file)) {
      const timestamp = pick(raw, "timestamp", "datetime", "time");
      const lat = num(pick(raw, "latitude", "lat"));
      const lng = num(pick(raw, "longitude", "lng", "lon"));
      if (!timestamp || lat === null || lng === null) continue;
      rows.push({
        timestamp,
        latitude: lat,
        longitude: lng,
        speed: num(pick(raw, "speed")),
        bearing: num(pick(raw, "bearing", "heading")),
        tripId: pick(raw, "trip_id", "tripid") ?? null,
        routeId: pick(raw, "route_id", "routeid") ?? null,
      });
    }
  }

  return { fileCount: files.length, rows, dateRange: dateRangeOf(rows.map((r) => r.timestamp)) };
}

function dateRangeOf(timestamps: string[]): { start: string; end: string } | null {
  const valid = timestamps
    .map((t) => new Date(t))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (valid.length === 0) return null;
  return {
    start: valid[0].toISOString(),
    end: valid[valid.length - 1].toISOString(),
  };
}
