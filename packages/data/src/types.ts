import { z } from "zod";

export const CurrencySchema = z.enum(["USD", "EUR", "GBP"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const FeeRangeSchema = z.enum(["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y"]);
export type FeeRange = z.infer<typeof FeeRangeSchema>;
export type DcaCadence = "daily" | "weekly" | "monthly";

export interface SourceResult<T> {
  source: string;
  value: T;
  fetchedAt: string; // ISO timestamp
}

export interface PriceData {
  price: number;
  currency: Currency;
  sources: SourceResult<number>[];
  agreement: "verified" | "disputed" | "single-source";
  fetchedAt: string;
}

export interface BlockHeightData {
  height: number;
  sources: SourceResult<number>[];
  agreement: "verified" | "disputed" | "single-source";
  fetchedAt: string;
}

export type MempoolFeesValue = {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  minimumFee: number;
};

export interface MempoolFees extends MempoolFeesValue {
  sources: SourceResult<MempoolFeesValue>[];
  fetchedAt: string;
}

export interface FeeHistoryBandPoint {
  t: string; // ISO timestamp
  minFee: number;
  p10Fee: number;
  p25Fee: number;
  medianFee: number;
  p75Fee: number;
  p90Fee: number;
  maxFee: number;
}

export interface FeeHistory {
  range: FeeRange;
  points: FeeHistoryBandPoint[];
  source: string;
  sourceQuality: string;
  partial: boolean; // true when data accumulation still in progress
  note?: string;
  fetchedAt: string;
}

export type FeeRegime = "quiet" | "normal" | "elevated" | "congested" | "extreme";

export interface FeeProfileRequest {
  cadence: DcaCadence;
  buyAmountUsd: number;
  targetVbytes?: number;
}

export interface FeeProfile {
  cadence: DcaCadence;
  buyAmountUsd: number;
  targetVbytes: number;
  recommendedSatVb: number;
  estimatedFeeUsd: number;
  estimatedFeePctOfBuy: number;
  confidence: number;
  regime: FeeRegime;
  reason: string;
  currentFees: MempoolFeesValue;
  historySummary: {
    range: FeeRange;
    p10Fee: number;
    medianFee: number;
    p90Fee: number;
    partial: boolean;
  };
  source: string;
  sourceQuality: string;
  limitations: string;
  fetchedAt: string;
}

export interface NetworkSummary {
  price: PriceData;
  blockHeight: BlockHeightData;
  hashrate: number; // EH/s
  difficulty: bigint;
  unminedBtc: number;
  nextHalvingEta: string; // ISO timestamp
  fetchedAt: string;
}

export interface UnminedSupply {
  unmined: number;
  totalCap: number; // 21_000_000
  currentSupply: number;
  formula: string; // human-readable derivation
}

export type MeanReversionSourceQuality = "public-chart-scrape" | "lite-fallback";

export interface MeanReversionHistoryPoint {
  date: string;
  price: number;
  fullIndex: number;
  liteIndex: number;
  difference: number;
}

export interface MeanReversionAnchorValue {
  name: string;
  value: number | null;
}

export interface MeanReversionLatest extends MeanReversionHistoryPoint {
  liteComponents: Record<string, number | null>;
  fullAnchors: MeanReversionAnchorValue[];
  fastIndex?: number | null;
  slowIndex?: number | null;
  floorIndex?: number | null;
  ceilingIndex?: number | null;
  indexSpread?: number | null;
}

export interface MeanReversionIndex {
  source: {
    full: string;
    url: string;
    note: string;
    sourceQuality: MeanReversionSourceQuality;
  };
  methodology: {
    lite: string;
    liteAnchors: string[];
    fullAnchors: string[];
  };
  latest: MeanReversionLatest;
  stats: {
    recentDays: number;
    recentMeanAbsoluteError: number | null;
    allDays: number;
    allMeanAbsoluteError: number | null;
  };
  history: MeanReversionHistoryPoint[];
  fetchedAt: string;
}

export type DcaMeanReversionZone =
  | "deep_value"
  | "value"
  | "neutral"
  | "warm"
  | "expensive"
  | "overheated";

export type BitcoinRiskBand =
  | "deep_value"
  | "value"
  | "neutral"
  | "elevated"
  | "high"
  | "extreme";

export type BitcoinRiskSourceQuality = "community-api-derived";
export type BitcoinSentimentSourceQuality = "free-api-attribution-required";

export interface CoinMetricsDailyHistoryRow {
  date: string;
  unixTs: number;
  priceUsd: number;
  marketCapUsd: number;
  mvrv: number;
  supplyBtc: number;
  issuanceUsd: number;
  feeTotalBtc?: number;
}

export interface IndependentBmriLitePoint {
  date: string;
  price: number;
  realizedPrice: number;
  dma200: number | null;
  wma200: number | null;
  components: {
    dma200Percentile: number | null;
    wma200Percentile: number | null;
    realizedPricePercentile: number | null;
  };
  liteIndex: number;
  contributingComponents: number;
}

export interface IndependentMeanReversionIndex {
  source: {
    name: "Coin Metrics Community API";
    url: string;
    sourceQuality: "community-api-derived";
  };
  methodology: string;
  limitations: string;
  dataDate: string;
  historyStartDate: string;
  historyLength: number;
  fetchedAt: string;
  history: IndependentBmriLitePoint[];
}

export interface BitcoinRiskComponent {
  value: number;
  score: number;
  sourceMetric: string;
  methodology: string;
}

export interface BitcoinRiskComponents {
  mvrvZDerived: BitcoinRiskComponent;
  puellIssuance: BitcoinRiskComponent;
  mayerMultiple: BitcoinRiskComponent;
  ma200wDistance: BitcoinRiskComponent;
}

export interface BitcoinSentiment {
  metric: "crypto-fear-and-greed";
  value: number;
  classification: string;
  dataDate: string;
  unixTs: number;
  source: {
    name: string;
    url: string;
    sourceQuality: BitcoinSentimentSourceQuality;
  };
  methodology: string;
  limitations: string;
}

export interface BitcoinRiskHistoryPoint {
  date: string;
  unixTs: number;
  mvrv: number;
  mvrvZScore: number;
  components: BitcoinRiskComponents;
  riskScore: number;
  band: BitcoinRiskBand;
}

export interface BitcoinRisk {
  metric: "bitcoin-risk-composite";
  mvrvZScore: number;
  mvrv: number;
  components: BitcoinRiskComponents;
  riskScore: number;
  band: BitcoinRiskBand;
  dataDate: string;
  unixTs: number;
  source: {
    name: string;
    url: string;
    sourceQuality: BitcoinRiskSourceQuality;
  };
  history: BitcoinRiskHistoryPoint[];
  sentiment?: BitcoinSentiment;
  sentimentStatus: "available" | "unavailable";
  methodology: string;
  limitations: string;
  fetchedAt: string;
}

export interface DcaMetrics {
  price: {
    value: number;
    currency: Currency;
    agreement: PriceData["agreement"];
    sources: SourceResult<number>[];
  };
  fees: {
    fastestFee: number;
    halfHourFee: number;
    hourFee: number;
    minimumFee: number;
  };
  network: {
    blockHeight: number;
    blockHeightAgreement: BlockHeightData["agreement"];
    hashrateEhS: number;
    difficulty: string;
    unminedBtc: number;
    nextHalvingEta: string;
  };
  meanReversion: {
    fullIndex: number;
    liteIndex: number;
    difference: number;
    zone: DcaMeanReversionZone;
    sourceQuality: MeanReversionSourceQuality;
    caveat: string;
    dataDate: string;
  };
  bitcoinRisk: {
    mvrvZScore: number;
    riskScore: number;
    band: BitcoinRiskBand;
    sourceQuality: BitcoinRiskSourceQuality;
    caveat: string;
    dataDate: string;
    sentiment?: {
      value: number;
      classification: string;
      sourceQuality: BitcoinSentimentSourceQuality;
      caveat: string;
      dataDate: string;
    };
  };
  raw: {
    networkSummary: NetworkSummary;
    mempoolFees: MempoolFees;
    meanReversion: Omit<MeanReversionIndex, "history">;
    bitcoinRisk: BitcoinRisk;
  };
  fetchedAt: string;
}
