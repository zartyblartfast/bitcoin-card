import type { CoinMetricsDailyHistoryRow } from "./types.js";

export const COIN_METRICS_DAILY_HISTORY_URL =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMrktCurUSD,CapMVRVCur,PriceUSD,SplyCur,IssTotUSD,FeeTotNtv&frequency=1d&page_size=10000";

const REQUEST_TIMEOUT_MS = 10_000;
const MINIMUM_HISTORY_ROWS = 2;

type CoinMetricsDailyHistoryResponse = {
  data?: unknown;
};

type CoinMetricsDailyHistoryPayloadRow = {
  time?: unknown;
  CapMrktCurUSD?: unknown;
  CapMVRVCur?: unknown;
  PriceUSD?: unknown;
  SplyCur?: unknown;
  IssTotUSD?: unknown;
  FeeTotNtv?: unknown;
};

function parseRequiredPositiveNumber(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Coin Metrics BTC daily history missing ${field}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Coin Metrics BTC daily history contains invalid ${field}`);
  }
  if (parsed <= 0) {
    throw new Error(`Coin Metrics BTC daily history ${field} must be positive`);
  }
  return parsed;
}

function parseOptionalNonNegativeNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Coin Metrics BTC daily history missing ${field}`);
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Coin Metrics BTC daily history contains invalid ${field}`);
  }
  if (parsed < 0) {
    throw new Error(`Coin Metrics BTC daily history ${field} must be non-negative`);
  }
  return parsed;
}

function parseDate(value: unknown): Pick<CoinMetricsDailyHistoryRow, "date" | "unixTs"> {
  if (typeof value !== "string") {
    throw new Error("Coin Metrics BTC daily history missing time");
  }

  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Coin Metrics BTC daily history contains invalid time");
  }

  const unixTs = Date.parse(value) / 1000;
  if (!Number.isFinite(unixTs) || new Date(unixTs * 1000).toISOString().slice(0, 10) !== date) {
    throw new Error("Coin Metrics BTC daily history contains invalid time");
  }

  return { date, unixTs };
}

function parseRow(payloadRow: CoinMetricsDailyHistoryPayloadRow): CoinMetricsDailyHistoryRow {
  const { date, unixTs } = parseDate(payloadRow.time);
  const feeTotalBtc = parseOptionalNonNegativeNumber(payloadRow.FeeTotNtv, "FeeTotNtv");
  const row = {
    date,
    unixTs,
    priceUsd: parseRequiredPositiveNumber(payloadRow.PriceUSD, "PriceUSD"),
    marketCapUsd: parseRequiredPositiveNumber(payloadRow.CapMrktCurUSD, "CapMrktCurUSD"),
    mvrv: parseRequiredPositiveNumber(payloadRow.CapMVRVCur, "CapMVRVCur"),
    supplyBtc: parseRequiredPositiveNumber(payloadRow.SplyCur, "SplyCur"),
    issuanceUsd: parseRequiredPositiveNumber(payloadRow.IssTotUSD, "IssTotUSD"),
  };
  return feeTotalBtc === undefined ? row : { ...row, feeTotalBtc };
}

function hasRequiredMarketMetrics(payloadRow: CoinMetricsDailyHistoryPayloadRow): boolean {
  const positiveFinite = (value: unknown): boolean => {
    if (typeof value !== "string" && typeof value !== "number") return false;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
  };
  return positiveFinite(payloadRow.PriceUSD)
    && positiveFinite(payloadRow.CapMrktCurUSD)
    && positiveFinite(payloadRow.CapMVRVCur)
    && positiveFinite(payloadRow.SplyCur)
    && positiveFinite(payloadRow.IssTotUSD);
}

export function parseCoinMetricsDailyHistory(payload: CoinMetricsDailyHistoryResponse): CoinMetricsDailyHistoryRow[] {
  if (!Array.isArray(payload.data)) {
    throw new Error("Coin Metrics BTC daily history response missing data array");
  }

  // Coin Metrics includes pre-market and partial-market chain history before
  // every required market metric exists. Exclude only that leading prefix;
  // every row from the first complete market observation remains strictly validated.
  const firstMarketObservation = payload.data.findIndex((value) => hasRequiredMarketMetrics(value as CoinMetricsDailyHistoryPayloadRow));
  // With no complete market observation, parse the supplied rows so callers get
  // the precise structural error instead of an ambiguous undersized-history error.
  const marketRows = firstMarketObservation < 0 ? payload.data : payload.data.slice(firstMarketObservation);
  const rows = marketRows.map((value) => parseRow(value as CoinMetricsDailyHistoryPayloadRow)).sort((a, b) => a.unixTs - b.unixTs);
  if (rows.length < MINIMUM_HISTORY_ROWS) {
    throw new Error("Coin Metrics BTC daily history response has too few usable rows");
  }

  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index - 1]!.date === rows[index]!.date) {
      throw new Error(`Coin Metrics BTC daily history contains duplicate date ${rows[index]!.date}`);
    }
  }

  return rows;
}

export async function getCoinMetricsDailyHistory(): Promise<CoinMetricsDailyHistoryRow[]> {
  const response = await fetch(COIN_METRICS_DAILY_HISTORY_URL, {
    headers: { "user-agent": "bitcoin-card-data/0.1" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${COIN_METRICS_DAILY_HISTORY_URL}`);
  }

  return parseCoinMetricsDailyHistory((await response.json()) as CoinMetricsDailyHistoryResponse);
}
