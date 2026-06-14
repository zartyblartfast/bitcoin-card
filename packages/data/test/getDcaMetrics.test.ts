import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDcaMetrics } from "../src/getDcaMetrics.js";

const originalFetch = globalThis.fetch;

function meanReversionFixture(days = 1410): string {
  const start = new Date("2022-07-03T00:00:00.000Z");
  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return `${d.toISOString().slice(0, 10)}T00:00:00.000000000`;
  });
  const price = dates.map((_, i) => 20_000 + i * 25);
  const realized = dates.map((_, i) => 16_000 + i * 15);
  const index = dates.map((_, i) => 12 + Math.sin(i / 35) * 5);
  const traces = [
    { name: "Price", x: dates, y: price },
    { name: "200DMA", x: dates, y: price.map(p => p * 0.92) },
    { name: "200WMA", x: dates, y: price.map(p => p * 0.78) },
    { name: "365d-Onchain VWAP", x: dates, y: price.map(p => p * 0.88) },
    { name: "90d-Onchain VWAP", x: dates, y: price.map(p => p * 0.94) },
    { name: "Realized Price", x: dates, y: realized },
    { name: "True Market Mean", x: dates, y: price.map(p => p * 0.9) },
    { name: "STH Cost Basis", x: dates, y: price.map(p => p * 0.96) },
    { name: "Cointime Price", x: dates, y: price.map(p => p * 0.76) },
    { name: "Powerlaw", x: dates, y: price.map(p => p * 1.5) },
    { name: "Index", x: dates, y: index },
  ];
  return `<script>Plotly.newPlot("chart", ${JSON.stringify(traces)}, {});</script>`;
}

function coinMetricsMvrvFixture() {
  return {
    data: [
      {
        asset: "btc",
        time: "2026-06-10T00:00:00.000000000Z",
        CapMrktCurUSD: "100",
        CapMVRVCur: "1.0",
      },
      {
        asset: "btc",
        time: "2026-06-11T00:00:00.000000000Z",
        CapMrktCurUSD: "200",
        CapMVRVCur: "1.0",
      },
      {
        asset: "btc",
        time: "2026-06-13T00:00:00.000000000Z",
        CapMrktCurUSD: "400",
        CapMVRVCur: "1.15",
      },
    ],
  };
}

function alternativeMeFngFixture() {
  return {
    name: "Fear and Greed Index",
    data: [
      {
        value: "18",
        value_classification: "Extreme Fear",
        timestamp: "1781395200",
        time_until_update: "22479",
      },
    ],
    metadata: { error: null },
  };
}

describe("getDcaMetrics", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("coinbase")) {
        return new Response(JSON.stringify({ data: { amount: "67000", currency: "USD" } }), { status: 200 });
      }
      if (url.includes("kraken")) {
        return new Response(JSON.stringify({ result: { XXBTZUSD: { c: ["67050", "0"] } } }), { status: 200 });
      }
      if (url.includes("mempool.space/api/blocks/tip/height")) {
        return new Response("900000", { status: 200 });
      }
      if (url.includes("blockstream.info/api/blocks/tip/height")) {
        return new Response("900000", { status: 200 });
      }
      if (url.includes("mempool.space/api/v1/mining/hashrate/3d")) {
        return new Response(JSON.stringify({ currentHashrate: 700e18, currentDifficulty: 86_000_000_000_000 }), { status: 200 });
      }
      if (url.includes("mempool.space/api/v1/fees/recommended")) {
        return new Response(JSON.stringify({ fastestFee: 5, halfHourFee: 3, hourFee: 2, minimumFee: 1 }), { status: 200 });
      }
      if (url.includes("meanreversion_index_light.html")) {
        return new Response(meanReversionFixture(), { status: 200 });
      }
      if (url.includes("community-api.coinmetrics.io/v4/timeseries/asset-metrics")) {
        return new Response(JSON.stringify(coinMetricsMvrvFixture()), { status: 200 });
      }
      if (url.includes("api.alternative.me/fng")) {
        return new Response(JSON.stringify(alternativeMeFngFixture()), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns a compact DCA app summary with price, fees, network state, and BMRI context", async () => {
    const result = await getDcaMetrics();

    expect(result.price.value).toBeCloseTo(67025, 0);
    expect(result.price.agreement).toBe("verified");
    expect(result.fees.fastestFee).toBe(5);
    expect(result.network.blockHeight).toBe(900000);
    expect(result.network.hashrateEhS).toBe(700);
    expect(result.meanReversion.fullIndex).toBeTypeOf("number");
    expect(result.meanReversion.liteIndex).toBeTypeOf("number");
    expect(result.meanReversion.zone).toBe("deep_value");
    expect(result.meanReversion.sourceQuality).toBe("public-chart-scrape");
    expect(result.meanReversion.caveat).toMatch(/not an official API/i);
    expect(result.bitcoinRisk.mvrvZScore).toBeCloseTo(0.4183219439);
    expect(result.bitcoinRisk.riskScore).toBe(12);
    expect(result.bitcoinRisk.band).toBe("deep_value");
    expect(result.bitcoinRisk.sentiment?.value).toBe(18);
    expect(result.bitcoinRisk.sentiment?.classification).toBe("Extreme Fear");
    expect(result.bitcoinRisk.dataDate).toBe("2026-06-13");
    expect(result.raw.meanReversion.history).toBeUndefined();
    expect(result.raw.bitcoinRisk.history).toHaveLength(3);
  });
});
