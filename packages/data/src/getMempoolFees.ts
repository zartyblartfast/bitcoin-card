import { fetchRecommendedFees } from "./sources/mempool.js";
import type { MempoolFees } from "./types.js";

/**
 * Get current recommended mempool transaction fees (sat/vB) at four
 * confirmation targets. Backed by mempool.space.
 */
export async function getMempoolFees(): Promise<MempoolFees> {
  const result = await fetchRecommendedFees();
  return { ...result.value, sources: [result], fetchedAt: result.fetchedAt };
}
