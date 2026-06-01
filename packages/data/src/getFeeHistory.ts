import { fetchRecentBlocks } from "./sources/mempool.js";
import type { FeeHistory, FeeRange } from "./types.js";

const BLOCKS_PER_HOUR = 6; // ~10 min target block time

const HOURS_IN_RANGE: Record<FeeRange, number> = {
  "24h": 24,
  "1w": 24 * 7,
  "1m": 24 * 30,
  "1y": 24 * 365,
  "2y": 24 * 730,
};

const BUCKET_HOURS: Record<FeeRange, number> = {
  "24h": 1,
  "1w": 24,
  "1m": 24,
  "1y": 24 * 30,
  "2y": 24 * 30,
};

const LONG_RANGE_NOTE =
  "Daily fee history accumulation starts with v0.2.0; check back later.";

/**
 * Get historical mempool fee data.
 *
 * - 24h: hourly buckets from the last ~144 blocks
 * - 1w: daily buckets from the last ~1008 blocks
 * - 1m, 1y, 2y: return `partial: true` with an empty points array and a
 *   note. These ranges will be filled by a daily-accumulation cron in v0.2.0.
 */
export async function getFeeHistory(range: FeeRange): Promise<FeeHistory> {
  if (range === "1m" || range === "1y" || range === "2y") {
    return {
      range,
      points: [],
      source: "self-accumulated",
      partial: true,
      note: LONG_RANGE_NOTE,
    };
  }

  const totalHours = HOURS_IN_RANGE[range];
  const bucketSeconds = BUCKET_HOURS[range] * 3600;
  const numBuckets = Math.floor(totalHours / BUCKET_HOURS[range]);
  const totalBlocks = Math.ceil(totalHours * BLOCKS_PER_HOUR);

  const { value: blocks } = await fetchRecentBlocks(totalBlocks);

  // Use the most recent block as the reference so bucket boundaries
  // don't depend on alignment with the wall-clock hour/day.
  const refTime =
    blocks.length > 0
      ? blocks[blocks.length - 1]!.timestamp
      : Math.floor(Date.now() / 1000);

  const buckets: number[][] = Array.from({ length: numBuckets }, () => []);
  for (const blk of blocks) {
    const age = refTime - blk.timestamp;
    if (age < 0) continue;
    // Clamp the oldest edge so a single overshoot block doesn't create
    // an extra empty bucket at the head.
    const bucketIndex = Math.min(
      Math.floor(age / bucketSeconds),
      numBuckets - 1,
    );
    buckets[bucketIndex]!.push(blk.medianFee ?? blk.feeRange?.[0] ?? 0);
  }

  const points = buckets
    .map((fees, i) => {
      if (fees.length === 0) return null;
      const bucketStart = refTime - (i + 1) * bucketSeconds;
      return {
        t: new Date(bucketStart * 1000).toISOString(),
        fee: fees.reduce((a, b) => a + b, 0) / fees.length,
      };
    })
    .filter((p): p is { t: string; fee: number } => p !== null)
    .reverse();

  return { range, points, source: "mempool", partial: false };
}
