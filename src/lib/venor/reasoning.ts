/**
 * VENOR Architecture: Orchestrated Reasoning Layer (Zero-LLM Core)
 * 100% Deterministic Adversarial Audits, Kish Fusion, and Cascade Vulnerability
 */

import type {
  OrthogonalSignal,
  KishWeightingResult,
  CascadeVulnerability,
  AdversarialAudit,
  ScarMemoryRecord,
  ClaimRecord,
  TruthScoreResult,
} from "./types";
import { benjaminiHochberg } from "@/lib/quant/validation";

// ─────────────────────────────────────────────────────────────────────────────
// §1 Kish Effective Sample Size & 4-Bucket Orthogonal Fusion
// ─────────────────────────────────────────────────────────────────────────────

export const BUCKET_WEIGHTS: Record<string, number> = {
  QUANT_STATARB: 1.2,
  FUNDAMENTAL: 1.1,
  MICROSTRUCTURE: 1.3,
  MACRO_GEO: 0.9,
};

/**
 * Computes Kish Effective Sample Size: N_eff = (∑ w_i)² / ∑ w_i²
 * Combines orthogonal evidence while discounting intra-bucket correlation.
 */
export function fuseOrthogonalEvidence(signals: OrthogonalSignal[]): KishWeightingResult {
  if (signals.length === 0) {
    return {
      signals: [],
      rawSignalCount: 0,
      kishEffectiveN: 0,
      orthogonalConsensusBias: 0,
      bucketRepresentation: {},
    };
  }

  // Count signals per bucket to downweight intra-bucket redundancy
  const bucketCounts: Record<string, number> = {};
  for (const s of signals) {
    bucketCounts[s.bucket] = (bucketCounts[s.bucket] || 0) + 1;
  }

  // Compute effective weight per signal: w_i = (BucketBase / √count_in_bucket) * confidence
  const weights: number[] = [];
  const adjustedSignals: (OrthogonalSignal & { effWeight: number })[] = [];

  for (const s of signals) {
    const baseW = BUCKET_WEIGHTS[s.bucket] || 1.0;
    const count = bucketCounts[s.bucket] || 1;
    const effW = (baseW / Math.sqrt(count)) * Math.max(0.2, s.confidence);
    weights.push(effW);
    adjustedSignals.push({ ...s, effWeight: effW });
  }

  // Kish N_eff formula
  const sumW = weights.reduce((a, b) => a + b, 0);
  const sumSqW = weights.reduce((a, b) => a + b * b, 0);
  const kishN = sumSqW > 0 ? (sumW * sumW) / sumSqW : 0;

  // Composite net directional score ∈ [-1, 1]
  let weightedDirectionSum = 0;
  for (const s of adjustedSignals) {
    weightedDirectionSum += s.directionalBias * s.effWeight;
  }
  const consensusBias = sumW > 0 ? weightedDirectionSum / sumW : 0;

  return {
    signals,
    rawSignalCount: signals.length,
    kishEffectiveN: Number(kishN.toFixed(2)),
    orthogonalConsensusBias: Number(Math.max(-1, Math.min(1, consensusBias)).toFixed(3)),
    bucketRepresentation: bucketCounts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 Adversarial Falsification & Multi-Testing FDR Control
// ─────────────────────────────────────────────────────────────────────────────

export interface AdversarialCheckInputs {
  ticker: string;
  consensusBias: number; // [-1, 1]
  vix: number;
  fragilityIndex: number;
  gammaPinRisk: boolean;
  liquidityRatio: number;
  candidatePValues?: number[];
}

/**
 * Evaluates stress shocks and applies Benjamini-Hochberg FDR control.
 */
export function runAdversarialAudit(inputs: AdversarialCheckInputs): AdversarialAudit {
  const { consensusBias, vix, fragilityIndex, gammaPinRisk, liquidityRatio, candidatePValues = [0.01, 0.03, 0.04, 0.08] } = inputs;

  let failedTests = 0;
  const testsRun = 4;
  const failureReasons: string[] = [];

  // Test 1: Volatility Shock Reversal Test
  if (vix > 30 && Math.abs(consensusBias) < 0.6) {
    failedTests++;
    failureReasons.push("High macro volatility (VIX > 30) invalidates modest directional bias");
  }

  // Test 2: Fragility Ceiling Test
  if (fragilityIndex > 0.75) {
    failedTests++;
    failureReasons.push("Structural fragility index > 0.75 indicates elevated dislocation risk");
  }

  // Test 3: Liquidity Vacuum Test
  if (liquidityRatio < 0.45) {
    failedTests++;
    failureReasons.push("Thin book liquidity (< 45% avg) amplifies slippage and whipsaw hazard");
  }

  // Test 4: Gamma Pinning Barrier Test
  if (gammaPinRisk && Math.abs(consensusBias) < 0.5) {
    failedTests++;
    failureReasons.push("Dealer gamma strike pin restricts directional expansion");
  }

  // Benjamini-Hochberg FDR control at q = 0.05
  const fdrMask = benjaminiHochberg(candidatePValues, 0.05);
  const numDiscoveries = fdrMask.filter(Boolean).length;
  const fdrPassed = numDiscoveries >= 2;

  const passed = failedTests <= 1 && fdrPassed;
  const stressImpact = failedTests * 2.5 + (vix > 25 ? 3.0 : 0);

  const counterThesis =
    failureReasons.length > 0
      ? failureReasons.join(" | ")
      : "No binding structural vulnerabilities detected under baseline stress shocks.";

  return {
    passed,
    falsificationTestsRun: testsRun,
    testsFailed: failedTests,
    fdrControlPassed: fdrPassed,
    counterThesis,
    stressShockImpactPct: Number(stressImpact.toFixed(1)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 Cascade Vulnerability Matrix (CV(a)) & Load-Bearing Claims
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes Cascade Vulnerability: CV(a) = max_i (1 - T(c_i)) * |∂Verdict / ∂T(c_i)|
 * Pinpoints the single most fragile, load-bearing assumption.
 */
export function computeCascadeVulnerability(
  claims: ClaimRecord[],
  truthScores: TruthScoreResult[],
  consensusBias: number
): CascadeVulnerability {
  if (claims.length === 0 || truthScores.length === 0) {
    return {
      loadBearingClaimId: "none",
      loadBearingClaimDescription: "Baseline statistical continuity without explicit claim dependence",
      truthScore: 1.0,
      sensitivityDelta: 0.1,
      vulnerabilityScore: 0.0,
      preMortemInvalidationScenario: "Direct break of 20-day trailing support level",
    };
  }

  let maxCV = -1;
  let loadBearingClaim: ClaimRecord = claims[0];
  let loadBearingTScore = 1.0;
  let maxSensitivity = 0.5;

  for (const c of claims) {
    const tScoreObj = truthScores.find((t) => t.claimId === c.id);
    const T = tScoreObj ? tScoreObj.score : c.piHatPrior;

    // Sensitivity estimate: fundamental claims have higher load-bearing weight
    const isFundamental = c.category === "FUNDAMENTAL" || c.relation.includes("REVENUE") || c.relation.includes("CAPACITY");
    const sensitivity = isFundamental ? 0.95 : c.category === "MACRO" ? 0.70 : 0.40;

    // CV(a) = (1 - T) * |∂Verdict / ∂T|
    const cv = (1 - T) * sensitivity;

    if (cv > maxCV) {
      maxCV = cv;
      loadBearingClaim = c;
      loadBearingTScore = T;
      maxSensitivity = sensitivity;
    }
  }

  const desc = `${loadBearingClaim.entity} ${loadBearingClaim.relation} ${loadBearingClaim.objectValue}`;
  const preMortem = `Thesis is falsified if ${loadBearingClaim.entity} ${loadBearingClaim.relation} shifts or is officially retracted (Truth Score drops below 0.50).`;

  return {
    loadBearingClaimId: loadBearingClaim.id,
    loadBearingClaimDescription: desc,
    truthScore: Number(loadBearingTScore.toFixed(3)),
    sensitivityDelta: Number(maxSensitivity.toFixed(2)),
    vulnerabilityScore: Number(Math.max(0, maxCV).toFixed(3)),
    preMortemInvalidationScenario: preMortem,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 Consequence-Weighted Scar Memory Sc(m)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the permanent Scar Score:
 * Sc(m) = α · (Realized PnL Error)² + β · InfoDensity − δ · Decay
 */
export function calculateScarScore(
  realizedPnLErrorPct: number,
  infoDensity = 1.0,
  ageInDays = 0,
  alpha = 1.5,
  beta = 0.5,
  delta = 0.02
): number {
  const impactTerm = alpha * Math.pow(Math.abs(realizedPnLErrorPct), 2);
  const infoTerm = beta * Math.min(2.0, infoDensity);
  const decayTerm = delta * Math.max(0, ageInDays);

  return Number(Math.max(0.1, impactTerm + infoTerm - decayTerm).toFixed(3));
}
