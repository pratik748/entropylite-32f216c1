// TWRD failure-mode guards — false consensus, adversarial spikes, stale facts, overfit drift.

import type { VeracityMeta, TwrdDomain } from "./types.ts";
import { decay } from "./truth.ts";

/** Shannon entropy of a categorical distribution, normalised to [0,1]. */
export function shannonEntropyNormalised(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n <= 0 || counts.length <= 1) return 0;
  let H = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / n;
    H -= p * Math.log2(p);
  }
  const Hmax = Math.log2(counts.length);
  return Hmax > 0 ? Math.max(0, Math.min(1, H / Hmax)) : 0;
}

/** False consensus: high agreement, low source diversity, rising contradiction. */
export function isFalseConsensus(opts: {
  agreement: number;
  sourceEntropy: number;
  contradictionRisk: number;
}): boolean {
  return opts.agreement > 0.85 && opts.sourceEntropy < 0.35 && opts.contradictionRisk > 0.25;
}

/** Adversarial spike: claim velocity vs baseline, or many <30d sources dominating. */
export function isAdversarialSpike(opts: {
  velocity: number;          // claims/min currently
  baselineVelocity: number;  // claims/min long-run baseline for this topic
  newSourceShare: number;    // share of sources <30 days old, [0,1]
}): boolean {
  const velSpike = opts.baselineVelocity > 0 && opts.velocity / opts.baselineVelocity > 10;
  return velSpike || opts.newSourceShare > 0.6;
}

/** Stale fact: temporal decay below floor. */
export function isStale(ageSeconds: number, domain: TwrdDomain): boolean {
  return decay(ageSeconds, domain) < 0.2;
}

/** Compose veracity meta from raw signals. */
export function buildVeracityMeta(opts: {
  T: number;
  S: number;
  A: number;
  contradictionRisk: number;
  sourceEntropy: number;
  ageSeconds: number;
  domain: TwrdDomain;
  velocity?: number;
  baselineVelocity?: number;
  newSourceShare?: number;
  kIndependent: number;
  meanThetaValue: number;
}): VeracityMeta {
  return {
    T: opts.T,
    S: opts.S,
    A: opts.A,
    contradictionRisk: opts.contradictionRisk,
    falseConsensus: isFalseConsensus({
      agreement: opts.A,
      sourceEntropy: opts.sourceEntropy,
      contradictionRisk: opts.contradictionRisk,
    }),
    staleFact: isStale(opts.ageSeconds, opts.domain),
    adversarialSpike: isAdversarialSpike({
      velocity: opts.velocity ?? 0,
      baselineVelocity: opts.baselineVelocity ?? 0,
      newSourceShare: opts.newSourceShare ?? 0,
    }),
    kIndependent: opts.kIndependent,
    meanTheta: opts.meanThetaValue,
  };
}