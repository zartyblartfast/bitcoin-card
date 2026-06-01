import { fetchCoinbasePrice } from "./sources/coinbase.js";
import { fetchKrakenPrice } from "./sources/kraken.js";
import { verifyPrices } from "./verification/price.js";
import type { Currency, PriceData, SourceResult } from "./types.js";

/**
 * Get the current Bitcoin spot price in the requested currency.
 *
 * Fetches from Coinbase and Kraken in parallel, captures results even when
 * one source fails, and applies cross-source verification. Returns a
 * single-source result if only one source succeeded.
 */
export async function getPrice(currency: Currency = "USD"): Promise<PriceData> {
  const results = await Promise.allSettled<SourceResult<number>>([
    fetchCoinbasePrice(currency),
    fetchKrakenPrice(currency),
  ]);

  const fulfilled = results
    .filter((r): r is PromiseFulfilledResult<SourceResult<number>> => r.status === "fulfilled")
    .map(r => r.value);

  if (fulfilled.length === 0) {
    const firstReason = (results.find(r => r.status === "rejected") as PromiseRejectedResult).reason;
    throw new Error(`All price sources failed. First error: ${String(firstReason)}`);
  }

  return { ...verifyPrices(fulfilled), currency };
}
