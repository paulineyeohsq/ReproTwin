// Computes estimated air-pollution exposure along a real, road-following
// route (from lib/routingEngine.ts) by treating every OSRM routing-graph
// edge as one segment: infer its road class from the route's own speed
// characteristic, resolve the real PM2.5 nearest to that segment (live
// station / historical CSV, falling back to the synthetic environmental
// model only when neither is available), and compute a dose as
// concentration x time — no machine-learning model in this calculation.
// Deliberately simple and auditable: every route's predicted exposure is
// the sum of (real, per-segment PM2.5) x (real, traffic-adjusted segment
// duration), so it stays directly explainable from the same real data
// shown in the route's "Why this exposure?" panel. This is still a
// *modelled estimate*, not a direct on-road sensor measurement — labelled
// as such everywhere it's shown.

import type { OsrmRouteResult, LatLng } from "./routingEngine";
import { inferRoadType } from "./roadInference";
import { inferTrafficLevel, sampleWeather, samplePollutants } from "./environment";
import { segmentDose, classifyPm25, average } from "./exposure";
import { mulberry32, hashStringToSeed } from "./rng";
import { getDataModeStatus } from "./dataMode";
import { getLatestHistoricalReading, ENVIRONMENT_SOURCE_LABEL } from "./realDataEngine";
import { aqiToPm25 } from "./aqiConversion";
import { haversineKm } from "./geo";
import type { MalaysiaStation } from "./liveEnvironment";
import { nearestTrafficSample, LIVE_TRAFFIC_SOURCE, type LiveTrafficSample } from "./liveTraffic";
import type { RoadType, TrafficLevel, ExposureLevel, MeasurementKind, EnvironmentalMode, TrafficMode } from "./types";

const SYNTHETIC_PM25_SOURCE = "Prototype synthetic environmental model";
const LIVE_STATIONS_SOURCE = "Real-time DOE/JAS stations nationwide via WAQI — nearest station to each road segment";
const SYNTHETIC_TRAFFIC_SOURCE = "Prototype synthetic traffic model";

// Nearest of the real, currently-reporting nationwide stations to a point
// — the "average of the area the route passes through" comes for free at
// the route level: each segment picks whichever real station is actually
// closest to it, and the route's overall avgPm25 is the average of those
// real, per-segment values.
function nearestLiveStation(lat: number, lng: number, stations: MalaysiaStation[]): { station: MalaysiaStation; distanceKm: number } | null {
  let best: MalaysiaStation | null = null;
  let bestDistanceKm = Infinity;
  for (const s of stations) {
    const d = haversineKm({ lat, lng }, { lat: s.lat, lng: s.lng });
    if (d < bestDistanceKm) {
      bestDistanceKm = d;
      best = s;
    }
  }
  return best ? { station: best, distanceKm: Math.round(bestDistanceKm * 10) / 10 } : null;
}

export interface RouteExposureSegment {
  segmentId: string;
  routeId: string;
  lat: number; // segment midpoint
  lng: number;
  distanceKm: number;
  estimatedSpeedKmh: number;
  estimatedDurationMin: number;
  roadType: RoadType;
  trafficLevel: TrafficLevel;
  pm25: number;
  pm10: number;
  no2: number;
  exposure: number;
  exposureLevel: ExposureLevel;
  measurement: MeasurementKind;
  pm25Source: string;
  stationName?: string;
  stationDistanceKm?: number;
  trafficSource: string;
}

export interface RouteExposureResult {
  segments: RouteExposureSegment[];
  totalExposure: number;
  avgPm25: number;
  avgPm10: number;
  avgNo2: number;
  environmentalMode: EnvironmentalMode;
  trafficMode: TrafficMode;
}

