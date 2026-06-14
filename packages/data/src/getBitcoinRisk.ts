import type { BitcoinRisk, BitcoinRiskBand, BitcoinRiskHistoryPoint, BitcoinSentiment } from "./types.js";

export const COIN_METRICS_MVRV_HISTORY_URL =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMrktCurUSD,CapMVRVCur&frequency=1d&page_size=10000";

export const ALTERNATIVE_ME_FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1&format=json";

type CoinMetricsMvrvHistoryResponse = {
  data?: unknown;
};

type CoinMetricsMvrvHistoryRow = {
  asset?: unknown;
  time?: unknown;
  CapMrktCurUSD?: unknown;
  CapMVRVCur?: unknown;
};

type AlternativeMeFearGreedResponse = {
  data?: unknown;
};

type AlternativeMeFearGreedRow = {
  value?: unknown;
  value_classification?: unknown;
  timestamp?: unknown;
};

type ParsedMvrvHistoryRow = {
  date: string;
  unixTs: number;
  marketCapUsd: number;
  mvrv: number;
  realizedCapUsd: number;
};

type CachedBitcoinRisk = {
  utcDay: string;
  value: BitcoinRisk;
};

let bitcoinRiskCache: CachedBitcoinRisk | null = null;

function currentUtcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertFiniteNumber(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Coin Metrics BTC MVRV history contains invalid ${field}`);
  }
  return value;
}

function parseNumericString(value: unknown, field: string): number {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Coin Metrics BTC MVRV history missing ${field}`);
  }
  const parsed = Number(value);
  return assertFiniteNumber(parsed, field);
}

function parseCoinMetricsDate(value: unknown): { date: string; unixTs: number } {
  if (typeof value !== "string") {
    throw new Error("Coin Metrics BTC MVRV history missing time");
  }

  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Coin Metrics BTC MVRV history contains invalid time");
  }

  const unixTs = Date.parse(value) / 1000;
  if (!Number.isFinite(unixTs)) {
    throw new Error("Coin Metrics BTC MVRV history contains unparsable time");
  }

  return { date, unixTs };
}

function parseHistoryRow(row: CoinMetricsMvrvHistoryRow): ParsedMvrvHistoryRow {
  const { date, unixTs } = parseCoinMetricsDate(row.time);
  const marketCapUsd = parseNumericString(row.CapMrktCurUSD, "CapMrktCurUSD");
  const mvrv = parseNumericString(row.CapMVRVCur, "CapMVRVCur");
  if (marketCapUsd <= 0) throw new Error("Coin Metrics BTC market cap must be positive");
  if (mvrv <= 0) throw new Error("Coin Metrics BTC MVRV must be positive");

  return {
    date,
    unixTs,
    marketCapUsd,
    mvrv,
    realizedCapUsd: marketCapUsd / mvrv,
  };
}

