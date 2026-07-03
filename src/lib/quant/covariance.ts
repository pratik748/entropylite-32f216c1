/**
 * Covariance Estimation Layer — institutional-grade Σ estimators.
 * ───────────────────────────────────────────────────────────────
 * Complements the existing hygiene pipeline (mpCleanCovariance → nearestPSD in
 * institutional.ts) with *estimation* improvements:
 *
 *   - Ledoit–Wolf constant-correlation shrinkage (Ledoit & Wolf 2004,
 *     "Honey, I Shrunk the Sample Covariance Matrix", J. Portf. Mgmt. 30(4)).
 *     Optimal convex combination Σ* = δF + (1−δ)S minimising expected
 *     Frobenius loss, with the shrinkage intensity δ estimated from the data.
 *   - EWMA (RiskMetrics) covariance: Σ_t = λΣ_{t−1} + (1−λ)x_t x_tᵀ, λ=0.94.
 *   - Scalar DCC-lite: EWMA correlation driver on standardised residuals,
 *     recombined with per-asset EWMA volatilities. A deterministic, browser-
 *     weight approximation of Engle (2002) DCC-GARCH that captures the same
 *     first-order effect (correlations rise in stress) without MLE.
 *   - Correlation-distance matrix d_ij = √(½(1−ρ_ij)) for HRP clustering.
 *
 * All functions are pure and deterministic. Complexity O(N²T); for the
 * platform's N ≤ 50, T ≤ 2500 this is < 10 ms on a laptop and fine in the
 * browser or an edge function.
 *
 * Recommended pipeline (documented in docs/QUANT_UPGRADE_SPEC.md):
 *   returns → ledoitWolfShrinkage → (optional mpCleanCovariance for N/T > 0.3)
 *           → nearestPSD → optimiser
 */

import { nearestPSD } from "@/lib/quant/institutional";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** Demean each series in place-safe copy; returns [X (N×T demeaned), means]. */
function demean(series: number[][]): { X: number[][]; means: number[]; T: number } {
  const N = series.length;
  const T = Math.min(...series.map(s => s.length));
  const X: number[][] = [];
  const means: number[] = [];
  for (let i = 0; i < N; i++) {
    const s = series[i].slice(-T);
    let m = 0;
    for (const v of s) m += v;
    m /= T;
    means.push(m);
    X.push(s.map(v => v - m));
  }
  return { X, means, T };
}

/** Sample covariance from demeaned N×T matrix (denominator T, ML convention). */
function sampleCov(X: number[][], T: number): number[][] {
  const N = X.length;
  const S: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let s = 0;
      for (let t = 0; t < T; t++) s += X[i][t] * X[j][t];
      S[i][j] = s / T;
      S[j][i] = S[i][j];
    }
  }
  return S;
}

// ─────────────────────────────────────────────────────────────────
// Ledoit–Wolf constant-correlation shrinkage
// ─────────────────────────────────────────────────────────────────

export interface LedoitWolfResult {
  /** Shrunk covariance Σ* = δF + (1−δ)S, PSD-projected. */
  sigma: number[][];
  /** Estimated optimal shrinkage intensity δ ∈ [0,1]. */
  delta: number;
  /** Average sample correlation used in the target F. */
  rBar: number;
  /** Raw sample covariance S (denominator T). */
  sample: number[][];
}

/**
 * Ledoit–Wolf shrinkage toward the constant-correlation target.
 *
 * Target:  f_ii = s_ii,  f_ij = r̄ √(s_ii s_jj)
 * δ* = max(0, min(1, (π̂ − ρ̂) / γ̂ / T)) where
 *   π̂ = Σ_ij AsyVar[√T s_ij]      (estimation error of S)
 *   ρ̂ = Σ_ii π_ii + Σ_{i≠j} r̄/2 (√(s_jj/s_ii) θ_ii,ij + √(s_ii/s_jj) θ_jj,ij)
 *   γ̂ = ‖S − F‖²_F               (misspecification of the target)
 *
 * Why: with T/N small (typical here: 60–500 obs on 5–50 assets) the sample
 * covariance is ill-conditioned; min-variance and Kelly weights amplify its
 * noise. Shrinkage provably reduces out-of-sample portfolio variance and is
 * the standard first-line fix. O(N²T) time, O(N²) memory.
 *
 * @param series N asset return series (each ≥ 20 obs; aligned tails are used).
 */
