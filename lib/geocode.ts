// Free-text destination search via OpenStreetMap's Nominatim geocoder.
// Public service, no API key — usage policy requires a descriptive
// User-Agent and caps requests at ~1/sec, which is well within what this
// prototype needs (one geocode per destination search).

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "ReproTwin-ResearchPrototype/1.0 (exposure-aware navigation research prototype)";

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export async function geocodeDestination(query: string): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=my`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((r) => ({
      label: r.display_name as string,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }));
  } catch {
    return [];
  }
}
