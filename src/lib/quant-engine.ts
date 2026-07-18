/**
 * Cutting-edge Quantitative Engine
 * ─────────────────────────────────
 * All inputs derived from REAL historical price series (no proxies).
 * Used by VaR, CVaR, Monte Carlo, Merton, correlation modules.
 *
 * Conventions:
 *   - Returns are LOG returns: r_t = ln(P_t / P_{t-1})
 *   - σ (sigma) is daily stdev of log-returns (SAMPLE stdev, ddof = 1)
 *   - μ (mu) is mean daily log-return
 *   - Annualized: σ_y = σ * √252, μ_y = μ * 252
 *   - Risk-adjusted ratios are excess over ANNUAL_RISK_FREE (one system-wide
 *     assumption, mirrored by supabase/functions/_shared/stats.ts)
 */

import { riskFreeFor } from "@/lib/riskFree";

/**
 * Default risk-free assumption (annual, decimal) = the USD snapshot rate
 * from the risk-free architecture (src/lib/riskFree.ts). Currency-aware
 * callers must pass `riskFreeFor(currency).annualRate` explicitly.
 */
export const ANNUAL_RISK_FREE = riskFreeFor("USD").annualRate;
export const TRADING_DAYS = 252;

export interface PriceSeries {
  closes: number[];
  volumes?: number[];
  timestamps?: number[];
}

export interface AssetStats {
  ticker: string;
  n: number;            // sample size
  mu: number;           // mean daily log-return
  sigma: number;        // daily stdev of log-returns
  muAnnual: number;     // annualized drift
  sigmaAnnual: number;  // annualized vol
  skew: number;         // 3rd moment
  kurtosis: number;     // 4th moment (excess)
  maxDD: number;        // realized max drawdown (negative)
  jumpProb: number;     // empirical prob of |r| > 3σ events
  jumpSize: number;     // mean of those jump returns (signed)
  lastPrice: number;
}

// ── 1. Log returns ───────────────────────────────────────────────
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) {
      out.push(Math.log(closes[i] / closes[i - 1]));
    }
  }
  return out;
}

// ── 2. Mean / variance / stdev ───────────────────────────────────
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function variance(xs: number[], ddof = 1): number {
  if (xs.length <= ddof) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - ddof);
}

export const stdev = (xs: number[], ddof = 1) => Math.sqrt(variance(xs, ddof));

// ── 3. Higher moments ────────────────────────────────────────────
export function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s === 0) return 0;
  let acc = 0;
  for (const x of xs) acc += ((x - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * acc;
}

export function excessKurtosis(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return 0;
  const m = mean(xs);
  const s = stdev(xs);
  if (s === 0) return 0;
  let acc = 0;
  for (const x of xs) acc += ((x - m) / s) ** 4;
  const num = (n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3));
  const corr = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return num * acc - corr;
}