export function ledoitWolfShrinkage(series: number[][]): LedoitWolfResult | null {
  const N = series.length;
  if (N < 2) return null;
  const { X, T } = demean(series);
  if (T < 20) return null;

  const S = sampleCov(X, T);
  const sd = S.map((row, i) => Math.sqrt(Math.max(row[i], 1e-18)));

  // Average correlation r̄
  let rSum = 0;
  let rCnt = 0;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      rSum += S[i][j] / (sd[i] * sd[j]);
      rCnt++;
    }
  const rBar = rCnt > 0 ? rSum / rCnt : 0;

  // Target F
  const F: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => (i === j ? S[i][i] : rBar * sd[i] * sd[j])),
  );

  // π̂ and θ terms
  let piHat = 0;
  let rhoHat = 0;
  let gammaHat = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      // π_ij = (1/T) Σ_t (x_it x_jt − s_ij)²
      let pij = 0;
      // θ_ii,ij = (1/T) Σ_t (x_it² − s_ii)(x_it x_jt − s_ij)
      let thI = 0;
      // θ_jj,ij = (1/T) Σ_t (x_jt² − s_jj)(x_it x_jt − s_ij)
      let thJ = 0;
      for (let t = 0; t < T; t++) {
        const wij = X[i][t] * X[j][t] - S[i][j];
        pij += wij * wij;
        thI += (X[i][t] * X[i][t] - S[i][i]) * wij;
        thJ += (X[j][t] * X[j][t] - S[j][j]) * wij;
      }
      pij /= T;
      thI /= T;
      thJ /= T;
      piHat += pij;
      if (i === j) {
        rhoHat += pij;
      } else {
        rhoHat += (rBar / 2) * ((sd[j] / sd[i]) * thI + (sd[i] / sd[j]) * thJ);
      }
      const diff = S[i][j] - F[i][j];
      gammaHat += diff * diff;
    }
  }

  let delta: number;
  if (gammaHat < 1e-18) {
    delta = 0; // target equals sample — nothing to shrink
  } else {
    const kappa = (piHat - rhoHat) / gammaHat;
    delta = Math.max(0, Math.min(1, kappa / T));
  }

  const sigma: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => delta * F[i][j] + (1 - delta) * S[i][j]),
  );
  const psd = nearestPSD(sigma);
  return { sigma: psd ?? sigma, delta, rBar, sample: S };
}

// ─────────────────────────────────────────────────────────────────
// EWMA covariance (RiskMetrics) and scalar DCC-lite
// ─────────────────────────────────────────────────────────────────

/**
 * RiskMetrics EWMA covariance:
 *   Σ_t = λ Σ_{t−1} + (1−λ) x_t x_tᵀ,   λ = 0.94 (daily convention).
 * Initialised from the equal-weight sample covariance of the first
 * `initWindow` observations. Streaming-friendly: pass the previous Σ via
 * `ewmaCovarianceStep` for O(N²) per-bar incremental updates.
 */
export function ewmaCovariance(series: number[][], lambda = 0.94, initWindow = 20): number[][] | null {
  const N = series.length;
  if (N < 2) return null;
  const { X, T } = demean(series);
  if (T < initWindow + 5) return null;
  // Init from first window
  const init = sampleCov(X.map(s => s.slice(0, initWindow)), initWindow);
  let cov = init;
  for (let t = initWindow; t < T; t++) {
    const x = X.map(s => s[t]);
    cov = ewmaCovarianceStep(cov, x, lambda);
  }
  return cov;
}

