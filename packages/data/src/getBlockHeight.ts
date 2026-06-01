import { fetchBlockHeight as fetchMempool } from "./sources/mempool.js";
import { fetchBlockHeight as fetchBlockstream } from "./sources/blockstream.js";
import type { BlockHeightData, SourceResult } from "./types.js";

/**
 * Get the current Bitcoin block height, verified across mempool.space
 * and Blockstream. Returns single-source if only one source succeeded.
 */
export async function getBlockHeight(): Promise<BlockHeightData> {
  const results = await Promise.allSettled<SourceResult<number>>([
    fetchMempool(),
    fetchBlockstream(),
  ]);

  const sources = results
    .filter((r): r is PromiseFulfilledResult<SourceResult<number>> => r.status === "fulfilled")
    .map(r => r.value);

  if (sources.length === 0) {
    throw new Error("All block-height sources failed");
  }

  const fetchedAt = sources[0]!.fetchedAt;
  const values = sources.map(s => s.value);
  const agreement: BlockHeightData["agreement"] =
    sources.length === 1
      ? "single-source"
      : new Set(values).size === 1
        ? "verified"
        : "disputed";

  return { height: values[0]!, sources, agreement, fetchedAt };
}