// ── 4. Drawdown (realized) ───────────────────────────────────────
export function maxDrawdown(closes: number[]): number {
  let peak = closes[0] ?? 1;
  let mdd = 0;
  for (const p of closes) {
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd; // negative
}

// ── 5. Empirical jump detection (Merton-style) ──────────────────
export function jumpStats(rets: number[]): { jumpProb: number; jumpSize: number } {
  if (rets.length < 30) return { jumpProb: 0, jumpSize: 0 };
  const s = stdev(rets);
  const threshold = 3 * s;
  const jumps = rets.filter(r => Math.abs(r) > threshold);
  if (jumps.length === 0) return { jumpProb: 0, jumpSize: 0 };
  return {
    jumpProb: jumps.length / rets.length,
    jumpSize: mean(jumps),
  };
}

// ── 6. Master per-asset stats ────────────────────────────────────
export function computeAssetStats(ticker: string, series: PriceSeries): AssetStats | null {
  const closes = series.closes ?? [];
  if (closes.length < 30) return null;
  const rets = logReturns(closes);
  if (rets.length < 20) return null;

  const mu = mean(rets);
  const sigma = stdev(rets);
  const { jumpProb, jumpSize } = jumpStats(rets);

  return {
    ticker,
    n: rets.length,
    mu,
    sigma,
    muAnnual: mu * 252,
    sigmaAnnual: sigma * Math.sqrt(252),
    skew: skewness(rets),
    kurtosis: excessKurtosis(rets),
    maxDD: maxDrawdown(closes),
    jumpProb,
    jumpSize,
    lastPrice: closes[closes.length - 1],
  };
}

// ── 7. Correlation & covariance matrices ────────────────────────
function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

export function correlationMatrix(seriesByTicker: Record<string, PriceSeries>): {
  tickers: string[]; matrix: number[][];
} {
  const tickers = Object.keys(seriesByTicker);
  const retsByT: Record<string, number[]> = {};
  let minLen = Infinity;
  for (const t of tickers) {
    const r = logReturns(seriesByTicker[t].closes);
    retsByT[t] = r;
    if (r.length < minLen) minLen = r.length;
  }
  // Align tail
  for (const t of tickers) retsByT[t] = retsByT[t].slice(-minLen);

  const m = tickers.map(ti =>
    tickers.map(tj => (ti === tj ? 1 : pearson(retsByT[ti], retsByT[tj])))
  );
  return { tickers, matrix: m };
}

export function covarianceMatrix(seriesByTicker: Record<string, PriceSeries>): {
  tickers: string[]; matrix: number[][]; sigmas: number[];
} {
  const { tickers, matrix: corr } = correlationMatrix(seriesByTicker);
  const sigmas = tickers.map(t => stdev(logReturns(seriesByTicker[t].closes)));
  const cov = corr.map((row, i) => row.map((c, j) => c * sigmas[i] * sigmas[j]));
  return { tickers, matrix: cov, sigmas };
}

// ── 8. Portfolio variance (true σ_p, not avg of σ_i) ────────────
export function portfolioVariance(weights: number[], cov: number[][]): number {
  let v = 0;
  for (let i = 0; i < weights.length; i++) {
    for (let j = 0; j < weights.length; j++) {
      v += weights[i] * weights[j] * cov[i][j];
    }
  }
  return v;
}

export const portfolioSigma = (w: number[], cov: number[][]) => Math.sqrt(Math.max(0, portfolioVariance(w, cov)));

// ── 9. VaR / CVaR, three methods ───────────────────────────────
const Z_95 = 1.6448536269514722;
const Z_99 = 2.3263478740408408;

/** Parametric (variance–covariance) VaR */
export function parametricVaR(portfolioValue: number, sigmaDaily: number, conf: 0.95 | 0.99 = 0.95, horizonDays = 1): number {
  const z = conf === 0.99 ? Z_99 : Z_95;
  return portfolioValue * sigmaDaily * Math.sqrt(horizonDays) * z;
}

/** Historical VaR, uses the actual return distribution */
export function historicalVaR(portfolioValue: number, portfolioRets: number[], conf: 0.95 | 0.99 = 0.95): number {
  if (portfolioRets.length === 0) return 0;
  const sorted = [...portfolioRets].sort((a, b) => a - b);
  const idx = Math.floor((1 - conf) * sorted.length);
  const var_ret = sorted[idx];
  return portfolioValue * Math.abs(var_ret);
}

/** Historical CVaR (Expected Shortfall) */
export function historicalCVaR(portfolioValue: number, portfolioRets: number[], conf: 0.95 | 0.99 = 0.95): number {
  if (portfolioRets.length === 0) return 0;
  const sorted = [...portfolioRets].sort((a, b) => a - b);
  const cutoff = Math.floor((1 - conf) * sorted.length);
  const tail = sorted.slice(0, Math.max(1, cutoff));
  const avg = mean(tail);
  return portfolioValue * Math.abs(avg);
}

/** Compute portfolio return series from per-asset return series + weights */
export function portfolioReturns(retsByT: Record<string, number[]>, weights: Record<string, number>): number[] {
  const tickers = Object.keys(weights).filter(t => retsByT[t]?.length);
  if (tickers.length === 0) return [];
  const minLen = Math.min(...tickers.map(t => retsByT[t].length));
  const out: number[] = [];
  for (let i = 0; i < minLen; i++) {
    let r = 0;
    for (const t of tickers) {
      r += weights[t] * retsByT[t][retsByT[t].length - minLen + i];
    }
    out.push(r);
  }
  return out;
}

/** Rolling VaR backtest, true historical, not synthetic noise */
export function rollingHistoricalVaR(
  portfolioValue: number,
  portfolioRets: number[],
  windowDays = 60,
  conf: 0.95 | 0.99 = 0.95
): { day: string; var: number; cvar: number }[] {
  const out: { day: string; var: number; cvar: number }[] = [];
  if (portfolioRets.length < windowDays + 1) return out;
  for (let i = windowDays; i < portfolioRets.length; i++) {
    const window = portfolioRets.slice(i - windowDays, i);
    const sorted = [...window].sort((a, b) => a - b);
    const idx = Math.floor((1 - conf) * sorted.length);
    const var_ret = Math.abs(sorted[idx] ?? 0);
    const tail = sorted.slice(0, Math.max(1, idx));
    const cvar_ret = Math.abs(mean(tail));
    const offset = portfolioRets.length - i;
    out.push({
      day: `D-${offset}`,
      var: portfolioValue * var_ret,
      cvar: portfolioValue * cvar_ret,
    });
  }
  return out.slice(-30); // last 30 observations
}

// ── 10. Beta to a benchmark ─────────────────────────────────────
/**
 * @deprecated Prefer `betaRegression`, which returns null on insufficient
 * data (instead of a false-neutral 1.0) and reports SE, R² and a CI.
 * Returns null when the sample is too small or the benchmark has no variance —
 * an unknown beta is null, never a silent 1.0 that reads as "market-like".
 */
export function beta(assetRets: number[], benchRets: number[]): number | null {
  const reg = betaRegression(assetRets, benchRets);
  return reg ? reg.beta : null;
}

// ── 11. Sharpe & Sortino ────────────────────────────────────────
export function sharpe(rets: number[], rfDaily = ANNUAL_RISK_FREE / TRADING_DAYS): number {
  const s = stdev(rets);
  if (s === 0) return 0;
  return ((mean(rets) - rfDaily) / s) * Math.sqrt(252);
}

/**
 * Annualized Sortino. NOTE the compatibility convention: when the sample has
 * NO downside observations, Sortino is mathematically unbounded (excellent),
 * but we return 0 here to keep a numeric contract shared with the edge spine.
 * Callers that must distinguish "no downside" from "poor" should check the
 * downside count themselves; the residual-risk register documents this.
 */
export function sortino(rets: number[], rfDaily = ANNUAL_RISK_FREE / TRADING_DAYS): number {
  const downside = rets.filter(r => r < rfDaily).map(r => r - rfDaily);
  if (downside.length === 0) return 0;
  const dSig = Math.sqrt(mean(downside.map(d => d * d)));
  if (dSig === 0) return 0;
  return ((mean(rets) - rfDaily) / dSig) * Math.sqrt(252);
}

// ── 11b. Uncertainty on the estimates themselves ─────────────────
// (Mirrored by supabase/functions/_shared/stats.ts; truth-spine test
//  asserts identical outputs.)

/**
 * Annualized Sharpe with its asymptotic standard error (Lo, 2002, iid case):
 *   SE(SR_daily) = sqrt((1 + SR_daily²/2) / n),  annualized by √252.
 * Understated under autocorrelation/fat tails — the caveat ships in `method`.
 */
export function sharpeWithSE(
  rets: number[],
  annualRiskFree = ANNUAL_RISK_FREE,
): { sharpe: number; se: number; n: number; method: string } | null {
  const n = rets.length;
  if (n < 40) return null;
  const s = stdev(rets);
  if (s === 0) return null;
  const rfDaily = annualRiskFree / TRADING_DAYS;
  const srDaily = (mean(rets) - rfDaily) / s;
  const seDaily = Math.sqrt((1 + (srDaily * srDaily) / 2) / n);
  return {
    sharpe: srDaily * Math.sqrt(TRADING_DAYS),
    se: seDaily * Math.sqrt(TRADING_DAYS),
    n,
    method: "Lo (2002) iid asymptotic SE; understated under autocorrelation or fat tails",
  };
}

/** Annualized vol with normal-theory SE ≈ σ̂/√(2(n−1)). Decimal units. */
export function volWithSE(
  rets: number[],
): { vol: number; se: number; n: number; method: string } | null {
  const n = rets.length;
  if (n < 20) return null;
  const vol = stdev(rets) * Math.sqrt(TRADING_DAYS);
  if (vol <= 0) return null;
  return {
    vol,
    se: vol / Math.sqrt(2 * (n - 1)),
    n,
    method: "normal-theory SE; understated under vol clustering (GARCH effects)",
  };
}

/**
 * OLS beta of asset on benchmark daily returns, with SE, R² and 95% CI.
 * Returns null (never a fabricated 1.0) when the sample is insufficient —
 * unlike the legacy `beta()` below, which is kept only for callers that
 * have not yet grown a null-path and is deprecated.
 */
export function betaRegression(
  assetRets: number[],
  benchRets: number[],
): { beta: number; alphaDaily: number; se: number; ci95: [number, number]; r2: number; n: number } | null {
  const n = Math.min(assetRets.length, benchRets.length);
  if (n < 40) return null;
  const a = assetRets.slice(-n);
  const b = benchRets.slice(-n);
  const mb = mean(b);
  const ma = mean(a);
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (b[i] - mb) ** 2;
    sxy += (b[i] - mb) * (a[i] - ma);
  }
  if (sxx <= 0) return null;
  const betaHat = sxy / sxx;
  const alphaDaily = ma - betaHat * mb;
  let sse = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    const resid = a[i] - alphaDaily - betaHat * b[i];
    sse += resid * resid;
    sst += (a[i] - ma) ** 2;
  }
  const sigma2 = sse / Math.max(1, n - 2);
  const se = Math.sqrt(sigma2 / sxx);
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  return { beta: betaHat, alphaDaily, se, ci95: [betaHat - 1.96 * se, betaHat + 1.96 * se], r2, n };
}

