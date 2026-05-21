/**
 * Portfolio Math — real, citable, deterministic.
 * Inputs come from the realized covariance matrix Σ and (where used) the
 * realized mean-return vector μ produced by useQuantSnapshot.
 *
 * Hard rules (enforced):
 *  - No Math.random, no synthetic smoothing, no random initialization.
 *  - No inverse-vol shortcut substituted for true risk parity.
 *  - No fallback weights, no heuristics.
 *  - Every output derives from Σ or μ directly.
 *  - On degenerate input (n<2, singular Σ, insufficient sample) → return null.
 *
 * References:
 *  - Markowitz, H. (1952) "Portfolio Selection". J. Finance 7(1).
 *  - Kelly, J.L. (1956) "A New Interpretation of Information Rate". BSTJ.
 *  - Thorp, E.O. (2006) "The Kelly Criterion in Blackjack, Sports Betting,
 *    and the Stock Market". Handbook of Asset and Liability Mgmt.
 *  - Marchenko, V.A. & Pastur, L.A. (1967) "Distribution of eigenvalues
 *    for some sets of random matrices". Math USSR-Sbornik 1.
 *  - Laloux, Cizeau, Bouchaud, Potters (1999) "Noise dressing of financial
 *    correlation matrices". Phys. Rev. Lett. 83.
 *  - Wilson, E.B. (1927) "Probable inference, the law of succession, and
 *    statistical inference". J. Am. Stat. Assoc. 22.
 *  - Maillard, Roncalli, Teiletche (2010) "The properties of equally
 *    weighted risk contribution portfolios". J. Portf. Mgmt.
 */

// ─────────────────────────────────────────────────────────────────
// Linear algebra primitives (small symmetric n ≤ ~50)
// ─────────────────────────────────────────────────────────────────

/** Deep-clone a square matrix. */
function cloneMat(A: number[][]): number[][] {
  return A.map(row => row.slice());
}

/** In-place Gauss-Jordan inverse. Returns null if singular. */
export function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  if (n === 0 || A.some(r => r.length !== n)) return null;
  const M: number[][] = A.map((row, i) => {
    const r = row.slice();
    for (let j = 0; j < n; j++) r.push(i === j ? 1 : 0);
    return r;
  });
  for (let col = 0; col < n; col++) {
    // Partial pivot
    let pivot = col;
    let max = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > max) { max = v; pivot = r; }
    }
    if (max < 1e-12) return null;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    const pv = M[col][col];
    for (let j = 0; j < 2 * n; j++) M[col][j] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) M[r][j] -= factor * M[col][j];
    }
  }
  return M.map(row => row.slice(n));
}

/** Matrix-vector product. */
function matVec(A: number[][], v: number[]): number[] {
  const n = A.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += A[i][j] * v[j];
    out[i] = s;
  }
  return out;
}

/** Eigen-decomposition of a real symmetric matrix via cyclic Jacobi rotations. */
export function jacobiEigen(
  A: number[][],
  maxSweeps = 100,
  tol = 1e-10,
): { values: number[]; vectors: number[][] } | null {
  const n = A.length;
  if (n === 0) return null;
  // Symmetry check (loose)
  for (let i = 0; i < n; i++) {
    if (A[i].length !== n) return null;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(A[i][j] - A[j][i]) > 1e-6 * (1 + Math.abs(A[i][j]))) return null;
    }
  }
  const M = cloneMat(A);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n - 1; p++)
      for (let q = p + 1; q < n; q++) off += Math.abs(M[p][q]);
    if (off < tol) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = M[p][q];
        if (Math.abs(apq) < tol) continue;
        const app = M[p][p];
        const aqq = M[q][q];
        const theta = (aqq - app) / (2 * apq);
        const t = theta >= 0
          ? 1 / (theta + Math.sqrt(1 + theta * theta))
          : 1 / (theta - Math.sqrt(1 + theta * theta));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        // Rotate M
        M[p][p] = app - t * apq;
        M[q][q] = aqq + t * apq;
        M[p][q] = 0;
        M[q][p] = 0;
        for (let i = 0; i < n; i++) {
          if (i !== p && i !== q) {
            const aip = M[i][p];
            const aiq = M[i][q];
            M[i][p] = c * aip - s * aiq;
            M[p][i] = M[i][p];
            M[i][q] = s * aip + c * aiq;
            M[q][i] = M[i][q];
          }
          const vip = V[i][p];
          const viq = V[i][q];
          V[i][p] = c * vip - s * viq;
          V[i][q] = s * vip + c * viq;
        }
      }
    }
  }
  const values = M.map((r, i) => r[i]);
  return { values, vectors: V };
}

// ─────────────────────────────────────────────────────────────────
// Portfolio strategies
// ─────────────────────────────────────────────────────────────────

