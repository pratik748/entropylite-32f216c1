/**
 * Thermodynamic & Spectral Entropic Network Engine
 * ──────────────────────────────────────────────────────────────────────────
 * Institutional-grade Information Theory & Entropic Complexity:
 *
 * 1. Von Neumann Spectral Entropy on Random Matrix Theory (RMT) Filtered Correlations:
 *    - Normalized density matrix: ρ = (1/N) * C_clean where Tr(ρ) = 1.
 *    - Spectral decomposition: ρ = Σ λ_i |v_i⟩⟨v_i|
 *    - Von Neumann Entropy: S(ρ) = -Σ λ_i * ln(λ_i)
 *    - Normalized Spectral Entropy Ratio: η_s = S(ρ) / ln(N) ∈ [0, 1]
 *      (η_s → 0 indicates systemic correlation collapse; η_s → 1 indicates maximum diversification).
 *    - Spectral Absorption Gap: Δλ = (λ_1 - λ_2) / Tr(C)
 *
 * 2. Continuous Shannon Differential Entropy via Kernel Density Estimation (KDE):
 *    - h(X) = -∫ f(x) ln f(x) dx with Gaussian kernel and Silverman's optimal bandwidth.
 *
 * 3. Tsallis Non-Extensive Entropy (q-Entropy):
 *    - S_q(P) = (1 - Σ p_i^q) / (q - 1)
 *    - Captures power-law fat tails and long-range memory in financial return distributions.
 *
 * 4. Transfer Entropy (Directional Information Flow Network):
 *    - Measures directional information transfer from asset X to asset Y beyond common market drift:
 *      T_{X → Y} = I(Y_{t+1}; X_t | Y_t)
 *
 * Pure, deterministic, zero-download, runs instantaneously in browser/WASM.
 */

import { mpCleanCovariance } from "@/lib/quant/institutional";
import { covToCorr, ledoitWolfShrinkage } from "@/lib/quant/covariance";
import { jacobiEigen } from "@/lib/portfolio-math";

export interface SpectralEntropyResult {
  /** Von Neumann Spectral Entropy S(ρ) */
  vonNeumannEntropy: number;
  /** Maximum possible entropy ln(N) */
  maxEntropy: number;
  /** Normalized diversification ratio η_s ∈ [0, 1] */
  diversificationRatio: number;
  /** Market dominance / First eigenvalue absorption ratio λ_1 / Σ λ */
  marketAbsorptionRatio: number;
  /** Spectral Gap (λ_1 - λ_2) / Σ λ */
  spectralGap: number;
  /** Top eigenvalues of the density matrix */
  eigenvalues: number[];
  /** Systemic Fragility State */
  fragilityRegime: "Orthogonal / High-Diversification" | "Moderate Coupling" | "Elevated Fragility" | "Systemic Factor Collapse";
}

/**
 * Computes Von Neumann Spectral Entropy on the empirical correlation matrix.
 * Filters noise via Marchenko-Pastur RMT before spectral evaluation.
 *
 * @param series N asset return series (N >= 2)
 */
