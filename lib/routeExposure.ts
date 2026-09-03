// Computes estimated air-pollution exposure along a real, road-following
// route (from lib/routingEngine.ts) by treating every OSRM routing-graph
// edge as one segment: infer its road class from the route's own speed
// characteristic, estimate traffic/pollutant conditions for the requested
// hour using the existing synthetic environmental model, and predict a
// dose with the already-trained exposure model. This is a *modelled
// estimate*, not a direct measurement — labelled as such everywhere it's
// shown.

import type { OsrmRouteResult, LatLng } from "./routingEngine";
import { inferRoadType } from "./roadInference";
import { inferTrafficLevel, sampleWeather, samplePollutants } from "./environment";
import { predictExposureRate } from "./aiModel";
import { segmentDose, classifyPm25 } from "./exposure";
import { mulberry32, hashStringToSeed } from "./rng";
import { getDataModeStatus } from "./dataMode";
import { getLatestHistoricalReading, ENVIRONMENT_SOURCE_LABEL } from "./realDataEngine";
import { aqiToPm25 } from "./aqiConversion";
import { haversineKm } from "./geo";
import type { MalaysiaStation } from "./liveEnvironment";
import type { RoadType, TrafficLevel, ExposureLevel, MeasurementKind, EnvironmentalMode } from "./types";

const SYNTHETIC_PM25_SOURCE = "Prototype synthetic environmental model";
const LIVE_STATIONS_SOURCE = "Real-time DOE/JAS stations nationwide via WAQI — nearest station to each road segment";

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
}

export interface RouteExposureResult {
  segments: RouteExposureSegment[];
  totalExposure: number;
  avgPm25: number;
  avgPm10: number;
  avgNo2: number;
  environmentalMode: EnvironmentalMode;
}

export function computeRouteExposure(
  routeId: string,
  route: OsrmRouteResult,
  hour: number,
  dayOfWeek: number,
  liveStations: MalaysiaStation[] = []
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

  const segments: RouteExposureSegment[] = [];
  let totalExposure = 0;
  let pm25Sum = 0;
  let pm10Sum = 0;
  let no2Sum = 0;

  const n = route.segmentDistancesKm.length;
  for (let i = 0; i < n; i++) {
    const a = route.coordinates[i];
    const b = route.coordinates[i + 1] ?? a;
    const speedKmh = route.segmentSpeedsKmh[i];
    const durationMin = route.segmentDurationsMin[i];
    const distanceKm = route.segmentDistancesKm[i];
    if (durationMin <= 0) continue;

    const roadType = inferRoadType(speedKmh);
    const trafficLevel = inferTrafficLevel(hour, roadType, rng);
    const midLat = (a.lat + b.lat) / 2;
    const midLng = (a.lng + b.lng) / 2;

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
    } else if (nearestLive) {
      pm25 = aqiToPm25(nearestLive.station.aqi);
      pm10 = Math.round(pm25 * 1.7 * 10) / 10; // AQI's bulk endpoint gives no per-pollutant breakdown
      no2 = 0;
      pm25Source = LIVE_STATIONS_SOURCE;
      stationName = nearestLive.station.name;
      stationDistanceKm = nearestLive.distanceKm;
    } else {
      const sampled = samplePollutants(hour, roadType, trafficLevel, weather.wind_speed, rng);
      pm25 = sampled.pm25;
      pm10 = sampled.pm10;
      no2 = sampled.no2;
    }

    const rate = predictExposureRate({
      pm25,
      pm10,
      no2,
      traffic_level: trafficLevel,
      road_type: roadType,
      speed: speedKmh,
      hour,
      day_of_week: dayOfWeek,
      temperature: weather.temperature,
      humidity: weather.humidity,
      wind_speed: weather.wind_speed,
    });
    const exposure = segmentDose(rate, durationMin / 60);

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
      // Colour-code by dose *rate* (pm25-equivalent, µg/m³ scale) rather
      // than the tiny absolute dose of one short segment — this is what
      // makes "which part of the journey contributes most" visually
      // meaningful regardless of how long each segment took to traverse.
      exposureLevel: classifyPm25(rate),
      measurement: "estimated",
      pm25Source,
      stationName,
      stationDistanceKm,
    });

    totalExposure += exposure;
    pm25Sum += pm25;
    pm10Sum += pm10;
    no2Sum += no2;
  }

  return {
    segments,
    totalExposure: Math.round(totalExposure * 10) / 10,
    avgPm25: segments.length ? Math.round((pm25Sum / segments.length) * 10) / 10 : 0,
    avgPm10: segments.length ? Math.round((pm10Sum / segments.length) * 10) / 10 : 0,
    avgNo2: segments.length ? Math.round((no2Sum / segments.length) * 10) / 10 : 0,
    environmentalMode,
  };
}

export function midpoint(coords: LatLng[]): LatLng {
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}
