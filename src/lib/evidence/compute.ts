/**
 * Deterministic computation helpers for the evidence engine.
 * Pure functions over numeric series — no I/O, no models.
 */

import type { HistoryPoint } from "./types";

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const round = (v: number, dp = 2) => {
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
};

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Standard normal CDF Φ(x) via the Zelen–Severo polynomial
 * (Abramowitz & Stegun 26.2.17), |error| < 7.5e-8 — plenty for
 * scenario probabilities.
 */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * poly;
  return x >= 0 ? p : 1 - p;
}

/**
 * Inverse standard normal CDF Φ⁻¹(p) via Acklam's rational approximation
 * (|relative error| < 1.15e-9). Used for percentile cones and tail levels.
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) return -normalQuantile(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Closed-form expected shortfall of a log-normal price return.
 * With ln(S_T/S0) ~ N(m, σ²) and tail mass p (e.g. 0.05):
 *   ES = E[S_T/S0 − 1 | S_T/S0 ≤ VaR quantile]
 *      = e^{m+σ²/2}·Φ(Φ⁻¹(p) − σ)/p − 1
 * Returns a (typically negative) decimal return.
 */
export function lognormalEs(m: number, sigma: number, p = 0.05): number {
  if (!(sigma > 0) || !(p > 0 && p < 1)) return 0;
  const zp = normalQuantile(p);
  return Math.exp(m + (sigma * sigma) / 2) * (normalCdf(zp - sigma) / p) - 1;
}

export function sma(closes: number[], window: number): number | null {
  if (closes.length < window) return null;
  return mean(closes.slice(-window));
}

/** Daily log returns. */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

/** Annualized volatility (%) from daily closes over the trailing window. */
export function annualizedVol(closes: number[], window = 60): number | null {
  const rets = dailyReturns(closes.slice(-(window + 1)));
  if (rets.length < 10) return null;
  const mu = mean(rets);
  const variance = mean(rets.map((r) => (r - mu) ** 2));
  return round(Math.sqrt(variance) * Math.sqrt(252) * 100, 1);
}

/** Total return (%) over the trailing n sessions. */
export function trailingReturn(closes: number[], sessions: number): number | null {
  if (closes.length < sessions + 1) return null;
  const start = closes[closes.length - 1 - sessions];
  const end = closes[closes.length - 1];
  if (start <= 0) return null;
  return round(((end - start) / start) * 100, 1);
}

/** Maximum peak-to-trough drawdown (%) across the series. Negative number. */
export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 5) return null;
  let peak = closes[0];
  let worst = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (c - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return round(worst * 100, 1);
}

/** Position of the last close inside the trailing 52-week range, 0–100. */
export function positionIn52w(closes: number[]): number | null {
  const window = closes.slice(-252);
  if (window.length < 30) return null;
  const lo = Math.min(...window);
  const hi = Math.max(...window);
  if (hi <= lo) return null;
  return round(((window[window.length - 1] - lo) / (hi - lo)) * 100, 0);
}

/** Percentile (0–100) of the last value within its own series. */
export function percentileOfLast(series: number[]): number | null {
  if (series.length < 10) return null;
  const last = series[series.length - 1];
  const below = series.filter((v) => v <= last).length;
  return round((below / series.length) * 100, 0);
}

/** Rolling series of trailing-window annualized vol, for regime percentile. */
export function rollingVolSeries(closes: number[], window = 20): number[] {
  const rets = dailyReturns(closes);
  const out: number[] = [];
  for (let i = window; i <= rets.length; i++) {
    const slice = rets.slice(i - window, i);
    const mu = mean(slice);
    const variance = mean(slice.map((r) => (r - mu) ** 2));
    out.push(Math.sqrt(variance) * Math.sqrt(252) * 100);
  }
  return out;
}

/** Realized Sharpe over the series (rf ≈ 0), annualized. */
export function realizedSharpe(closes: number[]): number | null {
  const rets = dailyReturns(closes);
  if (rets.length < 40) return null;
  const mu = mean(rets);
  const sd = Math.sqrt(mean(rets.map((r) => (r - mu) ** 2)));
  if (sd === 0) return null;
  return round((mu / sd) * Math.sqrt(252), 2);
}

/** Ratio of recent average volume to the longer-run average. */
export function volumeTrend(volumes: number[]): number | null {
  if (volumes.length < 80) return null;
  const recent = mean(volumes.slice(-20));
  const base = mean(volumes.slice(-120, -20));
  if (base <= 0) return null;
  return round(recent / base, 2);
}

/**
 * Downsample a daily close series to ≤ points history points with
 * month-style period labels derived from timestamps (unix seconds).
 */
export function toHistory(closes: number[], timestamps: number[], points = 24): HistoryPoint[] {
  if (closes.length === 0) return [];
  const step = Math.max(1, Math.floor(closes.length / points));
  const out: HistoryPoint[] = [];
  for (let i = 0; i < closes.length; i += step) {
    const ts = timestamps[i] ? new Date(timestamps[i] * 1000) : null;
    out.push({
      period: ts ? `${ts.toLocaleString("en", { month: "short" })} ’${String(ts.getFullYear()).slice(2)}` : `t${i}`,
      value: round(closes[i], 2),
    });
  }
  const lastIdx = closes.length - 1;
  const lastTs = timestamps[lastIdx] ? new Date(timestamps[lastIdx] * 1000) : null;
  if (out.length === 0 || out[out.length - 1].value !== closes[lastIdx]) {
    out.push({
      period: lastTs ? `${lastTs.toLocaleString("en", { month: "short" })} ’${String(lastTs.getFullYear()).slice(2)}` : "now",
      value: round(closes[lastIdx], 2),
    });
  }
  return out;
}

/** Herfindahl-style concentration (0–100) of percentage shares. */
export function concentrationIndex(shares: number[]): number | null {
  const valid = shares.filter((s) => Number.isFinite(s) && s > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  const hhi = valid.reduce((acc, s) => acc + (s / total) ** 2, 0);
  return round(hhi * 100, 0);
}
