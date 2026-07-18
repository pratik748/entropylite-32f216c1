/**
 * Canonical statistics for ALL edge functions.
 *
 * One truth spine: every edge function that needs a return series, a
 * volatility, a Sharpe/Sortino ratio, or a drawdown imports it from here.
 * Local redefinitions are forbidden — they are how the same ticker ended up
 * with three different "Sharpe ratios" across surfaces.
 *
 * Conventions (fixed, documented, and matching src/lib/quant-engine.ts):
 *   - Returns are LOG returns: r_t = ln(P_t / P_{t-1}).
 *   - Volatility is the SAMPLE standard deviation (ddof = 1) of log returns.
 *   - Annualization uses 252 trading days: σ_y = σ·√252, μ_y = μ·252.
 *   - Sharpe/Sortino are annualized excess returns over ANNUAL_RISK_FREE.
 *   - Sortino's downside deviation averages squared downside deviations over
 *     the count of downside observations (same as the client engine).
 *   - Max drawdown is returned as a POSITIVE decimal (0.23 = −23% peak-to-trough);
 *     display layers choose sign and percent scaling explicitly.
 *
 * If a surface needs a different convention it must say so at the call site —
 * never by shadowing these names.
 */

import { riskFreeFor } from "./riskFree.ts";

/**
 * Default risk-free assumption (annual, decimal) = the USD snapshot rate.
 * Currency-aware callers must pass `riskFreeFor(currency).annualRate`
 * explicitly instead of relying on this default.
 */
export const ANNUAL_RISK_FREE = riskFreeFor("USD").annualRate;

export const TRADING_DAYS = 252;

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample variance (ddof = 1). Returns 0 when n < 2. */
export function sampleVariance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

/** Sample standard deviation (ddof = 1). */
export function sampleStd(xs: number[]): number {
  return Math.sqrt(sampleVariance(xs));
}

/** Daily log returns, skipping non-positive prices. */
export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > 0 && closes[i - 1] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

/** Annualized volatility as a decimal (0.32 = 32%/yr) from daily returns. */
export function annualizedVol(dailyReturns: number[]): number {
  return sampleStd(dailyReturns) * Math.sqrt(TRADING_DAYS);
}

/** Annualized volatility in percent (32.1 = 32.1%/yr) from daily returns. */
export function annualizedVolPct(dailyReturns: number[]): number {
  return annualizedVol(dailyReturns) * 100;
}

/**
 * Annualized Sharpe ratio from daily returns.
 * Excess over ANNUAL_RISK_FREE unless another annual rate is passed explicitly.
 */
export function sharpeRatio(dailyReturns: number[], annualRiskFree = ANNUAL_RISK_FREE): number {
  if (dailyReturns.length < 10) return 0;
  const sd = sampleStd(dailyReturns);
  if (sd === 0) return 0;
  const rfDaily = annualRiskFree / TRADING_DAYS;
  return ((mean(dailyReturns) - rfDaily) / sd) * Math.sqrt(TRADING_DAYS);
}

/**
 * Annualized Sortino ratio from daily returns.
 * Downside deviation over returns below the daily risk-free rate.
 */
export function sortinoRatio(dailyReturns: number[], annualRiskFree = ANNUAL_RISK_FREE): number {
  if (dailyReturns.length < 10) return 0;
  const rfDaily = annualRiskFree / TRADING_DAYS;
  const downside = dailyReturns.filter((r) => r < rfDaily).map((r) => r - rfDaily);
  if (downside.length === 0) return 0;
  const downsideDev = Math.sqrt(mean(downside.map((d) => d * d)));
  if (downsideDev === 0) return 0;
  return ((mean(dailyReturns) - rfDaily) / downsideDev) * Math.sqrt(TRADING_DAYS);
}

/**
 * Annualized Sharpe with its asymptotic standard error (Lo, 2002, iid case):
 *   SE(SR_daily) = sqrt((1 + SR_daily²/2) / n),  annualized by √252.
 * The SE understates uncertainty under autocorrelation/fat tails — that
 * caveat ships in `method`. Returns null when the sample is too small for
 * the ratio to mean anything.
 */
export function sharpeWithSE(
  dailyReturns: number[],
  annualRiskFree = ANNUAL_RISK_FREE,
): { sharpe: number; se: number; n: number; method: string } | null {
  const n = dailyReturns.length;
  if (n < 40) return null;
  const sd = sampleStd(dailyReturns);
  if (sd === 0) return null;
  const rfDaily = annualRiskFree / TRADING_DAYS;
  const srDaily = (mean(dailyReturns) - rfDaily) / sd;
  const seDaily = Math.sqrt((1 + (srDaily * srDaily) / 2) / n);
  return {
    sharpe: srDaily * Math.sqrt(TRADING_DAYS),
    se: seDaily * Math.sqrt(TRADING_DAYS),
    n,
    method: "Lo (2002) iid asymptotic SE; understated under autocorrelation or fat tails",
  };
}

/**
 * Annualized volatility with its approximate standard error:
 *   SE(σ̂) ≈ σ̂ / sqrt(2(n−1))   (normal-theory approximation).
 * Decimal units (0.32 = 32%/yr).
 */
export function volWithSE(
  dailyReturns: number[],
): { vol: number; se: number; n: number; method: string } | null {
  const n = dailyReturns.length;
  if (n < 20) return null;
  const vol = sampleStd(dailyReturns) * Math.sqrt(TRADING_DAYS);
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
 * Returns null (never a fabricated 1.0) when the sample is insufficient.
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
  const beta = sxy / sxx;
  const alphaDaily = ma - beta * mb;
  let sse = 0, sst = 0;
  for (let i = 0; i < n; i++) {
    const resid = a[i] - alphaDaily - beta * b[i];
    sse += resid * resid;
    sst += (a[i] - ma) ** 2;
  }
  const sigma2 = sse / Math.max(1, n - 2);
  const se = Math.sqrt(sigma2 / sxx);
  const r2 = sst > 0 ? 1 - sse / sst : 0;
  return { beta, alphaDaily, se, ci95: [beta - 1.96 * se, beta + 1.96 * se], r2, n };
}

/** Maximum peak-to-trough drawdown as a POSITIVE decimal (0.23 = −23%). */
export function maxDrawdown(closes: number[]): number {
  if (closes.length < 2) return 0;
  let peak = closes[0];
  let mdd = 0;
  for (const p of closes) {
    if (p > peak) peak = p;
    if (peak > 0) {
      const dd = (peak - p) / peak;
      if (dd > mdd) mdd = dd;
    }
  }
  return mdd;
}

/** Pearson correlation over the aligned head of the two series. */
export function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

/** Linear-interpolated percentile of a series, p ∈ [0, 1]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(Math.max((sorted.length - 1) * p, 0), sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Historical VaR and CVaR (expected shortfall) at `conf` from daily returns.
 * Returned as POSITIVE decimals of notional (0.021 = 2.1% one-day loss).
 */
export function historicalVaRCVaR(
  dailyReturns: number[],
  conf: 0.95 | 0.99 = 0.95,
): { varPct: number; cvarPct: number } {
  if (dailyReturns.length < 20) return { varPct: 0, cvarPct: 0 };
  const sorted = [...dailyReturns].sort((a, b) => a - b);
  const idx = Math.floor((1 - conf) * sorted.length);
  const varPct = Math.abs(sorted[Math.min(idx, sorted.length - 1)] ?? 0);
  const tail = sorted.slice(0, Math.max(1, idx));
  const cvarPct = Math.abs(mean(tail));
  return { varPct, cvarPct };
}
