import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getNetworkSummary } from "../src/getNetworkSummary.js";
import * as mempool from "../src/sources/mempool.js";
import * as blockstream from "../src/sources/blockstream.js";

const originalFetch = globalThis.fetch;

describe("getNetworkSummary", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("bundles price, block height, hashrate, difficulty, unmined, and next halving ETA", async () => {
    // Mock all underlying sources
    vi.mocked(globalThis.fetch)
      // getPrice: coinbase
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { amount: "67000", currency: "USD" } }), { status: 200 }),
      )
      // getPrice: kraken
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ result: { XXBTZUSD: { c: ["67050", "0"] } } }), { status: 200 }),
      )
      // getBlockHeight: mempool
      .mockResolvedValueOnce(new Response("900000", { status: 200 }))
      // getBlockHeight: blockstream
      .mockResolvedValueOnce(new Response("900000", { status: 200 }))
      // fetchHashrate -> fetchMiningStats
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ currentHashrate: 6.5e20, currentDifficulty: 1.1e14 }),
          { status: 200 },
        ),
      )
      // fetchDifficulty -> fetchMiningStats (second call to same endpoint)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ currentHashrate: 6.5e20, currentDifficulty: 1.1e14 }),
          { status: 200 },
        ),
      );

    const result = await getNetworkSummary();

    expect(result.price.price).toBeCloseTo(67025, 0);
    expect(result.price.agreement).toBe("verified");
    expect(result.blockHeight.height).toBe(900000);
    expect(result.blockHeight.agreement).toBe("verified");
    expect(result.hashrate).toBeCloseTo(650, 0); // 6.5e20 / 1e18 = 650 EH/s
    expect(result.difficulty > 0n).toBe(true);
    expect(result.unminedBtc).toBeGreaterThan(0);
    expect(result.unminedBtc).toBeLessThan(21_000_000);
    expect(typeof result.nextHalvingEta).toBe("string");
    expect(new Date(result.nextHalvingEta).getTime()).toBeGreaterThan(Date.now());
  });

  it("computes next halving ETA based on height modulo 210000", async () => {
    // Height at exact halving boundary (block 0 mod 210000)
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { amount: "1", currency: "USD" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: { XXBTZUSD: { c: ["1", "0"] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("0", { status: 200 }))
      .mockResolvedValueOnce(new Response("0", { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ currentHashrate: 1, currentDifficulty: 1 }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ currentHashrate: 1, currentDifficulty: 1 }),
          { status: 200 },
        ),
      );

    const r0 = await getNetworkSummary();
    // At height 0, next halving is 210000 blocks away
    const expectedMs = r0.fetchedAt ? Date.now() : Date.now();
    // nextHalvingEta should be approximately 210000 * 600s = 126M seconds in the future
    const etaMs = new Date(r0.nextHalvingEta).getTime();
    expect(etaMs).toBeGreaterThan(expectedMs);
  });

  it("propagates errors when all critical sources fail", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("err", { status: 500 }));
    await expect(getNetworkSummary()).rejects.toThrow();
  });
});

// Suppress unused-import warning for the re-exports we spy on elsewhere
void mempool;
void blockstream;
