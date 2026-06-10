import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerBitcoinPrice } from "./tools/bitcoinPrice.js";
import { registerBlockHeight } from "./tools/blockHeight.js";
import { registerMempoolFees } from "./tools/mempoolFees.js";
import { registerFeeHistory } from "./tools/feeHistory.js";
import { registerNetworkSummary } from "./tools/networkSummary.js";
import { registerUnminedSupply } from "./tools/unminedSupply.js";
import { registerMarketBriefPrompt } from "./prompts/marketBrief.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "bitcoin-info-mcp",
    version: "0.1.2",
  });

  registerBitcoinPrice(server);
  registerBlockHeight(server);
  registerMempoolFees(server);
  registerFeeHistory(server);
  registerNetworkSummary(server);
  registerUnminedSupply(server);
  registerMarketBriefPrompt(server);

  return server;
}

export async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Keep alive; stdio transport handles its own lifecycle.
}
