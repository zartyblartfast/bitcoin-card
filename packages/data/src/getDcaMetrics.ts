import { getBitcoinRisk } from "./getBitcoinRisk.js";
import { getMempoolFees } from "./getMempoolFees.js";
import { getMeanReversionIndex } from "./getMeanReversionIndex.js";
import { getNetworkSummary } from "./getNetworkSummary.js";
import type { DcaMeanReversionZone, DcaMetrics } from "./types.js";

export function zoneFromMeanReversionIndex(index: number): DcaMeanReversionZone {
  if (index <= 20) return "deep_value";
  if (index <= 35) return "value";
  if (index <= 65) return "neutral";
  if (index <= 80) return "warm";
  if (index <= 90) return "expensive";
  return "overheated";
}

/**
 * Compact, DCA-app-oriented Bitcoin metrics bundle.
 *
 * This deliberately omits heavy BMRI history from the raw payload and exposes a
 * small market-context object suitable for display/manual decision support. It
 * is not a trading signal.
 */
export async function getDcaMetrics(): Promise<DcaMetrics> {
  const [networkSummary, mempoolFees, meanReversion, bitcoinRisk] = await Promise.all([
    getNetworkSummary(),
    getMempoolFees(),
    getMeanReversionIndex(),
    getBitcoinRisk(),
  ]);

  const compactMeanReversion = {
    ...meanReversion,
    history: undefined,
  } as Omit<typeof meanReversion, "history">;
  delete (compactMeanReversion as Partial<typeof meanReversion>).history;

  const compactBitcoinRisk = {
    mvrvZScore: bitcoinRisk.mvrvZScore,
    riskScore: bitcoinRisk.riskScore,
    band: bitcoinRisk.band,
    sourceQuality: bitcoinRisk.source.sourceQuality,
    caveat: bitcoinRisk.limitations,
    dataDate: bitcoinRisk.dataDate,
    ...(bitcoinRisk.sentiment
      ? {
          sentiment: {
            value: bitcoinRisk.sentiment.value,
            classification: bitcoinRisk.sentiment.classification,
            sourceQuality: bitcoinRisk.sentiment.source.sourceQuality,
            caveat: bitcoinRisk.sentiment.limitations,
            dataDate: bitcoinRisk.sentiment.dataDate,
          },
        }
      : {}),
  };

  return {
    price: {
      value: networkSummary.price.price,
      currency: networkSummary.price.currency,
      agreement: networkSummary.price.agreement,
      sources: networkSummary.price.sources,
    },
    fees: {
      fastestFee: mempoolFees.fastestFee,
      halfHourFee: mempoolFees.halfHourFee,
      hourFee: mempoolFees.hourFee,
      minimumFee: mempoolFees.minimumFee,
    },
    network: {
      blockHeight: networkSummary.blockHeight.height,
      blockHeightAgreement: networkSummary.blockHeight.agreement,
      hashrateEhS: networkSummary.hashrate,
      difficulty: networkSummary.difficulty.toString(),
      unminedBtc: networkSummary.unminedBtc,
      nextHalvingEta: networkSummary.nextHalvingEta,
    },
    meanReversion: {
      fullIndex: meanReversion.latest.fullIndex,
      liteIndex: meanReversion.latest.liteIndex,
      difference: meanReversion.latest.difference,
      zone: zoneFromMeanReversionIndex(meanReversion.latest.fullIndex),
      sourceQuality: meanReversion.source.sourceQuality,
      caveat: meanReversion.source.note,
      dataDate: meanReversion.latest.date,
    },
    bitcoinRisk: compactBitcoinRisk,
    raw: {
      networkSummary,
      mempoolFees,
      meanReversion: compactMeanReversion,
      bitcoinRisk,
    },
    fetchedAt: new Date().toISOString(),
  };
}
