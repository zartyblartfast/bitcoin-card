import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFeeProfile } from "../../../data/src/index.js";

export function registerFeeProfile(server: McpServer): void {
  server.tool(
    "get_fee_profile",
    "Get a patient DCA fee recommendation from Bitcoin Card fee history. Returns recommended sat/vB, estimated fee USD, fee percent of buy, confidence, current fee regime, current fees, and source/caveat metadata. Estimates are probabilistic, not guaranteed confirmation times.",
    {
      cadence: z.enum(["daily", "weekly", "monthly"]).describe("DCA cadence"),
      buyAmountUsd: z.number().positive().describe("Planned buy amount in USD"),
      targetVbytes: z.number().positive().default(140).describe("Estimated transaction virtual size in vbytes"),
    },
    async ({ cadence, buyAmountUsd, targetVbytes }) => {
      const result = await getFeeProfile({ cadence, buyAmountUsd, targetVbytes });
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
