import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCheckonchainMeanReversionComparison } from "../../../data/src/index.js";

export function registerMeanReversionIndex(server: McpServer): void {
  server.tool(
    "get_bitcoin_mean_reversion_index",
    "Get the Bitcoin Mean Reversion Index comparison: Full BMRI parsed from Checkonchain public chart data when available, BMRI-lite from 200DMA/200WMA/Realized Price, delta, anchors, methodology, source quality, and caveats.",
    {},
    async () => {
      const result = await getCheckonchainMeanReversionComparison();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
