import { describe, it, expect } from "vitest";
import {
  computeCurrentSupply,
  computeUnminedSupply,
} from "../../src/derive/unmined.js";

describe("computeCurrentSupply", () => {
  it("uses 50 BTC reward for blocks before first halving (height < 210000)", () => {
    expect(computeCurrentSupply(100)).toBe(5000);
    expect(computeCurrentSupply(0)).toBe(0);
    expect(computeCurrentSupply(210_000)).toBe(10_500_000);
  });

  it("applies first halving at height 210000", () => {
    // 210000 * 50 = 10,500,000 (pre-halving)
    // 1 block * 25 = 25 (post-halving)
    expect(computeCurrentSupply(210_001)).toBe(10_500_025);
  });

  it("applies second halving at height 420000", () => {
    // 210000 * 50 = 10,500,000
    // 210000 * 25 = 5,250,000
    // 1 * 12.5 = 12.5
    expect(computeCurrentSupply(420_001)).toBeCloseTo(15_750_012.5, 6);
  });

  it("applies third halving at height 630000", () => {
    // 3 full eras at 50/25/12.5 + 1 block at 6.25
    const expected = 210_000 * 50 + 210_000 * 25 + 210_000 * 12.5 + 1 * 6.25;
    expect(computeCurrentSupply(630_001)).toBeCloseTo(expected, 6);
  });

  it("throws on negative height", () => {
    expect(() => computeCurrentSupply(-1)).toThrow();
  });

  it("throws on non-integer height", () => {
    expect(() => computeCurrentSupply(1.5)).toThrow();
  });
});

describe("computeUnminedSupply", () => {
  it("returns 21M - currentSupply for a recent height", () => {
    const result = computeUnminedSupply(900_000);
    expect(result.unmined).toBeGreaterThan(0);
    expect(result.unmined).toBeLessThan(21_000_000);
    expect(result.totalCap).toBe(21_000_000);
    expect(result.currentSupply + result.unmined).toBeCloseTo(21_000_000, 6);
  });

  it("returns full 21M unmined at height 0", () => {
    const result = computeUnminedSupply(0);
    expect(result.unmined).toBe(21_000_000);
    expect(result.currentSupply).toBe(0);
  });

  it("includes a human-readable formula in the result", () => {
    const result = computeUnminedSupply(900_000);
    expect(result.formula).toMatch(/21,000,000/);
    expect(result.formula).toMatch(/halv/);
  });
});
