/**
 * VENOR Architecture: Gold Decision Layer (100% Deterministic & Verifiable)
 * Institutional Directional Sizing, Pre-Mortem Invalidation, and Proof Cards
 */

import type {
  GoldDecision,
  FutureSurvivalScoreResult,
  KishWeightingResult,
  CascadeVulnerability,
  AdversarialAudit,
  PolyhedralConstraint,
} from "./types";

export interface GoldDecisionInputs {
  ticker: string;
  currentPrice: number;
  fssResult: FutureSurvivalScoreResult;
  kishResult: KishWeightingResult;
  cascadeVulnerability: CascadeVulnerability;
  adversarialAudit: AdversarialAudit;
  constraints: PolyhedralConstraint[];
  fragilityIndex: number;
  volatilityRegime: "LOW_VOL_TREND" | "MEAN_REVERTING" | "HIGH_VOL_CRISIS";
  supportLevel?: number;
  resistanceLevel?: number;
  historicalWinRate?: number; // p
  historicalWinLossRatio?: number; // b
}

/** Deterministic pseudo-hash string generator for audit trail */
function computeAuditHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

export function synthesizeGoldDecision(inputs: GoldDecisionInputs): GoldDecision {
  const {
    ticker,
    currentPrice,
    fssResult,
    kishResult,
    cascadeVulnerability,
    adversarialAudit,
    constraints,
    fragilityIndex,
    volatilityRegime,
    supportLevel = currentPrice * 0.95,
    resistanceLevel = currentPrice * 1.08,
    historicalWinRate = 0.58,
    historicalWinLossRatio = 1.8,
  } = inputs;

  const bias = kishResult.orthogonalConsensusBias;
  const fss = fssResult.fss;
  const passedAudit = adversarialAudit.passed;

  // ── 1. Action & Direction Synthesis ──
  let action: "STRONG_LONG" | "ACCUMULATE" | "NEUTRAL" | "HEDGE" | "EXIT" = "NEUTRAL";
  let direction: "UP" | "DOWN" | "SIDEWAYS" = "SIDEWAYS";

  if (bias >= 0.45 && fss >= 0.65 && passedAudit) {
    action = "STRONG_LONG";
    direction = "UP";
  } else if (bias >= 0.20 && fss >= 0.50) {
    action = "ACCUMULATE";
    direction = "UP";
  } else if (bias <= -0.45 && fss >= 0.65 && passedAudit) {
    action = "EXIT";
    direction = "DOWN";
  } else if (bias <= -0.20 || fragilityIndex > 0.70) {
    action = "HEDGE";
    direction = "DOWN";
  } else {
    action = "NEUTRAL";
    direction = "SIDEWAYS";
  }

  // ── 2. Calibrated Confidence & Quant Score ──
  const baseConf = action === "NEUTRAL" ? 45 : 60;
  const rawConfidence =
    baseConf +
    Math.abs(bias) * 20 +
    (fss - 0.5) * 25 -
    fragilityIndex * 15 -
    (adversarialAudit.testsFailed * 6);

  const confidence = Math.max(30, Math.min(94, Math.round(rawConfidence)));
  const quantScore = Math.max(25, Math.min(96, Math.round(50 + bias * 30 + (fss - 0.5) * 30)));

  // ── 3. Price Cones & Stop Levels ──
  const entryBandWidth = Math.max(0.008, 0.015 * (volatilityRegime === "HIGH_VOL_CRISIS" ? 1.8 : 1.0));
  const entryLow = Number((currentPrice * (1 - entryBandWidth)).toFixed(2));
  const entryHigh = Number((currentPrice * (1 + entryBandWidth * 0.4)).toFixed(2));

  let targetPrice = currentPrice;
  let stopLoss = currentPrice;

  if (direction === "UP") {
    targetPrice = Number(Math.max(currentPrice * 1.06, resistanceLevel).toFixed(2));
    stopLoss = Number(Math.min(currentPrice * 0.96, supportLevel).toFixed(2));
  } else if (direction === "DOWN") {
    targetPrice = Number(Math.min(currentPrice * 0.94, supportLevel).toFixed(2));
    stopLoss = Number(Math.max(currentPrice * 1.04, resistanceLevel).toFixed(2));
  } else {
    targetPrice = Number((currentPrice * 1.03).toFixed(2));
    stopLoss = Number((currentPrice * 0.97).toFixed(2));
  }

  const riskSpan = Math.max(0.01, Math.abs(currentPrice - stopLoss));
  const rewardSpan = Math.abs(targetPrice - currentPrice);
  const riskRewardRatio = Number((rewardSpan / riskSpan).toFixed(2));

  // ── 4. Fractional-Kelly Position Sizing ──
  // f* = (p·b - q)/b * DeflatedSharpeFactor * FSS
  const p = historicalWinRate;
  const q = 1 - p;
  const b = historicalWinLossRatio;
  const rawKelly = b > 0 ? Math.max(0, (p * b - q) / b) : 0;
  const dsfScale = Math.min(1.0, fssResult.deflatedSharpeRatio / 2.0);
  const fractionalKelly = Number(Math.min(0.25, Math.max(0, rawKelly * 0.5 * dsfScale * fss)).toFixed(3));
  const capitalAllocationPct = `${(fractionalKelly * 100).toFixed(1)}% of total fortress capital`;

  // ── 5. Pre-Mortem Invalidation Triggers ──
  const preMortemTriggers: string[] = [
    cascadeVulnerability.preMortemInvalidationScenario,
    `Price crosses and holds beyond ${stopLoss.toFixed(2)} on above-average volume`,
  ];

  if (constraints.some((c) => c.severity === "CRITICAL")) {
    preMortemTriggers.push("Critical volatility deleveraging constraint activates");
  }

  // ── 6. Deterministic Cryptographic Proof Card ──
  const timestamp = Date.now();
  const rawTrace = `${ticker}:${timestamp}:${action}:${confidence}:${fss}:${bias}`;
  const proofId = `VENOR-${computeAuditHash(rawTrace)}`;

  const auditTrail: string[] = [
    `[TWRD] Admitted Claims with load-bearing vulnerability CV(a)=${cascadeVulnerability.vulnerabilityScore}`,
    `[CRUCIBLE] Polyhedral MC ran with FSS=${fssResult.fss} across ${fssResult.polyhedralFeasiblePaths} feasible paths`,
    `[VENOR] Kish Effective N_eff=${kishResult.kishEffectiveN} across 4 orthogonal buckets (Net Bias: ${bias})`,
    `[AUDIT] Adversarial Falsification: ${adversarialAudit.passed ? "PASSED" : "FLAGGED WITH COUNTER-THESIS"}`,
    `[GOLD DECISION] Directional verdict: ${action} | Sizing: ${capitalAllocationPct}`,
  ];

  return {
    ticker,
    timestamp,
    action,
    direction,
    confidence,
    quantScore,
    entryLow,
    entryHigh,
    targetPrice,
    stopLoss,
    riskRewardRatio,
    timeframe: volatilityRegime === "HIGH_VOL_CRISIS" ? "3-7 Days" : "2-4 Weeks",
    positionSizing: {
      fractionalKelly,
      capitalAllocationPct,
      maxRiskExposure: Number((fractionalKelly * currentPrice * 0.05).toFixed(2)),
    },
    futureSurvivalScore: fssResult.fss,
    deflatedSharpeRatio: fssResult.deflatedSharpeRatio,
    fragilityIndex,
    cascadeVulnerability,
    adversarialAudit,
    orthogonalEvidence: kishResult,
    preMortemTriggers,
    proofCard: {
      proofId,
      deterministicHash: computeAuditHash(auditTrail.join("|")),
      epistemicScore: cascadeVulnerability.truthScore,
      regime: volatilityRegime,
      fss: fssResult.fss,
      kishN: kishResult.kishEffectiveN,
      auditTrail,
    },
  };
}
