/**
 * Performance analytics — pure functions over real daily return series.
 * ─────────────────────────────────────────────────────────────────────
 * Inputs are portfolio (and optionally benchmark) daily log-returns built
 * from fetched price history. Nothing here fabricates data: with an
 * insufficient sample a metric is either omitted or graded low-confidence.
 *
 * References:
 *  - Sharpe (1966, 1994); Sortino & van der Meer (1991); Young (1991, Calmar);
 *    Keating & Shadwick (2002, Omega); Grinold & Kahn (2000, IR/TE).
 */

import { mean, stdev, ANNUAL_RISK_FREE } from "@/lib/quant-engine";
import {
  type PerformanceMetrics, type BenchmarkRelativeMetrics, type RollingMetrics,
  type RollingPoint, type MetricValue, metric, gradeSample,
} from "./types";

export const TRADING_DAYS = 252;

// ─────────────────────────────────────────────────────────────────
// Scalar metrics
// ─────────────────────────────────────────────────────────────────

/** Compound annual growth rate from a daily return series. */
export function cagr(rets: number[]): number {
  if (rets.length === 0) return 0;
  let logGrowth = 0;
  for (const r of rets) logGrowth += Math.log(1 + r);
  const years = rets.length / TRADING_DAYS;
  if (years <= 0) return 0;
  return Math.exp(logGrowth / years) - 1;
}

export function annualizedVol(rets: number[]): number {
  return stdev(rets) * Math.sqrt(TRADING_DAYS);
}

export function sharpeRatio(rets: number[], rfAnnual = ANNUAL_RISK_FREE): number {
  const vol = annualizedVol(rets);
  if (vol <= 0) return 0;
  return (mean(rets) * TRADING_DAYS - rfAnnual) / vol;
}

export function sortinoRatio(rets: number[], rfAnnual = ANNUAL_RISK_FREE): number {
  const rfDaily = rfAnnual / TRADING_DAYS;
  const downside = rets.filter(r => r < rfDaily).map(r => r - rfDaily);
  if (downside.length === 0) return 0;
  // Downside deviation uses the full sample count (Sortino convention).
  const dd = Math.sqrt(downside.reduce((s, d) => s + d * d, 0) / rets.length) * Math.sqrt(TRADING_DAYS);
  if (dd <= 0) return 0;
  return (mean(rets) * TRADING_DAYS - rfAnnual) / dd;
}

export function maxDrawdownFromReturns(rets: number[]): number {
  let equity = 1, peak = 1, mdd = 0;
  for (const r of rets) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = (peak - equity) / peak;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

export function calmarRatio(rets: number[]): number {
  const mdd = maxDrawdownFromReturns(rets);
  if (mdd <= 0) return 0;
  return cagr(rets) / mdd;
}

/** Omega(θ): E[gains above θ] / E[losses below θ], θ daily. */
export function omegaRatio(rets: number[], thresholdDaily = 0): number {
  let gains = 0, losses = 0;
  for (const r of rets) {
    const x = r - thresholdDaily;
    if (x > 0) gains += x;
    else losses -= x;
  }
  if (losses <= 0) return gains > 0 ? Infinity : 0;
  return gains / losses;
}

// ─────────────────────────────────────────────────────────────────
// Benchmark-relative (OLS on aligned daily returns)
// ─────────────────────────────────────────────────────────────────

export interface RegressionStats {
  alphaDaily: number;
  beta: number;
  rSquared: number;
  correlation: number;
  n: number;
}

/** OLS of portfolio returns on benchmark returns with intercept. */
export function regressOnBenchmark(portRets: number[], benchRets: number[]): RegressionStats | null {
  const n = Math.min(portRets.length, benchRets.length);
  if (n < 20) return null;
  const p = portRets.slice(-n), b = benchRets.slice(-n);
  const mp = mean(p), mb = mean(b);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (b[i] - mb) * (p[i] - mp);
    sxx += (b[i] - mb) ** 2;
    syy += (p[i] - mp) ** 2;
  }
  if (sxx <= 0) return null;
  const beta = sxy / sxx;
  const alphaDaily = mp - beta * mb;
  const rSquared = syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  const correlation = syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  return { alphaDaily, beta, rSquared, correlation, n };
}

export function trackingError(portRets: number[], benchRets: number[]): number {
  const n = Math.min(portRets.length, benchRets.length);
  if (n < 2) return 0;
  const active: number[] = [];
  const p = portRets.slice(-n), b = benchRets.slice(-n);
  for (let i = 0; i < n; i++) active.push(p[i] - b[i]);
  return stdev(active) * Math.sqrt(TRADING_DAYS);
}

export function informationRatio(portRets: number[], benchRets: number[]): number {
  const te = trackingError(portRets, benchRets);
  if (te <= 0) return 0;
  const n = Math.min(portRets.length, benchRets.length);
  const p = portRets.slice(-n), b = benchRets.slice(-n);
  const activeAnnual = (mean(p) - mean(b)) * TRADING_DAYS;
  return activeAnnual / te;
}

