import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetBitcoinRiskCacheForTests,
  getBitcoinRisk,
  parseCoinMetricsMvrvHistory,
  riskBandFromMvrvZScore,
  riskScoreFromMvrvZScore,
} from "../src/getBitcoinRisk.js";

const originalFetch = globalThis.fetch;

function coinMetricsMvrvFixture(latestMvrv = "1.15") {
  return {
    data: [
      {
        asset: "btc",
        time: "2026-06-10T00:00:00.000000000Z",
        CapMrktCurUSD: "100",
        CapMVRVCur: "1.0",
        PriceUSD: "100",
        IssTotUSD: "100",
        FeeTotNtv: "1",
      },
      {
        asset: "btc",
        time: "2026-06-11T00:00:00.000000000Z",
        CapMrktCurUSD: "200",
        CapMVRVCur: "1.0",
        PriceUSD: "150",
        IssTotUSD: "200",
        FeeTotNtv: "2",
      },
      {
        asset: "btc",
        time: "2026-06-13T00:00:00.000000000Z",
        CapMrktCurUSD: "400",
        CapMVRVCur: latestMvrv,
        PriceUSD: "300",
        IssTotUSD: "400",
        FeeTotNtv: "4",
      },
    ],
  };
}

function alternativeMeFngFixture(value = "18", classification = "Extreme Fear", timestamp = "1781395200") {
  return {
    name: "Fear and Greed Index",
    data: [
      {
        value,
        value_classification: classification,
        timestamp,
        time_until_update: "22479",
      },
    ],
    metadata: { error: null },
  };
}

