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

import { haversineKm, maxSeparationKm } from "./geo";

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

// Shared parser for one OSRM "route" object (from either a single-route or
// alternatives=true response) into this module's result shape.
function parseOsrmRoute(route: {
  geometry: { coordinates: [number, number][] };
  legs?: { annotation?: { distance?: number[]; duration?: number[] } }[];
  distance: number;
  duration: number;
}): OsrmRouteResult {
  const coordinates: LatLng[] = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

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
}

// Fetches one real road-following route through the given waypoints (in
// order — for >2 waypoints this is used as a "via point" technique: OSRM
// computes the genuine shortest real-road path visiting each waypoint in
// sequence, which is how this module gets several *different* real routes
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
    return parseOsrmRoute(data.routes[0]);
  } catch {
    return null;
  }
}

// Fetches OSRM's own alternative-route candidates for a direct
// origin->destination request (alternatives=true) — unlike the via-point
// bias below, this is OSRM's own routing algorithm proposing genuinely
// different real paths it considers reasonable (e.g. a secondary road
// corridor vs. the primary highway), which is often a better source of
// real diversity than a blind perpendicular offset, especially for short
// urban trips. OSRM's alternatives parameter is unreliable with via-points,
// so this is only used for the direct two-point request. Returns [] (not
// null) on any failure so callers can still fall back to via-point detours.
async function fetchOsrmAlternatives(origin: LatLng, destination: LatLng, maxAlternatives: number): Promise<OsrmRouteResult[]> {
  const url = `${OSRM_BASE_URL}/route/v1/driving/${coordString([origin, destination])}?overview=full&geometries=geojson&annotations=true&alternatives=true`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return [];
    return data.routes.slice(0, maxAlternatives).map(parseOsrmRoute);
  } catch {
    return [];
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

// Upper bound on the real candidate pool handed back to the route advisor
// (targeting 3-5 genuinely distinct real routes — see the via-point spread
// below). The advisor labels (up to) three of these as Fastest/Balanced/
// Low-exposure by actual computed outcome — a wider real pool makes it far
// more likely a genuinely non-dominated "Balanced" route actually exists,
// rather than every via-detour just rejoining the same main road
// immediately (which a fixed, small, trip-length-independent offset was
// prone to on both very short and very long trips).
const MAX_CANDIDATE_ROUTES = 5;

// Fetches several genuinely distinct, fully real-road-following routes
// between an origin and destination, from two complementary real sources:
// (1) OSRM's own alternatives=true candidates for the direct request —
// OSRM's routing algorithm proposing genuinely different paths it
// considers reasonable, which is often the best source of real diversity
// for short urban trips — and (2) a spread of via-biased detours at
// offsets scaled to the trip's own length, as a fallback/supplement for
// routes where OSRM alone doesn't have (or reveal) more than one
// alternative. Near-duplicate results — a route that rejoins (almost) the
// same road as one already kept — are dropped via maxSeparationKm rather
// than shown as if they were a different option. Returns null if OSRM is
// unreachable or every request fails — callers should fall back to the
// procedural demonstration routes in that case rather than mixing real and
// fabricated geometry in the same comparison.
//
// Deliberately does NOT assume which of these paths ends up "fastest" or
// "lowest exposure" — a geometric detour through real Malaysian roads does
// not reliably land on quieter streets (OSRM's public demo has no "avoid
// busy roads" parameter), so the caller computes exposure for all of them
// and assigns the Fastest/Balanced/Low-exposure labels by actual outcome.
// The returned pool can still be smaller than 3 when the real road network
// genuinely doesn't offer that many distinct paths (e.g. a single-road
// rural link) — this never fabricates a route to pad the count.
export async function fetchDiverseRoadRoutes(
  origin: LatLng,
  destination: LatLng
): Promise<OsrmRouteResult[] | null> {
  const straightLineKm = haversineKm(origin, destination);
  // Narrow/wide offset magnitudes as a fraction of trip length, clamped so
  // a short trip still gets a meaningful detour and a very long highway
  // trip doesn't get an absurdly large (multi-hour) one.
  const narrowOffsetKm = Math.min(8, Math.max(0.6, straightLineKm * 0.12));
  const wideOffsetKm = Math.min(15, Math.max(1.2, straightLineKm * 0.28));

  const viaPoints = [
    biasWaypoint(origin, destination, narrowOffsetKm, 1),
    biasWaypoint(origin, destination, narrowOffsetKm, -1),
    biasWaypoint(origin, destination, wideOffsetKm, 1),
    biasWaypoint(origin, destination, wideOffsetKm, -1),
  ];

  const [alternatives, ...detours] = await Promise.all([
    fetchOsrmAlternatives(origin, destination, 3),
    ...viaPoints.map((via) => fetchOsrmRoute([origin, via, destination])),
  ]);

  const fetched = [...alternatives, ...detours].filter((r): r is OsrmRouteResult => r !== null);
  if (fetched.length === 0) return null;

  // Keep a route only if its shape genuinely diverges from every route
  // already kept — direct/free-flow-preferring OSRM routing frequently
  // returns via-detours that rejoin the main road within a few hundred
  // metres, which must not count as a "different" candidate.
  const distinctThresholdKm = Math.min(5, Math.max(0.5, straightLineKm * 0.04));
  const distinct: OsrmRouteResult[] = [];
  for (const candidate of fetched) {
    const isDuplicate = distinct.some(
      (kept) => maxSeparationKm(candidate.coordinates, kept.coordinates) < distinctThresholdKm
    );
    if (!isDuplicate) distinct.push(candidate);
  }

  return distinct.slice(0, MAX_CANDIDATE_ROUTES);
}
