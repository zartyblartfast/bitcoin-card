import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBlockHeight } from "@bitcoin-card/data";

export function registerBlockHeight(server: McpServer): void {
  server.tool(
    "get_block_height",
    "Get the current Bitcoin block height, verified across mempool.space and Blockstream. Returns the height plus source agreement status (verified, disputed, or single-source).",
    {},
    async () => {
      const result = await getBlockHeight();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
