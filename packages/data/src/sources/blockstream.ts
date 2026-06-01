import { z } from "zod";
import { getJson } from "../httpClient.js";
import type { SourceResult } from "../types.js";

const BASE = "https://blockstream.info/api";

export type FeeEstimates = Record<string, number>;

export async function fetchBlockHeight(): Promise<SourceResult<number>> {
  const url = `${BASE}/blocks/tip/height`;
  const raw = await getJson<unknown>(url);
  const value = typeof raw === "number" ? raw : z.number().int().positive().parse(raw);
  return { source: "blockstream", value, fetchedAt: new Date().toISOString() };
}

export async function fetchFeeEstimates(): Promise<SourceResult<FeeEstimates>> {
  const url = `${BASE}/fee-estimates`;
  const value = z.record(z.string(), z.number()).parse(await getJson<unknown>(url));
  return { source: "blockstream", value, fetchedAt: new Date().toISOString() };
}
