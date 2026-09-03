// Real, live fetch of Malaysia's official OpenDOSM (data.gov.my) "Monthly
// Air Pollution" dataset — a genuine network call to a real government
// open-data endpoint, not a bundled or fabricated file.
// Source: https://open.dosm.gov.my/data-catalogue/air_pollution
// License: Creative Commons Attribution 4.0 International (CC BY 4.0) —
// usable in a research prototype with attribution.
//
// Two limitations verified during investigation (see README.md) that must
// never be hidden from the UI:
//   1. It is NATIONAL, not station-level — the dataset has no latitude/
//      longitude column at all, so it cannot be spatially matched to a
//      road segment or a specific rider location. It is only ever shown as
//      a national historical baseline, never plugged into the road-segment
//      exposure engine (see lib/realDataEngine.ts for the actual
//      station-level pipeline, which needs a separately-obtained,
//      researcher-supplied CSV).
//   2. It updates roughly annually (JAS publishes one cut a year), so a
//      "monthly" figure can be many months stale even immediately after a
//      successful fetch. Never call this "real-time" or "current" — always
//      "Historical Malaysian environmental data".

import Papa from "papaparse";

const OPENDOSM_CSV_URL = "https://storage.data.gov.my/environment/air_pollution.csv";

export type OpenDosmPollutant = "CO" | "NO2" | "O3" | "PM10" | "PM25" | "SO2";

const UNIT_BY_POLLUTANT: Record<OpenDosmPollutant, string> = {
  CO: "ppm",
  NO2: "ppm",
  O3: "ppm",
  PM10: "µg/m³",
  PM25: "µg/m³",
  SO2: "ppm",
};

interface OpenDosmRow {
  date: string;
  pollutant: string;
  concentration: number | null;
}

export interface OpenDosmLatest {
  pollutant: OpenDosmPollutant;
  concentration: number;
  month: string; // YYYY-MM-01
  unit: string;
  retrievedAt: string;
}

let cache: { rows: OpenDosmRow[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// The CSV's pollutant labels are inconsistent — verified directly against
// the live file: "PM 2.5" and "PM 10" carry a space (breaking a naive
// match against "PM25"/"PM10"), while some historical exports use Unicode
// superscripts (NO², O³) instead of plain digits. Strip both space AND dot
// globally (not just the first occurrence) rather than assuming one style.
function normalisePollutant(raw: string): string {
  return raw
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[\s.]/g, "")
    .toUpperCase();
}

async function loadRows(): Promise<OpenDosmRow[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.rows;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(OPENDOSM_CSV_URL, {
      signal: controller.signal,
      next: { revalidate: 86400 },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`OpenDOSM fetch failed: ${res.status}`);
    const text = await res.text();
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
    const rows: OpenDosmRow[] = parsed.data
      .map((r) => {
        const concentration = Number(r.concentration);
        return {
          date: r.date,
          pollutant: r.pollutant ?? "",
          concentration: Number.isFinite(concentration) ? concentration : null,
        };
      })
      .filter((r) => r.date);
    cache = { rows, fetchedAt: Date.now() };
    return rows;
  } catch {
    // Never fabricate a fallback number — a failed live fetch means
    // "unavailable this session", not "assume a default reading". Serve a
    // stale cache if we have one (still real data, just older), else empty.
    return cache?.rows ?? [];
  }
}

export async function getLatestNationalReading(pollutant: OpenDosmPollutant): Promise<OpenDosmLatest | null> {
  const rows = await loadRows();
  const matches = rows
    .filter((r) => normalisePollutant(r.pollutant) === pollutant && r.concentration !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = matches[matches.length - 1];
  if (!latest || latest.concentration === null) return null;
  return {
    pollutant,
    concentration: latest.concentration,
    month: latest.date,
    unit: UNIT_BY_POLLUTANT[pollutant],
    retrievedAt: new Date().toISOString(),
  };
}

export async function isOpenDosmReachable(): Promise<boolean> {
  const rows = await loadRows();
  return rows.length > 0;
}
