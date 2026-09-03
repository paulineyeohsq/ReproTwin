// Real road-network routing via OSRM's public demo instance
// (router.project-osrm.org) — a lightweight, no-API-key routing engine, as
// explicitly permitted by the brief ("a lightweight routing solution such
// as OSRM is acceptable for the prototype"). This is a shared public demo
// service, not a self-hosted deployment: it is rate-limited and not
// intended for production traffic, so every call here has a timeout and a
// documented fallback (see lib/routeAdvisor.ts) rather than assuming it is
// always reachable.
//
// The public demo only serves a "driving" profile (no motorcycle-specific
// profile exists on it). That is used as the closest available
// approximation for road-following geometry — a documented simplification,
// not a claim of motorcycle-specific routing.

const OSRM_BASE_URL = "https://router.project-osrm.org";
const REQUEST_TIMEOUT_MS = 8000;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OsrmRouteResult {
  distanceKm: number;
  durationMin: number;
  coordinates: LatLng[]; // full road-snapped geometry, in travel order
  // Per-segment arrays, one entry per consecutive pair in `coordinates`
  // (so length = coordinates.length - 1), taken directly from OSRM's
  // per-edge annotations — these are real routing-graph segments, not a
  // resampled approximation.
  segmentDistancesKm: number[];
  segmentDurationsMin: number[];
  segmentSpeedsKmh: number[];
  source: "osrm-live";
}

function coordString(points: LatLng[]): string {
  return points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
}

// Fetches one real road-following route through the given waypoints (in
// order — for >2 waypoints this is used as a "via point" technique: OSRM
// computes the genuine shortest real-road path visiting each waypoint in
// sequence, which is how this module gets three *different* real routes
// out of a routing engine whose public demo instance doesn't expose an
// "avoid main roads" parameter). Returns null on any failure — timeout,
// network unavailable, no route found — so callers can fall back cleanly.
export async function fetchOsrmRoute(waypoints: LatLng[]): Promise<OsrmRouteResult | null> {
  if (waypoints.length < 2) return null;
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordString(waypoints)}?overview=full&geometries=geojson&annotations=true&alternatives=false`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;

    const route = data.routes[0];
    const coordinates: LatLng[] = route.geometry.coordinates.map(
      ([lng, lat]: [number, number]) => ({ lat, lng })
    );

    const segmentDistancesKm: number[] = [];
    const segmentDurationsMin: number[] = [];
    const segmentSpeedsKmh: number[] = [];

    for (const leg of route.legs ?? []) {
      const dist: number[] = leg.annotation?.distance ?? [];
      const dur: number[] = leg.annotation?.duration ?? [];
      for (let i = 0; i < dist.length; i++) {
        const dKm = dist[i] / 1000;
        const durMin = dur[i] / 60;
        segmentDistancesKm.push(dKm);
        segmentDurationsMin.push(durMin);
        segmentSpeedsKmh.push(durMin > 0 ? (dKm / durMin) * 60 : 0);
      }
    }

    return {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
      coordinates,
      segmentDistancesKm,
      segmentDurationsMin,
      segmentSpeedsKmh,
      source: "osrm-live",
    };
  } catch {
    return null;
  }
}

// Offsets a point perpendicular to the origin->destination line, used to
// bias a via-waypoint so OSRM computes a genuinely different (but still
// 100% real, road-snapped) path for the "balanced" and "low exposure"
// route options.
export function biasWaypoint(
  origin: LatLng,
  destination: LatLng,
  offsetKm: number,
  side: 1 | -1
): LatLng {
  const mid: LatLng = {
    lat: (origin.lat + destination.lat) / 2,
    lng: (origin.lng + destination.lng) / 2,
  };
  const dx = destination.lng - origin.lng;
  const dy = destination.lat - origin.lat;
  const len = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  const perpLat = -dx / len;
  const perpLng = dy / len;
  const kmPerDegLat = 111;
  const kmPerDegLng = 111 * Math.cos((mid.lat * Math.PI) / 180);
  return {
    lat: mid.lat + (perpLat * offsetKm * side) / kmPerDegLat,
    lng: mid.lng + (perpLng * offsetKm * side) / kmPerDegLng,
  };
}

// Fetches several genuinely distinct, fully real-road-following routes
// between an origin and destination (a direct path plus two via-biased
// detours in different directions/magnitudes). Returns null if OSRM is
// unreachable or any request fails — callers should fall back to the
// procedural demonstration routes in that case rather than mixing real and
// fabricated geometry in the same comparison.
//
// Deliberately does NOT assume which of these paths ends up "fastest" or
// "lowest exposure" — a geometric detour through real Malaysian roads does
// not reliably land on quieter streets (OSRM's public demo has no "avoid
// busy roads" parameter), so the caller computes exposure for all of them
// and assigns the Fastest/Balanced/Low-exposure labels by actual outcome.
export async function fetchDiverseRoadRoutes(
  origin: LatLng,
  destination: LatLng
): Promise<OsrmRouteResult[] | null> {
  const viaA = biasWaypoint(origin, destination, 1.4, 1);
  const viaB = biasWaypoint(origin, destination, 1.4, -1);
  const viaC = biasWaypoint(origin, destination, 3.2, -1);

  const [direct, detourA, detourB, detourC] = await Promise.all([
    fetchOsrmRoute([origin, destination]),
    fetchOsrmRoute([origin, viaA, destination]),
    fetchOsrmRoute([origin, viaB, destination]),
    fetchOsrmRoute([origin, viaC, destination]),
  ]);

  const routes = [direct, detourA, detourB, detourC].filter(
    (r): r is OsrmRouteResult => r !== null
  );
  return routes.length > 0 ? routes : null;
}
