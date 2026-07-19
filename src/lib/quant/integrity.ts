/**
 * Model integrity — the layer that makes every headline number audit itself.
 * ─────────────────────────────────────────────────────────────────────────
 * Aladdin-grade credibility is not more decimals; it is each figure carrying
 * (a) its estimation uncertainty and (b) an out-of-sample check against the
 * data that produced it. This module provides:
 *
 *  - Kupiec (1995) proportion-of-failures VaR backtest, run WALKING
 *    out-of-sample: each day's loss is compared against the VaR estimated
 *    from the trailing window that ended the day before — never in-sample.
 *  - Sharpe uncertainty via Lo (2002)/Mertens (2002) standard errors and the
 *    Probabilistic Sharpe Ratio (Bailey & López de Prado) vs 0.
 *  - A chi-square confidence interval for realized volatility
 *    (Wilson–Hilferty quantile approximation, stated).
 *
 * Everything returns null on insufficient data; nothing substitutes a
 * default for a number it cannot honestly compute.
 */

import { normCDF, normInv, mean, stdev } from "@/lib/quant/institutional";
import { sharpeStdErr, probabilisticSharpe } from "@/lib/quant/validation";

const TRADING_DAYS = 252;

// ─────────────────────────────────────────────────────────────────
// Kupiec proportion-of-failures VaR backtest
// ─────────────────────────────────────────────────────────────────

export type VarVerdict = "consistent" | "underestimates risk" | "overestimates risk";

export interface KupiecResult {
  /** Out-of-sample days tested. */
  tests: number;
  breaches: number;
  breachRate: number;
  expectedRate: number;
  /** Kupiec likelihood ratio (χ² with 1 dof under H₀). */
  lr: number;
  /** P(observing this breach count | VaR model is correct). */
  pValue: number;
  verdict: VarVerdict;
}

/** χ²(1) survival function via the normal: P(X > x) = 2(1 − Φ(√x)). */
export function chi2Sf1(x: number): number {
  if (x <= 0) return 1;
  return Math.max(0, Math.min(1, 2 * (1 - normCDF(Math.sqrt(x)))));
}

/**
 * Walking out-of-sample historical-VaR backtest. For each day t ≥ window,
 * VaR is the empirical `1 − confidence` quantile of the PRIOR `window`
 * returns; a breach is r_t below that quantile. The Kupiec POF likelihood
 * ratio then asks whether the realized breach frequency is statistically
 * compatible with the promised coverage.
 */
export function kupiecBacktest(
  returns: number[],
  opts: { window?: number; confidence?: number } = {},
): KupiecResult | null {
  const window = opts.window ?? 60;
  const confidence = opts.confidence ?? 0.95;
  const n = returns.length;
  if (n < window + 30 || confidence <= 0.5 || confidence >= 1) return null;

  const p = 1 - confidence; // promised breach probability
  let tests = 0;
  let breaches = 0;
  for (let t = window; t < n; t++) {
    const prior = returns.slice(t - window, t).slice().sort((a, b) => a - b);
    const idx = Math.max(0, Math.min(prior.length - 1, Math.floor(p * prior.length)));
    const varQuantile = prior[idx]; // negative return level
    tests += 1;
    if (returns[t] < varQuantile) breaches += 1;
  }
  if (tests === 0) return null;

  const x = breaches;
  const rate = x / tests;
  // LR_POF = −2 ln[ (1−p)^{n−x} p^x ] + 2 ln[ (1−x/n)^{n−x} (x/n)^x ]
  const ll0 = (tests - x) * Math.log(1 - p) + x * Math.log(p);
  const ll1 = x === 0 || x === tests
    ? 0 // degenerate MLE terms vanish (0·ln0 → 0)
    : (tests - x) * Math.log(1 - rate) + x * Math.log(rate);
  const lr = Math.max(0, -2 * (ll0 - ll1));
  const pValue = chi2Sf1(lr);

  const verdict: VarVerdict =
    pValue >= 0.05 ? "consistent" : rate > p ? "underestimates risk" : "overestimates risk";

  return { tests, breaches: x, breachRate: rate, expectedRate: p, lr, pValue, verdict };
}