export function calculateSpectralEntropy(series: number[][]): SpectralEntropyResult | null {
  const N = series.length;
  if (N < 2) return null;
  const T = Math.min(...series.map(s => s.length));
  if (T < 20) return null;

  // Sample covariance
  const lw = ledoitWolfShrinkage(series);
  if (!lw) return null;

  // Clean covariance matrix via Marchenko-Pastur RMT
  const mpResult = mpCleanCovariance(lw.sample, T);
  const effectiveCov = mpResult ? mpResult.clean : lw.sigma;
  const corr = covToCorr(effectiveCov);

  // Eigendecomposition of correlation matrix
  const eig = jacobiEigen(corr);
  if (!eig) return null;
  const rawValues = eig.values.map(v => Math.max(0, v));
  const tr = rawValues.reduce((a, b) => a + b, 0);

  if (tr < 1e-12) return null;

  // Normalize eigenvalues to form density matrix spectrum where Σ p_i = 1
  const p = rawValues.map(v => v / tr).sort((a, b) => b - a);

  // Compute Von Neumann Entropy S(ρ) = -Σ p_i ln(p_i)
  let sVN = 0;
  for (const pi of p) {
    if (pi > 1e-15) {
      sVN -= pi * Math.log(pi);
    }
  }

  const maxS = Math.log(N);
  const divRatio = maxS > 0 ? Math.max(0, Math.min(1, sVN / maxS)) : 1;
  const marketAbsorption = p[0] || 0;
  const spectralGap = p.length > 1 ? (p[0] - p[1]) : 1;

  let fragilityRegime: SpectralEntropyResult["fragilityRegime"];
  if (divRatio > 0.82) {
    fragilityRegime = "Orthogonal / High-Diversification";
  } else if (divRatio > 0.65) {
    fragilityRegime = "Moderate Coupling";
  } else if (divRatio > 0.45) {
    fragilityRegime = "Elevated Fragility";
  } else {
    fragilityRegime = "Systemic Factor Collapse";
  }

  return {
    vonNeumannEntropy: sVN,
    maxEntropy: maxS,
    diversificationRatio: divRatio,
    marketAbsorptionRatio: marketAbsorption,
    spectralGap,
    eigenvalues: p,
    fragilityRegime,
  };
}

/**
 * Continuous Shannon Differential Entropy via Kernel Density Estimation (KDE)
 * Uses Silverman's rule of thumb bandwidth h = 1.06 * σ * N^{-1/5}.
 *
 * @param series 1D array of asset returns
 */
export function calculateContinuousShannonEntropy(series: number[]): {
  entropy: number;
  bandwidth: number;
  stdDev: number;
} | null {
  const n = series.length;
  if (n < 20) return null;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += series[i];
  mean /= n;

  let variance = 0;
  for (let i = 0; i < n; i++) variance += (series[i] - mean) ** 2;
  variance /= (n - 1);
  const stdDev = Math.sqrt(Math.max(1e-12, variance));

  // Silverman's optimal bandwidth
  const h = 1.06 * stdDev * Math.pow(n, -0.2);
  if (h < 1e-10) return null;

  // Numerical integration over [-4σ, +4σ] grid
  const nGrid = 200;
  const xMin = mean - 4 * stdDev;
  const xMax = mean + 4 * stdDev;
  const dx = (xMax - xMin) / nGrid;

  let entropy = 0;
  const invH = 1 / h;
  const normFactor = 1 / (n * h * Math.sqrt(2 * Math.PI));

  for (let g = 0; g <= nGrid; g++) {
    const x = xMin + g * dx;
    let fx = 0;
    for (let i = 0; i < n; i++) {
      const u = (x - series[i]) * invH;
      fx += Math.exp(-0.5 * u * u);
    }
    fx *= normFactor;

    if (fx > 1e-15) {
      entropy -= fx * Math.log(fx) * dx;
    }
  }

  return { entropy, bandwidth: h, stdDev };
}

/**
 * Tsallis Non-Extensive Entropy (q-Entropy)
 * Measures power-law heavy tails in return distributions.
 *
 * @param probabilities Probability mass vector (sums to 1)
 * @param q Entropic index (q=1 recovers Shannon entropy, q > 1 penalizes rare tail states)
 */
export function calculateTsallisEntropy(probabilities: number[], q = 1.5): number {
  if (probabilities.length === 0) return 0;
  if (Math.abs(q - 1) < 1e-6) {
    // Shannon limit as q -> 1
    return probabilities.reduce((s, p) => (p > 1e-15 ? s - p * Math.log(p) : s), 0);
  }

  let sumPq = 0;
  for (const p of probabilities) {
    if (p > 1e-15) {
      sumPq += Math.pow(p, q);
    }
  }

  return (1 - sumPq) / (q - 1);
}

export interface TransferEntropyMatrixResult {
  /** N x N directional Transfer Entropy matrix T[source][target] */
  matrix: number[][];
  /** Net causal source score for each asset (Outflow - Inflow) */
  netSourceScores: number[];
  /** Asset labels / indices sorted by systemic driving power */
  dominantDrivers: number[];
}

