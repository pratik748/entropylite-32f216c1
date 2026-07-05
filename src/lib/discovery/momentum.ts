// Epistemic momentum μ(x,t) = ∂T/∂t (TRUTH v2 §6.4) — estimated by
// exponentially-weighted least-squares slope over a claim's (or theme's)
// TWRD score history. Finite-difference regression, NOT an analytic
// derivative (the feedback process is not differentiable — per the
// manuscript's own correction).
//
// Interpretation: sustained μ > 0 on a claim cluster = consensus forming
// (narrative momentum); sign disagreement between μ and price momentum is a
// leading indicator candidate. O(n) per call, n = history length.

import type { TruthPoint } from "./types";

export interface EpistemicMomentum {
  /** slope in T-units per day ∈ [−1, 1] practically */
  muPerDay: number;
  /** number of points used */
  n: number;
  /** weighted R² of the linear fit — how trend-like the history is */
  r2: number;
}

const DAY_MS = 86_400_000;

/**
 * EW least-squares slope of T against time.
 * Weights w_i = exp(−ln2 · Δt_i / halfLifeDays) so recent snapshots dominate.
 * Returns null when fewer than 3 points or zero time spread.
 */
export function epistemicMomentum(history: TruthPoint[], halfLifeDays = 7): EpistemicMomentum | null {
  const pts = history.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.T));
  if (pts.length < 3) return null;
  pts.sort((a, b) => a.t - b.t);
  const tLast = pts[pts.length - 1].t;
  const lam = Math.LN2 / Math.max(halfLifeDays, 1e-6);

  let W = 0;
  let mx = 0;
  let my = 0;
  const w: number[] = pts.map((p) => Math.exp((-lam * (tLast - p.t)) / DAY_MS));
  for (let i = 0; i < pts.length; i++) {
    W += w[i];
    mx += w[i] * (pts[i].t / DAY_MS);
    my += w[i] * pts[i].T;
  }
  mx /= W;
  my /= W;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].t / DAY_MS - mx;
    const dy = pts[i].T - my;
    sxx += w[i] * dx * dx;
    sxy += w[i] * dx * dy;
    syy += w[i] * dy * dy;
  }
  if (sxx < 1e-12) return null;
  const slope = sxy / sxx;
  const r2 = syy > 1e-12 ? Math.min(1, (sxy * sxy) / (sxx * syy)) : 0;
  return { muPerDay: slope, n: pts.length, r2 };
}
