import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDcaMetrics } from "../../../data/src/index.js";

/** JSON-safe serializer for bigint values that may appear in raw network data. */
function toJsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v)),
  );
}

export function registerDcaMetrics(server: McpServer): void {
  server.tool(
    "get_dca_metrics",
    "Get a compact Bitcoin metrics bundle suitable for a DCA app: verified price, fees, network state, and BMRI market-context zone with caveats. Intended for display/manual context, not automated trading.",
    {},
    async () => {
      const result = await getDcaMetrics();
      return {
        content: [{ type: "text", text: JSON.stringify(toJsonSafe(result), null, 2) }],
      };
    },
  );
}