describe("getBitcoinRisk", () => {
  beforeEach(() => {
    _resetBitcoinRiskCacheForTests();
    globalThis.fetch = vi.fn();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-14T12:00:00.000Z"));
  });

  afterEach(() => {
    _resetBitcoinRiskCacheForTests();
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("derives a native composite Bitcoin Risk score and adds separate Alternative.me sentiment", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(coinMetricsMvrvFixture()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(alternativeMeFngFixture()), { status: 200 }));

    const result = await getBitcoinRisk();

    expect(result.metric).toBe("bitcoin-risk-composite");
    expect(result.mvrv).toBeCloseTo(1.15);
    expect(result.mvrvZScore).toBeCloseTo(0.4183219439);
    expect(result.components.mvrvZDerived).toMatchObject({ score: 12, sourceMetric: "CapMrktCurUSD,CapMVRVCur" });
    expect(result.components.puellIssuance.value).toBeCloseTo(1.7142857143);
    expect(result.components.puellIssuance.score).toBe(38);
    expect(result.components.mayerMultiple.value).toBeCloseTo(1.6363636364);
    expect(result.components.mayerMultiple.score).toBe(58);
    expect(result.components.ma200wDistance.value).toBeCloseTo(1.6363636364);
    expect(result.components.ma200wDistance.score).toBe(58);
    expect(result.riskScore).toBe(42);
    expect(result.band).toBe("neutral");
    expect(result.dataDate).toBe("2026-06-13");
    expect(result.unixTs).toBe(1781308800);
    expect(result.source.name).toBe("Coin Metrics Community API");
    expect(result.source.url).toContain("community-api.coinmetrics.io/v4/timeseries/asset-metrics");
    expect(result.source.sourceQuality).toBe("community-api-derived");
    expect(result.history).toHaveLength(3);
    expect(result.history[0]).toMatchObject({
      date: "2026-06-10",
      mvrv: 1,
      mvrvZScore: 0,
      riskScore: 18,
      band: "value",
    });
    expect(result.history[2]).toMatchObject({
      date: "2026-06-13",
      mvrv: 1.15,
      riskScore: 42,
      band: "neutral",
    });
    expect(result.history[2]!.components.puellIssuance.value).toBeCloseTo(1.7142857143);
    expect(result.history[2]!.mvrvZScore).toBeCloseTo(0.4183219439);
    expect(result.sentiment.metric).toBe("crypto-fear-and-greed");
    expect(result.sentiment.value).toBe(18);
    expect(result.sentiment.classification).toBe("Extreme Fear");
    expect(result.sentiment.dataDate).toBe("2026-06-14");
    expect(result.sentiment.source.name).toBe("Alternative.me");
    expect(result.sentiment.source.sourceQuality).toBe("free-api-attribution-required");
    expect(result.sentiment.limitations).toMatch(/sentiment/i);
    expect(result.methodology).toMatch(/CapMrktCurUSD/i);
    expect(result.limitations).toMatch(/community/i);
    expect(result.fetchedAt).toBe("2026-06-14T12:00:00.000Z");
  });

  it("caches the daily value in-process so repeated calls do not spend upstream requests", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(coinMetricsMvrvFixture()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(alternativeMeFngFixture()), { status: 200 }));

    const first = await getBitcoinRisk();
    const second = await getBitcoinRisk();

    expect(first).toEqual(second);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("refetches at most once per UTC day", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(coinMetricsMvrvFixture()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(alternativeMeFngFixture()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(coinMetricsMvrvFixture("2.0")), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(alternativeMeFngFixture("22", "Fear", "1781481600")), { status: 200 }));

    const first = await getBitcoinRisk();
    vi.setSystemTime(new Date("2026-06-15T00:05:00.000Z"));
    const second = await getBitcoinRisk();

    expect(first.mvrv).toBeCloseTo(1.15);
    expect(second.mvrv).toBe(2);
    expect(second.sentiment.value).toBe(22);
    expect(globalThis.fetch).toHaveBeenCalledTimes(4);
  });

  it("keeps valuation risk available when the optional sentiment fetch fails", async () => {
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(coinMetricsMvrvFixture()), { status: 200 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));

    const result = await getBitcoinRisk();

    expect(result.riskScore).toBe(42);
    expect(result.sentiment).toBeUndefined();
    expect(result.sentimentStatus).toMatch(/unavailable/i);
  });

  it("rejects malformed Coin Metrics responses", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: [{ time: "2026-06-13T00:00:00.000000000Z" }] }), {
        status: 200,
      }),
    );

    await expect(getBitcoinRisk()).rejects.toThrow(/too few usable rows/i);
  });

  it("skips sparse Coin Metrics rows that predate required metric availability", () => {
    const fixture = coinMetricsMvrvFixture();
    const result = parseCoinMetricsMvrvHistory(
      {
        data: [
          { asset: "btc", time: "2009-01-03T00:00:00.000000000Z", IssTotUSD: "0" },
          fixture.data[0],
          fixture.data[1],
          fixture.data[2],
        ],
      },
      "2026-06-14T12:00:00.000Z",
    );

    expect(result.history).toHaveLength(3);
    expect(result.history[0]!.date).toBe("2026-06-10");
  });

  it("parses unsorted history and uses the latest row by timestamp", () => {
    const result = parseCoinMetricsMvrvHistory(
      {
        data: [coinMetricsMvrvFixture().data[2], coinMetricsMvrvFixture().data[0], coinMetricsMvrvFixture().data[1]],
      },
      "2026-06-14T12:00:00.000Z",
    );

    expect(result.dataDate).toBe("2026-06-13");
    expect(result.history).toHaveLength(3);
    expect(result.history[0]!.date).toBe("2026-06-10");
    expect(result.history[2]!.mvrvZScore).toBeCloseTo(0.4183219439);
    expect(result.fetchedAt).toBe("2026-06-14T12:00:00.000Z");
  });
});

describe("bitcoin risk mappings", () => {
  it("converts MVRV Z-score to a clamped 0-100 risk score", () => {
    expect(riskScoreFromMvrvZScore(-1)).toBe(0);
    expect(riskScoreFromMvrvZScore(0.351)).toBe(11);
    expect(riskScoreFromMvrvZScore(7)).toBe(100);
    expect(riskScoreFromMvrvZScore(9)).toBe(100);
  });

  it("converts MVRV Z-score to valuation risk bands", () => {
    expect(riskBandFromMvrvZScore(0.351)).toBe("deep_value");
    expect(riskBandFromMvrvZScore(1)).toBe("value");
    expect(riskBandFromMvrvZScore(2)).toBe("neutral");
    expect(riskBandFromMvrvZScore(4)).toBe("elevated");
    expect(riskBandFromMvrvZScore(6)).toBe("high");
    expect(riskBandFromMvrvZScore(8)).toBe("extreme");
  });
});
