import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPrice } from "../../../data/src/index.js";

export function registerBitcoinPrice(server: McpServer): void {
  server.tool(
    "get_bitcoin_price",
    "Get the current Bitcoin spot price with cross-source verification. Queries Coinbase and Kraken in parallel, then reports the average price plus whether the sources agree within the 0.5% verification threshold.",
    {
      currency: z
        .enum(["USD", "EUR", "GBP"])
        .default("USD")
        .describe("Quote currency (default USD)"),
    },
    async ({ currency }) => {
      const result = await getPrice(currency);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
