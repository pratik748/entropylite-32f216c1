// Change-point & regime detection — pure, deterministic, browser-cheap.
//
//   cusum(xs)       two-sided CUSUM (Page 1954) on robust z-scores. O(T).
//   gaussianHMM(xs) K-state Gaussian HMM via scaled forward–backward EM
//                   (Baum–Welch). O(T·K²·iters). K=3 default extends the
//                   2-state `hmmRegimeDetect` in statarb-math.ts.
//
// Both are standard, mathematically settled methods; no invented constants —
// CUSUM defaults (k=0.5, h=5 in σ units) are the textbook ARL≈370 design.

// ─── robust standardisation ──────────────────────────────────────

export function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Robust z-scores via median / 1.4826·MAD. Falls back to stdev if MAD=0. */
export function robustZ(xs: number[]): number[] {
  if (xs.length === 0) return [];
  const med = medianOf(xs);
  const mad = medianOf(xs.map((x) => Math.abs(x - med)));
  let scale = 1.4826 * mad;
  if (scale < 1e-12) {
    const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, xs.length - 1));
    scale = sd > 1e-12 ? sd : 1;
  }
  return xs.map((x) => (x - med) / scale);
}

// ─── CUSUM ───────────────────────────────────────────────────────

export interface CusumResult {
  /** indices where an alarm fired (statistic reset after each alarm) */
  alarms: number[];
  sPos: number[];
  sNeg: number[];
  /** last value of max(S⁺, S⁻) — proximity to alarm */
  lastStat: number;
}

/**
 * Two-sided CUSUM on robust z-scores.
 * S⁺_t = max(0, S⁺_{t−1} + z_t − k),  S⁻_t = max(0, S⁻_{t−1} − z_t − k);
 * alarm when either exceeds h. k = allowance (σ/2 detects 1σ shifts fastest),
 * h = decision interval.
 */
export function cusum(xs: number[], k = 0.5, h = 5): CusumResult {
  const z = robustZ(xs);
  const sPos: number[] = new Array(z.length).fill(0);
  const sNeg: number[] = new Array(z.length).fill(0);
  const alarms: number[] = [];
  let p = 0;
  let n = 0;
  for (let t = 0; t < z.length; t++) {
    p = Math.max(0, p + z[t] - k);
    n = Math.max(0, n - z[t] - k);
    sPos[t] = p;
    sNeg[t] = n;
    if (p > h || n > h) {
      alarms.push(t);
      p = 0;
      n = 0;
    }
  }
  const last = z.length ? Math.max(sPos[z.length - 1], sNeg[z.length - 1]) : 0;
  return { alarms, sPos, sNeg, lastStat: last };
}

// ─── K-state Gaussian HMM (Baum–Welch, scaled) ───────────────────

export interface HMMFit {
  K: number;
  /** state means, ordered by ascending σ (state 0 = calmest) */
  mu: number[];
  sigma: number[];
  /** row-stochastic transition matrix */
  transition: number[][];
  /** T×K smoothed posteriors γ_t(k) */
  posterior: number[][];
  /** argmax-posterior state path */
  states: number[];
  logLik: number;
  /** P(state switches on the next step) = Σ_k γ_T(k)·(1 − A_kk) */
  pChange: number;
}

const SQRT2PI = Math.sqrt(2 * Math.PI);

function gaussPdf(x: number, mu: number, sigma: number): number {
  const s = Math.max(sigma, 1e-9);
  const d = (x - mu) / s;
  return Math.exp(-0.5 * d * d) / (s * SQRT2PI);
}

/**
 * Fit a K-state Gaussian HMM with sticky initialisation.
 * Deterministic: quantile-based init, fixed iteration count / tolerance.
 * Returns null when the series is too short (< 10·K observations).
 */
