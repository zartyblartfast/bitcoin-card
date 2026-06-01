import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { Currency, SourceResult } from "../types.js";

const CoinbaseResponseSchema = z.object({
  data: z.object({
    amount: z.string(),
    currency: z.string(),
  }),
});

export async function fetchCoinbasePrice(
  currency: Currency,
): Promise<SourceResult<number>> {
  const url = `https://api.coinbase.com/v2/prices/BTC-${currency}/spot`;
  const raw = await getJson<unknown>(url);
  const parsed = CoinbaseResponseSchema.parse(raw);
  const amount = Number(parsed.data.amount);
  if (!Number.isFinite(amount)) {
    throw new Error(`Coinbase returned non-finite amount: ${parsed.data.amount}`);
  }
  return {
    source: "coinbase",
    value: amount,
    fetchedAt: new Date().toISOString(),
  };
}
