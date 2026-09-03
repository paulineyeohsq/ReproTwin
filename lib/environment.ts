import type { RoadType, TrafficLevel } from "./types";
import { seededGaussian } from "./rng";

// Synthetic environmental model. NOT real measurements — encodes plausible
// relationships (traffic -> PM2.5, arterial roads -> higher exposure,
// rush hour -> higher exposure, residential -> lower exposure) so the
// downstream AI model has real signal to learn from.

const ROAD_BASE_PM25: Record<RoadType, number> = {
  residential: 11,
  arterial: 24,
  highway: 20,
};

const ROAD_BASE_NO2: Record<RoadType, number> = {
  residential: 9,
  arterial: 26,
  highway: 22,
};

const TRAFFIC_MULTIPLIER: Record<TrafficLevel, number> = {
  low: 0.82,
  moderate: 1.0,
  heavy: 1.4,
};

export function isRushHour(hour: number): boolean {
  return (hour >= 7 && hour < 10) || (hour >= 17 && hour < 20.5);
}

export function inferTrafficLevel(
  hour: number,
  roadType: RoadType,
  rng: () => number
): TrafficLevel {
  const rush = isRushHour(hour);
  let heavyProb = 0.08;
  let lowProb = 0.45;

  if (roadType === "highway") {
    heavyProb = rush ? 0.65 : 0.2;
    lowProb = rush ? 0.05 : 0.35;
  } else if (roadType === "arterial") {
    heavyProb = rush ? 0.55 : 0.18;
    lowProb = rush ? 0.08 : 0.3;
  } else {
    heavyProb = rush ? 0.15 : 0.03;
    lowProb = rush ? 0.35 : 0.7;
  }

  const r = rng();
  if (r < heavyProb) return "heavy";
  if (r < heavyProb + (1 - heavyProb - lowProb)) return "moderate";
  return r < heavyProb + lowProb ? "low" : "moderate";
}

export interface WeatherSample {
  temperature: number;
  humidity: number;
  wind_speed: number;
}

export function sampleWeather(hour: number, rng: () => number): WeatherSample {
  // Tropical diurnal cycle: coolest ~05:00, warmest ~15:00.
  const phase = ((hour - 15) / 24) * 2 * Math.PI;
  const temperature = 29 + 4 * Math.cos(phase) + seededGaussian(rng, 0, 0.8);
  const humidity = 72 - 14 * Math.cos(phase) + seededGaussian(rng, 0, 3);
  const wind_speed = Math.max(
    1,
    6 + 3 * Math.sin(phase + 1) + seededGaussian(rng, 0, 1.5)
  );
  return {
    temperature: round1(temperature),
    humidity: round1(clamp(humidity, 45, 95)),
    wind_speed: round1(wind_speed),
  };
}

export function samplePollutants(
  hour: number,
  roadType: RoadType,
  trafficLevel: TrafficLevel,
  windSpeed: number,
  rng: () => number
): { pm25: number; pm10: number; no2: number } {
  const rushMultiplier = isRushHour(hour) ? 1.22 : 1.0;
  const windEffect = clamp(1.25 - windSpeed / 22, 0.75, 1.25); // low wind -> higher pollution
  const trafficMult = TRAFFIC_MULTIPLIER[trafficLevel];

  const pm25Base = ROAD_BASE_PM25[roadType];
  const no2Base = ROAD_BASE_NO2[roadType];

  const pm25 =
    pm25Base * trafficMult * rushMultiplier * windEffect +
    seededGaussian(rng, 0, 2.2);
  const no2 =
    no2Base * trafficMult * rushMultiplier * windEffect +
    seededGaussian(rng, 0, 1.8);

  // PM10 tracks PM2.5 (shared traffic/dust source) but with a coarser
  // fraction that is relatively larger on busier, dustier roads.
  const pm10Ratio =
    roadType === "residential" ? 1.55 : roadType === "arterial" ? 1.85 : 1.7;
  const pm10 = pm25 * pm10Ratio + seededGaussian(rng, 0, 3);

  return {
    pm25: round1(clamp(pm25, 4, 95)),
    pm10: round1(clamp(pm10, 6, 180)),
    no2: round1(clamp(no2, 3, 80)),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}