/** One EWMA update step (streaming). */
export function ewmaCovarianceStep(prev: number[][], x: number[], lambda = 0.94): number[][] {
  const N = x.length;
  const out: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++)
    for (let j = i; j < N; j++) {
      const v = lambda * prev[i][j] + (1 - lambda) * x[i] * x[j];
      out[i][j] = v;
      out[j][i] = v;
    }
  return out;
}

export interface DCCLiteResult {
  /** Dynamic covariance at the final observation. */
  sigma: number[][];
  /** Dynamic correlation at the final observation. */
  corr: number[][];
  /** Per-asset EWMA volatilities at the final observation. */
  vols: number[];
}

/**
 * Scalar DCC-lite: two-stage dynamic correlation.
 *   Stage 1 — per-asset EWMA variance h_it (λ_vol), standardise ε_it = x_it/√h_it.
 *   Stage 2 — EWMA pseudo-correlation Q_t = λ_corr Q_{t−1} + (1−λ_corr) ε_t ε_tᵀ,
 *             rescaled R_t = diag(Q_t)^{−½} Q_t diag(Q_t)^{−½}.
 *   Recombine Σ_t = D_t R_t D_t with D_t = diag(√h_it).
 *
 * This is Engle (2002) DCC with the GARCH recursions replaced by fixed-λ EWMA
 * (i.e. integrated GARCH limits) — no likelihood optimisation, deterministic,
 * and empirically captures most of DCC's benefit at horizon ≤ 1 month.
 * Cost O(N²T); browser-safe.
 */
export function dccLite(series: number[][], lambdaVol = 0.94, lambdaCorr = 0.97): DCCLiteResult | null {
  const N = series.length;
  if (N < 2) return null;
  const { X, T } = demean(series);
  if (T < 30) return null;

  // Stage 1: EWMA variances + standardised residuals
  const h: number[] = X.map(s => {
    let v = 0;
    for (let t = 0; t < 10; t++) v += s[t] * s[t];
    return Math.max(v / 10, 1e-12);
  });
  const eps: number[][] = Array.from({ length: N }, () => new Array(T).fill(0));
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      eps[i][t] = X[i][t] / Math.sqrt(h[i]);
      h[i] = lambdaVol * h[i] + (1 - lambdaVol) * X[i][t] * X[i][t];
    }
  }

  // Stage 2: EWMA pseudo-correlation on ε
  let Q = sampleCov(eps.map(s => s.slice(0, 20)), 20);
  for (let t = 20; t < T; t++) {
    const e = eps.map(s => s[t]);
    Q = ewmaCovarianceStep(Q, e, lambdaCorr);
  }
  const dq = Q.map((row, i) => Math.sqrt(Math.max(row[i], 1e-12)));
  const corr: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => Math.max(-1, Math.min(1, Q[i][j] / (dq[i] * dq[j])))),
  );
  const vols = h.map(v => Math.sqrt(v));
  const sigma: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => corr[i][j] * vols[i] * vols[j]),
  );
  const psd = nearestPSD(sigma);
  return { sigma: psd ?? sigma, corr, vols };
}

// ─────────────────────────────────────────────────────────────────
// Correlation distance (HRP input)
// ─────────────────────────────────────────────────────────────────

/** d_ij = √(½ (1 − ρ_ij)) — a proper metric on correlation space. */
export function correlationDistance(corr: number[][]): number[][] {
  const N = corr.length;
  return Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => Math.sqrt(Math.max(0, 0.5 * (1 - corr[i][j])))),
  );
}

/** Covariance → correlation. */
export function covToCorr(cov: number[][]): number[][] {
  const N = cov.length;
  const sd = cov.map((r, i) => Math.sqrt(Math.max(r[i], 1e-18)));
  return Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) => Math.max(-1, Math.min(1, cov[i][j] / (sd[i] * sd[j])))),
  );
}
