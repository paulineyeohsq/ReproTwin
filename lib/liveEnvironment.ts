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
  };
}

export async function fetchLiveReading(lat: number, lng: number): Promise<EnvironmentalReading | null> {
  const token = process.env.WAQI_TOKEN;
  if (!token) return null;

  const retrievedAt = new Date().toISOString();
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

    const iaqi = json.data.iaqi ?? {};
    if (iaqi.pm25?.v === undefined) return null; // no fabricated fallback

    const stationGeo = json.data.city?.geo;
    const distanceKm = stationGeo
      ? Math.round(haversineKm({ lat, lng }, { lat: stationGeo[0], lng: stationGeo[1] }) * 10) / 10
      : undefined;

    return {
      pm25: iaqi.pm25.v,
      pm10: iaqi.pm10?.v ?? null,
      no2: iaqi.no2?.v ?? null,
      observedAt: json.data.time?.iso ?? retrievedAt,
      retrievedAt,
      source: "DOE/JAS station network via World Air Quality Index (WAQI) aggregator — attribution: aqicn.org",
      measurement: "measured",
      mode: "live",
      stationName: json.data.city?.name,
      distanceKm,
      interpolationMethod: "Nearest live-reporting station, no spatial interpolation",
    };
  } catch {
    return null; // network failure/timeout — fall through, never fabricate
  }
}
