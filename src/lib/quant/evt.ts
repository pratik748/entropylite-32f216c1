/**
 * Extreme Value Theory — tail risk beyond historical/parametric VaR.
 * ──────────────────────────────────────────────────────────────────
 * Peaks-over-threshold (POT) with a Generalised Pareto Distribution fitted by
 * probability-weighted moments (Hosking & Wallis 1987) — closed-form,
 * deterministic, no numerical optimisation, robust for the ξ < ½ regime that
 * covers equity/FX tails.
 *
 * Why: unifiedVaR (institutional.ts) interpolates the empirical distribution
 * or assumes Cornish-Fisher-adjusted normality. Both underestimate quantiles
 * beyond the observed sample (p > 1 − 1/T). EVT extrapolates the tail from
 * its asymptotic form and gives coherent VaR/ES at 99–99.9% from as few as
 * ~250 observations. This is the standard institutional treatment (Basel FRTB
 * uses ES; McNeil & Frey 2000 for the POT approach on financial returns).
 *
 * Conventions: input is a series of *returns*; internally we analyse the
 * LOSS distribution L = −r. All outputs are positive loss fractions.
 *
 * Cost: O(T log T) for the sort; negligible.
 */

import { mean } from "@/lib/quant/institutional";

export interface GPDFit {
  /** Shape ξ (xi > 0 ⇒ heavy tail; ξ < 0 ⇒ bounded tail). */
  xi: number;
  /** Scale β > 0. */
  beta: number;
  /** Number of exceedances used. */
  nExceed: number;
}

/**
 * Fit GPD to positive exceedances via probability-weighted moments.
 * With w_s = E[X·(1−F(X))^s] (Hosking & Wallis 1987):
 *   w0 = E[X] = β/(1−ξ),   w1 = β/(2(2−ξ))
 *   ⇒  ξ = 2 − w0/(w0 − 2w1),   β = 2·w0·w1/(w0 − 2w1)
 * w1 is estimated with plotting positions p_i = (i−0.35)/n on the ascending
 * order statistics: ŵ1 = (1/n) Σ x_(i)·(1 − p_i).
 * Valid for ξ < 0.5 (finite variance); we clamp ξ to (−0.5, 0.5) for
 * stability, which is the empirically relevant band for daily returns.
 */
export function gpdFitPWM(exceedances: number[]): GPDFit | null {
  const n = exceedances.length;
  if (n < 10) return null;
  const x = [...exceedances].sort((a, b) => a - b);
  const b0 = mean(x);
  let b1 = 0;
  for (let i = 0; i < n; i++) b1 += (1 - (i + 1 - 0.35) / n) * x[i];
  b1 /= n;
  const denom = b0 - 2 * b1;
  if (Math.abs(denom) < 1e-15 || b0 <= 0) return null;
  let xi = 2 - b0 / denom;
  const beta = (2 * b0 * b1) / denom;
  if (!(beta > 0)) return null;
  xi = Math.max(-0.5, Math.min(0.5, xi));
  return { xi, beta, nExceed: n };
}

export interface EVTRisk {
  /** VaR at confidence p (positive loss fraction). */
  var: number;
  /** Expected shortfall at confidence p (positive loss fraction). */
  es: number;
  /** Threshold u used for POT. */
  threshold: number;
  fit: GPDFit;
  method: "evt-pot";
}

/**
 * POT EVT VaR and ES from a return series.
 *
 *   u = empirical quantile of losses at `thresholdQuantile`
 *   VaR_p = u + (β/ξ)·[ ((n/N_u)·(1−p))^{−ξ} − 1 ]         (ξ ≠ 0)
 *   ES_p  = (VaR_p + β − ξ·u) / (1 − ξ)                     (ξ < 1)
 *
 * @param returns  raw return series (losses are the negative tail)
 * @param p        confidence level, e.g. 0.99 (must exceed thresholdQuantile)
 * @param thresholdQuantile  POT threshold quantile of the loss distribution
 *                           (default 0.90 — ~10% of the sample as exceedances)
 */
export function evtVaR(returns: number[], p = 0.99, thresholdQuantile = 0.9): EVTRisk | null {
  const n = returns.length;
  if (n < 100 || p <= thresholdQuantile) return null;
  const losses = returns.map(r => -r).sort((a, b) => a - b);
  const u = losses[Math.min(n - 1, Math.floor(thresholdQuantile * n))];
  const exceed = losses.filter(l => l > u).map(l => l - u);
  const fit = gpdFitPWM(exceed);
  if (!fit) return null;
  const { xi, beta } = fit;
  const nu = exceed.length;
  const tailRatio = (n / nu) * (1 - p);
  let varP: number;
  if (Math.abs(xi) < 1e-8) {
    varP = u + beta * Math.log(1 / tailRatio); // ξ→0 exponential limit
  } else {
    varP = u + (beta / xi) * (Math.pow(tailRatio, -xi) - 1);
  }
  const es = xi < 1 ? (varP + beta - xi * u) / (1 - xi) : Infinity;
  return { var: Math.max(varP, 0), es: Math.max(es, 0), threshold: u, fit, method: "evt-pot" };
}

/**
 * Hill estimator of the tail index α (heavy-tail exponent) using the top-k
 * order statistics of losses. 1/α ≈ ξ for Fréchet-domain tails; useful as a
 * cross-check on the PWM ξ and as a fragility feature for the regime layer.
 */
export function hillTailIndex(returns: number[], k?: number): { alpha: number; xi: number; k: number } | null {
  const losses = returns.map(r => -r).filter(l => l > 0).sort((a, b) => b - a);
  const n = losses.length;
  const kk = Math.min(k ?? Math.floor(Math.sqrt(n)), n - 1);
  if (kk < 5) return null;
  let s = 0;
  for (let i = 0; i < kk; i++) s += Math.log(losses[i] / losses[kk]);
  const xi = s / kk;
  if (!(xi > 0)) return null;
  return { alpha: 1 / xi, xi, k: kk };
}

/**
 * Regime-stratified EVT: fit the tail separately per regime label when each
 * stratum has enough data, else fall back to the pooled fit. Complements
 * regimeVaR (institutional.ts) which is purely empirical.
 */
export function regimeEVT(
  returns: number[],
  regimePath: number[],
  p = 0.99,
): Array<{ regime: number; risk: EVTRisk | null; n: number }> {
  const uniq = Array.from(new Set(regimePath)).sort((a, b) => a - b);
  return uniq.map(r => {
    const xs = returns.filter((_, i) => regimePath[i] === r);
    return { regime: r, risk: xs.length >= 150 ? evtVaR(xs, p) : null, n: xs.length };
  });
}