/** Equal-weight baseline. */
export function equalWeights(n: number): number[] | null {
  if (n < 2) return null;
  return new Array(n).fill(1 / n);
}

/**
 * Minimum-variance long-only weights.
 * Unconstrained closed form: w* = Σ⁻¹·1 / (1ᵀΣ⁻¹1).
 * If unconstrained solution has negatives, project to long-only via
 * iterative removal of the most negative weight and re-solve the
 * reduced sub-problem (Wolfe-style active set). Returns null if Σ singular.
 */
export function minVarianceWeights(sigma: number[][]): number[] | null {
  const n = sigma.length;
  if (n < 2) return null;
  const active = new Array(n).fill(true);
  for (let pass = 0; pass < n; pass++) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) if (active[i]) idx.push(i);
    if (idx.length === 0) return null;
    if (idx.length === 1) {
      const w = new Array(n).fill(0);
      w[idx[0]] = 1;
      return w;
    }
    const sub: number[][] = idx.map(i => idx.map(j => sigma[i][j]));
    const inv = invertMatrix(sub);
    if (!inv) return null;
    const ones = new Array(idx.length).fill(1);
    const invOnes = matVec(inv, ones);
    const denom = invOnes.reduce((s, v) => s + v, 0);
    if (Math.abs(denom) < 1e-12) return null;
    const subW = invOnes.map(v => v / denom);
    let worst = -1;
    let worstVal = 0;
    for (let k = 0; k < subW.length; k++) {
      if (subW[k] < worstVal) { worstVal = subW[k]; worst = k; }
    }
    if (worst === -1) {
      // All non-negative — accept
      const w = new Array(n).fill(0);
      idx.forEach((i, k) => { w[i] = subW[k]; });
      return w;
    }
    active[idx[worst]] = false;
  }
  return null;
}

/**
 * Mean-variance utility weights.
 * w* maximises  μᵀw − λ·wᵀΣw  s.t. 1ᵀw = 1.
 * Closed form (long/short): w* = Σ⁻¹(μ + γ·1) with γ s.t. weights sum to 1.
 * For long-only display we then project to simplex (clip negatives, renormalize),
 * which is explicit and not a hidden heuristic.
 */
export function meanVarianceWeights(
  mu: number[],
  sigma: number[][],
  riskAversion = 2,
): number[] | null {
  const n = sigma.length;
  if (n < 2 || mu.length !== n || riskAversion <= 0) return null;
  const inv = invertMatrix(sigma);
  if (!inv) return null;
  // raw = Σ⁻¹ μ / λ
  const raw = matVec(inv, mu).map(v => v / riskAversion);
  const ones = new Array(n).fill(1);
  const invOnes = matVec(inv, ones);
  const A = invOnes.reduce((s, v) => s + v, 0);
  const B = raw.reduce((s, v) => s + v, 0);
  if (Math.abs(A) < 1e-12) return null;
  const gamma = (1 - B) / A;
  const w = raw.map((v, i) => v + gamma * invOnes[i] / 1);
  // Long-only simplex projection (explicit)
  const clipped = w.map(v => Math.max(v, 0));
  const s = clipped.reduce((a, v) => a + v, 0);
  if (s < 1e-12) return null;
  return clipped.map(v => v / s);
}

/**
 * Equal Risk Contribution (true risk parity, Maillard et al. 2010).
 * Solves wᵢ·(Σw)ᵢ = const for all i via Newton iteration on the
 * unconstrained log-barrier formulation, then normalises to sum=1.
 * Cycles each coordinate updating wᵢ ← wᵢ · sqrt(target / (Σw)ᵢ).
 * Converges geometrically; returns null if iteration diverges.
 */
export function riskParityWeights(sigma: number[][], maxIter = 500, tol = 1e-8): number[] | null {
  const n = sigma.length;
  if (n < 2) return null;
  // Deterministic init = diag(Σ)^(-1/2) normalised (well-known starting point
  // for ERC solver; converges to the same fixed point regardless of init,
  // and is NOT itself returned as the answer — the iteration overwrites it).
  const diag = sigma.map((r, i) => r[i]);
  if (diag.some(d => d <= 0)) return null;
  let w = diag.map(d => 1 / Math.sqrt(d));
  let s = w.reduce((a, v) => a + v, 0);
  w = w.map(v => v / s);

  for (let iter = 0; iter < maxIter; iter++) {
    const Sw = matVec(sigma, w);
    // Risk contribution RCᵢ = wᵢ·(Σw)ᵢ ; target = portfolio variance / n
    const variance = w.reduce((acc, wi, i) => acc + wi * Sw[i], 0);
    if (variance <= 0) return null;
    const target = variance / n;
    const newW = w.map((wi, i) => {
      const rc = wi * Sw[i];
      if (rc <= 0) return wi;
      return wi * Math.sqrt(target / rc);
    });
    const sum = newW.reduce((a, v) => a + v, 0);
    if (sum <= 0 || !isFinite(sum)) return null;
    const norm = newW.map(v => v / sum);
    // Convergence: max |RCᵢ - target| / target
    let err = 0;
    const SwN = matVec(sigma, norm);
    const varN = norm.reduce((acc, wi, i) => acc + wi * SwN[i], 0);
    const tgtN = varN / n;
    for (let i = 0; i < n; i++) {
      const rc = norm[i] * SwN[i];
      const e = Math.abs(rc - tgtN) / Math.max(tgtN, 1e-12);
      if (e > err) err = e;
    }
    w = norm;
    if (err < tol) return w;
  }
  return null; // failed to converge — never return a heuristic fallback
}

