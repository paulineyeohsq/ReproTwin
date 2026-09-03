import type { RoadType, TrafficLevel } from "./types";

// Shared feature encoding used both to train the model (scripts/train-model.ts)
// and to run predictions at runtime (lib/aiModel.ts). Order matters — it must
// match FEATURE_NAMES exactly.
export const FEATURE_NAMES = [
  "pm25",
  "pm10",
  "no2",
  "traffic",
  "road_type",
  "speed",
  "hour",
  "day_of_week",
  "temperature",
  "humidity",
  "wind_speed",
] as const;

const TRAFFIC_ORDINAL: Record<TrafficLevel, number> = {
  low: 0,
  moderate: 1,
  heavy: 2,
};

const ROAD_ORDINAL: Record<RoadType, number> = {
  residential: 0,
  arterial: 1,
  highway: 2,
};

export interface FeatureInput {
  pm25: number;
  pm10: number;
  no2: number;
  traffic_level: TrafficLevel;
  road_type: RoadType;
  speed: number;
  hour: number;
  day_of_week: number; // 0 (Sun) - 6 (Sat)
  temperature: number;
  humidity: number;
  wind_speed: number;
}

export function toFeatureVector(input: FeatureInput): number[] {
  return [
    input.pm25,
    input.pm10,
    input.no2,
    TRAFFIC_ORDINAL[input.traffic_level],
    ROAD_ORDINAL[input.road_type],
    input.speed,
    input.hour,
    input.day_of_week,
    input.temperature,
    input.humidity,
    input.wind_speed,
  ];
}
