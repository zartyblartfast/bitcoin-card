import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { getBlockHeight } from "../src/getBlockHeight.js";

const originalFetch = globalThis.fetch;

describe("getBlockHeight", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns verified when mempool and blockstream agree", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("900123", { status: 200 }))
      .mockResolvedValueOnce(new Response("900123", { status: 200 }));

    const result = await getBlockHeight();
    expect(result.height).toBe(900123);
    expect(result.agreement).toBe("verified");
    expect(result.sources.map(s => s.source).sort()).toEqual(["blockstream", "mempool"]);
  });

  it("returns disputed when sources disagree", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("900123", { status: 200 }))
      .mockResolvedValueOnce(new Response("900120", { status: 200 }));

    const result = await getBlockHeight();
    expect(result.agreement).toBe("disputed");
    expect(result.height).toBe(900123);
  });

  it("returns single-source when one source fails", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("900123", { status: 200 }))
      .mockResolvedValueOnce(new Response("err", { status: 500 }));

    const result = await getBlockHeight();
    expect(result.agreement).toBe("single-source");
    expect(result.sources.map(s => s.source)).toEqual(["mempool"]);
  });

  it("throws when all sources fail", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(new Response("err", { status: 500 }));
    await expect(getBlockHeight()).rejects.toThrow(/All block-height sources failed/);
  });
});
