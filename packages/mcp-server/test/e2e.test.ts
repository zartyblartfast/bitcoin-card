import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../src/server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerMarketBriefPrompt } from "../src/prompts/marketBrief.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const originalFetch = globalThis.fetch;

const coinbaseBody = (amount: string) =>
  JSON.stringify({ data: { amount, currency: "USD" } });
const krakenBody = (last: string) =>
  JSON.stringify({ result: { XXBTZUSD: { c: [last, "0"] } } });

/**
 * Create a connected client+server pair using in-memory transport.
 * Each test gets fresh mocks.
 */
async function makeClient() {
  const server = createServer();
  const client = new Client({ name: "test", version: "0.0.0" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientT), server.connect(serverT)]);
  return { client, server };
}

describe("MCP server e2e", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("registers all 6 tools and the prompt", async () => {
    const { client } = await makeClient();
    try {
      const { tools } = await client.listTools();
      const toolNames = tools.map(t => t.name).sort();
      expect(toolNames).toEqual([
        "get_bitcoin_price",
        "get_block_height",
        "get_fee_history",
        "get_mempool_fees",
        "get_network_summary",
        "get_unmined_supply",
      ]);
    } finally {
      await client.close();
    }
  });

  it("get_bitcoin_price returns verified price with mocked Coinbase + Kraken", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response(coinbaseBody("67000"), { status: 200 }))
      .mockResolvedValueOnce(new Response(krakenBody("67050"), { status: 200 }));

    const { client } = await makeClient();
    try {
      const result = await client.callTool({
        name: "get_bitcoin_price",
        arguments: { currency: "USD" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.agreement).toBe("verified");
      expect(parsed.price).toBeCloseTo(67025, 0);
      expect(parsed.currency).toBe("USD");
    } finally {
      await client.close();
    }
  });

  it("get_block_height returns height with agreement", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("900123", { status: 200 }))
      .mockResolvedValueOnce(new Response("900123", { status: 200 }));

    const { client } = await makeClient();
    try {
      const result = await client.callTool({
        name: "get_block_height",
        arguments: {},
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.height).toBe(900123);
      expect(parsed.agreement).toBe("verified");
    } finally {
      await client.close();
    }
  });

  it("get_mempool_fees returns the four fee tiers", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ fastestFee: 80, halfHourFee: 50, hourFee: 30, minimumFee: 10 }),
        { status: 200 },
      ),
    );

    const { client } = await makeClient();
    try {
      const result = await client.callTool({
        name: "get_mempool_fees",
        arguments: {},
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.fastestFee).toBe(80);
      expect(parsed.halfHourFee).toBe(50);
      expect(parsed.hourFee).toBe(30);
      expect(parsed.minimumFee).toBe(10);
    } finally {
      await client.close();
    }
  });

  it("get_fee_history returns partial=true for 1y range", async () => {
    const { client } = await makeClient();
    try {
      const result = await client.callTool({
        name: "get_fee_history",
        arguments: { range: "1y" },
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.range).toBe("1y");
      expect(parsed.partial).toBe(true);
      expect(parsed.points).toEqual([]);
    } finally {
      await client.close();
    }
  });

  it("get_unmined_supply returns derived value with formula", async () => {
    vi.mocked(globalThis.fetch)
      .mockResolvedValueOnce(new Response("900000", { status: 200 }))
      .mockResolvedValueOnce(new Response("900000", { status: 200 }));

    const { client } = await makeClient();
    try {
      const result = await client.callTool({
        name: "get_unmined_supply",
        arguments: {},
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.totalCap).toBe(21_000_000);
      expect(parsed.unmined).toBeGreaterThan(0);
      expect(parsed.formula).toMatch(/21,000,000/);
    } finally {
      await client.close();
    }
  });

  it("get_network_summary bundles price, height, hashrate, difficulty, and unmined", async () => {
    // Promise.all makes call order non-deterministic, so route by URL.
    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("api.coinbase.com")) {
        return new Response(coinbaseBody("67000"), { status: 200 });
      }
      if (u.includes("api.kraken.com")) {
        return new Response(krakenBody("67050"), { status: 200 });
      }
      if (u.includes("blockstream.info")) {
        return new Response("900000", { status: 200 });
      }
      if (u.includes("mempool.space/api/blocks/tip/height")) {
        return new Response("900000", { status: 200 });
      }
      if (u.includes("mempool.space/api/v1/mining/hashrate")) {
        return new Response(
          JSON.stringify({ currentHashrate: 6.5e20, currentDifficulty: 1.1e14 }),
          { status: 200 },
        );
      }
      return new Response("unexpected url " + u, { status: 404 });
    });

    const { client } = await makeClient();
    try {
      const result = await client.callTool({
        name: "get_network_summary",
        arguments: {},
      });
      const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
      const parsed = JSON.parse(text);
      expect(parsed.price.agreement).toBe("verified");
      expect(parsed.blockHeight.height).toBe(900000);
      expect(parsed.hashrate).toBeCloseTo(650, 0);
      expect(parsed.unminedBtc).toBeGreaterThan(0);
      expect(new Date(parsed.nextHalvingEta).getTime()).toBeGreaterThan(Date.now());
    } finally {
      await client.close();
    }
  });

  it("bitcoin-market-brief prompt is registered and returns a composed user message", async () => {
    const { client } = await makeClient();
    try {
      const { prompts } = await client.listPrompts();
      const found = prompts.find(p => p.name === "bitcoin-market-brief");
      expect(found).toBeDefined();

      // Now actually get the prompt
      const result = await client.getPrompt({ name: "bitcoin-market-brief" });
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]!.role).toBe("user");
      const text = (result.messages[0]!.content as { type: string; text: string }).text;
      expect(text).toMatch(/get_network_summary/);
      expect(text).toMatch(/get_mempool_fees/);
    } finally {
      await client.close();
    }
  });
});

// Suppress unused-import warnings for re-exports we may want to import later
void registerMarketBriefPrompt;
void McpServer;
