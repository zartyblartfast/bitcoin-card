import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBitcoinRisk } from "../../../data/src/index.js";

export function registerBitcoinRisk(server: McpServer): void {
  server.tool(
    "get_bitcoin_risk",
    "Get a Bitcoin valuation-risk proxy derived from Coin Metrics Community API MVRV history, including daily risk history plus separate Alternative.me Fear & Greed sentiment when available. Free-tier friendly: daily in-process cache, reproducible MVRV Z-Score derivation, 0-100 local risk score, band, source, methodology, and caveats. Sentiment is not blended into the risk score. Not an automated trading signal.",
    {},
    async () => {
      const result = await getBitcoinRisk();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
