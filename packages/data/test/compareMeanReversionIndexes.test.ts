import { describe, expect, it } from "vitest";
import { compareIndependentMeanReversionIndexes } from "../src/compareMeanReversionIndexes.js";

describe("compareIndependentMeanReversionIndexes", () => {
  it("compares only overlapping dates and reports index drift plus threshold agreement", () => {
    const result = compareIndependentMeanReversionIndexes(
      [
        { date: "2026-01-01", liteIndex: 10 },
        { date: "2026-01-02", liteIndex: 40 },
        { date: "2026-01-03", liteIndex: 80 },
      ],
      [
        { date: "2026-01-02", liteIndex: 50 },
        { date: "2026-01-03", liteIndex: 70 },
        { date: "2026-01-04", liteIndex: 5 },
      ],
      [30, 70],
    );

    expect(result.overlapDays).toBe(2);
    expect(result.excludedIndependentDays).toBe(1);
    expect(result.excludedIncumbentDays).toBe(1);
    expect(result.meanAbsoluteDifference).toBe(10);
    expect(result.medianAbsoluteDifference).toBe(10);
    expect(result.p95AbsoluteDifference).toBe(10);
    expect(result.maxAbsoluteDifference).toBe(10);
    expect(result.currentDifference).toBe(10);
    expect(result.thresholdAgreement).toEqual({ agreements: 4, comparisons: 4, rate: 1 });
  });
});
