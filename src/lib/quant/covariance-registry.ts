/**
 * Covariance model registry — no single estimator is "the" truth.
 * ─────────────────────────────────────────────────────────────────────────
 * Aladdin-style discipline: every Σ-derived number states exactly which
 * estimator produced it, and the desk can flip estimators and watch the
 * numbers move. The registry wraps the existing estimation layer
 * (covariance.ts, institutional.ts) behind one explicit model descriptor:
 *
 *   CovarianceModel = { estimator, window, decay, shrinkage, cleaning, asOf }
 *
 * Disagreement between estimators is surfaced, not hidden — EWMA far above
 * sample σ means volatility is rising faster than the long window admits.
 */

import { ledoitWolfShrinkage, ewmaCovariance, dccLite } from "@/lib/quant/covariance";
import { mpCleanCovariance, nearestPSD } from "@/lib/quant/institutional";

export type CovModelId = "sample" | "ewma" | "ledoit_wolf" | "dcc_lite" | "mp_clean";

export interface CovModelDef {
  id: CovModelId;
  label: string;
  short: string;
  description: string;
}

export const COV_MODELS: CovModelDef[] = [
  { id: "sample", label: "Sample covariance", short: "Sample", description: "Equal-weight ML sample covariance over the aligned history — the unbiased baseline, noisy when T/N is small." },
  { id: "ewma", label: "EWMA (RiskMetrics λ=0.94)", short: "EWMA", description: "Exponentially weighted — reacts to the latest regime; yesterday matters more than last quarter." },
  { id: "ledoit_wolf", label: "Ledoit–Wolf shrinkage", short: "LW", description: "Sample shrunk toward constant correlation with data-estimated intensity δ — the standard fix for ill-conditioned Σ." },
  { id: "dcc_lite", label: "DCC-lite dynamic correlation", short: "DCC", description: "EWMA volatilities recombined with EWMA correlations of standardized residuals — captures correlations rising in stress." },
  { id: "mp_clean", label: "Marchenko–Pastur cleaned", short: "MP", description: "Eigenvalues inside the random-matrix noise band collapsed — keeps only statistically significant correlation structure." },
];

export interface CovarianceModelMeta {
  id: CovModelId;
  label: string;
  estimator: string;
  /** Observations used. */
  window: number;
  /** EWMA decay λ, when applicable. */
  decay: number | null;
  /** Shrinkage intensity δ, when applicable. */
  shrinkage: number | null;
  /** Cleaning applied ("PSD projection", "MP eigenvalue clipping", …). */
  cleaning: string | null;
  asOf: number;
}

export interface CovarianceEstimate {
  sigma: number[][];
  meta: CovarianceModelMeta;
}

const alignedT = (series: number[][]): number => Math.min(...series.map((s) => s.length));

/** Plain sample covariance (denominator T−1), tail-aligned. */
export function sampleCovarianceAligned(series: number[][]): number[][] | null {
  const N = series.length;
  if (N < 2) return null;
  const T = alignedT(series);
  if (T < 20) return null;
  const X = series.map((s) => s.slice(-T));
  const means = X.map((s) => s.reduce((a, v) => a + v, 0) / T);
  const S: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      let acc = 0;
      for (let t = 0; t < T; t++) acc += (X[i][t] - means[i]) * (X[j][t] - means[j]);
      S[i][j] = S[j][i] = acc / (T - 1);
    }
  }
  return S;
}

/**
 * Estimate Σ under the named model. Returns null when the estimator cannot
 * run honestly (thin data, degenerate input) — no silent substitution of a
 * different estimator.
 */
export function estimateCovariance(id: CovModelId, series: number[][]): CovarianceEstimate | null {
  const N = series.length;
  if (N < 2) return null;
  const T = alignedT(series);
  const def = COV_MODELS.find((m) => m.id === id);
  if (!def) return null;
  const base: Omit<CovarianceModelMeta, "estimator" | "decay" | "shrinkage" | "cleaning"> = {
    id, label: def.label, window: T, asOf: Date.now(),
  };

  switch (id) {
    case "sample": {
      const S = sampleCovarianceAligned(series);
      if (!S) return null;
      return { sigma: S, meta: { ...base, estimator: "equal-weight sample (T−1)", decay: null, shrinkage: null, cleaning: null } };
    }
    case "ewma": {
      const S = ewmaCovariance(series, 0.94);
      if (!S) return null;
      const psd = nearestPSD(S) ?? S;
      return { sigma: psd, meta: { ...base, estimator: "RiskMetrics EWMA", decay: 0.94, shrinkage: null, cleaning: "PSD projection" } };
    }
    case "ledoit_wolf": {
      const lw = ledoitWolfShrinkage(series);
      if (!lw) return null;
      return { sigma: lw.sigma, meta: { ...base, estimator: "Ledoit–Wolf constant-correlation", decay: null, shrinkage: lw.delta, cleaning: "PSD projection" } };
    }
    case "dcc_lite": {
      const d = dccLite(series);
      if (!d) return null;
      return { sigma: d.sigma, meta: { ...base, estimator: "scalar DCC-lite (EWMA vol × EWMA corr)", decay: 0.94, shrinkage: null, cleaning: "PSD projection" } };
    }
    case "mp_clean": {
      const S = sampleCovarianceAligned(series);
      if (!S) return null;
      const mp = mpCleanCovariance(S, T);
      if (!mp) return null;
      return { sigma: mp.clean, meta: { ...base, estimator: "sample + Marchenko–Pastur eigenvalue clipping", decay: null, shrinkage: null, cleaning: `MP clip λ₊=${mp.lambdaPlus.toFixed(2)}, signal share ${(mp.signalShare * 100).toFixed(0)}%` } };
    }
  }
}

/** Daily portfolio σ under a given Σ: √(wᵀΣw). */
export function portfolioSigmaFrom(sigma: number[][], weights: number[]): number {
  let v = 0;
  for (let i = 0; i < weights.length; i++)
    for (let j = 0; j < weights.length; j++) v += weights[i] * weights[j] * sigma[i][j];
  return Math.sqrt(Math.max(0, v));
}

export interface CovComparison {
  id: CovModelId;
  short: string;
  /** Annualized portfolio σ under this estimator, or null if it can't run. */
  sigmaAnnual: number | null;
}

/**
 * Portfolio σ under every registered estimator — the model-disagreement
 * row. A wide spread is itself information about regime instability.
 */
export function compareCovModels(series: number[][], weights: number[]): CovComparison[] {
  return COV_MODELS.map((m) => {
    const est = estimateCovariance(m.id, series);
    return {
      id: m.id,
      short: m.short,
      sigmaAnnual: est ? portfolioSigmaFrom(est.sigma, weights) * Math.sqrt(252) : null,
    };
  });
}
