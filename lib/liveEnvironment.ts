// OPTIONAL live current-conditions source (MODE B).
//
// Investigation summary (see README.md for the full write-up): the
// Department of Environment Malaysia (DOE/JAS) operates a real-time,
// station-level Air Pollutant Index network (APIMS, ~66 stations,
// published hourly, National Environmental Command Centre). However, no
// publicly documented, self-service developer API for it was found —
// eqms.doe.gov.my hosts the MyJAS EQMS system for direct/manual lookups,
// not an open API a third-party app can call. Malaysia's official open-data
// API (developer.data.gov.my / OpenDOSM) also does not expose it: its only
// air-quality dataset is monthly and national (see lib/historicalOpenDosm.ts).
//
// The closest technically-available option is the World Air Quality Index
// (WAQI/aqicn.org) project, a third-party aggregator that mirrors DOE's own
// APIMS station feed in near-real-time. This module integrates it as an
// explicitly OPTIONAL, OFF-BY-DEFAULT path, because its terms of use
// (https://aqicn.org/api/) carry real constraints this prototype must
// respect rather than quietly ignore:
//   - requires the deployer's own free API token — never a bundled/shared
//     token, so MODE B only activates if the person running this app has
//     registered one themselves (WAQI_TOKEN env var);
//   - "cannot be redistributed as cached or archived data" — this module
//     never persists a raw feed response; only the small derived pm25/
//     exposure figures actually used for one specific ride are ever saved
//     (see lib/tripStore.ts), and even those only client-side, per rider;
//   - mandatory attribution to the World Air Quality Index Project, shown
//     wherever a MODE B reading is displayed;
//   - non-profit/organisational (non-purely-personal) use is asked to
//     notify or agree with the WAQI team directly — this integration does
//     NOT constitute that agreement. Treat MODE B as a technical proof of
//     what a live integration would look like, and confirm licensing
//     directly with WAQI before using it beyond local development/research
//     demonstration.

import { haversineKm } from "./geo";
import type { EnvironmentalReading } from "./types";

const WAQI_BASE = "https://api.waqi.info/feed";

export function isLiveEnvironmentConfigured(): boolean {
  return Boolean(process.env.WAQI_TOKEN);
}

interface WaqiResponse {
  status: string;
  data?: {
    city?: { geo?: [number, number]; name?: string };
    iaqi?: Record<string, { v: number }>;
    time?: { iso?: string };
    forecast?: { daily?: { pm25?: { avg: number; day: string; max: number; min: number }[] } };
  };
}

// Shared fetch+parse — both fetchLiveReading and fetchWaqiHistoricalAverage
// hit the same URL, which Next.js's fetch cache/dedup already collapses
// into one network call per render when both are used on the same page.
async function fetchWaqiRaw(lat: number, lng: number): Promise<WaqiResponse["data"] | null> {
  const token = process.env.WAQI_TOKEN;
  if (!token) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    // 5-minute cache: "sensible caching", never claimed as second-by-second
    // measurement even when the underlying station itself updates hourly.
    const res = await fetch(`${WAQI_BASE}/geo:${lat};${lng}/?token=${token}`, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const json: WaqiResponse = await res.json();
    if (json.status !== "ok" || !json.data) return null;
    return json.data;
  } catch {
    return null; // network failure/timeout — fall through, never fabricate
  }
}

export async function fetchLiveReading(lat: number, lng: number): Promise<EnvironmentalReading | null> {
  const retrievedAt = new Date().toISOString();
  const data = await fetchWaqiRaw(lat, lng);
  if (!data) return null;

  const iaqi = data.iaqi ?? {};
  if (iaqi.pm25?.v === undefined) return null; // no fabricated fallback

  const stationGeo = data.city?.geo;
  const distanceKm = stationGeo
    ? Math.round(haversineKm({ lat, lng }, { lat: stationGeo[0], lng: stationGeo[1] }) * 10) / 10
    : undefined;

  return {
    pm25: iaqi.pm25.v,
    pm10: iaqi.pm10?.v ?? null,
    no2: iaqi.no2?.v ?? null,
    observedAt: data.time?.iso ?? retrievedAt,
    retrievedAt,
    source: "DOE/JAS station network via World Air Quality Index (WAQI) aggregator — attribution: aqicn.org",
    measurement: "measured",
    mode: "live",
    stationName: data.city?.name,
    distanceKm,
    interpolationMethod: "Nearest live-reporting station, no spatial interpolation",
  };
}

