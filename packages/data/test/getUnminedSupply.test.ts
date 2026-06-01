import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getUnminedSupply } from "../src/getUnminedSupply.js";

const originalFetch = globalThis.fetch;

describe("getUnminedSupply", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches current block height and returns derived unmined supply", async () => {
    // mempool returns a plain number for block height
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("900000", { status: 200 }))
      .mockResolvedValueOnce(new Response("900000", { status: 200 }));

    const result = await getUnminedSupply();
    expect(result.totalCap).toBe(21_000_000);
    expect(result.unmined).toBeGreaterThan(0);
    expect(result.unmined).toBeLessThan(21_000_000);
    expect(result.currentSupply + result.unmined).toBeCloseTo(21_000_000, 6);
    expect(result.formula).toMatch(/21,000,000/);
  });

  it("propagates errors when both block-height sources fail", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("err", { status: 500 }));
    await expect(getUnminedSupply()).rejects.toThrow();
  });
});
