import { getPrice } from "./getPrice.js";
import { getBlockHeight } from "./getBlockHeight.js";
import { fetchHashrate, fetchDifficulty } from "./sources/mempool.js";
import { computeUnminedSupply } from "./derive/unmined.js";
import type { NetworkSummary } from "./types.js";

const HALVING_INTERVAL = 210_000;
const TARGET_BLOCK_TIME_SEC = 600; // 10 minutes

/**
 * One-shot bundle of the current Bitcoin network state.
 *
 * Fetches price, block height, hashrate, and difficulty in parallel,
 * derives unmined supply from the halving schedule, and computes the
 * next halving ETA from the current height.
 */
export async function getNetworkSummary(): Promise<NetworkSummary> {
  const [price, blockHeight, hashrate, difficulty] = await Promise.all([
    getPrice("USD"),
    getBlockHeight(),
    fetchHashrate(),
    fetchDifficulty(),
  ]);

  const { unmined } = computeUnminedSupply(blockHeight.height);
  const blocksUntilHalving =
    HALVING_INTERVAL - (blockHeight.height % HALVING_INTERVAL);
  const nextHalvingEta = new Date(
    Date.now() + blocksUntilHalving * TARGET_BLOCK_TIME_SEC * 1000,
  ).toISOString();

  return {
    price,
    blockHeight,
    hashrate: hashrate.value,
    difficulty: difficulty.value,
    unminedBtc: unmined,
    nextHalvingEta,
    fetchedAt: new Date().toISOString(),
  };
}
