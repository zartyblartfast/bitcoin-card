export type LiteIndexPoint = { date: string; liteIndex: number };

export type MeanReversionComparison = {
  overlapDays: number;
  excludedIndependentDays: number;
  excludedIncumbentDays: number;
  meanAbsoluteDifference: number;
  medianAbsoluteDifference: number;
  p95AbsoluteDifference: number;
  maxAbsoluteDifference: number;
  correlation: number | null;
  currentDifference: number;
  thresholdAgreement: { agreements: number; comparisons: number; rate: number };
};

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)]!;
}

function correlation(left: number[], right: number[]): number | null {
  if (left.length < 2) return null;
  const meanLeft = left.reduce((sum, value) => sum + value, 0) / left.length;
  const meanRight = right.reduce((sum, value) => sum + value, 0) / right.length;
  const numerator = left.reduce((sum, value, index) => sum + (value - meanLeft) * (right[index]! - meanRight), 0);
  const leftVariance = left.reduce((sum, value) => sum + (value - meanLeft) ** 2, 0);
  const rightVariance = right.reduce((sum, value) => sum + (value - meanRight) ** 2, 0);
  return leftVariance === 0 || rightVariance === 0 ? null : numerator / Math.sqrt(leftVariance * rightVariance);
}

export function compareIndependentMeanReversionIndexes(
  independent: LiteIndexPoint[],
  incumbent: LiteIndexPoint[],
  thresholds: number[],
): MeanReversionComparison {
  const incumbentByDate = new Map(incumbent.map((point) => [point.date, point.liteIndex]));
  const overlap = independent
    .filter((point) => incumbentByDate.has(point.date))
    .map((point) => ({ independent: point.liteIndex, incumbent: incumbentByDate.get(point.date)! }));
  if (!overlap.length) throw new Error("Independent and incumbent BMRI-lite histories have no overlapping dates");

  const absoluteDifferences = overlap.map((point) => Math.abs(point.independent - point.incumbent));
  let agreements = 0;
  for (const threshold of thresholds) {
    for (const point of overlap) {
      if ((point.independent >= threshold) === (point.incumbent >= threshold)) agreements += 1;
    }
  }
  const comparisons = overlap.length * thresholds.length;
  const latest = overlap.at(-1)!;
  return {
    overlapDays: overlap.length,
    excludedIndependentDays: independent.length - overlap.length,
    excludedIncumbentDays: incumbent.length - overlap.length,
    meanAbsoluteDifference: absoluteDifferences.reduce((sum, value) => sum + value, 0) / absoluteDifferences.length,
    medianAbsoluteDifference: quantile(absoluteDifferences, 0.5),
    p95AbsoluteDifference: quantile(absoluteDifferences, 0.95),
    maxAbsoluteDifference: Math.max(...absoluteDifferences),
    correlation: correlation(overlap.map((point) => point.independent), overlap.map((point) => point.incumbent)),
    currentDifference: latest.independent - latest.incumbent,
    thresholdAgreement: { agreements, comparisons, rate: comparisons ? agreements / comparisons : 1 },
  };
}