export function gaussianHMM(xs: number[], K = 3, maxIters = 60, tol = 1e-6): HMMFit | null {
  const T = xs.length;
  if (T < 10 * K) return null;

  // init: means at spread quantiles, common sd, sticky diagonal
  const sorted = [...xs].sort((a, b) => a - b);
  const q = (p: number) => sorted[Math.min(T - 1, Math.max(0, Math.round(p * (T - 1))))];
  const globalMu = xs.reduce((a, b) => a + b, 0) / T;
  const globalSd = Math.sqrt(xs.reduce((a, b) => a + (b - globalMu) ** 2, 0) / Math.max(1, T - 1)) || 1e-6;
  let mu = Array.from({ length: K }, (_, k) => q(0.15 + (0.7 * k) / Math.max(1, K - 1)));
  let sigma = Array.from({ length: K }, () => globalSd);
  const A = Array.from({ length: K }, (_, i) =>
    Array.from({ length: K }, (_, j) => (i === j ? 0.9 : 0.1 / (K - 1))),
  );
  let pi = new Array(K).fill(1 / K);

  const alpha: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  const beta: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  const gamma: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  const c: number[] = new Array(T).fill(0);

  let prevLL = -Infinity;
  let logLik = -Infinity;

  for (let iter = 0; iter < maxIters; iter++) {
    // E-step: scaled forward
    for (let k = 0; k < K; k++) alpha[0][k] = pi[k] * gaussPdf(xs[0], mu[k], sigma[k]);
    c[0] = alpha[0].reduce((a, b) => a + b, 0) || 1e-300;
    for (let k = 0; k < K; k++) alpha[0][k] /= c[0];
    for (let t = 1; t < T; t++) {
      for (let k = 0; k < K; k++) {
        let s = 0;
        for (let j = 0; j < K; j++) s += alpha[t - 1][j] * A[j][k];
        alpha[t][k] = s * gaussPdf(xs[t], mu[k], sigma[k]);
      }
      c[t] = alpha[t].reduce((a, b) => a + b, 0) || 1e-300;
      for (let k = 0; k < K; k++) alpha[t][k] /= c[t];
    }
    // scaled backward
    for (let k = 0; k < K; k++) beta[T - 1][k] = 1;
    for (let t = T - 2; t >= 0; t--) {
      for (let j = 0; j < K; j++) {
        let s = 0;
        for (let k = 0; k < K; k++) s += A[j][k] * gaussPdf(xs[t + 1], mu[k], sigma[k]) * beta[t + 1][k];
        beta[t][j] = s / c[t + 1];
      }
    }
    // posteriors
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (let k = 0; k < K; k++) {
        gamma[t][k] = alpha[t][k] * beta[t][k];
        s += gamma[t][k];
      }
      s = s || 1e-300;
      for (let k = 0; k < K; k++) gamma[t][k] /= s;
    }
    logLik = c.reduce((a, b) => a + Math.log(b), 0);

    // M-step
    const newA = Array.from({ length: K }, () => new Array(K).fill(0));
    const denomA = new Array(K).fill(0);
    for (let t = 0; t < T - 1; t++) {
      // ξ_t(j,k) ∝ α_t(j)·A_jk·b_k(x_{t+1})·β_{t+1}(k)
      let norm = 0;
      const xi: number[][] = Array.from({ length: K }, () => new Array(K).fill(0));
      for (let j = 0; j < K; j++) {
        for (let k = 0; k < K; k++) {
          xi[j][k] = alpha[t][j] * A[j][k] * gaussPdf(xs[t + 1], mu[k], sigma[k]) * beta[t + 1][k];
          norm += xi[j][k];
        }
      }
      norm = norm || 1e-300;
      for (let j = 0; j < K; j++) {
        for (let k = 0; k < K; k++) newA[j][k] += xi[j][k] / norm;
        denomA[j] += gamma[t][j];
      }
    }
    for (let j = 0; j < K; j++) {
      const d = denomA[j] || 1e-300;
      for (let k = 0; k < K; k++) A[j][k] = Math.max(1e-6, newA[j][k] / d);
      const rs = A[j].reduce((a, b) => a + b, 0);
      for (let k = 0; k < K; k++) A[j][k] /= rs;
    }
    pi = gamma[0].slice();
    for (let k = 0; k < K; k++) {
      let w = 0;
      let m = 0;
      for (let t = 0; t < T; t++) {
        w += gamma[t][k];
        m += gamma[t][k] * xs[t];
      }
      w = w || 1e-300;
      mu[k] = m / w;
      let v = 0;
      for (let t = 0; t < T; t++) v += gamma[t][k] * (xs[t] - mu[k]) ** 2;
      sigma[k] = Math.max(Math.sqrt(v / w), 1e-6);
    }

    if (Math.abs(logLik - prevLL) < tol * Math.abs(prevLL || 1)) break;
    prevLL = logLik;
  }

  // order states by ascending sigma for stable labelling (state 0 = calmest)
  const order = Array.from({ length: K }, (_, k) => k).sort((a, b) => sigma[a] - sigma[b]);
  mu = order.map((k) => mu[k]);
  sigma = order.map((k) => sigma[k]);
  const post = gamma.map((row) => order.map((k) => row[k]));
  const states = post.map((row) => row.indexOf(Math.max(...row)));

  // transition matrix of the ordered states, re-estimated from the smoothed
  // state path with add-ε smoothing (avoids permutation bookkeeping on A)
  const Anew = Array.from({ length: K }, () => new Array(K).fill(1e-6));
  for (let t = 0; t < T - 1; t++) Anew[states[t]][states[t + 1]] += 1;
  for (let j = 0; j < K; j++) {
    const rs = Anew[j].reduce((a, b) => a + b, 0);
    for (let k = 0; k < K; k++) Anew[j][k] /= rs;
  }

  const last = post[T - 1];
  let pChange = 0;
  for (let k = 0; k < K; k++) pChange += last[k] * (1 - Anew[k][k]);

  return { K, mu, sigma, transition: Anew, posterior: post, states, logLik, pChange };
}
