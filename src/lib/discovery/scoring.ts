// Opportunity Score — multiplicative gated ranking statistic, computed in
// log space. OS = E_net · R · C · Y · τ · L · N · Q. Each factor is a gate:
// zero robustness or zero liquidity kills the candidate regardless of edge.
// OS is a RANKING statistic, not a return forecast — the UI must label it so.
//
// Edge estimation: precision-weighted (inverse-variance) blend of engine
// forecasts — the Bayesian normal–normal posterior mean — followed by
// James–Stein-style shrinkage toward zero. The shrinkage prior is "the
// market is efficient"; evidence must overcome it.

import type { EngineForecast, OpportunityFactors, OpportunityScoreResult, PublishDecision } from "./types";

// ─── expected edge ───────────────────────────────────────────────

export interface EdgeEstimate {
  /** shrunken expected edge net of costs (return units) */
  eNet: number;
  /** shrinkage factor applied ∈ [0,1] */
  kappa: number;
  /** blended pre-shrinkage forecast */
  muBlend: number;
  /** blend variance */
  s2Blend: number;
}

/** Inverse-variance blend of engine forecasts. */
export function blendForecasts(forecasts: EngineForecast[]): { mu: number; s2: number } | null {
  const valid = forecasts.filter((f) => Number.isFinite(f.mu) && f.s2 > 0);
  if (valid.length === 0) return null;
  let wSum = 0;
  let mSum = 0;
  for (const f of valid) {
    const w = 1 / f.s2;
    wSum += w;
    mSum += w * f.mu;
  }
  return { mu: mSum / wSum, s2: 1 / wSum };
}

/**
 * Shrunken net edge.
 * κ = max(0, 1 − s²_blend / (s²_blend + Var_hist)) when the class's realized
 * edge dispersion is known; a conservative prior κ₀ (default 0.25) otherwise.
 */
export function expectedEdge(
  forecasts: EngineForecast[],
  opts: { costRoundTrip: number; histEdgeVar?: number; priorKappa?: number },
): EdgeEstimate | null {
  const blend = blendForecasts(forecasts);
  if (!blend) return null;
  const kappa =
    opts.histEdgeVar !== undefined && opts.histEdgeVar >= 0
      ? Math.max(0, 1 - blend.s2 / (blend.s2 + opts.histEdgeVar))
      : Math.min(1, Math.max(0, opts.priorKappa ?? 0.25));
  // costs reduce edge magnitude toward zero for both long and short theses
  const shrunk = kappa * blend.mu;
  const eNet = Math.sign(shrunk) * Math.max(0, Math.abs(shrunk) - Math.max(0, opts.costRoundTrip));
  return { eNet, kappa, muBlend: blend.mu, s2Blend: blend.s2 };
}

// ─── individual factors ──────────────────────────────────────────

/** Payoff asymmetry from simulated path returns: Y = 2Ω/(1+Ω) ∈ [0,2]. */
export function payoffAsymmetry(pathReturns: number[], threshold = 0): number {
  if (pathReturns.length === 0) return 1;
  let gains = 0;
  let losses = 0;
  for (const r of pathReturns) {
    if (r > threshold) gains += r - threshold;
    else losses += threshold - r;
  }
  if (losses <= 0) return gains > 0 ? 2 : 1;
  const omega = gains / losses;
  return (2 * omega) / (1 + omega);
}

/** τ = exp(−ln2 · age/halfLife) ∈ (0,1]. */
export function timeliness(ageDays: number, halfLifeDays: number): number {
  if (!(halfLifeDays > 0)) return 1;
  return Math.exp((-Math.LN2 * Math.max(0, ageDays)) / halfLifeDays);
}

/** L = min(1, ADV$/ref). Refine with Almgren–Chriss upstream for big sizes. */
export function liquidityFactor(advUsd: number, refUsd = 5e6): number {
  if (!(advUsd > 0)) return 0.01;
  return Math.min(1, advUsd / refUsd);
}

/** Q = 1/(1 + ciWidth/|eNet|): wide interval relative to edge ⇒ heavy haircut. */
export function confidenceFactor(edgeCiWidth: number, eNet: number): number {
  const denomEdge = Math.abs(eNet);
  if (denomEdge < 1e-12) return 0.01;
  return 1 / (1 + Math.max(0, edgeCiWidth) / denomEdge);
}

// ─── composite ───────────────────────────────────────────────────

const FACTOR_FLOOR = 1e-6;

/**
 * log OS = log E_net + Σ log(factor). Gate: eNet ≤ 0 ⇒ os = 0.
 * `bottleneck` names the multiplicative factor (excluding eNet) costing the
 * most score — the reduced form of TRUTH's cascade-vulnerability /
 * load-bearing-claim report.
 */
export function opportunityScore(factors: OpportunityFactors): OpportunityScoreResult {
  const gates: (keyof OpportunityFactors)[] = [
    "robustness",
    "conviction",
    "asymmetry",
    "timeliness",
    "liquidity",
    "novelty",
    "confidence",
  ];
  if (!(factors.eNet > 0)) {
    return {
      os: 0,
      logOs: -Infinity,
      factors,
      bottleneck: { factor: "eNet", value: factors.eNet, logCost: Infinity },
    };
  }
  let logOs = Math.log(factors.eNet);
  let worst: { factor: keyof OpportunityFactors; value: number; logCost: number } = {
    factor: "robustness",
    value: factors.robustness,
    logCost: 0,
  };
  for (const g of gates) {
    const v = Math.max(FACTOR_FLOOR, factors[g]);
    const cost = -Math.log(Math.min(v, 2)); // asymmetry may exceed 1 (a bonus, negative cost)
    logOs += Math.log(v);
    if (cost > worst.logCost) worst = { factor: g, value: factors[g], logCost: cost };
  }
  return { os: Math.exp(logOs), logOs, factors, bottleneck: worst };
}

// ─── publish gate ────────────────────────────────────────────────

export interface PublishThresholds {
  minPReal: number; // default 0.4
  minFss: number; // default 0.45
  minBuckets: number; // default 2 (orthogonal evidence buckets agreeing)
}

export const DEFAULT_PUBLISH_THRESHOLDS: PublishThresholds = {
  minPReal: 0.4,
  minFss: 0.45,
  minBuckets: 2,
};

/**
 * Aggressive rejection: publish only when every gate passes. All failing
 * reasons are reported — rejected candidates are shown WITH reasons in the
 * debug view, never silently dropped.
 */
export function publishGate(
  c: { eNet: number; pReal: number; fss: number; bucketsAgreeing: number },
  t: PublishThresholds = DEFAULT_PUBLISH_THRESHOLDS,
): PublishDecision {
  const reasons: string[] = [];
  if (!(c.eNet > 0)) reasons.push("non_positive_net_edge");
  if (c.pReal < t.minPReal) reasons.push(`p_real_below_${t.minPReal}`);
  if (c.fss < t.minFss) reasons.push(`fss_below_${t.minFss}`);
  if (c.bucketsAgreeing < t.minBuckets) reasons.push(`buckets_below_${t.minBuckets}`);
  return { publish: reasons.length === 0, reasons };
}
