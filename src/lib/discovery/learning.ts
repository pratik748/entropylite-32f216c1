// Continuous learning — consequence-weighted memory + regime-conditional
// reliability (TRUTH Scar Memory §8, reduced to realized-outcome attribution;
// the simulated ∂O/∂m gradient was rejected as marginal — see
// docs/TRUTH_TO_ENTROPYLITE_MAP.md #13).
//
// Reuses the audited estimators in src/lib/quant/calibration.ts:
//   betaUpdate  — decayed Beta-Bernoulli (bounded effective memory)
//   betaMean    — posterior mean
// Storage: public.engine_regime_stats (one row per engine × regime) and the
// new scar columns on public.scar_memory.

import { betaUpdate, betaMean, type BetaState } from "@/lib/quant/calibration";
import type { ReliabilityCell } from "./types";

// ─── per-(engine × regime) reliability ───────────────────────────

export function newReliabilityCell(priorMean = 0.55, strength = 10): ReliabilityCell {
  const m = Math.min(0.99, Math.max(0.01, priorMean));
  return { alpha: m * strength, beta: (1 - m) * strength, n: 0 };
}

/**
 * Record one outcome (hit ∈ {0,1} or fractional) with exponential
 * forgetting λ — effective memory 1/(1−λ) ≈ 50 outcomes at the default.
 */
export function updateReliability(cell: ReliabilityCell, hit: number, lambda = 0.98): ReliabilityCell {
  const s: BetaState = betaUpdate({ alpha: cell.alpha, beta: cell.beta }, hit, lambda);
  return { alpha: s.alpha, beta: s.beta, n: cell.n + 1 };
}

/**
 * Empirical-Bayes estimate for the cell: shrink the cell posterior toward
 * the engine's marginal reliability with prior strength κ. Cells with little
 * evidence ≈ the marginal; cells with ~50+ effective outcomes speak for
 * themselves. This is what runConsensus should read instead of a static
 * per-engine prior.
 */
export function reliabilityEstimate(cell: ReliabilityCell, engineMarginal = 0.55, priorStrength = 10): number {
  const nEff = cell.alpha + cell.beta;
  const cellMean = betaMean({ alpha: cell.alpha, beta: cell.beta });
  const m = Math.min(0.99, Math.max(0.01, engineMarginal));
  return (nEff * cellMean + priorStrength * m) / (nEff + priorStrength);
}

// ─── scar scoring ────────────────────────────────────────────────

export interface ScarInput {
  /** |realized PnL error| / reference risk (e.g. expected loss at stop); ≥ 0 */
  pnlErrRatio: number;
  /** novelty of the failure context ∈ [0,1] (claimNovelty over context buckets) */
  contextNovelty: number;
  /** independent failures observed in the same context bucket */
  corroboration: number;
  /** age of the failure in days */
  ageDays: number;
  /** decay half-life (default 90d) */
  halfLifeDays?: number;
}

export const SCAR_WEIGHTS = { alpha: 0.5, beta: 0.2, gamma: 0.2, delta: 0.1 } as const;

/**
 * Sc(m) = α·min(1, pnlErrRatio)² + β·novelty + γ·min(1, corroboration/3)
 *         − δ·(1 − 2^(−age/halfLife))                        ∈ [0, 1]
 * Consequence magnitude dominates (α), per the consequence-driven memory
 * principle: the lesson that cost the most, weighs the most.
 */
export function scarScore(input: ScarInput): number {
  const hl = input.halfLifeDays ?? 90;
  const impact = Math.min(1, Math.max(0, input.pnlErrRatio));
  const nov = Math.min(1, Math.max(0, input.contextNovelty));
  const corr = Math.min(1, Math.max(0, input.corroboration) / 3);
  const decay = 1 - Math.pow(2, -Math.max(0, input.ageDays) / Math.max(hl, 1e-6));
  const sc =
    SCAR_WEIGHTS.alpha * impact * impact +
    SCAR_WEIGHTS.beta * nov +
    SCAR_WEIGHTS.gamma * corr -
    SCAR_WEIGHTS.delta * decay;
  return Math.min(1, Math.max(0, sc));
}

export function quantileOf(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1));
  return s[idx];
}

/**
 * Permanent scar status (never decays, permanently penalises re-publishing
 * this context via odg-validator's scar hazard) iff the score reaches the
 * 0.85-quantile of trailing scar scores AND the failure was independently
 * corroborated (≥ 2 failures in the same context bucket). Rare by design.
 */
export function shouldScar(sc: number, trailingScores: number[], corroboration: number): boolean {
  if (corroboration < 2) return false;
  if (trailingScores.length < 5) return sc >= 0.75; // cold-start absolute bar
  return sc >= quantileOf(trailingScores, 0.85);
}
