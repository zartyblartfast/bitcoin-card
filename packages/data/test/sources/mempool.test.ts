import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  fetchBlockHeight,
  fetchRecommendedFees,
  fetchHashrate,
  fetchDifficulty,
  fetchRecentBlocks,
} from "../../src/sources/mempool.js";

const originalFetch = globalThis.fetch;

describe("mempool.space source", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetchBlockHeight returns integer height from /api/blocks/tip/height", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response("812345", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );
    const result = await fetchBlockHeight();
    expect(result).toEqual({ source: "mempool", value: 812345, fetchedAt: expect.any(String) });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://mempool.space/api/blocks/tip/height",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchRecommendedFees returns fee object from /api/v1/fees/recommended", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          fastestFee: 25,
          halfHourFee: 20,
          hourFee: 15,
          minimumFee: 1,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchRecommendedFees();
    expect(result.source).toBe("mempool");
    expect(result.value).toEqual({
      fastestFee: 25,
      halfHourFee: 20,
      hourFee: 15,
      minimumFee: 1,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://mempool.space/api/v1/fees/recommended",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchHashrate returns EH/s (divides H/s by 1e18)", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ hashrate: 6.5e20 }), { status: 200 }),
    );
    const result = await fetchHashrate();
    expect(result.source).toBe("mempool");
    // 6.5e20 / 1e18 = 650
    expect(result.value).toBeCloseTo(650, 6);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://mempool.space/api/v1/mining/hashrate/3d",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchDifficulty returns bigint from /api/v1/difficulty/", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ difficulty: 102_000_000_000_000 }), { status: 200 }),
    );
    const result = await fetchDifficulty();
    expect(result.source).toBe("mempool");
    expect(typeof result.value).toBe("bigint");
    expect(result.value).toBe(102_000_000_000_000n);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://mempool.space/api/v1/difficulty/",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("fetchRecentBlocks returns parsed array from /api/v1/blocks/tip/{n}", async () => {
    const mockBlocks = [
      { id: "0001", height: 100, timestamp: 1700000000, medianFee: 5, feeRange: [1, 10] },
      { id: "0002", height: 99, timestamp: 1699999000, medianFee: 4 },
    ];
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify(mockBlocks), { status: 200 }),
    );
    const result = await fetchRecentBlocks(2);
    expect(result.source).toBe("mempool");
    expect(result.value).toHaveLength(2);
    expect(result.value[0]?.height).toBe(100);
    expect(result.value[1]?.id).toBe("0002");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://mempool.space/api/v1/blocks/tip/2",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("propagates HTTP errors with status code in message", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("upstream down", { status: 503 }));
    await expect(fetchBlockHeight()).rejects.toThrow(/HTTP 503/);
  });
});
