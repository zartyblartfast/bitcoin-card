import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getUnminedSupply } from "../../../data/src/index.js";

export function registerUnminedSupply(server: McpServer): void {
  server.tool(
    "get_unmined_supply",
    "Get the current unmined Bitcoin supply, derived purely from block height and the halving schedule (21M cap, 50 BTC initial reward, halvings every 210,000 blocks). Returns the full derivation formula for verifiability. No external API call for the calculation itself.",
    {},
    async () => {
      const result = await getUnminedSupply();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
