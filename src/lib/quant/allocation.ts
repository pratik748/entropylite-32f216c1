/**
 * Allocation Layer — Hierarchical Risk Parity + Black–Litterman.
 * ──────────────────────────────────────────────────────────────
 * Adds two institutional allocators alongside the existing Markowitz / ERC /
 * Kelly set in portfolio-math.ts:
 *
 *   - HRP (López de Prado 2016, "Building Diversified Portfolios that
 *     Outperform Out-of-Sample", J. Portf. Mgmt. 42(4)): single-linkage
 *     clustering on correlation distance → quasi-diagonalisation → recursive
 *     bisection with inverse-variance splits. Requires NO matrix inversion,
 *     so it stays stable exactly where Markowitz breaks (near-singular Σ),
 *     and empirically beats mean-variance out-of-sample on small samples.
 *
 *   - Black–Litterman (Black & Litterman 1992): Bayesian blend of the
 *     market-equilibrium prior Π = δΣw_mkt with user/system views (P, Q, Ω).
 *     This is the mathematically correct home for Entropy Lite's proprietary
 *     signals (ODG gradient, CLANK pressure, reflexivity): they become views
 *     with confidence-scaled uncertainty instead of ad-hoc weight nudges.
 *
 * Deterministic, O(N³) worst case, trivial at platform scale (N ≤ 50).
 */

import { invertMatrix } from "@/lib/portfolio-math";
import { nearestPSD } from "@/lib/quant/institutional";
import { covToCorr, correlationDistance } from "@/lib/quant/covariance";

// ─────────────────────────────────────────────────────────────────
// Hierarchical Risk Parity
// ─────────────────────────────────────────────────────────────────

export interface HRPResult {
  weights: number[];
  /** Quasi-diagonal ordering of the assets (dendrogram leaf order). */
  order: number[];
}

/**
 * Single-linkage agglomerative clustering on a distance matrix.
 * Returns the dendrogram leaf order (quasi-diagonalisation).
 */
function singleLinkageOrder(dist: number[][]): number[] {
  const N = dist.length;
  // Each cluster: list of original indices in leaf order.
  let clusters: number[][] = Array.from({ length: N }, (_, i) => [i]);
  // Cluster-to-cluster distance = min pairwise distance (single linkage).
  const d = (a: number[], b: number[]) => {
    let m = Infinity;
    for (const i of a) for (const j of b) if (dist[i][j] < m) m = dist[i][j];
    return m;
  };
  while (clusters.length > 1) {
    let bi = 0, bj = 1, best = Infinity;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const v = d(clusters[i], clusters[j]);
        if (v < best) { best = v; bi = i; bj = j; }
      }
    const merged = clusters[bi].concat(clusters[bj]);
    clusters = clusters.filter((_, k) => k !== bi && k !== bj);
    clusters.push(merged);
  }
  return clusters[0];
}

/** Inverse-variance weights within a sub-covariance (diagonal only). */
function ivpWeights(cov: number[][], idx: number[]): number[] {
  const inv = idx.map(i => 1 / Math.max(cov[i][i], 1e-18));
  const s = inv.reduce((a, v) => a + v, 0);
  return inv.map(v => v / s);
}

/** Cluster variance using IVP weights: wᵀ Σ_sub w. */
function clusterVariance(cov: number[][], idx: number[]): number {
  const w = ivpWeights(cov, idx);
  let v = 0;
  for (let a = 0; a < idx.length; a++)
    for (let b = 0; b < idx.length; b++)
      v += w[a] * cov[idx[a]][idx[b]] * w[b];
  return v;
}

/**
 * Hierarchical Risk Parity weights.
 * @param cov covariance matrix (need not be invertible — HRP never inverts).
 */
export function hrpWeights(cov: number[][]): HRPResult | null {
  const N = cov.length;
  if (N < 2) return null;
  if (cov.some(r => r.length !== N)) return null;
  if (cov.some((r, i) => !(r[i] > 0))) return null;

  const corr = covToCorr(cov);
  const dist = correlationDistance(corr);
  const order = singleLinkageOrder(dist);

  const weights = new Array(N).fill(1);
  // Recursive bisection over the quasi-diagonal ordering.
  let stack: number[][] = [order];
  while (stack.length > 0) {
    const next: number[][] = [];
    for (const items of stack) {
      if (items.length < 2) continue;
      const half = Math.floor(items.length / 2);
      const left = items.slice(0, half);
      const right = items.slice(half);
      const vL = clusterVariance(cov, left);
      const vR = clusterVariance(cov, right);
      const alpha = 1 - vL / Math.max(vL + vR, 1e-18); // share to the left
      for (const i of left) weights[i] *= alpha;
      for (const i of right) weights[i] *= 1 - alpha;
      next.push(left, right);
    }
    stack = next;
  }
  const s = weights.reduce((a, v) => a + v, 0);
  if (!(s > 0) || !isFinite(s)) return null;
  return { weights: weights.map(v => v / s), order };
}

