import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchCoinbasePrice } from "../../src/sources/coinbase.js";

const originalFetch = globalThis.fetch;

describe("fetchCoinbasePrice", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns USD price on success", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ data: { amount: "67234.45", currency: "USD" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await fetchCoinbasePrice("USD");
    expect(result).toEqual({ source: "coinbase", value: 67234.45, fetchedAt: expect.any(String) });
  });

  it("requests the correct URL for the currency", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { amount: "1", currency: "EUR" } }), { status: 200 }),
    );
    await fetchCoinbasePrice("EUR");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.coinbase.com/v2/prices/BTC-EUR/spot",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects non-finite amounts", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ data: { amount: "NaN", currency: "USD" } }), { status: 200 }),
    );
    await expect(fetchCoinbasePrice("USD")).rejects.toThrow(/non-finite/i);
  });

  it("propagates HTTP errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("rate limit", { status: 429 }));
    await expect(fetchCoinbasePrice("USD")).rejects.toThrow(/HTTP 429/);
  });
});
