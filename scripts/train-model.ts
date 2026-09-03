// Trains the lightweight gradient-boosting exposure model on the synthetic
// dataset and writes data/model.json (trees + performance metrics).
// Run with: npx tsx scripts/train-model.ts

import fs from "node:fs";
import path from "node:path";
import tripsData from "../data/trips.json";
import { toFeatureVector, FEATURE_NAMES } from "../lib/features";
import { exposureRateGroundTruth } from "../lib/groundTruth";
import { trainGBM, computeMetrics } from "../lib/ml/gbm";
import { mulberry32, hashStringToSeed } from "../lib/rng";
import type { Trip } from "../lib/types";

const trips = tripsData as unknown as Trip[];

interface Row {
  x: number[];
  y: number;
}

const rows: Row[] = [];
for (const trip of trips) {
  for (let i = 0; i < trip.segments.length; i++) {
    const seg = trip.segments[i];
    const rowRng = mulberry32(hashStringToSeed(`${trip.id}-${i}`));
    const tsDate = new Date(seg.env.timestamp);
    const hour = tsDate.getUTCHours() + tsDate.getUTCMinutes() / 60;

    const featureInput = {
      pm25: seg.env.pm25,
      pm10: seg.env.pm10,
      no2: seg.env.no2,
      traffic_level: seg.env.traffic_level,
      road_type: seg.env.road_type,
      speed: seg.point.speed,
      hour,
      day_of_week: tsDate.getUTCDay(),
      temperature: seg.env.temperature,
      humidity: seg.env.humidity,
      wind_speed: seg.env.wind_speed,
    };

    const y = exposureRateGroundTruth(featureInput, rowRng);
    rows.push({ x: toFeatureVector(featureInput), y });
  }
}

// Deterministic shuffle + 80/20 split.
const shuffleRng = mulberry32(42);
const shuffled = [...rows];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(shuffleRng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const splitIdx = Math.floor(shuffled.length * 0.8);
const trainRows = shuffled.slice(0, splitIdx);
const testRows = shuffled.slice(splitIdx);

console.log(`Training on ${trainRows.length} rows, testing on ${testRows.length} rows...`);

const { model, predictAll } = trainGBM(trainRows, [...FEATURE_NAMES], {
  nTrees: 45,
  learningRate: 0.15,
  maxDepth: 4,
  minSamplesLeaf: 10,
});

const testPredictions = predictAll(testRows);
const testActual = testRows.map((r) => r.y);
const metricsCore = computeMetrics(testActual, testPredictions);

const metrics = {
  ...metricsCore,
  nTrain: trainRows.length,
  nTest: testRows.length,
  trainedAt: new Date().toISOString(),
};

const output = { ...model, metrics };

const dataDir = path.join(__dirname, "..", "data");
fs.writeFileSync(path.join(dataDir, "model.json"), JSON.stringify(output));

console.log("Model performance (held-out test set):");
console.log(metrics);
