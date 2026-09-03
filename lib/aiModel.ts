import modelJson from "@/data/model.json";
import { predictGBM } from "./ml/gbm";
import { toFeatureVector, type FeatureInput } from "./features";
import type { GBMModel } from "./types";

const model = modelJson as unknown as GBMModel;

export function predictExposureRate(input: FeatureInput): number {
  const x = toFeatureVector(input);
  return predictGBM(model, x);
}

export function getModelMetrics() {
  return model.metrics;
}

export function getFeatureNames() {
  return model.featureNames;
}
