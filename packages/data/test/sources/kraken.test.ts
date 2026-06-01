import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchKrakenPrice } from "../../src/sources/kraken.js";

const originalFetch = globalThis.fetch;

describe("fetchKrakenPrice", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns USD price from result.XXBTZUSD.c[0]", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ result: { XXBTZUSD: { c: ["67234.10", "67234.20"] } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchKrakenPrice("USD");
    expect(result).toEqual({ source: "kraken", value: 67234.1, fetchedAt: expect.any(String) });
  });

  it("requests the correct pair URL for the currency", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ result: { XXBTZEUR: { c: ["60000"] } } }), { status: 200 }),
    );
    await fetchKrakenPrice("EUR");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.kraken.com/0/public/Ticker?pair=XXBTZEUR",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects when last price is missing or non-numeric", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ result: { XXBTZUSD: { c: ["not-a-number"] } } }), { status: 200 }),
    );
    await expect(fetchKrakenPrice("USD")).rejects.toThrow(/non-finite/i);
  });

  it("rejects when the pair key is missing from the response", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ result: { SOMEOTHER: { c: ["100"] } } }), { status: 200 }),
    );
    await expect(fetchKrakenPrice("USD")).rejects.toThrow(/missing last price/i);
  });
});
