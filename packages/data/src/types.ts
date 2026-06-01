import { z } from "zod";

export const CurrencySchema = z.enum(["USD", "EUR", "GBP"]);
export type Currency = z.infer<typeof CurrencySchema>;

export const FeeRangeSchema = z.enum(["24h", "1w", "1m", "1y", "2y"]);
export type FeeRange = z.infer<typeof FeeRangeSchema>;

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

export interface FeeHistoryPoint {
  t: string; // ISO timestamp
  fee: number; // sat/vB
}

export interface FeeHistory {
  range: FeeRange;
  points: FeeHistoryPoint[];
  source: string;
  partial: boolean; // true when data accumulation still in progress
  note?: string;
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
