import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getMempoolFees } from "../src/getMempoolFees.js";

const originalFetch = globalThis.fetch;

describe("getMempoolFees", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns the four recommended fee tiers on success", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ fastestFee: 80, halfHourFee: 50, hourFee: 30, minimumFee: 10 }),
        { status: 200 },
      ),
    );
    const result = await getMempoolFees();
    expect(result.fastestFee).toBe(80);
    expect(result.halfHourFee).toBe(50);
    expect(result.hourFee).toBe(30);
    expect(result.minimumFee).toBe(10);
    expect(result.sources[0]?.source).toBe("mempool");
  });

  it("propagates HTTP errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("down", { status: 503 }));
    await expect(getMempoolFees()).rejects.toThrow();
  });

  it("rejects malformed responses", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ wrong: "shape" }), { status: 200 }),
    );
    await expect(getMempoolFees()).rejects.toThrow();
  });
});
