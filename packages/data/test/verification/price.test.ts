import { describe, it, expect } from "vitest";
import { verifyPrices } from "../../src/verification/price.js";
import type { SourceResult } from "../../src/types.js";

const at = "2026-06-01T00:00:00.000Z";
const src = (source: string, value: number): SourceResult<number> => ({
  source,
  value,
  fetchedAt: at,
});

describe("verifyPrices", () => {
  it("marks verified when sources agree within threshold", () => {
    const result = verifyPrices([src("coinbase", 67000), src("kraken", 67050)]);
    expect(result.price).toBeCloseTo(67025, 0);
    expect(result.agreement).toBe("verified");
  });

  it("marks disputed when sources diverge beyond threshold", () => {
    const result = verifyPrices([src("coinbase", 67000), src("kraken", 68000)]);
    expect(result.agreement).toBe("disputed");
  });

  it("marks single-source when only one source provided", () => {
    const result = verifyPrices([src("coinbase", 67000)]);
    expect(result.agreement).toBe("single-source");
    expect(result.price).toBe(67000);
  });

  it("throws when given empty sources array", () => {
    expect(() => verifyPrices([])).toThrow(/at least one source/i);
  });

  it("uses default 0.5% threshold", () => {
    const r1 = verifyPrices([src("a", 100), src("b", 100.4)]);
    expect(r1.agreement).toBe("verified");
    const r2 = verifyPrices([src("a", 100), src("b", 100.6)]);
    expect(r2.agreement).toBe("disputed");
  });

  it("accepts a custom threshold", () => {
    // 20% divergence exceeds the 10% custom threshold.
    const result = verifyPrices([src("a", 100), src("b", 120)], { threshold: 0.1 });
    expect(result.agreement).toBe("disputed");
  });
});
