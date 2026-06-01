import { describe, it, expect } from "vitest";
import {
  getPrice,
  getBlockHeight,
  getMempoolFees,
  getNetworkSummary,
} from "../../src/index.js";

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === "1";
const itIntegration = RUN_INTEGRATION ? it : it.skip;

describe.skipIf(!RUN_INTEGRATION)("integration: real Bitcoin APIs", () => {
  itIntegration(
    "getPrice returns verified price from Coinbase and Kraken",
    async () => {
      const r = await getPrice("USD");
      expect(r.price).toBeGreaterThan(1000);
      expect(["verified", "single-source"]).toContain(r.agreement);
    },
    30_000,
  );

  itIntegration(
    "getBlockHeight returns current tip",
    async () => {
      const r = await getBlockHeight();
      expect(r.height).toBeGreaterThan(800_000);
    },
    30_000,
  );

  itIntegration(
    "getMempoolFees returns sensible fee tiers",
    async () => {
      const r = await getMempoolFees();
      expect(r.fastestFee).toBeGreaterThan(0);
      expect(r.fastestFee).toBeGreaterThanOrEqual(r.hourFee);
      expect(r.minimumFee).toBeLessThanOrEqual(r.hourFee);
    },
    30_000,
  );

  itIntegration(
    "getNetworkSummary bundles everything with reasonable values",
    async () => {
      const r = await getNetworkSummary();
      expect(r.unminedBtc).toBeGreaterThan(500_000);
      expect(r.unminedBtc).toBeLessThan(21_000_000);
      expect(r.hashrate).toBeGreaterThan(100);
      expect(r.difficulty > 0n).toBe(true);
      expect(new Date(r.nextHalvingEta).getTime()).toBeGreaterThan(Date.now());
    },
    30_000,
  );
});