// ─────────────────────────────────────────────────────────────────
// Sharpe with uncertainty
// ─────────────────────────────────────────────────────────────────

export interface SharpeReport {
  sharpeAnnual: number;
  /** Lo/Mertens standard error of the ANNUALIZED Sharpe. */
  seAnnual: number;
  /** P(true Sharpe > 0 | observed), skew/kurtosis-adjusted. */
  psrVsZero: number;
  skew: number;
  kurtosis: number; // raw (3 = Gaussian)
  n: number;
}

/** Sample skewness and raw kurtosis. */
export function sampleMoments(rets: number[]): { skew: number; kurtosis: number } | null {
  const n = rets.length;
  if (n < 20) return null;
  const m = mean(rets);
  const sd = stdev(rets);
  if (!(sd > 0)) return null;
  let s3 = 0, s4 = 0;
  for (const r of rets) {
    const z = (r - m) / sd;
    s3 += z ** 3;
    s4 += z ** 4;
  }
  return { skew: s3 / n, kurtosis: s4 / n };
}

/**
 * Annualized Sharpe with its Lo (2002) standard error and PSR vs 0.
 * The SE is computed on the daily SR and scaled by √252 — the same scaling
 * the point estimate uses, so the ± band is in the units on screen.
 */
export function sharpeReport(dailyRets: number[]): SharpeReport | null {
  const n = dailyRets.length;
  if (n < 30) return null;
  const m = mean(dailyRets);
  const sd = stdev(dailyRets);
  if (!(sd > 0)) return null;
  const moments = sampleMoments(dailyRets);
  if (!moments) return null;
  const srDaily = m / sd;
  const seDaily = sharpeStdErr(srDaily, n, moments.skew, moments.kurtosis);
  if (!isFinite(seDaily)) return null;
  return {
    sharpeAnnual: srDaily * Math.sqrt(TRADING_DAYS),
    seAnnual: seDaily * Math.sqrt(TRADING_DAYS),
    psrVsZero: probabilisticSharpe(srDaily, 0, n, moments.skew, moments.kurtosis),
    skew: moments.skew,
    kurtosis: moments.kurtosis,
    n,
  };
}

// ─────────────────────────────────────────────────────────────────
// Volatility confidence interval
// ─────────────────────────────────────────────────────────────────

/** Wilson–Hilferty χ² quantile: χ²_q(k) ≈ k·(1 − 2/(9k) + z_q·√(2/(9k)))³. */
export function chi2QuantileWH(q: number, k: number): number {
  const z = normInv(q);
  const a = 2 / (9 * k);
  return k * Math.pow(1 - a + z * Math.sqrt(a), 3);
}

export interface VolCI {
  sigmaAnnual: number;
  lowAnnual: number;
  highAnnual: number;
  confidence: number;
  n: number;
}

/**
 * Chi-square CI for annualized volatility from a daily σ estimate:
 * [ σ·√((n−1)/χ²_{1−α/2}), σ·√((n−1)/χ²_{α/2}) ], Wilson–Hilferty quantiles.
 * Assumes i.i.d. returns — stated, and the reason the band is a floor on
 * honest uncertainty rather than a ceiling.
 */
export function volatilityCI(sigmaDaily: number, n: number, confidence = 0.95): VolCI | null {
  if (!(sigmaDaily > 0) || n < 30 || confidence <= 0.5 || confidence >= 1) return null;
  const alpha = 1 - confidence;
  const k = n - 1;
  const hi = chi2QuantileWH(1 - alpha / 2, k);
  const lo = chi2QuantileWH(alpha / 2, k);
  if (!(hi > 0) || !(lo > 0)) return null;
  const ann = Math.sqrt(TRADING_DAYS);
  return {
    sigmaAnnual: sigmaDaily * ann,
    lowAnnual: sigmaDaily * Math.sqrt(k / hi) * ann,
    highAnnual: sigmaDaily * Math.sqrt(k / lo) * ann,
    confidence,
    n,
  };
}
