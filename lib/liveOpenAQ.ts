// OPTIONAL live current-conditions source (MODE B) — OpenAQ
// (api.openaq.org/v3), a nonprofit that aggregates real ground-level
// air-quality monitoring data (government reference stations and other
// providers) worldwide under an open, attribution-based license (unlike
// WAQI's non-commercial/no-caching restriction). Requires the deployer's
// own free API key (OPENAQ_API_KEY, X-API-Key header) — get one at
// https://explore.openaq.org/register.
//
// Coverage caveat, stated rather than assumed: OpenAQ's Malaysia coverage
// was not confirmed during development (no test key was available to query
// live) — DOE/JAS itself has no public API for OpenAQ to ingest from (see
// README.md), so whether OpenAQ carries any Klang Valley location at all
// depends on whatever third-party providers it currently tracks there. This
// module tries a 25 km radius search around the query point and returns
// null (falling through to the next tier) if nothing is found, exactly
// like every other tier here — never fabricates a result.
//
// Because OpenAQ mixes reference-grade government stations and lower-cost
// sensor networks depending on who submits data for a given location, this
// module surfaces the actual `provider.name` OpenAQ reports rather than
// assuming reference-grade accuracy.

import { haversineKm } from "./geo";
import type { EnvironmentalReading } from "./types";

const OPENAQ_BASE = "https://api.openaq.org/v3";
const SEARCH_RADIUS_M = 25000; // OpenAQ's documented maximum

export function isOpenAqConfigured(): boolean {
  return Boolean(process.env.OPENAQ_API_KEY);
}

interface OpenAqLocation {
  id: number;
  name: string | null;
  coordinates: { latitude: number; longitude: number };
  provider?: { name: string };
  sensors: { id: number; parameter: { name: string; units: string } }[];
}

interface OpenAqLatestResult {
  sensorsId: number;
  value: number;
  datetime?: { utc?: string };
}

async function fetchJson(url: string, apiKey: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
      next: { revalidate: 300 }, // 5-minute cache — "sensible", never claimed as second-by-second
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchOpenAqReading(lat: number, lng: number): Promise<EnvironmentalReading | null> {
  const apiKey = process.env.OPENAQ_API_KEY;
  if (!apiKey) return null;

  const retrievedAt = new Date().toISOString();

  const locationsJson = await fetchJson(
    `${OPENAQ_BASE}/locations?coordinates=${lat.toFixed(4)},${lng.toFixed(4)}&radius=${SEARCH_RADIUS_M}&limit=10`,
    apiKey,
    6000
  );
  const locations: OpenAqLocation[] = locationsJson?.results ?? [];
  if (locations.length === 0) return null;

  let nearest: OpenAqLocation | null = null;
  let nearestDistanceKm = Infinity;
  for (const loc of locations) {
    if (!loc.coordinates || !loc.sensors?.some((s) => s.parameter.name === "pm25")) continue;
    const d = haversineKm({ lat, lng }, { lat: loc.coordinates.latitude, lng: loc.coordinates.longitude });
    if (d < nearestDistanceKm) {
      nearestDistanceKm = d;
      nearest = loc;
    }
  }
  if (!nearest) return null;

  const latestJson = await fetchJson(`${OPENAQ_BASE}/locations/${nearest.id}/latest`, apiKey, 6000);
  const latest: OpenAqLatestResult[] = latestJson?.results ?? [];
  if (latest.length === 0) return null;

  const sensorParam = new Map(nearest.sensors.map((s) => [s.id, s.parameter.name]));
  const valueFor = (paramName: string) => {
    const entry = latest.find((r) => sensorParam.get(r.sensorsId) === paramName);
    return entry ?? null;
  };

  const pm25Entry = valueFor("pm25");
  if (!pm25Entry) return null; // no fabricated fallback

  const pm10Entry = valueFor("pm10");
  const no2Entry = valueFor("no2");

  return {
    pm25: Math.round(pm25Entry.value * 10) / 10,
    pm10: pm10Entry ? Math.round(pm10Entry.value * 10) / 10 : null,
    no2: no2Entry ? Math.round(no2Entry.value * 10) / 10 : null,
    observedAt: pm25Entry.datetime?.utc ?? retrievedAt,
    retrievedAt,
    source: `OpenAQ aggregator — provider: ${nearest.provider?.name ?? "unknown"}`,
    measurement: "measured",
    mode: "live",
    stationName: nearest.name ?? undefined,
    distanceKm: Math.round(nearestDistanceKm * 10) / 10,
    interpolationMethod: "Nearest OpenAQ-tracked monitoring location, no spatial interpolation",
  };
}
