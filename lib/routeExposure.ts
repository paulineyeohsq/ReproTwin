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
import type { RoadType, TrafficLevel, ExposureLevel } from "./types";

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
}

export interface RouteExposureResult {
  segments: RouteExposureSegment[];
  totalExposure: number;
  avgPm25: number;
  avgPm10: number;
  avgNo2: number;
}

export function computeRouteExposure(
  routeId: string,
  route: OsrmRouteResult,
  hour: number,
  dayOfWeek: number
): RouteExposureResult {
  const rng = mulberry32(hashStringToSeed(routeId));
  const weather = sampleWeather(hour, rng);

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
    const { pm25, pm10, no2 } = samplePollutants(hour, roadType, trafficLevel, weather.wind_speed, rng);

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
  };
}

export function midpoint(coords: LatLng[]): LatLng {
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}
