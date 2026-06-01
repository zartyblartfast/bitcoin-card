import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerMarketBriefPrompt(server: McpServer): void {
  server.prompt(
    "bitcoin-market-brief",
    "Compose a structured Bitcoin market brief. Internally calls get_network_summary and get_mempool_fees, then summarises in plain language.",
    async () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Call get_network_summary and get_mempool_fees, then write a 4-sentence market brief covering: " +
              "(1) current price and source agreement, " +
              "(2) mempool fee environment (cheap / normal / congested), " +
              "(3) time to next halving, " +
              "(4) one risk worth flagging.",
          },
        },
      ],
    }),
  );
}