/** Up/down capture: mean portfolio return over mean benchmark return in up/down benchmark days. */
export function captureRatios(portRets: number[], benchRets: number[]): { up: number; down: number } | null {
  const n = Math.min(portRets.length, benchRets.length);
  if (n < 20) return null;
  const p = portRets.slice(-n), b = benchRets.slice(-n);
  let upP = 0, upB = 0, upN = 0, dnP = 0, dnB = 0, dnN = 0;
  for (let i = 0; i < n; i++) {
    if (b[i] > 0) { upP += p[i]; upB += b[i]; upN++; }
    else if (b[i] < 0) { dnP += p[i]; dnB += b[i]; dnN++; }
  }
  if (upN === 0 || dnN === 0 || upB === 0 || dnB === 0) return null;
  return { up: (upP / upN) / (upB / upN), down: (dnP / dnN) / (dnB / dnN) };
}

// ─────────────────────────────────────────────────────────────────
// Rolling metrics
// ─────────────────────────────────────────────────────────────────

export function rollingMetrics(rets: number[], window = 60, rfAnnual = 0.05): RollingMetrics {
  const sharpePts: RollingPoint[] = [];
  const volPts: RollingPoint[] = [];
  const retPts: RollingPoint[] = [];
  for (let end = window; end <= rets.length; end++) {
    const win = rets.slice(end - window, end);
    volPts.push({ endIndex: end - 1, value: annualizedVol(win) });
    retPts.push({ endIndex: end - 1, value: mean(win) * TRADING_DAYS });
    sharpePts.push({ endIndex: end - 1, value: sharpeRatio(win, rfAnnual) });
  }
  return { window, sharpe: sharpePts, volatilityAnnual: volPts, returnAnnual: retPts };
}

// ─────────────────────────────────────────────────────────────────
// Assembled metric bundle with provenance
// ─────────────────────────────────────────────────────────────────

export function computePerformanceMetrics(opts: {
  portfolioReturns: number[];
  benchmarkReturns?: number[];
  benchmarkTicker?: string;
  rfAnnual?: number;
  rollingWindow?: number;
}): PerformanceMetrics | null {
  const { portfolioReturns: rets, benchmarkReturns, benchmarkTicker, rfAnnual = 0.05, rollingWindow = 60 } = opts;
  const n = rets.length;
  if (n < 20) return null;

  const src = "historical-prices" as const;
  const rfNote = [`risk-free rate ${(rfAnnual * 100).toFixed(1)}% annual`];

  const out: PerformanceMetrics = {
    cagr: metric(cagr(rets), src, "geometric annualization of daily returns", n),
    annualReturn: metric(mean(rets) * TRADING_DAYS, src, "mean daily return × 252", n),
    annualVol: metric(annualizedVol(rets), src, "stdev of daily returns × √252", n),
    sharpe: metric(sharpeRatio(rets, rfAnnual), src, "(μₐ − rf) / σₐ", n, rfNote),
    sortino: metric(sortinoRatio(rets, rfAnnual), src, "(μₐ − rf) / downside deviation", n, rfNote),
    calmar: metric(calmarRatio(rets), src, "CAGR / max drawdown", n),
    omega: metric(omegaRatio(rets), src, "Σ gains / Σ losses around 0 (Keating–Shadwick)", n),
    maxDrawdown: metric(maxDrawdownFromReturns(rets), src, "max peak-to-trough on compounded equity", n),
    rolling: rollingMetrics(rets, Math.min(rollingWindow, Math.max(20, Math.floor(n / 2)))),
  };

  if (benchmarkReturns && benchmarkReturns.length >= 20 && benchmarkTicker) {
    const reg = regressOnBenchmark(rets, benchmarkReturns);
    const capture = captureRatios(rets, benchmarkReturns);
    if (reg) {
      const nb = reg.n;
      const bsrc = "benchmark-prices" as const;
      const olsCalc = `OLS r_p = α + β·r_b on ${nb} aligned days vs ${benchmarkTicker}`;
      out.benchmark = {
        benchmarkTicker,
        alphaAnnual: metric(reg.alphaDaily * TRADING_DAYS, bsrc, olsCalc, nb),
        beta: metric(reg.beta, bsrc, olsCalc, nb),
        rSquared: metric(reg.rSquared, bsrc, olsCalc, nb),
        trackingError: metric(trackingError(rets, benchmarkReturns), bsrc, "stdev(r_p − r_b) × √252", nb),
        informationRatio: metric(informationRatio(rets, benchmarkReturns), bsrc, "annualized active return / tracking error", nb),
        upCapture: metric(capture?.up ?? 0, bsrc, "mean r_p / mean r_b over benchmark-up days", nb,
          undefined, capture ? gradeSample(nb) : "low"),
        downCapture: metric(capture?.down ?? 0, bsrc, "mean r_p / mean r_b over benchmark-down days", nb,
          undefined, capture ? gradeSample(nb) : "low"),
        correlation: metric(reg.correlation, bsrc, "Pearson correlation of daily returns", nb),
        benchmarkReturnAnnual: metric(
          mean(benchmarkReturns.slice(-nb)) * TRADING_DAYS, bsrc, "mean benchmark daily return × 252", nb),
      };
    }
  }

  return out;
}