function populationStandardDeviation(values: number[]): number {
  if (values.length < 2) {
    throw new Error("At least two market cap observations are required to derive MVRV Z-Score");
  }

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function assertFearGreedString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Alternative.me Fear & Greed response missing ${field}`);
  }
  return value;
}

function parseUnixSeconds(value: unknown, field: string): number {
  const parsed = typeof value === "string" || typeof value === "number" ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(`Alternative.me Fear & Greed response missing numeric ${field}`);
  }
  return parsed;
}

function dateFromUnixSeconds(unixTs: number): string {
  return new Date(unixTs * 1000).toISOString().slice(0, 10);
}

export function riskScoreFromMvrvZScore(mvrvZScore: number): number {
  if (!Number.isFinite(mvrvZScore)) throw new Error("mvrvZScore must be finite");
  const normalized = (mvrvZScore + 0.5) / 7.5;
  return Math.max(0, Math.min(100, Math.round(normalized * 100)));
}

export function riskBandFromMvrvZScore(mvrvZScore: number): BitcoinRiskBand {
  if (!Number.isFinite(mvrvZScore)) throw new Error("mvrvZScore must be finite");
  if (mvrvZScore <= 0.5) return "deep_value";
  if (mvrvZScore <= 1.5) return "value";
  if (mvrvZScore <= 3) return "neutral";
  if (mvrvZScore <= 5) return "elevated";
  if (mvrvZScore <= 7) return "high";
  return "extreme";
}

export function parseAlternativeMeFearGreed(payload: AlternativeMeFearGreedResponse): BitcoinSentiment {
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("Alternative.me Fear & Greed response missing data array");
  }

  const row = payload.data[0] as AlternativeMeFearGreedRow;
  const value = parseUnixSeconds(row.value, "value");
  if (value < 0 || value > 100) {
    throw new Error("Alternative.me Fear & Greed value must be between 0 and 100");
  }

  const classification = assertFearGreedString(row.value_classification, "value_classification");
  const unixTs = parseUnixSeconds(row.timestamp, "timestamp");

  return {
    metric: "crypto-fear-and-greed",
    value,
    classification,
    dataDate: dateFromUnixSeconds(unixTs),
    unixTs,
    source: {
      name: "Alternative.me",
      url: ALTERNATIVE_ME_FEAR_GREED_URL,
      sourceQuality: "free-api-attribution-required",
    },
    methodology:
      "Alternative.me Crypto Fear & Greed Index is a separate market-sentiment gauge. It is returned alongside valuation risk for context, but it is not blended into the MVRV Z-Score risk score.",
    limitations:
      "Sentiment score is partly behavioral and black-box. Alternative.me permits commercial use with attribution shown next to the data; treat it as market mood, not valuation risk or a trading signal.",
  };
}

export function parseCoinMetricsMvrvHistory(
  payload: CoinMetricsMvrvHistoryResponse,
  fetchedAt = new Date().toISOString(),
): BitcoinRisk {
  if (!Array.isArray(payload.data)) {
    throw new Error("Coin Metrics BTC MVRV history response missing data array");
  }

  const rows = payload.data
    .map((row) => parseHistoryRow(row as CoinMetricsMvrvHistoryRow))
    .sort((a, b) => a.unixTs - b.unixTs);

  if (rows.length < 2) {
    throw new Error("Coin Metrics BTC MVRV history response has too few usable rows");
  }

  const latest = rows[rows.length - 1]!;
  const marketCapStdDev = populationStandardDeviation(rows.map(row => row.marketCapUsd));
  const history: BitcoinRiskHistoryPoint[] = rows.map((row) => {
    const mvrvZScore = assertFiniteNumber(
      (row.marketCapUsd - row.realizedCapUsd) / marketCapStdDev,
      "derived historical MVRV Z-Score",
    );
    return {
      date: row.date,
      unixTs: row.unixTs,
      mvrv: row.mvrv,
      mvrvZScore,
      riskScore: riskScoreFromMvrvZScore(mvrvZScore),
      band: riskBandFromMvrvZScore(mvrvZScore),
    };
  });
  const latestHistory = history[history.length - 1]!;
  const mvrvZScore = latestHistory.mvrvZScore;

  return {
    metric: "mvrv-zscore",
    mvrvZScore,
    mvrv: latest.mvrv,
    riskScore: riskScoreFromMvrvZScore(mvrvZScore),
    band: riskBandFromMvrvZScore(mvrvZScore),
    dataDate: latest.date,
    unixTs: latest.unixTs,
    source: {
      name: "Coin Metrics Community API",
      url: COIN_METRICS_MVRV_HISTORY_URL,
      sourceQuality: "community-api-derived",
    },
    history,
    sentimentStatus: "unavailable",
    methodology:
      "MVRV Z-Score derived from Coin Metrics Community BTC CapMrktCurUSD and CapMVRVCur daily history. Realized cap is inferred as market cap / MVRV, then MVRV Z-Score is computed as (market cap - realized cap) / population standard deviation of historical market cap. The local 0-100 score linearly maps MVRV Z-Score from -0.5 (0 risk) to 7.0 (100 risk) and clamps outside that range.",
    limitations:
      "This is an open, reproducible MVRV Z-Score valuation-risk proxy derived from Coin Metrics Community API data under its community license; it is not a proprietary composite risk index or an automated trading signal.",
    fetchedAt,
  };
}

async function getBitcoinSentiment(): Promise<BitcoinSentiment | undefined> {
  try {
    const response = await fetch(ALTERNATIVE_ME_FEAR_GREED_URL, {
      headers: { "user-agent": "bitcoin-card-data/0.1" },
    });
    if (!response.ok) return undefined;
    const payload = (await response.json()) as AlternativeMeFearGreedResponse;
    return parseAlternativeMeFearGreed(payload);
  } catch {
    return undefined;
  }
}

export async function getBitcoinRisk(): Promise<BitcoinRisk> {
  const utcDay = currentUtcDay();
  if (bitcoinRiskCache?.utcDay === utcDay) return bitcoinRiskCache.value;

  const response = await fetch(COIN_METRICS_MVRV_HISTORY_URL, {
    headers: { "user-agent": "bitcoin-card-data/0.1" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${COIN_METRICS_MVRV_HISTORY_URL}`);
  }

  const payload = (await response.json()) as CoinMetricsMvrvHistoryResponse;
  const value = parseCoinMetricsMvrvHistory(payload);
  const sentiment = await getBitcoinSentiment();
  const valueWithSentiment: BitcoinRisk = sentiment
    ? { ...value, sentiment, sentimentStatus: "available" }
    : { ...value, sentimentStatus: "unavailable" };
  bitcoinRiskCache = { utcDay, value: valueWithSentiment };
  return valueWithSentiment;
}

export function _resetBitcoinRiskCacheForTests(): void {
  bitcoinRiskCache = null;
}