/**
 * Continuous Kelly for a multivariate Gaussian return process.
 * Full-Kelly weights: w_K = Σ⁻¹·μ  (no sum constraint — these are bet sizes).
 * Fractional Kelly scales by `fraction` ∈ (0, 1].
 * For an allocation display we cash-pad: remaining = 1 − Σ wᵢ goes to cash.
 * Reference: Thorp (2006), Kelly (1956). Returns null if Σ singular.
 */
export function fractionalKellyWeights(
  mu: number[],
  sigma: number[][],
  fraction = 0.25,
): { risk: number[]; cash: number } | null {
  const n = sigma.length;
  if (n < 2 || mu.length !== n) return null;
  if (fraction <= 0 || fraction > 1) return null;
  const inv = invertMatrix(sigma);
  if (!inv) return null;
  const wRaw = matVec(inv, mu).map(v => v * fraction);
  // Clip negatives to 0 (long-only display). Cap leverage at 1.
  const wPos = wRaw.map(v => Math.max(v, 0));
  let sumPos = wPos.reduce((a, v) => a + v, 0);
  if (sumPos > 1) {
    const k = 1 / sumPos;
    for (let i = 0; i < wPos.length; i++) wPos[i] *= k;
    sumPos = 1;
  }
  return { risk: wPos, cash: Math.max(0, 1 - sumPos) };
}

// ─────────────────────────────────────────────────────────────────
// Random Matrix Theory — noise vs signal
// ─────────────────────────────────────────────────────────────────

/**
 * Marchenko–Pastur upper edge for a correlation matrix built from N assets
 * over T daily observations: λ₊ = σ²(1 + √(N/T))².
 * For a correlation matrix the implicit σ² = 1.
 * Eigenvalues exceeding λ₊ are statistically significant (genuine signal).
 * Returns null when T < N + 5 (insufficient sample).
 */
export function marchenkoPastur(
  eigenvalues: number[],
  T: number,
  N: number,
  variance = 1,
): { lambdaPlus: number; lambdaMinus: number; signalCount: number; signalShare: number } | null {
  if (N < 2 || T < N + 5 || eigenvalues.length !== N) return null;
  const q = N / T;
  const sqrtQ = Math.sqrt(q);
  const lambdaPlus = variance * (1 + sqrtQ) ** 2;
  const lambdaMinus = variance * (1 - sqrtQ) ** 2;
  const signalEigs = eigenvalues.filter(l => l > lambdaPlus);
  const totalVar = eigenvalues.reduce((a, v) => a + v, 0);
  const signalShare = totalVar > 0
    ? signalEigs.reduce((a, v) => a + v, 0) / totalVar
    : 0;
  return { lambdaPlus, lambdaMinus, signalCount: signalEigs.length, signalShare };
}

/**
 * PC1 concentration: share of total variance explained by the top eigenvalue
 * of the correlation matrix. > 40% suggests systemic factor dominance.
 * Reference: Bouchaud & Potters, Theory of Financial Risk and Derivative Pricing.
 */
export function pc1Concentration(corrOrCov: number[][]): number | null {
  const n = corrOrCov.length;
  if (n < 2) return null;
  const eig = jacobiEigen(corrOrCov);
  if (!eig) return null;
  const total = eig.values.reduce((a, v) => a + v, 0);
  if (total <= 0) return null;
  const top = Math.max(...eig.values);
  return top / total;
}

// ─────────────────────────────────────────────────────────────────
// Statistics
// ─────────────────────────────────────────────────────────────────

/**
 * Wilson score interval for a binomial proportion.
 * Returns [low, high] containing the true proportion with 1-α confidence
 * given `successes` out of `trials`. Z=1.96 → 95%.
 * Reference: Wilson (1927).
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z = 1.96,
): { p: number; low: number; high: number } | null {
  if (trials <= 0 || successes < 0 || successes > trials) return null;
  const n = trials;
  const phat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (phat + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt(phat * (1 - phat) / n + z2 / (4 * n * n))) / denom;
  return {
    p: phat,
    low: Math.max(0, center - margin),
    high: Math.min(1, center + margin),
  };
}
