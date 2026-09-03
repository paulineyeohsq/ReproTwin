import { buildRegressionTree, predictTree, type TrainRow } from "./tree";
import type { GBMModel, ModelMetrics } from "../types";

export interface GBMTrainOptions {
  nTrees: number;
  learningRate: number;
  maxDepth: number;
  minSamplesLeaf: number;
}

const DEFAULT_OPTIONS: GBMTrainOptions = {
  nTrees: 40,
  learningRate: 0.15,
  maxDepth: 4,
  minSamplesLeaf: 8,
};

// A small, dependency-free gradient boosting regressor: sequentially fit
// shallow trees to the residuals of the running prediction. This stands in
// for XGBoost/Random Forest per the brief — same idea, no ML infra to
// troubleshoot.
export function trainGBM(
  rows: TrainRow[],
  featureNames: string[],
  options: Partial<GBMTrainOptions> = {}
): { model: Omit<GBMModel, "metrics">; predictAll: (rows: TrainRow[]) => number[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const nFeatures = featureNames.length;

  const initialValue = rows.reduce((s, r) => s + r.y, 0) / rows.length;
  let predictions = rows.map(() => initialValue);

  const trees = [];
  for (let t = 0; t < opts.nTrees; t++) {
    const residualRows: TrainRow[] = rows.map((r, i) => ({
      x: r.x,
      y: r.y - predictions[i],
    }));
    const tree = buildRegressionTree(
      residualRows,
      opts.maxDepth,
      opts.minSamplesLeaf,
      nFeatures
    );
    trees.push(tree);
    predictions = predictions.map(
      (p, i) => p + opts.learningRate * predictTree(tree, rows[i].x)
    );
  }

  const model: Omit<GBMModel, "metrics"> = {
    initialValue,
    learningRate: opts.learningRate,
    trees,
    featureNames,
  };

  const predictAll = (data: TrainRow[]) =>
    data.map((r) => predictGBM(model, r.x));

  return { model, predictAll };
}

export function predictGBM(
  model: Omit<GBMModel, "metrics">,
  x: number[]
): number {
  let value = model.initialValue;
  for (const tree of model.trees) {
    value += model.learningRate * predictTree(tree, x);
  }
  return Math.max(0, value);
}

export function computeMetrics(
  actual: number[],
  predicted: number[]
): Omit<ModelMetrics, "nTrain" | "nTest" | "trainedAt"> {
  const n = actual.length;
  const mae = actual.reduce((s, a, i) => s + Math.abs(a - predicted[i]), 0) / n;
  const mse = actual.reduce((s, a, i) => s + (a - predicted[i]) ** 2, 0) / n;
  const rmse = Math.sqrt(mse);
  const meanActual = actual.reduce((s, a) => s + a, 0) / n;
  const ssTot = actual.reduce((s, a) => s + (a - meanActual) ** 2, 0);
  const ssRes = actual.reduce((s, a, i) => s + (a - predicted[i]) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;
  return {
    mae: round(mae),
    rmse: round(rmse),
    r2: round(r2, 3),
  };
}

function round(v: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}
