import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { Currency, SourceResult } from "../types.js";

const KRAKEN_PAIRS: Record<Currency, string> = {
  USD: "XXBTZUSD",
  EUR: "XXBTZEUR",
  GBP: "XXBTZGBP",
};

const KrakenResponseSchema = z.object({
  result: z.record(z.object({ c: z.array(z.string()) })),
});

export async function fetchKrakenPrice(
  currency: Currency,
): Promise<SourceResult<number>> {
  const pair = KRAKEN_PAIRS[currency];
  const url = `https://api.kraken.com/0/public/Ticker?pair=${pair}`;
  const raw = await getJson<unknown>(url);
  const parsed = KrakenResponseSchema.parse(raw);
  const last = parsed.result[pair]?.c[0];
  if (last === undefined) throw new Error(`Kraken response missing last price for ${pair}`);
  const value = Number(last);
  if (!Number.isFinite(value)) throw new Error(`Kraken returned non-finite price: ${last}`);
  return { source: "kraken", value, fetchedAt: new Date().toISOString() };
}
