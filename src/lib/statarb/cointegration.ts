/**
 * Engle-Granger cointegration: OLS hedge ratio + ADF on residuals.
 * Pure-TS, no deps. All inputs are price series of equal length.
 */
import type { CointegrationResult } from "./types";

/** Ordinary least-squares regression: y = alpha + beta * x. */
export function ols(x: number[], y: number[]): { alpha: number; beta: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { alpha: 0, beta: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]; sy += y[i];
    sxx += x[i] * x[i]; sxy += x[i] * y[i];
  }
  const denom = n * sxx - sx * sx;
  const beta = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const alpha = (sy - beta * sx) / n;
  return { alpha, beta };
}

/**
 * Augmented Dickey-Fuller test (lag-1 form, no constant — appropriate for
 * residuals of an OLS regression which already absorbed the constant).
 * Returns the t-statistic on the lagged-level coefficient.
 *
 *     Δy_t = ρ · y_{t-1} + γ · Δy_{t-1} + ε_t
 *
 * Null hypothesis: ρ = 0 (unit root, NOT stationary).
 * Reject (stationary) when t-stat is sufficiently negative.
 */
export function adfTest(series: number[]): number {
  const n = series.length;
  if (n < 20) return 0;
  const dy: number[] = [];
  const yLag: number[] = [];
  const dyLag: number[] = [];
  for (let i = 2; i < n; i++) {
    dy.push(series[i] - series[i - 1]);
    yLag.push(series[i - 1]);
    dyLag.push(series[i - 1] - series[i - 2]);
  }
  // Two-regressor OLS without intercept: dy ~ rho*yLag + gamma*dyLag
  // Solve normal equations directly.
  const m = dy.length;
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < m; i++) {
    s11 += yLag[i] * yLag[i];
    s12 += yLag[i] * dyLag[i];
    s22 += dyLag[i] * dyLag[i];
    t1 += yLag[i] * dy[i];
    t2 += dyLag[i] * dy[i];
  }
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-12) return 0;
  const rho = (s22 * t1 - s12 * t2) / det;
  const gamma = (s11 * t2 - s12 * t1) / det;
  // Residual variance + standard error on rho
  let rss = 0;
  for (let i = 0; i < m; i++) {
    const e = dy[i] - rho * yLag[i] - gamma * dyLag[i];
    rss += e * e;
  }
  const dof = Math.max(1, m - 2);
  const sigma2 = rss / dof;
  const seRho = Math.sqrt(Math.max(0, sigma2 * s22 / det));
  return seRho > 0 ? rho / seRho : 0;
}

/**
 * Approximate ADF p-value from MacKinnon (1996) critical-value table for
 * the no-constant case. Linear interpolation between key thresholds.
 */
export function adfPValue(tStat: number): number {
  // Critical values (no constant): 1% ≈ -2.58, 5% ≈ -1.95, 10% ≈ -1.62
  if (tStat <= -2.58) return 0.01;
  if (tStat <= -1.95) return 0.01 + (0.05 - 0.01) * ((tStat + 2.58) / (-1.95 + 2.58));
  if (tStat <= -1.62) return 0.05 + (0.10 - 0.05) * ((tStat + 1.95) / (-1.62 + 1.95));
  if (tStat <= 0)    return 0.10 + (0.50 - 0.10) * ((tStat + 1.62) / (0 + 1.62));
  return Math.min(0.99, 0.50 + tStat * 0.1);
}

/** Engle-Granger cointegration test on two equal-length price series. */
export function cointegrate(x: number[], y: number[]): CointegrationResult {
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0, n);
  const ys = y.slice(0, n);
  const { alpha, beta } = ols(xs, ys);
  const residuals = ys.map((v, i) => v - (alpha + beta * xs[i]));
  const adfStat = adfTest(residuals);
  const pValue = adfPValue(adfStat);
  return {
    beta,
    alpha,
    adfStat,
    pValue,
    isCointegrated: pValue < 0.05 && residuals.length >= 30,
    residuals,
  };
}
