/**
 * Calibration Layer — probabilistic foundations for the proprietary engines.
 * ──────────────────────────────────────────────────────────────────────────
 * The audit found CLANK constraint confidences hard-coded (0.65–0.95), ODG
 * scar factors computed from an ad-hoc count ratio, and TWRD/ODG probability
 * outputs never scored against outcomes. This module provides the shared,
 * mathematically grounded machinery:
 *
 *   - Proper scoring rules: Brier score, log loss, reliability curves
 *     (so every probability the platform emits can be audited).
 *   - Decayed Beta-Bernoulli posterior (conjugate, streaming, O(1)) —
 *     replaces running averages for CLANK confidence learning; the same
 *     structure TWRD already uses for source credibility, formalised with
 *     exponential forgetting so the system keeps adapting.
 *   - Empirical-Bayes shrinkage for small-sample proportions (ODG scar).
 *   - Online logistic regression (SGD, L2, bounded weights, serialisable) —
 *     the upgrade path from CLANK's hand-set trigger→probability maps to
 *     coefficients learned from recorded activation events. Mirrors the SGD
 *     TWRD already runs on its truth weights, so one mechanism serves both.
 *
 * Everything is pure/deterministic given inputs and cheap enough to run on
 * every render in the browser; state serialises to a single JSON row in
 * Supabase for persistence.
 */

// ─────────────────────────────────────────────────────────────────
// Proper scoring rules
// ─────────────────────────────────────────────────────────────────

/** Brier score = mean squared error of probability forecasts. 0 is perfect. */
export function brierScore(probs: number[], outcomes: number[]): number | null {
  const n = Math.min(probs.length, outcomes.length);
  if (n === 0) return null;
  let s = 0;
  for (let i = 0; i < n; i++) s += (probs[i] - outcomes[i]) ** 2;
  return s / n;
}

/** Negative log-likelihood per observation (clamped for numerical safety). */
export function logLoss(probs: number[], outcomes: number[]): number | null {
  const n = Math.min(probs.length, outcomes.length);
  if (n === 0) return null;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.min(Math.max(probs[i], 1e-9), 1 - 1e-9);
    s += -(outcomes[i] * Math.log(p) + (1 - outcomes[i]) * Math.log(1 - p));
  }
  return s / n;
}

export interface ReliabilityBin {
  pLow: number; pHigh: number;
  meanForecast: number; meanOutcome: number; n: number;
}

/**
 * Reliability (calibration) curve: bin forecasts, compare mean forecast vs
 * realised frequency. Perfectly calibrated ⇒ points on the diagonal.
 * Feed this the TWRD truth scores, CLANK activation probabilities, and ODG
 * pFavorable vs realised outcomes to make calibration observable in the UI.
 */
export function reliabilityCurve(probs: number[], outcomes: number[], nBins = 10): ReliabilityBin[] {
  const bins: ReliabilityBin[] = Array.from({ length: nBins }, (_, b) => ({
    pLow: b / nBins, pHigh: (b + 1) / nBins, meanForecast: 0, meanOutcome: 0, n: 0,
  }));
  const n = Math.min(probs.length, outcomes.length);
  for (let i = 0; i < n; i++) {
    const b = Math.min(nBins - 1, Math.floor(probs[i] * nBins));
    bins[b].meanForecast += probs[i];
    bins[b].meanOutcome += outcomes[i];
    bins[b].n++;
  }
  for (const b of bins) {
    if (b.n > 0) { b.meanForecast /= b.n; b.meanOutcome /= b.n; }
  }
  return bins;
}

// ─────────────────────────────────────────────────────────────────
// Decayed Beta-Bernoulli posterior
// ─────────────────────────────────────────────────────────────────

export interface BetaState { alpha: number; beta: number; }

/**
 * Streaming Beta posterior update with exponential forgetting:
 *   α ← λ·α + y,   β ← λ·β + (1 − y),   y ∈ [0,1] (fractional evidence OK)
 *
 * λ < 1 bounds the effective sample size at 1/(1−λ), so the posterior mean
 * behaves like a properly normalised EWMA of outcomes with prior anchoring —
 * the estimator keeps adapting instead of freezing as n → ∞ (the flaw in a
 * plain running average). λ = 0.98 ⇒ effective memory ≈ 50 outcomes.
 */
export function betaUpdate(state: BetaState, y: number, lambda = 0.98): BetaState {
  const yc = Math.min(Math.max(y, 0), 1);
  return { alpha: lambda * state.alpha + yc, beta: lambda * state.beta + (1 - yc) };
}

