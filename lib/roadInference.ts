import type { RoadType, TrafficLevel } from "./types";

// Real GPS/routing data (real device GPS, real mobility CSVs, real OSRM
// routes) has no road classification attached — infer a coarse class from
// observed/expected speed so the existing environment/exposure model
// (which is keyed on road type) still has something reasonable to work
// with. This is an inferred mobility feature, not a fabricated
// measurement, and is documented as such wherever it's used.
export function inferRoadType(speedKmh: number): RoadType {
  if (speedKmh > 45) return "highway";
  if (speedKmh > 20) return "arterial";
  return "residential";
}

export function inferTrafficLevel(speedKmh: number, roadType: RoadType): TrafficLevel {
  const freeFlow = roadType === "highway" ? 60 : roadType === "arterial" ? 40 : 25;
  const ratio = speedKmh / freeFlow;
  if (ratio < 0.4) return "heavy";
  if (ratio < 0.75) return "moderate";
  return "low";
}