/**
 * Binned Directional Transfer Entropy Estimator:
 * Calculates directional information propagation from Asset X (source) to Asset Y (target):
 * T_{X → Y} = Σ p(y_{t+1}, y_t, x_t) * log2( p(y_{t+1} | y_t, x_t) / p(y_{t+1} | y_t) )
 *
 * @param series N asset return series
 * @param nBins Number of quantization bins (default 4 for robust empirical sampling)
 */
export function calculateTransferEntropyMatrix(
  series: number[][],
  nBins = 4
): TransferEntropyMatrixResult | null {
  const N = series.length;
  if (N < 2) return null;
  const T = Math.min(...series.map(s => s.length));
  if (T < 40) return null;

  // Quantize each series into discrete bins [0, nBins-1]
  const quantized: number[][] = [];
  for (let i = 0; i < N; i++) {
    const s = series[i].slice(-T);
    const sorted = [...s].sort((a, b) => a - b);
    const bounds: number[] = [];
    for (let b = 1; b < nBins; b++) {
      bounds.push(sorted[Math.floor((b * T) / nBins)]);
    }

    const q = s.map(val => {
      for (let b = 0; b < bounds.length; b++) {
        if (val <= bounds[b]) return b;
      }
      return bounds.length;
    });
    quantized.push(q);
  }

  const TE: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));

  for (let src = 0; src < N; src++) {
    for (let dst = 0; dst < N; dst++) {
      if (src === dst) continue;

      const X = quantized[src];
      const Y = quantized[dst];

      // Count joint frequencies of (Y_{t+1}, Y_t, X_t), (Y_t, X_t), (Y_{t+1}, Y_t), (Y_t)
      const countYnextYtXt: Record<string, number> = {};
      const countYtXt: Record<string, number> = {};
      const countYnextYt: Record<string, number> = {};
      const countYt: Record<number, number> = {};
      const nPairs = T - 1;

      for (let t = 0; t < nPairs; t++) {
        const yNext = Y[t + 1];
        const yCurr = Y[t];
        const xCurr = X[t];

        const k3 = `${yNext}_${yCurr}_${xCurr}`;
        const k2yx = `${yCurr}_${xCurr}`;
        const k2yy = `${yNext}_${yCurr}`;

        countYnextYtXt[k3] = (countYnextYtXt[k3] || 0) + 1;
        countYtXt[k2yx] = (countYtXt[k2yx] || 0) + 1;
        countYnextYt[k2yy] = (countYnextYt[k2yy] || 0) + 1;
        countYt[yCurr] = (countYt[yCurr] || 0) + 1;
      }

      let te = 0;
      for (const [k3, n3] of Object.entries(countYnextYtXt)) {
        const [yNextStr, yCurrStr, xCurrStr] = k3.split("_");
        const yNext = Number(yNextStr);
        const yCurr = Number(yCurrStr);
        const xCurr = Number(xCurrStr);

        const p3 = n3 / nPairs;
        const pYtXt = (countYtXt[`${yCurr}_${xCurr}`] || 1) / nPairs;
        const pYnextYt = (countYnextYt[`${yNext}_${yCurr}`] || 1) / nPairs;
        const pYt = (countYt[yCurr] || 1) / nPairs;

        // p(y_{t+1} | y_t, x_t) / p(y_{t+1} | y_t) = (p3 / pYtXt) / (pYnextYt / pYt)
        const num = p3 / pYtXt;
        const den = pYnextYt / pYt;

        if (num > 0 && den > 0) {
          te += p3 * Math.log2(num / den);
        }
      }

      TE[src][dst] = Math.max(0, te);
    }
  }

  // Calculate Net Causal Source Scores (Outflow - Inflow)
  const netScores: number[] = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let outFlow = 0;
    let inFlow = 0;
    for (let j = 0; j < N; j++) {
      outFlow += TE[i][j];
      inFlow += TE[j][i];
    }
    netScores[i] = outFlow - inFlow;
  }

  const dominantDrivers = Array.from({ length: N }, (_, i) => i).sort(
    (a, b) => netScores[b] - netScores[a]
  );

  return {
    matrix: TE,
    netSourceScores: netScores,
    dominantDrivers,
  };
}
