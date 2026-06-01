import { getBlockHeight } from "./getBlockHeight.js";
import { computeUnminedSupply } from "./derive/unmined.js";
import type { UnminedSupply } from "./types.js";

/**
 * Get the current unmined Bitcoin supply. Fetches the current block height
 * (with cross-source verification via getBlockHeight) and computes the
 * unmined amount purely from the halving schedule.
 *
 * No external API is called for the supply calculation itself - this
 * function returns the full derivation formula in the result for verifiability.
 */
export async function getUnminedSupply(): Promise<UnminedSupply> {
  const { height } = await getBlockHeight();
  return computeUnminedSupply(height);
}
