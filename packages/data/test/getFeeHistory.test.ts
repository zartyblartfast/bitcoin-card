import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getFeeHistory, parseMempoolFeeRateHistory } from "../src/getFeeHistory.js";
import * as mempool from "../src/sources/mempool.js";

const originalFetch = globalThis.fetch;

const block = (timestamp: number, medianFee: number) => ({
  id: `block-${timestamp}`,
  height: Math.floor(timestamp / 600),
  timestamp,
  medianFee,
});

describe("getFeeHistory", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses mempool.space fee-rate bands into clear percentile field names", () => {
    const result = parseMempoolFeeRateHistory("24h", [
      { timestamp: 1781395200, avgFee_0: 1, avgFee_10: 2, avgFee_25: 3, avgFee_50: 5, avgFee_75: 8, avgFee_90: 13, avgFee_100: 21 },
    ], "2026-06-12T00:00:00.000Z");

    expect(result).toMatchObject({
      range: "24h",
      source: "mempool.space",
      sourceQuality: "public-api-fee-rate-bands",
      partial: false,
      fetchedAt: "2026-06-12T00:00:00.000Z",
    });
    expect(result.points[0]).toMatchObject({
      t: "2026-06-14T00:00:00.000Z",
      minFee: 1,
      p10Fee: 2,
      p25Fee: 3,
      medianFee: 5,
      p75Fee: 8,
      p90Fee: 13,
      maxFee: 21,
    });
  });

  it("returns valid percentile-band history for every supported range", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async () =>
      new Response(JSON.stringify([
        { timestamp: 1781395200, avgFee_0: 1, avgFee_10: 2, avgFee_25: 3, avgFee_50: 5, avgFee_75: 8, avgFee_90: 13, avgFee_100: 21 },
      ]), { status: 200 }),
    );

    for (const range of ["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y"] as const) {
      const result = await getFeeHistory(range);
      expect(result.range).toBe(range);
      expect(result.source).toBe("mempool.space");
      expect(result.sourceQuality).toBe("public-api-fee-rate-bands");
      expect(result.points).toHaveLength(1);
      const point = result.points[0]!;
      expect(point.minFee).toBeLessThanOrEqual(point.p10Fee);
      expect(point.p10Fee).toBeLessThanOrEqual(point.p25Fee);
      expect(point.p25Fee).toBeLessThanOrEqual(point.medianFee);
      expect(point.medianFee).toBeLessThanOrEqual(point.p75Fee);
      expect(point.p75Fee).toBeLessThanOrEqual(point.p90Fee);
      expect(point.p90Fee).toBeLessThanOrEqual(point.maxFee);
      expect(result.fetchedAt).toBeTruthy();
    }
  });

  it("aggregates 24h of recent blocks into hourly buckets", async () => {
    // 24h × 6 blocks/h = 144 blocks, with monotonically increasing timestamps.
    const now = Math.floor(Date.now() / 1000);
    const blocks = Array.from({ length: 144 }, (_, i) =>
      block(now - (143 - i) * 600, 10 + (i % 5)),
    );
    vi.spyOn(mempool, "fetchRecentBlocks").mockResolvedValue({
      source: "mempool",
      value: blocks as Parameters<typeof mempool.fetchRecentBlocks>[0] extends number ? Awaited<ReturnType<typeof mempool.fetchRecentBlocks>>["value"] : never,
      fetchedAt: new Date().toISOString(),
    });

    const result = await getFeeHistory("24h");
    expect(result.partial).toBe(true);
    expect(result.source).toBe("mempool.space recent-block fallback");
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.length).toBeLessThanOrEqual(24);
    // Each point has an ISO timestamp and ordered numeric percentile bands.
    for (const p of result.points) {
      expect(typeof p.t).toBe("string");
      expect(Number.isFinite(p.medianFee)).toBe(true);
      expect(p.minFee).toBeLessThanOrEqual(p.maxFee);
    }
  });

  it("aggregates 1w of recent blocks into daily buckets", async () => {
    const now = Math.floor(Date.now() / 1000);
    const blocks = Array.from({ length: 144 * 7 }, (_, i) =>
      block(now - (144 * 7 - 1 - i) * 600, 20 + (i % 7)),
    );
    vi.spyOn(mempool, "fetchRecentBlocks").mockResolvedValue({
      source: "mempool",
      value: blocks as never,
      fetchedAt: new Date().toISOString(),
    });

    const result = await getFeeHistory("1w");
    expect(result.partial).toBe(true);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.length).toBeLessThanOrEqual(7);
  });

  it("rejects unsupported ranges", async () => {
    await expect(getFeeHistory("5y" as never)).rejects.toThrow(/Unsupported fee history range/i);
  });

  it("propagates errors from the underlying fetch", async () => {
    vi.spyOn(mempool, "fetchRecentBlocks").mockRejectedValue(new Error("mempool down"));
    await expect(getFeeHistory("24h")).rejects.toThrow(/mempool down/);
  });
});
