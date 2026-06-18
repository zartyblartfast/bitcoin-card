import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFeeHistory } from "../../../data/src/index.js";

const FeeHistoryRangeSchema = z.enum(["24h", "3d", "1w", "1m", "3m", "6m", "1y", "2y", "3y"]);

export function registerFeeHistory(server: McpServer): void {
  server.tool(
    "get_fee_history",
    "Get historical Bitcoin fee-rate distribution bands from mempool.space via Bitcoin Card. Supported ranges: 24h, 3d, 1w, 1m, 3m, 6m, 1y, 2y, 3y. Returns percentile bands: minFee, p10Fee, p25Fee, medianFee, p75Fee, p90Fee, maxFee, plus source/caveat metadata.",
    {
      range: FeeHistoryRangeSchema.default("24h").describe("Time range: 24h, 3d, 1w, 1m, 3m, 6m, 1y, 2y, or 3y"),
    },
    async ({ range }) => {
      const result = await getFeeHistory(range);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );
}
