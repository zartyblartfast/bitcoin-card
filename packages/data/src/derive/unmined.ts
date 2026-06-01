const TOTAL_CAP = 21_000_000;
const INITIAL_REWARD = 50;
const HALVING_INTERVAL = 210_000;

/**
 * Compute the total BTC mined up to a given block height, applying the
 * halving schedule (50 → 25 → 12.5 → ... every 210,000 blocks).
 */
export function computeCurrentSupply(height: number): number {
  if (!Number.isInteger(height) || height < 0) {
    throw new Error(`Invalid block height: ${height}`);
  }

  let supply = 0;
  let remaining = height;
  let reward = INITIAL_REWARD;

  while (remaining > 0) {
    const inThisEra = Math.min(remaining, HALVING_INTERVAL);
    supply += inThisEra * reward;
    remaining -= inThisEra;
    reward /= 2;
  }

  return supply;
}

/**
 * Compute the unmined BTC supply at a given block height.
 *
 * Returns a result object that includes the human-readable derivation
 * formula, so callers can present it for verifiability.
 */
export function computeUnminedSupply(height: number) {
  const currentSupply = computeCurrentSupply(height);
  const unmined = TOTAL_CAP - currentSupply;
  return {
    unmined,
    totalCap: TOTAL_CAP,
    currentSupply,
    formula: `unmined = 21,000,000 - Σ(blocks_mined × reward) over ${height} blocks, with halvings every 210,000 blocks`,
  };
}
