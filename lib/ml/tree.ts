import type { GBMTreeNode } from "../types";

export interface TrainRow {
  x: number[];
  y: number;
}

// Minimal CART regression tree trained by variance-reduction splitting.
// No external dependency — small enough to train and serialise to JSON,
// and to walk again at inference time in the browser.
export function buildRegressionTree(
  rows: TrainRow[],
  maxDepth: number,
  minSamplesLeaf: number,
  nFeatures: number
): GBMTreeNode {
  function mean(rs: TrainRow[]): number {
    return rs.reduce((s, r) => s + r.y, 0) / rs.length;
  }

  function variance(rs: TrainRow[]): number {
    const m = mean(rs);
    return rs.reduce((s, r) => s + (r.y - m) ** 2, 0) / rs.length;
  }

  function build(rows: TrainRow[], depth: number): GBMTreeNode {
    if (
      depth >= maxDepth ||
      rows.length < minSamplesLeaf * 2 ||
      variance(rows) < 1e-6
    ) {
      return { leaf: mean(rows) };
    }

    let bestGain = 0;
    let bestFeature = -1;
    let bestThreshold = 0;
    const parentVar = variance(rows) * rows.length;

    for (let f = 0; f < nFeatures; f++) {
      const values = Array.from(new Set(rows.map((r) => r.x[f]))).sort(
        (a, b) => a - b
      );
      if (values.length < 2) continue;

      // Try up to 12 candidate thresholds spread across the unique values.
      const step = Math.max(1, Math.floor(values.length / 12));
      for (let i = step; i < values.length; i += step) {
        const threshold = (values[i - 1] + values[i]) / 2;
        const left = rows.filter((r) => r.x[f] <= threshold);
        const right = rows.filter((r) => r.x[f] > threshold);
        if (left.length < minSamplesLeaf || right.length < minSamplesLeaf)
          continue;

        const childVar =
          variance(left) * left.length + variance(right) * right.length;
        const gain = parentVar - childVar;
        if (gain > bestGain) {
          bestGain = gain;
          bestFeature = f;
          bestThreshold = threshold;
        }
      }
    }

    if (bestFeature === -1) {
      return { leaf: mean(rows) };
    }

    const left = rows.filter((r) => r.x[bestFeature] <= bestThreshold);
    const right = rows.filter((r) => r.x[bestFeature] > bestThreshold);

    return {
      featureIndex: bestFeature,
      threshold: bestThreshold,
      left: build(left, depth + 1),
      right: build(right, depth + 1),
    };
  }

  return build(rows, 0);
}

export function predictTree(node: GBMTreeNode, x: number[]): number {
  if (node.leaf !== undefined) return node.leaf;
  const { featureIndex, threshold, left, right } = node;
  if (featureIndex === undefined || threshold === undefined || !left || !right) {
    return 0;
  }
  return x[featureIndex] <= threshold
    ? predictTree(left, x)
    : predictTree(right, x);
}
