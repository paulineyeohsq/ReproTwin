// Free-text destination search via OpenStreetMap's Nominatim geocoder.
// Public service, no API key — usage policy requires a descriptive
// User-Agent and caps requests at ~1/sec, which is well within what this
// prototype needs (one geocode per destination search).

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const USER_AGENT = "ReproTwin-ResearchPrototype/1.0 (exposure-aware navigation research prototype)";

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export async function geocodeDestination(query: string): Promise<GeocodeResult[]> {
  if (!query.trim()) return [];
  const url = `${NOMINATIM_SEARCH_URL}?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=my`;

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

// Turns a real device GPS fix into a short, human-readable place name (e.g.
// "Petaling Jaya, Selangor") for display as "Current location" — never a
// hardcoded/assumed city. Falls back to null (caller shows raw
// coordinates or a generic label) rather than fabricating a place name if
// Nominatim is unreachable.
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const url = `${NOMINATIM_REVERSE_URL}?lat=${lat}&lon=${lng}&format=json&zoom=14`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const address = data?.address;
    if (!address) return data?.display_name ?? null;
    const place = address.suburb ?? address.town ?? address.city ?? address.city_district ?? address.village;
    const state = address.state;
    return [place, state].filter(Boolean).join(", ") || data?.display_name || null;
  } catch {
    return null;
  }
}
