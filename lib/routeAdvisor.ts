import type { BaseRoute, CandidateRoute, RoadType, RouteProfile, RouteWaypointDef } from "./types";
import { findBaseRouteByDestination } from "./baseRoutes";
import { resampleRoute, routeDistanceKm } from "./geo";
import { inferTrafficLevel, sampleWeather, samplePollutants } from "./environment";
import { predictExposureRate } from "./aiModel";
import { mulberry32, hashStringToSeed } from "./rng";
import { fetchDiverseRoadRoutes, type LatLng, type OsrmRouteResult } from "./routingEngine";
import { computeRouteExposure } from "./routeExposure";

// Route predictions are simulated for the evening peak (typical of the
// rider's 17:00-20:00 commute window) so the numbers reflect realistic
// rush-hour conditions rather than an arbitrary time of day.
export const ADVISOR_HOUR = 18;
const ADVISOR_DAY_OF_WEEK = 3; // a generic weekday (Wednesday)

export const PROCEDURAL_ROAD_SOURCE = "Prototype road network (routing service unavailable — demonstration fallback)";
export const OSRM_ROAD_SOURCE = "OpenStreetMap road network via OSRM";

const PROFILE_CONFIG: Record<
  RouteProfile,
  {
    label: string;
    bendDeg: number;
    speedKmh: number;
    remap: (r: RoadType) => RoadType;
  }
> = {
  fastest: {
    label: "Fastest",
    bendDeg: 0,
    speedKmh: 42,
    remap: (r) => r,
  },
  balanced: {
    label: "Balanced",
    bendDeg: 0.006,
    speedKmh: 35,
    // Arterial roads carry the highest congestion-driven PM2.5 in this
    // model, so the balanced route trades busy arterial stretches for
    // quieter residential streets while keeping the faster highway legs.
    remap: (r) => (r === "arterial" ? "residential" : r),
  },
  low_exposure: {
    label: "Low exposure",
    bendDeg: 0.011,
    speedKmh: 27,
    remap: () => "residential",
  },
};

function bendWaypoints(
  waypoints: RouteWaypointDef[],
  amplitudeDeg: number,
  remap: (r: RoadType) => RoadType
): RouteWaypointDef[] {
  const n = waypoints.length;
  return waypoints.map((w, i) => {
    const t = n === 1 ? 0 : i / (n - 1);
    const bend = Math.sin(t * Math.PI) * amplitudeDeg;
    const isEndpoint = i === 0 || i === n - 1;
    return {
      lat: w.lat + (isEndpoint ? 0 : bend),
      lng: w.lng - (isEndpoint ? 0 : bend * 0.65),
      roadType: remap(w.roadType),
    };
  });
}

function buildCandidate(
  base: BaseRoute,
  profile: RouteProfile,
  hour: number
): CandidateRoute {
  const cfg = PROFILE_CONFIG[profile];
  const waypoints = bendWaypoints(base.waypoints, cfg.bendDeg, cfg.remap);
  const distanceKm = routeDistanceKm(waypoints);
  const travelTimeMin = (distanceKm / cfg.speedKmh) * 60;

  const rng = mulberry32(hashStringToSeed(`${base.id}-${profile}`));
  const points = resampleRoute(waypoints, 36);

  let totalExposure = 0;
  let pm25Sum = 0;
  const stepDistanceKm = distanceKm / (points.length - 1 || 1);
  const stepDurationHours = stepDistanceKm / cfg.speedKmh;

  const weather = sampleWeather(hour, rng);

  for (const p of points) {
    const trafficLevel = inferTrafficLevel(hour, p.roadType, rng);
    const { pm25, pm10, no2 } = samplePollutants(
      hour,
      p.roadType,
      trafficLevel,
      weather.wind_speed,
      rng
    );
    pm25Sum += pm25;

    const rate = predictExposureRate({
      pm25,
      pm10,
      no2,
      traffic_level: trafficLevel,
      road_type: p.roadType,
      speed: cfg.speedKmh,
      hour,
      day_of_week: ADVISOR_DAY_OF_WEEK,
      temperature: weather.temperature,
      humidity: weather.humidity,
      wind_speed: weather.wind_speed,
    });
    totalExposure += rate * stepDurationHours;
  }

  return {
    id: `${base.id}-${profile}`,
    profile,
    label: cfg.label,
    destination: base.destination,
    distanceKm: Math.round(distanceKm * 10) / 10,
    travelTimeMin: Math.round(travelTimeMin),
    predictedExposure: Math.round(totalExposure * 10) / 10,
    waypoints,
    avgPm25: Math.round((pm25Sum / points.length) * 10) / 10,
    roadNetworkSource: PROCEDURAL_ROAD_SOURCE,
  };
}

// Synchronous, dependency-free fallback: a procedurally bent path around
// the straight line between origin and destination. Used only when the
// real routing engine (OSRM) is unreachable — see getCandidateRoutesAsync.
export function getCandidateRoutes(
  destination: string,
  hour: number = ADVISOR_HOUR
): CandidateRoute[] {
  const base = findBaseRouteByDestination(destination);
  return (["fastest", "balanced", "low_exposure"] as RouteProfile[]).map(
    (profile) => buildCandidate(base, profile, hour)
  );
}

const OSRM_PROFILE_META: Record<RouteProfile, { label: string }> = {
  fastest: { label: "Fastest" },
  balanced: { label: "Balanced" },
  low_exposure: { label: "Low exposure" },
};

