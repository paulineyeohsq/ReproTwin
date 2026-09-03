import type { FeatureInput } from "./features";
import { seededGaussian } from "./rng";

// The synthetic "true" exposure-dose-rate function the AI model is trained
// to approximate. It composes PM2.5 with plausible modifiers — slower speed
// in traffic implies more time/exertion (higher inhalation), road type
// affects deposition, NO2 contributes a small co-pollutant effect — plus
// noise, so the model has a genuinely learnable but non-trivial signal
// rather than simply memorising PM2.5 itself.
export function exposureRateGroundTruth(
  input: FeatureInput,
  rng: () => number
): number {
  const exertion = 1 + Math.max(0, (26 - input.speed) / 55);
  const deposition =
    input.road_type === "arterial" ? 1.1 : input.road_type === "highway" ? 1.04 : 0.94;
  const trafficBoost =
    input.traffic_level === "heavy" ? 1.08 : input.traffic_level === "low" ? 0.97 : 1.0;
  const no2Interaction = 1 + input.no2 / 480;
  const pm10Interaction = 1 + input.pm10 / 900;

  const base =
    input.pm25 * exertion * deposition * trafficBoost * no2Interaction * pm10Interaction;
  const noise = seededGaussian(rng, 0, base * 0.13);
  return Math.max(0, base + noise);
}