/** Posterior mean. */
export const betaMean = (s: BetaState) => s.alpha / Math.max(s.alpha + s.beta, 1e-12);

/** Posterior variance — use for "confidence about the confidence" displays. */
export function betaVariance(s: BetaState): number {
  const n = s.alpha + s.beta;
  return (s.alpha * s.beta) / Math.max(n * n * (n + 1), 1e-12);
}

/** Build a prior with a given mean and equivalent-sample-size strength. */
export function betaPrior(mean: number, strength = 10): BetaState {
  const m = Math.min(Math.max(mean, 0.01), 0.99);
  return { alpha: m * strength, beta: (1 - m) * strength };
}

/**
 * Empirical-Bayes shrunk proportion:
 *   p̂ = (successes + κ·p₀) / (trials + κ)
 * Shrinks small-sample frequencies toward the prior p₀ with strength κ.
 * This is the posterior mean of Beta(κp₀, κ(1−p₀)) after `trials` Bernoulli
 * observations — the standard fix for noisy small-n proportions (scar memory,
 * per-ticker hit rates, per-regime win rates).
 */
export function shrunkProportion(successes: number, trials: number, priorMean = 0.5, priorStrength = 5): number {
  if (trials < 0 || successes < 0) return priorMean;
  return (successes + priorStrength * priorMean) / (trials + priorStrength);
}

// ─────────────────────────────────────────────────────────────────
// Online logistic regression
// ─────────────────────────────────────────────────────────────────

export interface LogitModelState {
  weights: number[];
  bias: number;
  nObs: number;
}

/**
 * Online logistic regression with SGD, L2 regularisation and bounded weights.
 * p(y=1|x) = σ(wᵀx + b).
 *
 * Intended CLANK wiring (see docs/QUANT_UPGRADE_SPEC.md §CLANK): one model
 * per constraint with features x = [proximity, vix/40, realizedVol/40,
 * |drawdown|·5, regimeFlag]; the model's p replaces the hand-set
 * `proximity × confidence` product once nObs ≥ 30, blending via
 * w_n = n/(n+n₀) before that. State serialises to one JSON column.
 */
export class OnlineLogit {
  weights: number[];
  bias: number;
  nObs: number;
  private readonly lr: number;
  private readonly l2: number;
  private readonly bound: number;

  constructor(nFeatures: number, opts?: { lr?: number; l2?: number; bound?: number; state?: LogitModelState }) {
    this.lr = opts?.lr ?? 0.3;
    this.l2 = opts?.l2 ?? 1e-3;
    this.bound = opts?.bound ?? 4;
    if (opts?.state && opts.state.weights.length === nFeatures) {
      this.weights = opts.state.weights.slice();
      this.bias = opts.state.bias;
      this.nObs = opts.state.nObs;
    } else {
      this.weights = new Array(nFeatures).fill(0);
      this.bias = 0;
      this.nObs = 0;
    }
  }

  predict(x: number[]): number {
    let z = this.bias;
    for (let i = 0; i < this.weights.length; i++) z += this.weights[i] * (x[i] ?? 0);
    return 1 / (1 + Math.exp(-z));
  }

  /** One SGD step toward outcome y ∈ [0,1]. Learning rate decays as 1/√n
   *  with a slow schedule (η halves every ~300 obs) so the model keeps
   *  adapting at the sample sizes this platform sees. */
  update(x: number[], y: number): number {
    const p = this.predict(x);
    const g = p - Math.min(Math.max(y, 0), 1);
    const eta = this.lr / Math.sqrt(1 + this.nObs / 100);
    for (let i = 0; i < this.weights.length; i++) {
      const w = this.weights[i] - eta * (g * (x[i] ?? 0) + this.l2 * this.weights[i]);
      this.weights[i] = Math.max(-this.bound, Math.min(this.bound, w));
    }
    this.bias = Math.max(-this.bound, Math.min(this.bound, this.bias - eta * g));
    this.nObs++;
    return p;
  }

  /**
   * Prediction blended with a prior probability while the model is young:
   *   p̂ = (n₀·prior + n·p_model) / (n₀ + n)
   * Guarantees graceful degradation to the registry prior at n = 0.
   */
  predictBlended(x: number[], prior: number, priorStrength = 30): number {
    const p = this.predict(x);
    const n = this.nObs;
    return (priorStrength * prior + n * p) / (priorStrength + n);
  }

  serialize(): LogitModelState {
    return { weights: this.weights.slice(), bias: this.bias, nObs: this.nObs };
  }
}