export interface MalaysiaStation {
  name: string;
  lat: number;
  lng: number;
  aqi: number;
  observedAt: string;
}

// Roughly covers all of Malaysia (Peninsular + Sabah/Sarawak); the WAQI
// bounds query also returns nearby stations in Thailand/Singapore/Brunei/
// Indonesia that happen to fall inside this box, so results are filtered
// to station names WAQI itself labels "Malaysia".
const MALAYSIA_BOUNDS = { south: 0.5, west: 98.5, north: 7.8, east: 119.8 };

// One request for every reporting station in the country, rather than a
// point-by-point query per location — this is what makes a genuine
// nationwide live map feasible without hammering the API.
export async function fetchMalaysiaStations(): Promise<MalaysiaStation[]> {
  const token = process.env.WAQI_TOKEN;
  if (!token) return [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const { south, west, north, east } = MALAYSIA_BOUNDS;
    const res = await fetch(`https://api.waqi.info/map/bounds/?latlng=${south},${west},${north},${east}&token=${token}`, {
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];

    const json = await res.json();
    if (json.status !== "ok" || !Array.isArray(json.data)) return [];

    const stations: MalaysiaStation[] = [];
    for (const s of json.data) {
      const name: string = s.station?.name ?? "";
      if (!name.includes("Malaysia")) continue; // exclude neighbouring countries in the same bounding box
      const aqi = Number(s.aqi);
      if (!Number.isFinite(aqi)) continue; // WAQI returns "-" for stations with no current reading
      stations.push({
        name,
        lat: s.lat,
        lng: s.lon,
        aqi,
        observedAt: s.station?.time ?? new Date().toISOString(),
      });
    }
    return stations;
  } catch {
    return []; // network failure/timeout — never fabricate station data
  }
}

export interface WaqiHistoricalAverage {
  avgPm25: number;
  dayCount: number;
  days: string[]; // YYYY-MM-DD, oldest first
  stationName?: string;
  distanceKm?: number;
  source: string;
}

// WAQI's forecast.daily.pm25 array blends a few recent PAST days with
// several FUTURE forecast days in one undifferentiated list (the API gives
// no per-entry flag distinguishing observed-history from ML forecast). To
// avoid ever labelling a forecast as "historical", this only averages
// entries whose date is strictly before today (UTC) — so on a given day it
// may return very few days (sometimes zero, in which case it returns
// null rather than fabricating a figure from forecast data).
export async function fetchWaqiHistoricalAverage(lat: number, lng: number): Promise<WaqiHistoricalAverage | null> {
  const data = await fetchWaqiRaw(lat, lng);
  if (!data) return null;

  const dailyPm25 = data.forecast?.daily?.pm25 ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const pastDays = dailyPm25.filter((d) => d.day < todayStr).sort((a, b) => a.day.localeCompare(b.day));
  if (pastDays.length === 0) return null;

  const stationGeo = data.city?.geo;
  const distanceKm = stationGeo
    ? Math.round(haversineKm({ lat, lng }, { lat: stationGeo[0], lng: stationGeo[1] }) * 10) / 10
    : undefined;

  return {
    avgPm25: Math.round((pastDays.reduce((s, d) => s + d.avg, 0) / pastDays.length) * 10) / 10,
    dayCount: pastDays.length,
    days: pastDays.map((d) => d.day),
    stationName: data.city?.name,
    distanceKm,
    source: "DOE/JAS station network via World Air Quality Index (WAQI) aggregator — attribution: aqicn.org",
  };
}
