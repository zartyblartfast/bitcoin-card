import { getFeeHistory } from "./getFeeHistory.js";
import { getMempoolFees } from "./getMempoolFees.js";
import { getPrice } from "./getPrice.js";
import type { DcaCadence, FeeHistory, FeeProfile, FeeProfileRequest, FeeRegime, FeeRange, MempoolFeesValue } from "./types.js";

function assertCadence(value: DcaCadence): void {
  if (value !== "daily" && value !== "weekly" && value !== "monthly") {
    throw new Error(`Unsupported cadence: ${String(value)}`);
  }
}

function assertPositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be positive`);
}

function average(values: number[]): number {
  if (values.length === 0) throw new Error("Cannot average empty fee profile history");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function regimeFromP90(p90Fee: number): FeeRegime {
  if (p90Fee <= 3) return "quiet";
  if (p90Fee <= 15) return "normal";
  if (p90Fee <= 40) return "elevated";
  if (p90Fee <= 100) return "congested";
  return "extreme";
}

function rangeForCadence(cadence: DcaCadence): FeeRange {
  if (cadence === "daily") return "3d";
  if (cadence === "weekly") return "1w";
  return "1m";
}

function targetFromHistory(cadence: DcaCadence, history: FeeHistory): number {
  const p10 = average(history.points.map((p) => p.p10Fee));
  const p25 = average(history.points.map((p) => p.p25Fee));
  const median = average(history.points.map((p) => p.medianFee));
  const raw = cadence === "daily" ? (p25 + median) / 2 : cadence === "weekly" ? p25 : p10;
  return Math.max(1, Math.ceil(raw));
}

function confidenceFor(history: FeeHistory, regime: FeeRegime): number {
  const base = history.partial ? 0.55 : 0.8;
  const regimePenalty: Record<FeeRegime, number> = {
    quiet: 0,
    normal: 0,
    elevated: 0.1,
    congested: 0.2,
    extreme: 0.35,
  };
  return Math.max(0, Math.min(1, Number((base - regimePenalty[regime]).toFixed(2))));
}

function reasonFor(cadence: DcaCadence, target: number, regime: FeeRegime, feePct: number): string {
  if (regime === "quiet") {
    return `${target} sat/vB is realistic for a patient ${cadence} DCA campaign based on recent low-fee windows.`;
  }
  if (regime === "normal") {
    return `${target} sat/vB is a realistic low-fee target for a ${cadence} DCA campaign in normal recent fee conditions.`;
  }
  if (regime === "elevated") {
    return `Fees are elevated. ${target} sat/vB is the lowest target likely to confirm reliably within a ${cadence} cadence; estimated fee is ${feePct.toFixed(2)}% of the planned buy.`;
  }
  if (regime === "congested") {
    return `Fees are congested. ${target} sat/vB may be needed for a realistic ${cadence} target; consider pausing or requiring review if this exceeds your campaign guardrail.`;
  }
  return `Fees are extremely high. ${target} sat/vB is based on recent history, but a patient ${cadence} campaign should consider pausing or manual review.`;
}

export async function getFeeProfile(request: FeeProfileRequest): Promise<FeeProfile> {
  assertCadence(request.cadence);
  assertPositive(request.buyAmountUsd, "buyAmountUsd");
  const targetVbytes = request.targetVbytes ?? 140;
  assertPositive(targetVbytes, "targetVbytes");

  const range = rangeForCadence(request.cadence);
  const [history, currentFees, price] = await Promise.all([
    getFeeHistory(range),
    getMempoolFees(),
    getPrice("USD"),
  ]);

  if (history.points.length === 0) throw new Error("Fee profile requires non-empty fee history");

  const p10Fee = average(history.points.map((p) => p.p10Fee));
  const medianFee = average(history.points.map((p) => p.medianFee));
  const p90Fee = average(history.points.map((p) => p.p90Fee));
  const recommendedSatVb = targetFromHistory(request.cadence, history);
  const estimatedFeeUsd = (recommendedSatVb * targetVbytes / 100_000_000) * price.price;
  const estimatedFeePctOfBuy = (estimatedFeeUsd / request.buyAmountUsd) * 100;
  const regime = regimeFromP90(Math.max(p90Fee, currentFees.hourFee));

  const currentFeeValue: MempoolFeesValue = {
    fastestFee: currentFees.fastestFee,
    halfHourFee: currentFees.halfHourFee,
    hourFee: currentFees.hourFee,
    minimumFee: currentFees.minimumFee,
  };

  return {
    cadence: request.cadence,
    buyAmountUsd: request.buyAmountUsd,
    targetVbytes,
    recommendedSatVb,
    estimatedFeeUsd,
    estimatedFeePctOfBuy,
    confidence: confidenceFor(history, regime),
    regime,
    reason: reasonFor(request.cadence, recommendedSatVb, regime, estimatedFeePctOfBuy),
    currentFees: currentFeeValue,
    historySummary: {
      range,
      p10Fee,
      medianFee,
      p90Fee,
      partial: history.partial,
    },
    source: "Bitcoin Card fee history + current mempool fees",
    sourceQuality: "derived-from-public-fee-history",
    limitations: "Fee targets are probabilistic and based on recent public fee history. They estimate realistic low-fee targets; they do not guarantee confirmation time.",
    fetchedAt: new Date().toISOString(),
  };
}
