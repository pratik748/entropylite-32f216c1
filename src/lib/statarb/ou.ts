/**
 * Ornstein-Uhlenbeck mean-reversion fit on a spread series.
 *
 *     dX_t = θ(μ - X_t) dt + σ dW_t
 *
 * Discrete AR(1) form on Δt = 1:
 *     X_{t+1} = a + b · X_t + ε,   ε ~ N(0, sigma_e²)
 * with  b = exp(-θ),   a = μ(1 - b),   sigma_e² = σ² (1 - b²) / (2θ).
 *
 * We invert the AR(1) coefficients to recover (θ, μ, σ).
 */
import type { OUParameters } from "./types";
import { ols } from "./cointegration";

export function fitOU(spread: number[]): OUParameters {
  const n = spread.length;
  if (n < 20) {
    return { theta: 0, mu: 0, sigmaEq: 0, halfLife: Infinity, zScore: 0, isStationary: false };
  }
  const x = spread.slice(0, n - 1);
  const y = spread.slice(1, n);
  const { alpha: a, beta: b } = ols(x, y);

  // Residual std-dev of the AR(1) regression
  let rss = 0;
  for (let i = 0; i < x.length; i++) {
    const e = y[i] - (a + b * x[i]);
    rss += e * e;
  }
  const sigmaE = Math.sqrt(rss / Math.max(1, x.length - 2));

  // OU parameters from AR(1)
  const stationaryB = b > 0 && b < 1;
  const theta = stationaryB ? -Math.log(b) : 0;
  const mu = stationaryB ? a / (1 - b) : x.reduce((s, v) => s + v, 0) / x.length;
  // σ² = sigma_e² · 2θ / (1 - b²)
  const stationaryVar = stationaryB && (1 - b * b) > 1e-9
    ? (sigmaE * sigmaE * 2 * theta) / (1 - b * b)
    : sigmaE * sigmaE;
  const sigmaEq = Math.sqrt(Math.max(0, stationaryVar));
  const halfLife = theta > 0 ? Math.log(2) / theta : Infinity;

  const last = spread[n - 1];
  const zScore = sigmaEq > 0 ? (last - mu) / sigmaEq : 0;

  return {
    theta,
    mu,
    sigmaEq,
    halfLife,
    zScore,
    isStationary: stationaryB && halfLife < n, // half-life must fit in window
  };
}
