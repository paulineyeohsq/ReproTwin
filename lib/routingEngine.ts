// Real road-network routing for a motorcycle rider, from two real sources:
//
// 1. TomTom Routing API (calculateRoute), when TOMTOM_API_KEY is
//    configured — queried with the real travelMode=motorcycle parameter,
//    which filters out roads where motorcycles are prohibited and applies
//    TomTom's own motorcycle-specific routing rules. This is genuine
//    motorcycle-aware routing, not an approximation.
// 2. OSRM's public demo instance (router.project-osrm.org), used only as a
//    fallback when TomTom isn't configured or a request fails — a
//    lightweight, no-API-key routing engine, as explicitly permitted by the
//    brief ("a lightweight routing solution such as OSRM is acceptable for
//    the prototype"). Its public demo only serves a generic "driving"
//    profile (no motorcycle-specific profile exists on it), so a route from
//    this tier is a car-profile approximation, not genuine motorcycle
//    routing — labelled as such everywhere `source` is surfaced.
//
// Both are shared public/free-tier services, not self-hosted deployments:
// every call here has a timeout and a documented fallback (see
// lib/routeAdvisor.ts) rather than assuming either is always reachable.

import { haversineKm, maxSeparationKm } from "./geo";

const OSRM_BASE_URL = "https://router.project-osrm.org";
const TOMTOM_ROUTING_BASE = "https://api.tomtom.com/routing/1/calculateRoute";
const REQUEST_TIMEOUT_MS = 8000;

export function isMotorcycleRoutingConfigured(): boolean {
  return Boolean(process.env.TOMTOM_API_KEY);
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OsrmRouteResult {
  distanceKm: number;
  durationMin: number;
  coordinates: LatLng[]; // full road-snapped geometry, in travel order
  // Per-segment arrays, one entry per consecutive pair in `coordinates`
  // (so length = coordinates.length - 1). For the OSRM tier these come
  // directly from OSRM's per-edge annotations (real routing-graph
  // segments, not a resampled approximation); for the TomTom tier, TomTom's
  // basic route response has no equivalent per-edge annotation, so these
  // are derived by splitting the route's real total duration across real
  // consecutive-point distances (a route-average speed estimate, still
  // built entirely from real coordinates/total time, not fabricated).
  segmentDistancesKm: number[];
  segmentDurationsMin: number[];
  segmentSpeedsKmh: number[];
  source: "osrm-live" | "tomtom-motorcycle";
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

function tomtomCoordString(points: LatLng[]): string {
  return points.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(":");
}

// Parses one TomTom calculateRoute "route" object into this module's
// shared result shape. TomTom's basic response gives real coordinates and
// a real total distance/duration, but no per-edge annotation the way
// OSRM's does — segment distance comes from real consecutive-point
// haversine distances, and segment duration/speed are that route's real
// total travel time distributed proportionally across those real
// distances (a route-average speed estimate, not per-edge ground truth).
function parseTomTomRoute(route: {
  legs: { points: { latitude: number; longitude: number }[] }[];
  summary: { lengthInMeters: number; travelTimeInSeconds: number };
}): OsrmRouteResult {
  const coordinates: LatLng[] = route.legs.flatMap((leg) => leg.points.map((p) => ({ lat: p.latitude, lng: p.longitude })));

  const segmentDistancesKm: number[] = [];
  for (let i = 1; i < coordinates.length; i++) {
    segmentDistancesKm.push(haversineKm(coordinates[i - 1], coordinates[i]));
  }
  const totalKm = route.summary.lengthInMeters / 1000;
  const totalMin = route.summary.travelTimeInSeconds / 60;
  const distanceSumKm = segmentDistancesKm.reduce((s, d) => s + d, 0) || totalKm || 1e-6;

  const segmentDurationsMin: number[] = [];
  const segmentSpeedsKmh: number[] = [];
  for (const dKm of segmentDistancesKm) {
    const durMin = (dKm / distanceSumKm) * totalMin;
    segmentDurationsMin.push(durMin);
    segmentSpeedsKmh.push(durMin > 0 ? (dKm / durMin) * 60 : 0);
  }

  return {
    distanceKm: totalKm,
    durationMin: totalMin,
    coordinates,
    segmentDistancesKm,
    segmentDurationsMin,
    segmentSpeedsKmh,
    source: "tomtom-motorcycle",
  };
}

// Real motorcycle-mode routing through the given waypoints (in order — via
// points work the same way as fetchOsrmRoute's, colon-separated instead of
// semicolon-separated). travelMode=motorcycle is TomTom's real routing
// parameter: it filters out roads where motorcycles are prohibited and
// applies TomTom's own motorcycle-specific routing rules, not a generic
// car route relabelled. Returns null when TOMTOM_API_KEY isn't configured
// or the request fails, so callers fall back to the OSRM car-profile tier.
async function fetchTomTomMotorcycleRoute(waypoints: LatLng[]): Promise<OsrmRouteResult | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key || waypoints.length < 2) return null;
  const url = `${TOMTOM_ROUTING_BASE}/${tomtomCoordString(waypoints)}/json?key=${key}&travelMode=motorcycle&routeType=fastest&traffic=true`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.routes?.length) return null;
    return parseTomTomRoute(data.routes[0]);
  } catch {
    return null;
  }
}