function osrmRouteToCandidate(
  destinationLabel: string,
  profile: RouteProfile,
  route: OsrmRouteResult,
  exposure: ReturnType<typeof computeRouteExposure>,
  routeId: string
): CandidateRoute {
  return {
    id: routeId,
    profile,
    label: OSRM_PROFILE_META[profile].label,
    destination: destinationLabel,
    distanceKm: Math.round(route.distanceKm * 10) / 10,
    travelTimeMin: Math.round(route.durationMin),
    predictedExposure: exposure.totalExposure,
    waypoints: [route.coordinates[0], route.coordinates[route.coordinates.length - 1]].map((c) => ({
      lat: c.lat,
      lng: c.lng,
      roadType: "arterial" as RoadType,
    })),
    avgPm25: exposure.avgPm25,
    avgPm10: exposure.avgPm10,
    avgNo2: exposure.avgNo2,
    geometry: route.coordinates,
    segments: exposure.segments.map((s) => ({ lat: s.lat, lng: s.lng, exposureLevel: s.exposureLevel })),
    roadNetworkSource: OSRM_ROAD_SOURCE,
  };
}

// Real road-network routing (OSRM) with several genuinely distinct,
// road-snapped candidates, labelled Fastest/Balanced/Low-exposure by their
// *actual computed* travel time and exposure — not by which geometric
// detour was requested, since a real-road detour doesn't reliably land on
// lower-exposure streets. Falls back to the procedural demonstration
// routes (getCandidateRoutes) if the routing engine is unreachable, so the
// app never mixes a real route with a fabricated one in the same
// comparison, and never simply breaks when the public routing service is
// unavailable.
export async function getCandidateRoutesAsync(
  origin: LatLng,
  destination: LatLng,
  destinationLabel: string,
  hour: number = ADVISOR_HOUR
): Promise<{ routes: CandidateRoute[]; usedRealRoads: boolean }> {
  const rawRoutes = await fetchDiverseRoadRoutes(origin, destination);

  if (rawRoutes) {
    const idBase = destinationLabel.replace(/\s+/g, "-").toLowerCase();
    const scored = rawRoutes.map((route, i) => ({
      route,
      exposure: computeRouteExposure(`${idBase}-raw${i}`, route, hour, ADVISOR_DAY_OF_WEEK),
    }));

    const byTime = [...scored].sort((a, b) => a.route.durationMin - b.route.durationMin);
    const byExposure = [...scored].sort((a, b) => a.exposure.totalExposure - b.exposure.totalExposure);

    // "Fastest" and "Low exposure" are always the genuine minimum on their
    // respective metric — even if that happens to be the same real route
    // (a real detour doesn't always find a lower-exposure alternative, and
    // mislabelling a worse-exposure route as "low exposure" just to force
    // three distinct picks would be actively misleading).
    const fastestPick = byTime[0];
    const lowExposurePick = byExposure[0];
    const balancedPick =
      scored.find((s) => s !== fastestPick && s !== lowExposurePick) ??
      byExposure[Math.floor(byExposure.length / 2)];

    return {
      usedRealRoads: true,
      routes: [
        osrmRouteToCandidate(destinationLabel, "fastest", fastestPick.route, fastestPick.exposure, `${idBase}-fastest`),
        osrmRouteToCandidate(destinationLabel, "balanced", balancedPick.route, balancedPick.exposure, `${idBase}-balanced`),
        osrmRouteToCandidate(destinationLabel, "low_exposure", lowExposurePick.route, lowExposurePick.exposure, `${idBase}-low-exposure`),
      ],
    };
  }

  // Fallback: only works for the 4 predefined demo destinations, since the
  // procedural generator is anchored to hand-authored base routes.
  try {
    return { usedRealRoads: false, routes: getCandidateRoutes(destinationLabel, hour) };
  } catch {
    return { usedRealRoads: false, routes: [] };
  }
}

export type PreferenceKey = "fastest" | "balanced" | "lowest_exposure";

export const PREFERENCE_WEIGHTS: Record<
  PreferenceKey,
  { exposure: number; time: number; label: string }
> = {
  fastest: { exposure: 0.3, time: 0.7, label: "Fastest" },
  balanced: { exposure: 0.7, time: 0.3, label: "Balanced" },
  lowest_exposure: { exposure: 0.9, time: 0.1, label: "Lowest exposure" },
};

// Very simple weighted score — not a graph-search algorithm. Lower is
// better; the route with the lowest weighted cost is the AI-recommended one.
export function scoreRoutes(
  routes: CandidateRoute[],
  preference: PreferenceKey
): { route: CandidateRoute; score: number }[] {
  const weights = PREFERENCE_WEIGHTS[preference];
  const minExposure = Math.min(...routes.map((r) => r.predictedExposure));
  const maxExposure = Math.max(...routes.map((r) => r.predictedExposure));
  const minTime = Math.min(...routes.map((r) => r.travelTimeMin));
  const maxTime = Math.max(...routes.map((r) => r.travelTimeMin));

  const normalize = (v: number, min: number, max: number) =>
    max === min ? 0 : (v - min) / (max - min);

  return routes
    .map((route) => {
      const exposureScore = normalize(
        route.predictedExposure,
        minExposure,
        maxExposure
      );
      const timeScore = normalize(route.travelTimeMin, minTime, maxTime);
      const score = weights.exposure * exposureScore + weights.time * timeScore;
      return { route, score };
    })
    .sort((a, b) => a.score - b.score);
}
