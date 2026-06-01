import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fetchBlockHeight, fetchFeeEstimates } from "../../src/sources/blockstream.js";

const originalFetch = globalThis.fetch;

describe("blockstream", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("fetchBlockHeight", () => {
    it("returns numeric block height from plain number response", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response("900123", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
      );
      const result = await fetchBlockHeight();
      expect(result.source).toBe("blockstream");
      expect(result.value).toBe(900123);
      expect(typeof result.fetchedAt).toBe("string");
    });

    it("requests the correct blockstream URL", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(new Response("1", { status: 200 }));
      await fetchBlockHeight();
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://blockstream.info/api/blocks/tip/height",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("propagates HTTP errors", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(new Response("err", { status: 503 }));
      await expect(fetchBlockHeight()).rejects.toThrow(/HTTP 503/);
    });
  });

  describe("fetchFeeEstimates", () => {
    it("returns record of sat/vB estimates keyed by target block count", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ "1": 50, "3": 30, "6": 20, "144": 10 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const result = await fetchFeeEstimates();
      expect(result.source).toBe("blockstream");
      expect(result.value).toEqual({ "1": 50, "3": 30, "6": 20, "144": 10 });
    });

    it("rejects malformed JSON", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        new Response(JSON.stringify({ wrong: "shape" }), { status: 200 }),
      );
      await expect(fetchFeeEstimates()).rejects.toThrow();
    });
  });
});
