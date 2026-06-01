import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMempoolFees } from "@bitcoin-card/data";

export function registerMempoolFees(server: McpServer): void {
  server.tool(
    "get_mempool_fees",
    "Get current recommended mempool transaction fees in sat/vB at four confirmation targets: fastest (next block), half-hour, one-hour, and minimum (economical). Backed by mempool.space.",
    {},
    async () => {
      const result = await getMempoolFees();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
