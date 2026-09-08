import type { BaseRoute, CandidateRoute, RoadType, RouteProfile, RouteWaypointDef, TrafficLevel } from "./types";
import { findBaseRouteByDestination } from "./baseRoutes";
import { resampleRoute, routeDistanceKm } from "./geo";
import { inferTrafficLevel, sampleWeather, samplePollutants } from "./environment";
import { mulberry32, hashStringToSeed } from "./rng";
import { fetchDiverseRoadRoutes, type LatLng, type OsrmRouteResult } from "./routingEngine";
import { computeRouteExposure } from "./routeExposure";
import { pm25ToAqi } from "./aqiConversion";
import { fetchMalaysiaStations } from "./liveEnvironment";
import { fetchLiveTrafficForRoute, averageTrafficRatio } from "./liveTraffic";
import { ADVISOR_HOUR, PREFERENCE_WEIGHTS } from "./routeScoring";

export { ADVISOR_HOUR, PREFERENCE_WEIGHTS, scoreRoutes, type PreferenceKey } from "./routeScoring";

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
  const trafficSeverity: Record<TrafficLevel, number> = { low: 0, moderate: 1, heavy: 2 };
  let severitySum = 0;
  const stepDistanceKm = distanceKm / (points.length - 1 || 1);
  const stepDurationHours = stepDistanceKm / cfg.speedKmh;

  const weather = sampleWeather(hour, rng);

  for (const p of points) {
    const trafficLevel = inferTrafficLevel(hour, p.roadType, rng);
    const { pm25 } = samplePollutants(
      hour,
      p.roadType,
      trafficLevel,
      weather.wind_speed,
      rng
    );
    pm25Sum += pm25;
    severitySum += trafficSeverity[trafficLevel];
    // Real dose formula (concentration x time) — no model, matching
    // computeRouteExposure's real-road calculation.
    totalExposure += pm25 * stepDurationHours;
  }

  const avgPm25 = Math.round((pm25Sum / points.length) * 10) / 10;
  const avgSeverity = severitySum / points.length;
  const trafficLevel: TrafficLevel = avgSeverity < 0.5 ? "low" : avgSeverity < 1.5 ? "moderate" : "heavy";

  return {
    id: `${base.id}-${profile}`,
    profile,
    label: cfg.label,
    destination: base.destination,
    distanceKm: Math.round(distanceKm * 10) / 10,
    travelTimeMin: Math.round(travelTimeMin),
    predictedExposure: Math.round(totalExposure * 10) / 10,
    waypoints,
    avgPm25,
    // No real AQI reading exists for a purely synthetic route — derived
    // equivalent via the standard EPA breakpoint conversion.
    avgAqi: pm25ToAqi(avgPm25),
    trafficLevel,
    roadNetworkSource: PROCEDURAL_ROAD_SOURCE,
    environmentalMode: "synthetic",
    trafficMode: "synthetic",
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
  routeId: string,
  avgTrafficRatio: number | undefined
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
    avgAqi: exposure.avgAqi,
    trafficLevel: exposure.trafficLevel,
    geometry: route.coordinates,
    segments: exposure.segments.map((s) => ({
      lat: s.lat,
      lng: s.lng,
      exposureLevel: s.exposureLevel,
      measurement: s.measurement,
      pm25Source: s.pm25Source,
      stationName: s.stationName,
      distanceKm: s.stationDistanceKm,
      trafficSource: s.trafficSource,
    })),
    roadNetworkSource: OSRM_ROAD_SOURCE,
    environmentalMode: exposure.environmentalMode,
    trafficMode: exposure.trafficMode,
    avgTrafficRatio,
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
//
// Targets 3 labelled routes (Fastest/Balanced/Low-exposure) drawn from a
// real candidate pool of 3-5 distinct routes (see fetchDiverseRoadRoutes).
// Returns only 2 when the real road network genuinely doesn't offer a
// third distinct path for this trip — Balanced is never a route that's
// literally identical to Fastest or Low-exposure (see balancedIsDistinct
// below), but is shown even when it doesn't beat either on time or
// exposure, since it's still real, different data about an actual road.
export async function getCandidateRoutesAsync(
  origin: LatLng,
  destination: LatLng,
  destinationLabel: string,
  hour: number = ADVISOR_HOUR
): Promise<{ routes: CandidateRoute[]; usedRealRoads: boolean }> {
  // Fetched once per request, not once per route/segment — every candidate
  // route reuses the same real nationwide station list (see
  // lib/routeExposure.ts for why per-segment fetching would be wasteful).
  // fetchMalaysiaStations() itself returns [] with no network call when no
  // live source is configured, so this is always safe to call.
  const [rawRoutes, liveStations] = await Promise.all([
    fetchDiverseRoadRoutes(origin, destination),
    fetchMalaysiaStations(),
  ]);

  if (rawRoutes) {
    const idBase = destinationLabel.replace(/\s+/g, "-").toLowerCase();

    // Unlike liveStations, traffic samples are fetched per route (TomTom's
    // Flow Segment Data has no bulk nationwide endpoint) but still bounded
    // and parallelised — see lib/liveTraffic.ts. fetchLiveTrafficForRoute
    // itself returns [] with no network call when TOMTOM_API_KEY isn't
    // configured, so this is always safe to call.
    const trafficByRoute = await Promise.all(rawRoutes.map((route) => fetchLiveTrafficForRoute(route.coordinates)));

    // OSRM's public "driving" profile has no live congestion awareness at
    // all — it returns a static, roughly free-flow duration. Where live
    // traffic samples exist for a route, its travel time (and therefore
    // its ranking as Fastest/Balanced) is adjusted toward real current
    // conditions rather than left at that static estimate.
    const adjustedRoutes = rawRoutes.map((route, i) => {
      const ratio = averageTrafficRatio(trafficByRoute[i]);
      return ratio ? { ...route, durationMin: route.durationMin / ratio } : route;
    });

    const scored = adjustedRoutes.map((route, i) => ({
      route,
      exposure: computeRouteExposure(`${idBase}-raw${i}`, route, hour, liveStations, trafficByRoute[i]),
      avgTrafficRatio: averageTrafficRatio(trafficByRoute[i]) ?? undefined,
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

    // "Balanced" used to be "whichever candidate wasn't already picked",
    // in array order — verified against real routes that this can produce
    // a route that's both slower AND more polluted than the other two
    // picks (a detour that finds neither a real time nor exposure
    // advantage), which isn't a "balance" of anything. Instead, pick
    // whichever candidate genuinely minimises the same weighted time/
    // exposure trade-off PREFERENCE_WEIGHTS.balanced already defines
    // elsewhere in the app — preferring one of the remaining routes so
    // three distinct options are still shown when possible, but never
    // preferring a strictly worse route just to fill that slot.
    const times = scored.map((s) => s.route.durationMin);
    const exposures = scored.map((s) => s.exposure.totalExposure);
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const minExposure = Math.min(...exposures);
    const maxExposure = Math.max(...exposures);
    const normalize = (v: number, min: number, max: number) => (max === min ? 0 : (v - min) / (max - min));
    const balancedWeights = PREFERENCE_WEIGHTS.balanced;
    const balancedScore = (s: (typeof scored)[number]) =>
      balancedWeights.time * normalize(s.route.durationMin, minTime, maxTime) +
      balancedWeights.exposure * normalize(s.exposure.totalExposure, minExposure, maxExposure);

    const remaining = scored.filter((s) => s !== fastestPick && s !== lowExposurePick);
    const balancedCandidates = remaining.length > 0 ? remaining : scored;
    const balancedPick = balancedCandidates.reduce((best, s) => (balancedScore(s) < balancedScore(best) ? s : best));

    // Show "Balanced" whenever a genuinely separate real route was found
    // (fetchDiverseRoadRoutes already only returns geometrically distinct
    // paths — see maxSeparationKm — so any route here that isn't literally
    // the Fastest/Low-exposure pick itself is real, different data worth
    // showing, even on a trip where it doesn't happen to beat either
    // extreme on time or exposure). Only reused when the real pool had
    // just 2 distinct routes total (remaining was empty above), in which
    // case there is no third option to label.
    const balancedIsDistinct = balancedPick !== fastestPick && balancedPick !== lowExposurePick;

    return {
      usedRealRoads: true,
      routes: [
        osrmRouteToCandidate(destinationLabel, "fastest", fastestPick.route, fastestPick.exposure, `${idBase}-fastest`, fastestPick.avgTrafficRatio),
        ...(balancedIsDistinct
          ? [osrmRouteToCandidate(destinationLabel, "balanced", balancedPick.route, balancedPick.exposure, `${idBase}-balanced`, balancedPick.avgTrafficRatio)]
          : []),
        osrmRouteToCandidate(destinationLabel, "low_exposure", lowExposurePick.route, lowExposurePick.exposure, `${idBase}-low-exposure`, lowExposurePick.avgTrafficRatio),
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