// ─────────────────────────────────────────────────────────────────
// Black–Litterman
// ─────────────────────────────────────────────────────────────────

export interface BLView {
  /** Portfolio weights of the view (length N). e.g. [1,0,0,-1,…] relative view. */
  portfolio: number[];
  /** Expected return of the view portfolio (same units/period as Σ). */
  expectedReturn: number;
  /** Confidence ∈ (0,1]; 1 = certain. Scales the view variance Ω_kk. */
  confidence?: number;
}

export interface BLResult {
  /** Posterior expected returns μ_BL. */
  mu: number[];
  /** Equilibrium prior returns Π = δ Σ w_mkt. */
  prior: number[];
  /** Posterior covariance of the mean estimate (τ-scale). */
  posteriorCov: number[][];
}

/**
 * Black–Litterman posterior expected returns.
 *
 *   Π = δ Σ w_mkt                                    (equilibrium prior)
 *   μ_BL = [(τΣ)⁻¹ + Pᵀ Ω⁻¹ P]⁻¹ [(τΣ)⁻¹ Π + Pᵀ Ω⁻¹ Q]
 *   Ω_kk = p_kᵀ (τΣ) p_k / confidence_k              (He–Litterman default,
 *                                                     scaled by confidence)
 *
 * With no views this returns Π exactly — the allocator then reproduces the
 * market portfolio, which is the correct "no-information" behaviour and the
 * main robustness win over raw sample-mean Markowitz.
 *
 * @param sigma      covariance of returns (period units, e.g. daily)
 * @param marketWeights  benchmark/market-cap or current portfolio weights
 * @param views      list of views (may be empty)
 * @param delta      risk-aversion of the representative agent (default 2.5)
 * @param tau        prior uncertainty scale (default 0.05)
 */
export function blackLitterman(
  sigma: number[][],
  marketWeights: number[],
  views: BLView[],
  delta = 2.5,
  tau = 0.05,
): BLResult | null {
  const N = sigma.length;
  if (N < 2 || marketWeights.length !== N) return null;

  // Prior Π = δ Σ w
  const prior = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += sigma[i][j] * marketWeights[j];
    prior[i] = delta * s;
  }

  const valid = views.filter(v => v.portfolio.length === N);
  if (valid.length === 0) {
    const tauSigma = sigma.map(r => r.map(v => v * tau));
    return { mu: prior, prior, posteriorCov: tauSigma };
  }

  const K = valid.length;
  const tauSigma = sigma.map(r => r.map(v => v * tau));

  // Ω diagonal: p (τΣ) pᵀ / confidence
  const omegaDiag: number[] = valid.map(v => {
    const conf = Math.min(Math.max(v.confidence ?? 0.5, 1e-3), 1);
    let q = 0;
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) s += tauSigma[i][j] * v.portfolio[j];
      q += v.portfolio[i] * s;
    }
    return Math.max(q, 1e-12) / conf;
  });

  const invTauSigma = invertMatrix(tauSigma);
  if (!invTauSigma) return null;

  // A = (τΣ)⁻¹ + Pᵀ Ω⁻¹ P     (N×N)
  const A: number[][] = invTauSigma.map(r => r.slice());
  for (let k = 0; k < K; k++) {
    const p = valid[k].portfolio;
    const wk = 1 / omegaDiag[k];
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) A[i][j] += p[i] * wk * p[j];
  }
  // b = (τΣ)⁻¹ Π + Pᵀ Ω⁻¹ Q   (N)
  const b = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += invTauSigma[i][j] * prior[j];
    b[i] = s;
  }
  for (let k = 0; k < K; k++) {
    const p = valid[k].portfolio;
    const wk = valid[k].expectedReturn / omegaDiag[k];
    for (let i = 0; i < N; i++) b[i] += p[i] * wk;
  }

  const invA = invertMatrix(A);
  if (!invA) return null;
  const mu = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = 0; j < N; j++) s += invA[i][j] * b[j];
    mu[i] = s;
  }
  const psd = nearestPSD(invA);
  return { mu, prior, posteriorCov: psd ?? invA };
}
