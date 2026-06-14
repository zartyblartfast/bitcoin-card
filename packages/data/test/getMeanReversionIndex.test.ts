import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeanReversionIndex } from "../src/getMeanReversionIndex.js";

const originalFetch = globalThis.fetch;

function makeCheckonchainFixture(days = 1410): string {
  const start = new Date("2022-07-03T00:00:00.000Z");
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return `${d.toISOString().slice(0, 10)}T00:00:00.000000000`;
  });
  const price = dates.map((_, i) => 20_000 + i * 25 + Math.sin(i / 20) * 1_000);
  const realized = dates.map((_, i) => 16_000 + i * 15);
  const fullIndex = dates.map((_, i) => Math.max(0, Math.min(100, 45 + Math.sin(i / 35) * 25)));
  const traces = [
    { name: "Price", x: dates, y: price },
    { name: "200DMA", x: dates, y: price.map((p) => p * 0.92) },
    { name: "200WMA", x: dates, y: price.map((p) => p * 0.78) },
    { name: "365d-Onchain VWAP", x: dates, y: price.map((p) => p * 0.88) },
    { name: "90d-Onchain VWAP", x: dates, y: price.map((p) => p * 0.94) },
    { name: "Realized Price", x: dates, y: realized },
    { name: "True Market Mean", x: dates, y: price.map((p) => p * 0.9) },
    { name: "STH Cost Basis", x: dates, y: price.map((p) => p * 0.96) },
    { name: "Cointime Price", x: dates, y: price.map((p) => p * 0.76) },
    { name: "Powerlaw", x: dates, y: price.map((p) => p * 1.5) },
    { name: "Index", x: dates, y: fullIndex },
    { name: "Fast Index", x: dates, y: fullIndex.map((v) => Math.min(100, v + 2)) },
    { name: "Slow Index", x: dates, y: fullIndex.map((v) => Math.max(0, v - 2)) },
    { name: "Floor Index", x: dates, y: fullIndex.map((v) => Math.max(0, v - 8)) },
    { name: "Ceiling Index", x: dates, y: fullIndex.map((v) => Math.min(100, v + 8)) },
    { name: "Index_Spread", x: dates, y: fullIndex.map(() => 4) },
  ];
  return `<html><body><script>Plotly.newPlot("chart", ${JSON.stringify(traces)}, {});</script></body></html>`;
}

describe("getMeanReversionIndex", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses Checkonchain full BMRI and computes a 3-anchor lite comparison", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(makeCheckonchainFixture(), { status: 200 }),
    );

    const result = await getMeanReversionIndex();

    expect(result.source.full).toMatch(/Checkonchain/);
    expect(result.source.sourceQuality).toBe("public-chart-scrape");
    expect(result.methodology.liteAnchors).toEqual(["200DMA", "200WMA", "Realized Price"]);
    expect(result.methodology.fullAnchors).toContain("365d-Onchain VWAP");
    expect(result.methodology.fullAnchors).toContain("Cointime Price");
    expect(result.latest.fullIndex).toBeGreaterThanOrEqual(0);
    expect(result.latest.fullIndex).toBeLessThanOrEqual(100);
    expect(result.latest.liteIndex).toBeGreaterThanOrEqual(0);
    expect(result.latest.liteIndex).toBeLessThanOrEqual(100);
    expect(result.latest.difference).toBeCloseTo(result.latest.liteIndex - result.latest.fullIndex, 6);
    expect(result.latest.liteComponents["200DMA"]).toBeTypeOf("number");
    expect(result.latest.fullAnchors).toHaveLength(9);
    expect(result.history.length).toBeGreaterThan(1_000);
  });
});
