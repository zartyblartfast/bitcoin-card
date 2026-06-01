import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getNetworkSummary } from "../../../data/src/index.js";

/**
 * Convert a value to a JSON-safe form. Bitcoin difficulty exceeds 2^53, so
 * we store it as a bigint in the data layer and serialize as a string at
 * the MCP boundary.
 */
function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

export function registerNetworkSummary(server: McpServer): void {
  server.tool(
    "get_network_summary",
    "Get a one-shot bundle of current Bitcoin network state: price (cross-source verified), block height, hashrate (EH/s), difficulty (as string, may exceed 2^53), unmined BTC, and next halving ETA. The most useful single tool for a market overview.",
    {},
    async () => {
      const result = await getNetworkSummary();
      return {
        content: [{ type: "text", text: JSON.stringify(toJsonSafe(result), null, 2) }],
      };
    },
  );
}