export function computeRouteExposure(
  routeId: string,
  route: OsrmRouteResult,
  hour: number,
  liveStations: MalaysiaStation[] = [],
  trafficSamples: LiveTrafficSample[] = []
): RouteExposureResult {
  const rng = mulberry32(hashStringToSeed(routeId));
  const weather = sampleWeather(hour, rng);
  // Tier 1: a researcher-supplied historical DOE/JAS CSV (MODE A), if
  // loaded — the most precise real source when available.
  // Tier 2 (new): the same real, currently-reporting nationwide stations
  // shown on /air-quality (fetched once per route request by the caller,
  // not once per segment — a route can have dozens of segments, and
  // re-fetching per segment would be both slow and a wasteful use of a
  // rate-limited free API token). Each segment just picks whichever real
  // station is nearest to it — a synchronous lookup against the small
  // already-fetched list, no extra network calls here.
  // Tier 3: the synthetic model, only when neither real source is available.
  const hasHistoricalStations = getDataModeStatus().hasRealEnvironmentData;
  const hasLiveStations = liveStations.length > 0;
  const environmentalMode: EnvironmentalMode = hasHistoricalStations ? "historical" : hasLiveStations ? "live" : "synthetic";
  const hasLiveTraffic = trafficSamples.length > 0;
  const trafficMode: TrafficMode = hasLiveTraffic ? "live" : "synthetic";

  const segments: RouteExposureSegment[] = [];
  let totalExposure = 0;
  let pm25Sum = 0;
  let pm10Sum = 0;
  let no2Sum = 0;
  // "Avg PM2.5" (below) is computed per distinct real *area* (station),
  // not per resampled routing-graph segment — nearest-station matching has
  // no distance cap, so many segments along one stretch can all resolve
  // to the same single station, and averaging per segment would let that
  // one reading dominate just because of how finely this stretch happened
  // to be split into edges, not because of how much of the route it
  // actually represents. Live-tier areas keep their raw AQI (not the
  // per-segment converted PM2.5) so the average is taken in AQI space and
  // converted once — aqiToPm25 is a nonlinear (EPA breakpoint) conversion,
  // so averaging already-converted PM2.5 figures gives a different,
  // less correct number than averaging the AQI readings themselves.
  const liveAreaAqiByStation = new Map<string, number>();
  const historicalAreaByStation = new Map<string, { pm25: number; pm10: number; no2: number }>();

  const n = route.segmentDistancesKm.length;
  for (let i = 0; i < n; i++) {
    const a = route.coordinates[i];
    const b = route.coordinates[i + 1] ?? a;
    const speedKmh = route.segmentSpeedsKmh[i];
    const durationMin = route.segmentDurationsMin[i];
    const distanceKm = route.segmentDistancesKm[i];
    if (durationMin <= 0) continue;

    const roadType = inferRoadType(speedKmh);
    const midLat = (a.lat + b.lat) / 2;
    const midLng = (a.lng + b.lng) / 2;

    // Tier 1 (new): TomTom's real current-vs-free-flow speed, nearest of
    // this route's own bounded sample set (see lib/liveTraffic.ts — no
    // bulk endpoint exists, so samples are per-route, not nationwide like
    // the PM2.5 station list). Tier 2: the synthetic hour/road-type model,
    // only when no live sample is available for this request.
    const nearestTraffic = hasLiveTraffic ? nearestTrafficSample(midLat, midLng, trafficSamples) : null;
    const trafficLevel: TrafficLevel = nearestTraffic ? nearestTraffic.trafficLevel : inferTrafficLevel(hour, roadType, rng);
    const trafficSource = nearestTraffic ? LIVE_TRAFFIC_SOURCE : SYNTHETIC_TRAFFIC_SOURCE;

    let pm25: number, pm10: number, no2: number;
    let pm25Source = SYNTHETIC_PM25_SOURCE;
    let stationName: string | undefined;
    let stationDistanceKm: number | undefined;

    const historical = hasHistoricalStations ? getLatestHistoricalReading(midLat, midLng) : null;
    const nearestLive = !historical && hasLiveStations ? nearestLiveStation(midLat, midLng, liveStations) : null;

    if (historical) {
      pm25 = historical.pm25;
      pm10 = historical.pm10 ?? Math.round(historical.pm25 * 1.7 * 10) / 10;
      no2 = historical.no2 ?? 0;
      pm25Source = ENVIRONMENT_SOURCE_LABEL;
      stationName = historical.stationName;
      stationDistanceKm = historical.distanceKm;
      historicalAreaByStation.set(stationName, { pm25, pm10, no2 });
    } else if (nearestLive) {
      pm25 = aqiToPm25(nearestLive.station.aqi);
      pm10 = Math.round(pm25 * 1.7 * 10) / 10; // AQI's bulk endpoint gives no per-pollutant breakdown
      no2 = 0;
      pm25Source = LIVE_STATIONS_SOURCE;
      stationName = nearestLive.station.name;
      stationDistanceKm = nearestLive.distanceKm;
      liveAreaAqiByStation.set(stationName, nearestLive.station.aqi);
    } else {
      const sampled = samplePollutants(hour, roadType, trafficLevel, weather.wind_speed, rng);
      pm25 = sampled.pm25;
      pm10 = sampled.pm10;
      no2 = sampled.no2;
    }

    // Real dose formula (concentration x time), no model in the loop —
    // pm25 is the real reading resolved above (live station / historical
    // CSV / synthetic fallback), durationMin already reflects real
    // traffic-adjusted travel time when TomTom is configured.
    const exposure = segmentDose(pm25, durationMin / 60);

    segments.push({
      segmentId: `${routeId}-seg${i}`,
      routeId,
      lat: (a.lat + b.lat) / 2,
      lng: (a.lng + b.lng) / 2,
      distanceKm: Math.round(distanceKm * 1000) / 1000,
      estimatedSpeedKmh: Math.round(speedKmh * 10) / 10,
      estimatedDurationMin: Math.round(durationMin * 100) / 100,
      roadType,
      trafficLevel,
      pm25: Math.round(pm25 * 10) / 10,
      pm10: Math.round(pm10 * 10) / 10,
      no2: Math.round(no2 * 10) / 10,
      exposure: Math.round(exposure * 1000) / 1000,
      // Colour-code by the real PM2.5 concentration itself (µg/m³) rather
      // than the tiny absolute dose of one short segment — this is what
      // makes "which part of the journey contributes most" visually
      // meaningful regardless of how long each segment took to traverse,
      // and keeps the map colouring directly traceable to a real reading.
      exposureLevel: classifyPm25(pm25),
      measurement: "estimated",
      pm25Source,
      stationName,
      stationDistanceKm,
      trafficSource,
    });

    totalExposure += exposure;
    pm25Sum += pm25;
    pm10Sum += pm10;
    no2Sum += no2;
  }

  let avgPm25: number;
  let avgPm10: number;
  let avgNo2: number;

  // Mirrors the same tier priority used for environmentalMode above
  // (historical beats live beats synthetic) so a route that mixes tiers
  // (e.g. mostly-historical with a few segments falling back to live
  // where the historical dataset has no local coverage) reports an
  // average consistent with the tier it's actually labelled as.
  if (historicalAreaByStation.size > 0) {
    const areas = [...historicalAreaByStation.values()];
    avgPm25 = Math.round(average(areas.map((a) => a.pm25)) * 10) / 10;
    avgPm10 = Math.round(average(areas.map((a) => a.pm10)) * 10) / 10;
    avgNo2 = Math.round(average(areas.map((a) => a.no2)) * 10) / 10;
  } else if (liveAreaAqiByStation.size > 0) {
    const avgAqi = average([...liveAreaAqiByStation.values()]);
    avgPm25 = Math.round(aqiToPm25(avgAqi) * 10) / 10;
    avgPm10 = Math.round(avgPm25 * 1.7 * 10) / 10;
    avgNo2 = 0;
  } else {
    // No real area data anywhere on this route (fully synthetic) — the
    // per-segment average is the only figure available.
    avgPm25 = segments.length ? Math.round((pm25Sum / segments.length) * 10) / 10 : 0;
    avgPm10 = segments.length ? Math.round((pm10Sum / segments.length) * 10) / 10 : 0;
    avgNo2 = segments.length ? Math.round((no2Sum / segments.length) * 10) / 10 : 0;
  }

  return {
    segments,
    totalExposure: Math.round(totalExposure * 10) / 10,
    avgPm25,
    avgPm10,
    avgNo2,
    environmentalMode,
    trafficMode,
  };
}

export function midpoint(coords: LatLng[]): LatLng {
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}
