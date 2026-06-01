import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFeeHistory } from "@bitcoin-card/data";

export function registerFeeHistory(server: McpServer): void {
  server.tool(
    "get_fee_history",
    "Get historical mempool fee data. Supported ranges: 24h and 1w return real bucketed data. Note: 1m, 1y, and 2y ranges return partial: true with empty points - daily accumulation starts in v0.2.0.",
    {
      range: z
        .enum(["24h", "1w", "1m", "1y", "2y"])
        .default("24h")
        .describe("Time range (24h, 1w return real data; 1m, 1y, 2y return partial)"),
    },
    async ({ range }) => {
      const result = await getFeeHistory(range);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
