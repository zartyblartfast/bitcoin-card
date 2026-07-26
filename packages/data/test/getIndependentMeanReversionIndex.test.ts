import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetIndependentBmriLiteIntegrityForTests,
  assertIndependentBmriLiteHistoryIntegrity,
  calculateIndependentMeanReversionIndex,
  getIndependentMeanReversionIndex,
} from "../src/getIndependentMeanReversionIndex.js";
import { COIN_METRICS_DAILY_HISTORY_URL } from "../src/coinMetricsDailyHistory.js";
import { getIndependentMeanReversionIndex as exportedGetIndependentMeanReversionIndex } from "../src/index.js";
import type { CoinMetricsDailyHistoryRow } from "../src/types.js";

function row(
  date: string,
  priceUsd: number,
  marketCapUsd: number,
  mvrv: number,
  supplyBtc: number,
): CoinMetricsDailyHistoryRow {
  return {
    date,
    unixTs: Date.parse(`${date}T00:00:00.000Z`) / 1000,
    priceUsd,
    marketCapUsd,
    mvrv,
    supplyBtc,
    issuanceUsd: 1,
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  _resetIndependentBmriLiteIntegrityForTests();
  vi.useRealTimers();
});

describe("calculateIndependentMeanReversionIndex", () => {
  it("derives realized price and uses only history available on each day for the lite percentile", () => {
    const result = calculateIndependentMeanReversionIndex([
      row("2026-01-01", 10, 100, 2, 10),
      row("2026-01-02", 30, 200, 2, 10),
      row("2026-01-03", 10, 100, 2, 10),
    ]);

    expect(result.history.map((point) => point.realizedPrice)).toEqual([5, 10, 5]);
    expect(result.history.map((point) => point.contributingComponents)).toEqual([1, 1, 1]);
    expect(result.history.map((point) => point.components.realizedPricePercentile)).toEqual([100, 100, 200 / 3]);
    expect(result.history.map((point) => point.liteIndex)).toEqual([100, 100, 200 / 3]);
    expect(result.dataDate).toBe("2026-01-03");
  });
  it("uses exact 200-day and 1,400-day moving-average windows after warm-up", () => {
    const history = Array.from({ length: 1_400 }, (_, index) =>
      row(`2020-01-${String((index % 28) + 1).padStart(2, "0")}`, index + 1, (index + 1) * 10, 2, 5),
    ).map((point, index) => ({ ...point, date: new Date(Date.UTC(2020, 0, index + 1)).toISOString().slice(0, 10), unixTs: 1_577_836_800 + index * 86_400 }));

    const latest = calculateIndependentMeanReversionIndex(history).history.at(-1)!;

    expect(latest.dma200).toBe(1_300.5);
    expect(latest.wma200).toBe(700.5);
    expect(latest.contributingComponents).toBe(3);
    expect(latest.liteIndex).toBeGreaterThanOrEqual(0);
    expect(latest.liteIndex).toBeLessThanOrEqual(100);
  });

  it("rejects undersized histories", () => {
    expect(() => calculateIndependentMeanReversionIndex([row("2026-01-01", 10, 100, 2, 10)])).toThrow(/at least two/i);
  });
});

describe("independent BMRI-lite integrity", () => {
  it("rejects a daily history whose latest observation exceeds the declared freshness allowance", () => {
    expect(() =>
      assertIndependentBmriLiteHistoryIntegrity(
        [row("2026-01-01", 10, 100, 2, 10), row("2026-01-02", 20, 200, 2, 10)],
        { now: new Date("2026-01-10T00:00:00.000Z") },
      ),
    ).toThrow(/stale/i);
  });
});

describe("getIndependentMeanReversionIndex", () => {
  it("exports the independent calculator through the data-package entrypoint", () => {
    expect(exportedGetIndependentMeanReversionIndex).toBe(getIndependentMeanReversionIndex);
  });

  it("refuses an insufficient but fresh upstream history rather than emitting a partial primary signal", async () => {
    const rows = [row("2026-01-01", 10, 100, 2, 10), row("2026-01-02", 20, 200, 2, 10)];
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: rows.map((point) => ({
            time: `${point.date}T00:00:00.000000000Z`,
            PriceUSD: String(point.priceUsd),
            CapMrktCurUSD: String(point.marketCapUsd),
            CapMVRVCur: String(point.mvrv),
            SplyCur: String(point.supplyBtc),
            IssTotUSD: String(point.issuanceUsd),
          })),
        }),
        { status: 200 },
      ),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));

    await expect(getIndependentMeanReversionIndex()).rejects.toThrow(/insufficient/i);
  });

  it("fetches the shared validated Coin Metrics history rather than a chart scrape", async () => {
    const endUnixTs = Date.parse("2026-01-02T00:00:00.000Z") / 1000;
    const rows = Array.from({ length: 1_400 }, (_, index) => {
      const unixTs = endUnixTs - (1_399 - index) * 86_400;
      const date = new Date(unixTs * 1000).toISOString().slice(0, 10);
      return { ...row(date, index + 1, (index + 1) * 10, 2, 5), unixTs };
    });
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: rows.map((point) => ({
            time: `${point.date}T00:00:00.000000000Z`,
            PriceUSD: String(point.priceUsd),
            CapMrktCurUSD: String(point.marketCapUsd),
            CapMVRVCur: String(point.mvrv),
            SplyCur: String(point.supplyBtc),
            IssTotUSD: String(point.issuanceUsd),
          })),
        }),
        { status: 200 },
      ),
    );

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-03T00:00:00.000Z"));
    const result = await getIndependentMeanReversionIndex();

    expect(globalThis.fetch).toHaveBeenCalledWith(COIN_METRICS_DAILY_HISTORY_URL, expect.any(Object));
    expect(result.source.sourceQuality).toBe("community-api-derived");
    expect(result.history).toHaveLength(1_400);
  });
});
