import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBitcoinRisk } from "../../../data/src/index.js";

export function registerBitcoinRisk(server: McpServer): void {
  server.tool(
    "get_bitcoin_risk",
    "Get bitcoin-card's native Bitcoin Risk composite: a free-source 0-100 valuation/cycle risk score derived from Coin Metrics Community API MVRV, market cap, price, and issuance history. Includes component breakdown (MVRV-Z-derived, Puell-style issuance multiple, Mayer Multiple, 200WMA distance), daily history, band, methodology, caveats, and separate Alternative.me Fear & Greed sentiment when available. Not Cowen Risk, not Glassnode-equivalent, and not an automated trading signal.",
    {},
    async () => {
      const result = await getBitcoinRisk();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