// ── 12. Merton Structural Credit (Distance-to-Default) ──────────
/**
 * Merton (1974) structural credit model.
 * Equity = call option on firm value with strike = debt face value.
 *
 * Inputs:
 *   E  = market cap (equity value)
 *   D  = debt face value (book debt)
 *   sE = equity volatility (annualized, from log returns)
 *   T  = horizon in years (default 1)
 *   r  = risk-free rate (default 0.04)
 *
 * Returns: { dd: distance-to-default, pd: prob of default (1y), assetVol }
 *
 * Solved iteratively: V*N(d1) - D*exp(-rT)*N(d2) = E,  sV = (E/V)*N(d1)*sE
 */
function normCDF(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * ax);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

export function mertonDistanceToDefault(E: number, D: number, sE: number, T = 1, r = 0.04): {
  dd: number; pd: number; assetVol: number; assetValue: number;
} {
  if (E <= 0 || D <= 0 || sE <= 0) return { dd: 0, pd: 0.5, assetVol: sE, assetValue: E };
  // Initial guesses
  let V = E + D;
  let sV = sE * (E / V);
  for (let iter = 0; iter < 50; iter++) {
    const d1 = (Math.log(V / D) + (r + 0.5 * sV * sV) * T) / (sV * Math.sqrt(T));
    const d2 = d1 - sV * Math.sqrt(T);
    const callVal = V * normCDF(d1) - D * Math.exp(-r * T) * normCDF(d2);
    const sVnew = (E / Math.max(V, 1e-9)) * normCDF(d1) * sE;
    const Vnew = V + (E - callVal) * 0.5; // damped Newton
    if (Math.abs(Vnew - V) / V < 1e-6 && Math.abs(sVnew - sV) / Math.max(sV, 1e-9) < 1e-6) {
      V = Vnew; sV = sVnew; break;
    }
    V = Vnew; sV = Math.max(sVnew, 1e-6);
  }
  const d1 = (Math.log(V / D) + (r + 0.5 * sV * sV) * T) / (sV * Math.sqrt(T));
  const d2 = d1 - sV * Math.sqrt(T);
  const dd = d2;
  const pd = normCDF(-dd);
  return { dd, pd, assetVol: sV, assetValue: V };
}
