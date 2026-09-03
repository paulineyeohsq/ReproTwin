// OPTIONAL live current-conditions source (MODE B), alternative to WAQI
// (lib/liveEnvironment.ts) — PurpleAir's own key-based REST API
// (api.purpleair.com/v1/sensors, header X-API-Key). There is real sensor
// coverage in Klang Valley/Kuala Lumpur (see map.purpleair.com/malaysia).
//
// Important accuracy caveat this module encodes rather than hides:
// PurpleAir sensors are consumer-grade optical particle counters, not
// government reference-grade monitors. They are well documented to read
// PM2.5 noticeably HIGH relative to reference monitors, especially at high
// relative humidity, unless a correction factor (e.g. the US EPA or
// AQandU correction) is applied. This module reports the raw `pm2.5_atm`
// value uncorrected and labels it explicitly as "consumer-grade,
// uncorrected" — never presented with the same implied accuracy as a DOE/
// JAS reference station.
//
// Off by default — requires the deployer's own free API key
// (PURPLEAIR_API_KEY env var), obtained directly from PurpleAir
// (https://develop.purpleair.com/). No raw sensor payload is ever
// persisted; only the small derived pm25 figure used for a specific ride
// is saved (see lib/tripStore.ts), consistent with the same
// no-archiving-of-the-raw-feed posture used for WAQI.

import { haversineKm } from "./geo";
import type { EnvironmentalReading } from "./types";

const PURPLEAIR_BASE = "https://api.purpleair.com/v1/sensors";
// Roughly a Klang-Valley-sized box around the query point (~16 km each way)
// — wide enough to reliably catch a nearby sensor without pulling in
// sensors from unrelated cities.
const BOX_DEGREES = 0.15;

export function isPurpleAirConfigured(): boolean {
  return Boolean(process.env.PURPLEAIR_API_KEY);
}

interface PurpleAirResponse {
  fields: string[];
  data: (number | null)[][];
}

export async function fetchPurpleAirReading(lat: number, lng: number): Promise<EnvironmentalReading | null> {
  const apiKey = process.env.PURPLEAIR_API_KEY;
  if (!apiKey) return null;

  const retrievedAt = new Date().toISOString();
  try {
    const fields = "pm2.5_atm,pm10.0_atm,humidity,latitude,longitude,last_seen,confidence";
    const params = new URLSearchParams({
      fields,
      // location_type=0 restricts to outdoor sensors, avoiding indoor units
      // that would misrepresent ambient roadside/outdoor exposure.
      location_type: "0",
      nwlat: String(lat + BOX_DEGREES),
      nwlng: String(lng - BOX_DEGREES),
      selat: String(lat - BOX_DEGREES),
      selng: String(lng + BOX_DEGREES),
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${PURPLEAIR_BASE}?${params.toString()}`, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
      next: { revalidate: 300 }, // 5-minute cache — "sensible", never claimed as second-by-second
    });
    clearTimeout(timeout);
    if (!res.ok) return null;

    const json: PurpleAirResponse = await res.json();
    if (!json.fields || !json.data || json.data.length === 0) return null;

    const idx = (name: string) => json.fields.indexOf(name);
    const iLat = idx("latitude");
    const iLng = idx("longitude");
    const iPm25 = idx("pm2.5_atm");
    const iPm10 = idx("pm10.0_atm");
    const iLastSeen = idx("last_seen");
    if (iLat < 0 || iLng < 0 || iPm25 < 0) return null;

    let nearest: (number | null)[] | null = null;
    let nearestDistanceKm = Infinity;
    for (const row of json.data) {
      const sLat = row[iLat];
      const sLng = row[iLng];
      const pm25 = row[iPm25];
      if (sLat === null || sLng === null || pm25 === null) continue;
      const d = haversineKm({ lat, lng }, { lat: sLat, lng: sLng });
      if (d < nearestDistanceKm) {
        nearestDistanceKm = d;
        nearest = row;
      }
    }
    if (!nearest) return null; // no fabricated fallback

    const pm25 = nearest[iPm25] as number;
    const pm10 = iPm10 >= 0 ? (nearest[iPm10] as number | null) : null;
    const lastSeenEpoch = iLastSeen >= 0 ? (nearest[iLastSeen] as number | null) : null;
    const observedAt = lastSeenEpoch ? new Date(lastSeenEpoch * 1000).toISOString() : retrievedAt;

    return {
      pm25: Math.round(pm25 * 10) / 10,
      pm10: pm10 !== null ? Math.round(pm10 * 10) / 10 : null,
      no2: null, // PurpleAir sensors do not measure NO2
      observedAt,
      retrievedAt,
      source: "PurpleAir community sensor network (consumer-grade, uncorrected) — attribution: purpleair.com",
      measurement: "measured",
      mode: "live",
      distanceKm: Math.round(nearestDistanceKm * 10) / 10,
      interpolationMethod:
        "Nearest reporting PurpleAir sensor, no spatial interpolation — raw optical-sensor reading, not EPA-corrected; consumer sensors read PM2.5 higher than reference monitors in humid conditions",
    };
  } catch {
    return null; // network failure/timeout — fall through, never fabricate
  }
}
