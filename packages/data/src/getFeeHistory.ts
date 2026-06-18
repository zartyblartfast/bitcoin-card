import { fetchFeeRateHistory, fetchRecentBlocks, type MempoolFeeRateHistoryRow } from "./sources/mempool.js";
import type { FeeHistory, FeeHistoryBandPoint, FeeRange } from "./types.js";

const BLOCKS_PER_HOUR = 6; // ~10 min target block time

const SUPPORTED_RANGES = ["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y"] as const;

const HOURS_IN_RANGE: Record<FeeRange, number> = {
  "24h": 24,
  "3d": 24 * 3,
  "1w": 24 * 7,
  "1m": 24 * 30,
  "3m": 24 * 90,
  "6m": 24 * 180,
  "1y": 24 * 365,
  "2y": 24 * 730,
  "3y": 24 * 1095,
};

const FALLBACK_BUCKET_HOURS: Record<FeeRange, number> = {
  "24h": 1,
  "3d": 2,
  "1w": 24,
  "1m": 24,
  "3m": 24,
  "6m": 24 * 2,
  "1y": 24 * 7,
  "2y": 24 * 7,
  "3y": 24 * 7,
};

export function isFeeHistoryRange(value: string): value is FeeRange {
  return (SUPPORTED_RANGES as readonly string[]).includes(value);
}

function assertSupportedRange(range: FeeRange): void {
  if (!isFeeHistoryRange(range)) {
    throw new Error(`Unsupported fee history range: ${String(range)}`);
  }
}

function assertFiniteFee(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid fee history ${field}`);
  return value;
}

function pointFromFees(t: string, fees: number[]): FeeHistoryBandPoint {
  const sorted = fees.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error("Cannot build fee history bucket from no fees");
  const q = (percent: number) => {
    const index = Math.round((percent / 100) * (sorted.length - 1));
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))]!;
  };
  return {
    t,
    minFee: q(0),
    p10Fee: q(10),
    p25Fee: q(25),
    medianFee: q(50),
    p75Fee: q(75),
    p90Fee: q(90),
    maxFee: q(100),
  };
}

export function parseMempoolFeeRateHistory(
  range: FeeRange,
  rows: MempoolFeeRateHistoryRow[],
  fetchedAt = new Date().toISOString(),
): FeeHistory {
  assertSupportedRange(range);
  const points = rows
    .map((row) => ({
      t: new Date(row.timestamp * 1000).toISOString(),
      minFee: assertFiniteFee(row.avgFee_0, "avgFee_0"),
      p10Fee: assertFiniteFee(row.avgFee_10, "avgFee_10"),
      p25Fee: assertFiniteFee(row.avgFee_25, "avgFee_25"),
      medianFee: assertFiniteFee(row.avgFee_50, "avgFee_50"),
      p75Fee: assertFiniteFee(row.avgFee_75, "avgFee_75"),
      p90Fee: assertFiniteFee(row.avgFee_90, "avgFee_90"),
      maxFee: assertFiniteFee(row.avgFee_100, "avgFee_100"),
    }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));

  return {
    range,
    points,
    source: "mempool.space",
    sourceQuality: "public-api-fee-rate-bands",
    partial: false,
    fetchedAt,
  };
}

async function getFallbackFeeHistory(range: FeeRange, upstreamError: unknown): Promise<FeeHistory> {
  const totalHours = HOURS_IN_RANGE[range];
  const bucketSeconds = FALLBACK_BUCKET_HOURS[range] * 3600;
  const numBuckets = Math.floor(totalHours / FALLBACK_BUCKET_HOURS[range]);
  const totalBlocks = Math.ceil(totalHours * BLOCKS_PER_HOUR);
  const maxBlocks = Math.min(totalBlocks, 2016);

  const { value: blocks, fetchedAt } = await fetchRecentBlocks(maxBlocks);
  const refTime = blocks.length > 0 ? blocks[blocks.length - 1]!.timestamp : Math.floor(Date.now() / 1000);

  const buckets: number[][] = Array.from({ length: numBuckets }, () => []);
  for (const blk of blocks) {
    const age = refTime - blk.timestamp;
    if (age < 0) continue;
    const bucketIndex = Math.min(Math.floor(age / bucketSeconds), numBuckets - 1);
    const fallbackFee = blk.medianFee ?? blk.feeRange?.[0] ?? 0;
    buckets[bucketIndex]!.push(fallbackFee);
  }

  const points = buckets
    .map((fees, i) => {
      if (fees.length === 0) return null;
      const bucketStart = refTime - (i + 1) * bucketSeconds;
      return pointFromFees(new Date(bucketStart * 1000).toISOString(), fees);
    })
    .filter((p): p is FeeHistoryBandPoint => p !== null)
    .reverse();

  const reason = upstreamError instanceof Error ? upstreamError.message : "unknown upstream error";
  return {
    range,
    points,
    source: "mempool.space recent-block fallback",
    sourceQuality: "recent-block-derived-fee-bands",
    partial: true,
    note: `mempool.space fee-rate band endpoint was unavailable (${reason}); returned recent-block-derived fee bands. Coverage may be shorter or sparser than requested.`,
    fetchedAt,
  };
}

/**
 * Get historical fee-rate distribution bands.
 *
 * Primary source: mempool.space /v1/mining/blocks/fee-rates/{range}, which
 * returns fee percentiles for chart buckets. If that endpoint is unavailable,
 * fall back to recent-block medians and mark the response partial.
 */
export async function getFeeHistory(range: FeeRange): Promise<FeeHistory> {
  assertSupportedRange(range);
  try {
    const { value, fetchedAt } = await fetchFeeRateHistory(range);
    return parseMempoolFeeRateHistory(range, value, fetchedAt);
  } catch (error) {
    return getFallbackFeeHistory(range, error);
  }
}