// TomTom's own alternative-route candidates for a direct origin->
// destination request (maxAlternatives) — like OSRM's alternatives=true,
// this only works reliably for a plain two-point request, not with via
// points. Returns [] (not null) on any failure so callers fall back to the
// OSRM tier's own alternatives.
async function fetchTomTomMotorcycleAlternatives(
  origin: LatLng,
  destination: LatLng,
  maxAlternatives: number
): Promise<OsrmRouteResult[]> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return [];
  const url = `${TOMTOM_ROUTING_BASE}/${tomtomCoordString([origin, destination])}/json?key=${key}&travelMode=motorcycle&routeType=fastest&traffic=true&maxAlternatives=${maxAlternatives}`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.routes?.length) return [];
    return data.routes.slice(0, maxAlternatives + 1).map(parseTomTomRoute);
  } catch {
    return [];
  }
}

// Real motorcycle-mode routing when TomTom is configured, falling back to
// OSRM's generic car-profile demo instance otherwise — every candidate
// route this app shows goes through one of these two, never a mix decided
// ad hoc per call site.
async function fetchRoute(waypoints: LatLng[]): Promise<OsrmRouteResult | null> {
  const motorcycle = await fetchTomTomMotorcycleRoute(waypoints);
  if (motorcycle) return motorcycle;
  return fetchOsrmRoute(waypoints);
}

async function fetchRouteAlternatives(origin: LatLng, destination: LatLng, maxAlternatives: number): Promise<OsrmRouteResult[]> {
  const motorcycle = await fetchTomTomMotorcycleAlternatives(origin, destination, maxAlternatives);
  if (motorcycle.length > 0) return motorcycle;
  return fetchOsrmAlternatives(origin, destination, maxAlternatives);
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
// between an origin and destination, from two complementary sources: (1)
// alternative-route candidates for the direct request — the routing
// engine's own algorithm proposing genuinely different paths it considers
// reasonable, which is often the best source of real diversity for short
// urban trips — and (2) a spread of via-biased detours at offsets scaled
// to the trip's own length, as a fallback/supplement for routes where the
// direct request alone doesn't have (or reveal) more than one alternative.
// Every one of these (direct alternatives and every detour) independently
// prefers real TomTom motorcycle-mode routing and only falls back to
// OSRM's generic car profile per-request if TomTom isn't configured or
// that specific request fails — so a trip can end up with a genuine mix
// (e.g. TomTom for the direct alternatives, OSRM for a detour that timed
// out) rather than an all-or-nothing choice, and each candidate's own
// `source` says which it actually used. Near-duplicate results — a route
// that rejoins (almost) the same road as one already kept — are dropped
// via maxSeparationKm rather than shown as if they were a different
// option. Returns null if every request fails — callers should fall back
// to the procedural demonstration routes in that case rather than mixing
// real and fabricated geometry in the same comparison.
//
// Deliberately does NOT assume which of these paths ends up "fastest" or
// "lowest exposure" — a geometric detour through real Malaysian roads does
// not reliably land on quieter streets, so the caller computes exposure
// for all of them and assigns the Fastest/Balanced/Low-exposure labels by
// actual outcome. The returned pool can still be smaller than 3 when the
// real road network genuinely doesn't offer that many distinct paths (e.g.
// a single-road rural link) — this never fabricates a route to pad the
// count.
//
// Note on request volume: with TomTom configured, this issues up to 5
// TomTom routing requests per trip search (1 alternatives request + 4
// detours), on top of this app's existing TomTom traffic-flow requests
// (lib/liveTraffic.ts) — worth keeping in mind against a free-tier daily
// quota if traffic grows.
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
    fetchRouteAlternatives(origin, destination, 3),
    ...viaPoints.map((via) => fetchRoute([origin, via, destination])),
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
