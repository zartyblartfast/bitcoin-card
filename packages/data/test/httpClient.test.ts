import { describe, it, expect, vi, afterEach } from "vitest";
import { getJson, HttpError } from "../src/httpClient.js";

describe("getJson", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed JSON on 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await getJson<{ ok: boolean }>("https://x/y");
    expect(result).toEqual({ ok: true });
  });

  it("throws HttpError on non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("nope", { status: 500 }),
    );
    await expect(getJson("https://x/y")).rejects.toBeInstanceOf(HttpError);
  });

  it("throws on timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation(
      (_url, init: RequestInit | undefined) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    await expect(
      getJson("https://x/y", { timeoutMs: 50 }),
    ).rejects.toThrow();
  });
});
