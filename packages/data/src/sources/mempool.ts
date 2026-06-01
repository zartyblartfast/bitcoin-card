import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { SourceResult } from "../types.js";

const BASE = "https://mempool.space/api";

const BlockHeightSchema = z.number().int().positive();
const FeesSchema = z.object({
  fastestFee: z.number(),
  halfHourFee: z.number(),
  hourFee: z.number(),
  minimumFee: z.number(),
});
const HashrateSchema = z.object({
  hashrate: z.number(), // H/s
});
const DifficultySchema = z.object({
  difficulty: z.number(), // expected as number, then converted to bigint
});
const BlockSchema = z.object({
  id: z.string(),
  height: z.number().int().positive(),
  timestamp: z.number().int().positive(),
  medianFee: z.number().optional(),
  feeRange: z.tuple([z.number(), z.number()]).optional(),
});

export type MempoolBlock = z.infer<typeof BlockSchema>;

/**
 * Raw fees shape returned by the mempool.space `/v1/fees/recommended` endpoint.
 * Note: differs from the aggregate `MempoolFees` in types.ts (which carries
 * `sources` and `fetchedAt` for cross-source aggregation). The aggregation
 * layer (Task 1.8+) will lift a `SourceResult<RawFees>[]` into `MempoolFees`.
 */
export interface RawMempoolFees {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  minimumFee: number;
}

export async function fetchBlockHeight(): Promise<SourceResult<number>> {
  const url = `${BASE}/blocks/tip/height`;
  const value = BlockHeightSchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value, fetchedAt: new Date().toISOString() };
}

export async function fetchRecommendedFees(): Promise<SourceResult<RawMempoolFees>> {
  const url = `${BASE}/v1/fees/recommended`;
  const fees = FeesSchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value: fees, fetchedAt: new Date().toISOString() };
}

export async function fetchHashrate(): Promise<SourceResult<number>> {
  const url = `${BASE}/v1/mining/hashrate/3d`;
  const { hashrate } = HashrateSchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value: hashrate / 1e18, fetchedAt: new Date().toISOString() };
}

export async function fetchDifficulty(): Promise<SourceResult<bigint>> {
  const url = `${BASE}/v1/difficulty/`;
  const { difficulty } = DifficultySchema.parse(await getJson<unknown>(url));
  return { source: "mempool", value: BigInt(Math.round(difficulty)), fetchedAt: new Date().toISOString() };
}

export async function fetchRecentBlocks(count: number): Promise<SourceResult<MempoolBlock[]>> {
  const url = `${BASE}/v1/blocks/tip/${count}`;
  const value = z.array(BlockSchema).parse(await getJson<unknown>(url));
  return { source: "mempool", value, fetchedAt: new Date().toISOString() };
}
