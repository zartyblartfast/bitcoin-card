import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COIN_METRICS_DAILY_HISTORY_URL,
  getCoinMetricsDailyHistory,
  parseCoinMetricsDailyHistory,
} from "../src/coinMetricsDailyHistory.js";

const originalFetch = globalThis.fetch;

function row(overrides: Record<string, unknown> = {}) {
  return {
    asset: "btc",
    time: "2026-06-10T00:00:00.000000000Z",
    PriceUSD: "100",
    CapMrktCurUSD: "200",
    CapMVRVCur: "2",
    SplyCur: "20",
    IssTotUSD: "10",
    FeeTotNtv: "1",
    ...overrides,
  };
}

function payload(rows = [row(), row({ time: "2026-06-11T00:00:00.000000000Z", PriceUSD: "110" })]) {
  return { data: rows };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("parseCoinMetricsDailyHistory", () => {
  it("parses every required field, optional fees, and sorts rows chronologically", () => {
    const history = parseCoinMetricsDailyHistory(
      payload([
        row({ time: "2026-06-11T00:00:00.000000000Z", PriceUSD: "110", FeeTotNtv: undefined }),
        row(),
      ]),
    );

    expect(history).toEqual([
      {
        date: "2026-06-10",
        unixTs: 1781049600,
        priceUsd: 100,
        marketCapUsd: 200,
        mvrv: 2,
        supplyBtc: 20,
        issuanceUsd: 10,
        feeTotalBtc: 1,
      },
      {
        date: "2026-06-11",
        unixTs: 1781136000,
        priceUsd: 110,
        marketCapUsd: 200,
        mvrv: 2,
        supplyBtc: 20,
        issuanceUsd: 10,
      },
    ]);
  });

  it("ignores unavailable leading pre-market rows but keeps the complete daily series", () => {
    const history = parseCoinMetricsDailyHistory(payload([
      row({ time: "2009-01-03T00:00:00.000000000Z", PriceUSD: null, CapMrktCurUSD: null, CapMVRVCur: null, SplyCur: "0", IssTotUSD: null }),
      row(),
      row({ time: "2026-06-11T00:00:00.000000000Z", PriceUSD: "110" }),
    ]));

    expect(history.map((point) => point.date)).toEqual(["2026-06-10", "2026-06-11"]);
  });

  it("ignores partial leading market rows until all required metrics begin", () => {
    const history = parseCoinMetricsDailyHistory(payload([
      row({ time: "2010-07-17T00:00:00.000000000Z", PriceUSD: "0.08", CapMrktCurUSD: "100", CapMVRVCur: null, SplyCur: "5000000", IssTotUSD: "1" }),
      row(),
      row({ time: "2026-06-11T00:00:00.000000000Z", PriceUSD: "110" }),
    ]));

    expect(history.map((point) => point.date)).toEqual(["2026-06-10", "2026-06-11"]);
  });

  it.each([
    ["missing PriceUSD", row({ PriceUSD: undefined })],
    ["non-finite CapMrktCurUSD", row({ CapMrktCurUSD: "Infinity" })],
    ["non-positive CapMVRVCur", row({ CapMVRVCur: "0" })],
    ["missing SplyCur", row({ SplyCur: undefined })],
    ["non-positive IssTotUSD", row({ IssTotUSD: "0" })],
  ])("rejects %s", (_reason, invalidRow) => {
    expect(() => parseCoinMetricsDailyHistory(payload([invalidRow, row({ time: "2026-06-11T00:00:00.000000000Z" })]))).toThrow(
      /Coin Metrics BTC daily history/i,
    );
  });

  it("rejects malformed dates", () => {
    expect(() => parseCoinMetricsDailyHistory(payload([row({ time: "not-a-date" }), row({ time: "2026-06-11T00:00:00.000000000Z" })]))).toThrow(
      /invalid time/i,
    );
  });

  it("rejects duplicate observation dates deterministically", () => {
    expect(() => parseCoinMetricsDailyHistory(payload([row(), row({ PriceUSD: "101" })]))).toThrow(/duplicate date/i);
  });

  it("rejects an undersized history", () => {
    expect(() => parseCoinMetricsDailyHistory(payload([row()]))).toThrow(/too few usable rows/i);
  });
});

describe("getCoinMetricsDailyHistory", () => {
  it("requests all shared fields including supply and returns the validated rows", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload()), { status: 200 }));
    globalThis.fetch = fetchMock;

    const result = await getCoinMetricsDailyHistory();

    expect(result).toHaveLength(2);
    expect(COIN_METRICS_DAILY_HISTORY_URL).toContain("PriceUSD");
    expect(COIN_METRICS_DAILY_HISTORY_URL).toContain("CapMrktCurUSD");
    expect(COIN_METRICS_DAILY_HISTORY_URL).toContain("CapMVRVCur");
    expect(COIN_METRICS_DAILY_HISTORY_URL).toContain("SplyCur");
    expect(COIN_METRICS_DAILY_HISTORY_URL).toContain("IssTotUSD");
    expect(fetchMock).toHaveBeenCalledWith(COIN_METRICS_DAILY_HISTORY_URL, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
});
