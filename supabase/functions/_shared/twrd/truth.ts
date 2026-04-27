// TWRD TRUTH Engine — pure, streaming-friendly, normalised to [0,1]
// Implements: T(x,t) = σ(w1S + w2A + w3D − w4B − w5C + b)

import {
  type TruthFactors,
  type Weights,
  type TwrdDomain,
  HALF_LIFE_SECONDS,
} from "./types.ts";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** S — Beta posterior mean θ = α / (α+β) */
export function sourceCredibility(alpha: number, beta: number): number {
  const denom = alpha + beta;
  if (denom <= 0) return 0.5;
  return clamp01(alpha / denom);
}

/** Mean credibility over a (deduped) set of source thetas */
export function meanTheta(thetas: number[]): number {
  if (!thetas.length) return 0;
  return thetas.reduce((a, b) => a + b, 0) / thetas.length;
}

/** A — Noisy-OR agreement.  A = 1 − Π(1 − θ_i) */
export function agreement(thetas: number[]): number {
  if (!thetas.length) return 0;
  let prod = 1;
  for (const t of thetas) prod *= 1 - clamp01(t);
  return clamp01(1 - prod);
}

/** Streaming agreement update: A_new = 1 − (1−A_old)(1−θ_new) */
export function updateAgreement(Aold: number, thetaNew: number): number {
  return clamp01(1 - (1 - clamp01(Aold)) * (1 - clamp01(thetaNew)));
}

/** D — exponential decay. λ_d derived from domain half-life. */
export function decay(deltaSeconds: number, domain: TwrdDomain): number {
  const halfLife = HALF_LIFE_SECONDS[domain] ?? HALF_LIFE_SECONDS.financial;
  const lambda = Math.LN2 / halfLife;
  return clamp01(Math.exp(-lambda * Math.max(0, deltaSeconds)));
}

/** B — bias penalty. δ default 0.5 (TWRD §5.2.4). */
export function biasPenalty(biasHat: number, delta = 0.5): number {
  return clamp01(delta * clamp01(biasHat));
}

/** C — contradiction penalty. ε default 0.6 (TWRD §5.2.5). */
export function contradictionPenalty(maxContradictorT: number, eps = 0.6): number {
  return clamp01(eps * clamp01(maxContradictorT));
}

/** Central TRUTH function. */
export function truthScore(f: TruthFactors, w: Weights): number {
  const z = w.w1 * f.S + w.w2 * f.A + w.w3 * f.D - w.w4 * f.B - w.w5 * f.C + w.b;
  return clamp01(sigmoid(z));
}

/** Convenience: build factors and compute T in one shot. */
export function computeTruth(opts: {
  thetas: number[];               // already deduped by source independence
  ageSeconds: number;
  domain: TwrdDomain;
  biasHat?: number;
  maxContradictorT?: number;
  weights: Weights;
  piHatCap?: number;              // upper cap from cleaner (e.g. 0.45 speculative)
}): { T: number; factors: TruthFactors } {
  const factors: TruthFactors = {
    S: meanTheta(opts.thetas),
    A: agreement(opts.thetas),
    D: decay(opts.ageSeconds, opts.domain),
    B: biasPenalty(opts.biasHat ?? 0),
    C: contradictionPenalty(opts.maxContradictorT ?? 0),
  };
  let T = truthScore(factors, opts.weights);
  if (typeof opts.piHatCap === "number") T = Math.min(T, opts.piHatCap);
  return { T: clamp01(T), factors };
}