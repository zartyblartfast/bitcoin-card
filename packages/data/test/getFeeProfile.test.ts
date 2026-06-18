import { describe, expect, it, vi, afterEach } from "vitest";
import { getFeeProfile } from "../src/getFeeProfile.js";
import * as feeHistory from "../src/getFeeHistory.js";
import * as mempoolFees from "../src/getMempoolFees.js";
import * as price from "../src/getPrice.js";

const feeHistoryFixture = {
  range: "1w" as const,
  points: [
    { t: "2026-06-10T00:00:00.000Z", minFee: 1, p10Fee: 2, p25Fee: 3, medianFee: 5, p75Fee: 8, p90Fee: 12, maxFee: 20 },
    { t: "2026-06-11T00:00:00.000Z", minFee: 2, p10Fee: 3, p25Fee: 4, medianFee: 6, p75Fee: 9, p90Fee: 14, maxFee: 22 },
  ],
  source: "mempool.space",
  sourceQuality: "public-api-fee-rate-bands",
  partial: false,
  fetchedAt: "2026-06-12T00:00:00.000Z",
};

describe("getFeeProfile", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calculates a weekly low-fee target with USD and percent-of-buy estimates", async () => {
    vi.spyOn(feeHistory, "getFeeHistory").mockResolvedValue(feeHistoryFixture);
    vi.spyOn(mempoolFees, "getMempoolFees").mockResolvedValue({
      fastestFee: 12,
      halfHourFee: 8,
      hourFee: 6,
      minimumFee: 2,
      sources: [],
      fetchedAt: "2026-06-12T00:00:00.000Z",
    });
    vi.spyOn(price, "getPrice").mockResolvedValue({
      price: 100_000,
      currency: "USD",
      sources: [],
      agreement: "single-source",
      fetchedAt: "2026-06-12T00:00:00.000Z",
    });

    const result = await getFeeProfile({ cadence: "weekly", buyAmountUsd: 100, targetVbytes: 140 });

    expect(result.cadence).toBe("weekly");
    expect(result.buyAmountUsd).toBe(100);
    expect(result.targetVbytes).toBe(140);
    expect(result.recommendedSatVb).toBe(4);
    expect(result.estimatedFeeUsd).toBeCloseTo(0.56);
    expect(result.estimatedFeePctOfBuy).toBeCloseTo(0.56);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.regime).toBe("normal");
    expect(result.reason).toMatch(/weekly/i);
    expect(result.historySummary).toMatchObject({ range: "1w", p10Fee: 2.5, medianFee: 5.5, p90Fee: 13, partial: false });
    expect(result.sourceQuality).toBe("derived-from-public-fee-history");
  });

  it("does not blindly recommend 1 sat/vB when recent history makes it unrealistic", async () => {
    vi.spyOn(feeHistory, "getFeeHistory").mockResolvedValue({
      ...feeHistoryFixture,
      points: [
        { t: "2026-06-10T00:00:00.000Z", minFee: 8, p10Fee: 10, p25Fee: 12, medianFee: 20, p75Fee: 40, p90Fee: 60, maxFee: 90 },
      ],
    });
    vi.spyOn(mempoolFees, "getMempoolFees").mockResolvedValue({
      fastestFee: 70,
      halfHourFee: 50,
      hourFee: 30,
      minimumFee: 8,
      sources: [],
      fetchedAt: "2026-06-12T00:00:00.000Z",
    });
    vi.spyOn(price, "getPrice").mockResolvedValue({ price: 100_000, currency: "USD", sources: [], agreement: "single-source", fetchedAt: "2026-06-12T00:00:00.000Z" });

    const result = await getFeeProfile({ cadence: "monthly", buyAmountUsd: 100, targetVbytes: 140 });

    expect(result.recommendedSatVb).toBeGreaterThan(1);
    expect(result.regime).toMatch(/elevated|congested|extreme/);
    expect(result.reason).toMatch(/elevated|congested|high/i);
  });

  it("rejects invalid buy amounts", async () => {
    await expect(getFeeProfile({ cadence: "weekly", buyAmountUsd: 0 })).rejects.toThrow(/buyAmountUsd/i);
  });
});
