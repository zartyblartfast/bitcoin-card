import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getFeeHistory } from "../src/getFeeHistory.js";
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

  it("returns partial=true for 1m, 1y, and 2y ranges with explanatory note", async () => {
    for (const range of ["1m", "1y", "2y"] as const) {
      const result = await getFeeHistory(range);
      expect(result.range).toBe(range);
      expect(result.partial).toBe(true);
      expect(result.points).toEqual([]);
      expect(result.source).toBe("self-accumulated");
      expect(result.note).toBeTruthy();
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
    expect(result.partial).toBe(false);
    expect(result.source).toBe("mempool");
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.length).toBeLessThanOrEqual(24);
    // Each point has an ISO timestamp and a numeric fee.
    for (const p of result.points) {
      expect(typeof p.t).toBe("string");
      expect(Number.isFinite(p.fee)).toBe(true);
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
    expect(result.partial).toBe(false);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.length).toBeLessThanOrEqual(7);
  });

  it("propagates errors from the underlying fetch", async () => {
    vi.spyOn(mempool, "fetchRecentBlocks").mockRejectedValue(new Error("mempool down"));
    await expect(getFeeHistory("24h")).rejects.toThrow(/mempool down/);
  });
});
