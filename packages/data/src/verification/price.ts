import type { Currency, PriceData, SourceResult } from "../types.js";

export interface VerifyOptions {
  threshold?: number; // fraction, e.g. 0.005 for 0.5%
}

/**
 * Cross-source verification of price data.
 *
 * - Single source → "single-source"
 * - Multiple sources within threshold (default 0.5%) → "verified", price is mean
 * - Multiple sources outside threshold → "disputed", price is still mean but flagged
 *
 * The currency field on the returned PriceData is always "USD" as a placeholder;
 * callers should spread the result and override the currency field.
 */
export function verifyPrices(
  sources: SourceResult<number>[],
  options: VerifyOptions = {},
): PriceData {
  if (sources.length === 0) {
    throw new Error("verifyPrices requires at least one source");
  }
  const threshold = options.threshold ?? 0.005;
  const currency: Currency = "USD";
  const fetchedAt = sources[0]!.fetchedAt;

  if (sources.length === 1) {
    return {
      price: sources[0]!.value,
      currency,
      sources,
      agreement: "single-source",
      fetchedAt,
    };
  }

  const max = Math.max(...sources.map(s => s.value));
  const min = Math.min(...sources.map(s => s.value));
  const relDelta = min === 0 ? Infinity : (max - min) / min;

  const agreement: PriceData["agreement"] =
    relDelta <= threshold ? "verified" : "disputed";
  const price = sources.reduce((sum, s) => sum + s.value, 0) / sources.length;

  return { price, currency, sources, agreement, fetchedAt };
}
