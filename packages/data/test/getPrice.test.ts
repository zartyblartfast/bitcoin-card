import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getPrice } from "../src/getPrice.js";

const originalFetch = globalThis.fetch;

const coinbaseBody = (amount: string) =>
  JSON.stringify({ data: { amount, currency: "USD" } });
const krakenBody = (last: string) =>
  JSON.stringify({ result: { XXBTZUSD: { c: [last, "0"] } } });

describe("getPrice", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("queries both Coinbase and Kraken and reports verified when within threshold", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(coinbaseBody("67000"), { status: 200 }))
      .mockResolvedValueOnce(new Response(krakenBody("67050"), { status: 200 }));

    const result = await getPrice("USD");
    expect(result.agreement).toBe("verified");
    expect(result.price).toBeCloseTo(67025, 0);
    expect(result.currency).toBe("USD");
    expect(result.sources.map(s => s.source).sort()).toEqual(["coinbase", "kraken"]);
  });

  it("reports disputed when sources diverge beyond threshold", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(coinbaseBody("60000"), { status: 200 }))
      .mockResolvedValueOnce(new Response(krakenBody("65000"), { status: 200 }));

    const result = await getPrice("USD");
    expect(result.agreement).toBe("disputed");
    expect(result.price).toBeCloseTo(62500, 0);
  });

  it("marks single-source when one source fails", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(coinbaseBody("67000"), { status: 200 }))
      .mockResolvedValueOnce(new Response("kraken down", { status: 500 }));

    const result = await getPrice("USD");
    expect(result.agreement).toBe("single-source");
    expect(result.price).toBe(67000);
    expect(result.sources.map(s => s.source)).toEqual(["coinbase"]);
  });

  it("throws when all sources fail", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("err", { status: 500 }));
    await expect(getPrice("USD")).rejects.toThrow(/All price sources failed/);
  });
});
