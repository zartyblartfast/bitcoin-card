import { COIN_METRICS_DAILY_HISTORY_URL, getCoinMetricsDailyHistory } from "./coinMetricsDailyHistory.js";
import type {
  CoinMetricsDailyHistoryRow,
  IndependentBmriLitePoint,
  IndependentMeanReversionIndex,
} from "./types.js";

const MINIMUM_HISTORY_ROWS = 2;
export const INDEPENDENT_BMRI_MINIMUM_HISTORY_ROWS = 1_400;
export const INDEPENDENT_BMRI_MAX_DATA_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_HISTORY_CONTRACTION_FRACTION = 0.05;
const DMA_WINDOW = 200;
const WMA_WINDOW = 1_400;

let lastValidatedHistoryLength: number | undefined;

type ComponentName = "dma200Percentile" | "wma200Percentile" | "realizedPricePercentile";

export type IndependentBmriLiteIntegrityOptions = {
  now?: Date;
  previousHistoryLength?: number;
};

export function assertIndependentBmriLiteHistoryIntegrity(
  rows: CoinMetricsDailyHistoryRow[],
  { now = new Date(), previousHistoryLength }: IndependentBmriLiteIntegrityOptions = {},
): void {
  const latest = rows.at(-1);
  if (!latest) {
    throw new Error("Independent BMRI-lite history is empty");
  }

  const dataAgeMs = now.getTime() - latest.unixTs * 1000;
  if (dataAgeMs > INDEPENDENT_BMRI_MAX_DATA_AGE_MS) {
    throw new Error(`Independent BMRI-lite history is stale: latest data is ${latest.date}`);
  }
  if (rows.length < INDEPENDENT_BMRI_MINIMUM_HISTORY_ROWS) {
    throw new Error(`Independent BMRI-lite history is insufficient: requires ${INDEPENDENT_BMRI_MINIMUM_HISTORY_ROWS} daily rows`);
  }
  if (previousHistoryLength !== undefined && rows.length < previousHistoryLength * (1 - MAX_HISTORY_CONTRACTION_FRACTION)) {
    throw new Error("Independent BMRI-lite history contracted materially since the last validated refresh");
  }
}

function movingAverage(values: number[], window: number): Array<number | null> {
  const averages: Array<number | null> = Array(values.length).fill(null);
  let sum = 0;
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]!;
    if (index >= window) sum -= values[index - window]!;
    if (index >= window - 1) averages[index] = sum / window;
  }
  return averages;
}

function insertSorted(values: number[], value: number): void {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  values.splice(low, 0, value);
}

function percentileIncludingCurrent(sortedValues: number[], value: number): number {
  insertSorted(sortedValues, value);
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedValues[middle]! <= value) low = middle + 1;
    else high = middle;
  }
  return (100 * low) / sortedValues.length;
}

function assertRows(rows: CoinMetricsDailyHistoryRow[]): void {
  if (rows.length < MINIMUM_HISTORY_ROWS) {
    throw new Error("Independent BMRI-lite requires at least two daily observations");
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const realizedPrice = row.marketCapUsd / row.mvrv / row.supplyBtc;
    if (!Number.isFinite(realizedPrice) || realizedPrice <= 0) {
      throw new Error(`Independent BMRI-lite derived an invalid realized price on ${row.date}`);
    }
    if (index > 0 && rows[index - 1]!.unixTs >= row.unixTs) {
      throw new Error("Independent BMRI-lite requires unique ascending daily observations");
    }
  }
}

export function calculateIndependentMeanReversionIndex(
  rows: CoinMetricsDailyHistoryRow[],
  fetchedAt = new Date().toISOString(),
): IndependentMeanReversionIndex {
  assertRows(rows);

  const prices = rows.map((row) => row.priceUsd);
  const dma200 = movingAverage(prices, DMA_WINDOW);
  const wma200 = movingAverage(prices, WMA_WINDOW);
  const percentileHistories: Record<ComponentName, number[]> = {
    dma200Percentile: [],
    wma200Percentile: [],
    realizedPricePercentile: [],
  };

  const history: IndependentBmriLitePoint[] = rows.map((row, index) => {
    const realizedPrice = row.marketCapUsd / row.mvrv / row.supplyBtc;
    const anchors: Array<[ComponentName, number | null]> = [
      ["dma200Percentile", dma200[index] ?? null],
      ["wma200Percentile", wma200[index] ?? null],
      ["realizedPricePercentile", realizedPrice],
    ];
    const components: IndependentBmriLitePoint["components"] = {
      dma200Percentile: null,
      wma200Percentile: null,
      realizedPricePercentile: null,
    };
    const available: number[] = [];

    for (const [name, anchor] of anchors) {
      if (anchor === null) continue;
      const ratio = row.priceUsd / anchor;
      const percentile = percentileIncludingCurrent(percentileHistories[name], ratio);
      components[name] = percentile;
      available.push(percentile);
    }

    return {
      date: row.date,
      price: row.priceUsd,
      realizedPrice,
      dma200: dma200[index] ?? null,
      wma200: wma200[index] ?? null,
      components,
      liteIndex: available.reduce((sum, value) => sum + value, 0) / available.length,
      contributingComponents: available.length,
    };
  });

  const first = history[0]!;
  const latest = history[history.length - 1]!;
  return {
    source: {
      name: "Coin Metrics Community API",
      url: COIN_METRICS_DAILY_HISTORY_URL,
      sourceQuality: "community-api-derived",
    },
    methodology:
      "Independent BMRI-lite: average of point-in-time expanding percentile ranks for BTC price divided by its locally calculated 200-day moving average, 1,400-day moving average, and Coin Metrics-derived realized price.",
    limitations:
      "This transparent free-source indicator is not the exact Checkonchain Full BMRI and excludes its additional proprietary or unavailable anchors.",
    dataDate: latest.date,
    historyStartDate: first.date,
    historyLength: history.length,
    fetchedAt,
    history,
  };
}

export async function getIndependentMeanReversionIndex(): Promise<IndependentMeanReversionIndex> {
  const rows = await getCoinMetricsDailyHistory();
  assertIndependentBmriLiteHistoryIntegrity(
    rows,
    lastValidatedHistoryLength === undefined ? {} : { previousHistoryLength: lastValidatedHistoryLength },
  );
  const result = calculateIndependentMeanReversionIndex(rows);
  lastValidatedHistoryLength = rows.length;
  return result;
}

export function _resetIndependentBmriLiteIntegrityForTests(): void {
  lastValidatedHistoryLength = undefined;
}
