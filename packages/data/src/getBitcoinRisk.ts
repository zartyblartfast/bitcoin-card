import { COIN_METRICS_DAILY_HISTORY_URL, getCoinMetricsDailyHistory, parseCoinMetricsDailyHistory } from "./coinMetricsDailyHistory.js";
import type {
  BitcoinRisk,
  BitcoinRiskBand,
  BitcoinRiskComponents,
  BitcoinRiskHistoryPoint,
  BitcoinSentiment,
  CoinMetricsDailyHistoryRow,
} from "./types.js";

export const COIN_METRICS_MVRV_HISTORY_URL = COIN_METRICS_DAILY_HISTORY_URL;

export const ALTERNATIVE_ME_FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=1&format=json";

type AlternativeMeFearGreedResponse = {
  data?: unknown;
};

type AlternativeMeFearGreedRow = {
  value?: unknown;
  value_classification?: unknown;
  timestamp?: unknown;
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

function componentScoreFromRatio(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) throw new Error("Bitcoin risk component value must be finite");
  const normalized = (value - low) / (high - low);
  return Math.max(0, Math.min(100, Math.round(normalized * 100)));
}

function riskBandFromCompositeScore(riskScore: number): BitcoinRiskBand {
  if (!Number.isFinite(riskScore)) throw new Error("riskScore must be finite");
  if (riskScore <= 15) return "deep_value";
  if (riskScore <= 30) return "value";
  if (riskScore <= 55) return "neutral";
  if (riskScore <= 70) return "elevated";
  if (riskScore <= 85) return "high";
  return "extreme";
}

function average(values: number[]): number {
  if (values.length === 0) throw new Error("Cannot average empty Bitcoin risk component window");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function trailingAverage(
  rows: CoinMetricsDailyHistoryRow[],
  index: number,
  field: "priceUsd" | "issuanceUsd",
  period: number,
): number {
  const start = Math.max(0, index - period + 1);
  return average(rows.slice(start, index + 1).map((row) => row[field]));
}

function buildRiskComponents(
  row: CoinMetricsDailyHistoryRow,
  rows: CoinMetricsDailyHistoryRow[],
  index: number,
  mvrvZScore: number,
): BitcoinRiskComponents {
  const issuanceAverage365d = trailingAverage(rows, index, "issuanceUsd", 365);
  const puell = row.issuanceUsd / issuanceAverage365d;
  const priceAverage200d = trailingAverage(rows, index, "priceUsd", 200);
  const mayer = row.priceUsd / priceAverage200d;
  const priceAverage200w = trailingAverage(rows, index, "priceUsd", 1400);
  const ma200wDistance = row.priceUsd / priceAverage200w;

  return {
    mvrvZDerived: {
      value: mvrvZScore,
      score: riskScoreFromMvrvZScore(mvrvZScore),
      sourceMetric: "CapMrktCurUSD,CapMVRVCur",
      methodology: "MVRV Z-Score proxy derived from market cap and MVRV-implied realized cap.",
    },
    puellIssuance: {
      value: puell,
      score: componentScoreFromRatio(puell, 0.3, 4.0),
      sourceMetric: "IssTotUSD",
      methodology: "Puell-style issuance multiple: daily BTC issuance USD divided by its trailing 365-day average. Short histories use the available trailing window.",
    },
    mayerMultiple: {
      value: mayer,
      score: componentScoreFromRatio(mayer, 0.6, 2.4),
      sourceMetric: "PriceUSD",
      methodology: "Mayer Multiple: BTC price divided by its trailing 200-day moving average. Short histories use the available trailing window.",
    },
    ma200wDistance: {
      value: ma200wDistance,
      score: componentScoreFromRatio(ma200wDistance, 0.6, 2.4),
      sourceMetric: "PriceUSD",
      methodology: "200-week moving-average distance: BTC price divided by its trailing 1400-day average. Short histories use the available trailing window.",
    },
  };
}

function compositeScoreFromComponents(components: BitcoinRiskComponents): number {
  return Math.round(
    average([
      components.mvrvZDerived.score,
      components.puellIssuance.score,
      components.mayerMultiple.score,
      components.ma200wDistance.score,
    ]),
  );
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

export function parseCoinMetricsMvrvHistory(payload: { data?: unknown }, fetchedAt = new Date().toISOString()): BitcoinRisk {
  return buildBitcoinRisk(parseCoinMetricsDailyHistory(payload), fetchedAt);
}

function buildBitcoinRisk(rows: CoinMetricsDailyHistoryRow[], fetchedAt: string): BitcoinRisk {
  const latest = rows[rows.length - 1]!;
  const marketCapStdDev = populationStandardDeviation(rows.map((row) => row.marketCapUsd));
  const history: BitcoinRiskHistoryPoint[] = rows.map((row, index) => {
    const mvrvZScore = assertFiniteNumber(
      (row.marketCapUsd - row.marketCapUsd / row.mvrv) / marketCapStdDev,
      "derived historical MVRV Z-Score",
    );
    const components = buildRiskComponents(row, rows, index, mvrvZScore);
    const riskScore = compositeScoreFromComponents(components);
    return {
      date: row.date,
      unixTs: row.unixTs,
      mvrv: row.mvrv,
      mvrvZScore,
      components,
      riskScore,
      band: riskBandFromCompositeScore(riskScore),
    };
  });
  const latestHistory = history[history.length - 1]!;
  const mvrvZScore = latestHistory.mvrvZScore;

  return {
    metric: "bitcoin-risk-composite",
    mvrvZScore,
    mvrv: latest.mvrv,
    components: latestHistory.components,
    riskScore: latestHistory.riskScore,
    band: latestHistory.band,
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
      "Native bitcoin-card Bitcoin Risk composite. Components are MVRV Z-Score derived from Coin Metrics CapMrktCurUSD and CapMVRVCur, Puell-style issuance multiple from IssTotUSD, Mayer Multiple from PriceUSD, and 200-week moving-average distance from PriceUSD. Component scores are normalized to 0-100 and averaged. Alternative.me Fear & Greed and other third-party composites are returned only as separate context when available, not hidden inside the native score.",
    limitations:
      "This is an open, reproducible free-source Bitcoin risk composite derived from Coin Metrics Community API data under its community license. It is not Cowen Risk, not Glassnode-equivalent, not entity-adjusted, and not an automated trading signal. Reserve Risk and Terminal Price are intentionally excluded until a clean CDD source or self-computed pipeline exists.",
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

  const value = buildBitcoinRisk(await getCoinMetricsDailyHistory(), new Date().toISOString());
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
