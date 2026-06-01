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
  currentHashrate: z.number(), // H/s
  currentDifficulty: z.number(),
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

/**
 * Fetch the current mining stats (hashrate + difficulty) from mempool.space.
 * The /v1/mining/hashrate/3d endpoint conveniently returns both values
 * at the top level, so we use it for both fetchers below.
 */
async function fetchMiningStats(): Promise<z.infer<typeof HashrateSchema>> {
  const url = `${BASE}/v1/mining/hashrate/3d`;
  return HashrateSchema.parse(await getJson<unknown>(url));
}

export async function fetchHashrate(): Promise<SourceResult<number>> {
  const stats = await fetchMiningStats();
  return {
    source: "mempool",
    value: stats.currentHashrate / 1e18, // convert H/s to EH/s
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchDifficulty(): Promise<SourceResult<bigint>> {
  const stats = await fetchMiningStats();
  return {
    source: "mempool",
    value: BigInt(Math.round(stats.currentDifficulty)),
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchRecentBlocks(count: number): Promise<SourceResult<MempoolBlock[]>> {
  const url = `${BASE}/v1/blocks/tip/${count}`;
  const value = z.array(BlockSchema).parse(await getJson<unknown>(url));
  return { source: "mempool", value, fetchedAt: new Date().toISOString() };
}
