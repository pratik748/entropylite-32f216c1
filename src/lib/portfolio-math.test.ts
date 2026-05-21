import { describe, it, expect } from "vitest";
import {
  invertMatrix,
  jacobiEigen,
  equalWeights,
  minVarianceWeights,
  meanVarianceWeights,
  riskParityWeights,
  fractionalKellyWeights,
  marchenkoPastur,
  pc1Concentration,
  wilsonInterval,
} from "./portfolio-math";

const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const sumsTo1 = (w: number[], eps = 1e-8) =>
  Math.abs(w.reduce((s, v) => s + v, 0) - 1) < eps;

// Helper: build a covariance matrix from σ vector and correlation matrix
function covFromCorr(sigmas: number[], corr: number[][]): number[][] {
  const n = sigmas.length;
  const out: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out[i][j] = sigmas[i] * sigmas[j] * corr[i][j];
  return out;
}

describe("invertMatrix", () => {
  it("inverts a known 2x2 matrix", () => {
    const A = [[4, 7], [2, 6]];
    const inv = invertMatrix(A)!;
    // Expected: [[0.6,-0.7],[-0.2,0.4]]
    expect(approx(inv[0][0], 0.6)).toBe(true);
    expect(approx(inv[0][1], -0.7)).toBe(true);
    expect(approx(inv[1][0], -0.2)).toBe(true);
    expect(approx(inv[1][1], 0.4)).toBe(true);
  });
  it("returns null on singular matrix", () => {
    expect(invertMatrix([[1, 2], [2, 4]])).toBeNull();
  });
  it("A·A⁻¹ = I for 3x3 symmetric PD matrix", () => {
    const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]];
    const inv = invertMatrix(A)!;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) s += A[i][k] * inv[k][j];
        expect(approx(s, i === j ? 1 : 0, 1e-9)).toBe(true);
      }
  });
});

describe("jacobiEigen", () => {
  it("recovers eigenvalues of diag matrix", () => {
    const eig = jacobiEigen([[3, 0], [0, 5]])!;
    const vals = eig.values.slice().sort((a, b) => a - b);
    expect(approx(vals[0], 3)).toBe(true);
    expect(approx(vals[1], 5)).toBe(true);
  });
  it("eigenvalues sum equals trace (3x3)", () => {
    const A = [[2, 1, 0], [1, 2, 1], [0, 1, 2]];
    const eig = jacobiEigen(A)!;
    const trace = 6;
    const sum = eig.values.reduce((s, v) => s + v, 0);
    expect(approx(sum, trace, 1e-8)).toBe(true);
    // Known eigenvalues: 2, 2-√2, 2+√2
    const sorted = eig.values.slice().sort((a, b) => a - b);
    expect(approx(sorted[0], 2 - Math.SQRT2, 1e-8)).toBe(true);
    expect(approx(sorted[1], 2, 1e-8)).toBe(true);
    expect(approx(sorted[2], 2 + Math.SQRT2, 1e-8)).toBe(true);
  });
});

describe("equalWeights", () => {
  it("returns 1/n vector", () => {
    expect(equalWeights(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
  });
  it("returns null for n<2", () => {
    expect(equalWeights(1)).toBeNull();
  });
});

describe("minVarianceWeights", () => {
  it("assigns higher weight to the lower-variance asset (uncorrelated)", () => {
    // Diagonal Σ → analytical w_i ∝ 1/σ_i²
    const sigma = [[0.04, 0], [0, 0.01]];
    const w = minVarianceWeights(sigma)!;
    expect(sumsTo1(w)).toBe(true);
    // Closed-form: w1 = (1/0.04)/(1/0.04+1/0.01) = 25/125 = 0.2
    expect(approx(w[0], 0.2, 1e-9)).toBe(true);
    expect(approx(w[1], 0.8, 1e-9)).toBe(true);
  });
  it("long-only projection: no negative weights", () => {
    // Strongly correlated assets — unconstrained min-var would short one.
    const sigma = covFromCorr([0.2, 0.25], [[1, 0.95], [0.95, 1]]);
    const w = minVarianceWeights(sigma)!;
    expect(sumsTo1(w)).toBe(true);
    for (const v of w) expect(v).toBeGreaterThanOrEqual(0);
  });
  it("deterministic: same input → same output across 20 runs", () => {
    const sigma = covFromCorr([0.15, 0.2, 0.3], [[1, 0.3, 0.1], [0.3, 1, 0.2], [0.1, 0.2, 1]]);
    const first = minVarianceWeights(sigma)!;
    for (let k = 0; k < 20; k++) {
      const w = minVarianceWeights(sigma)!;
      for (let i = 0; i < first.length; i++) expect(w[i]).toBe(first[i]);
    }
  });
});

describe("meanVarianceWeights", () => {
  it("higher μ asset gets more weight (diagonal Σ)", () => {
    const w = meanVarianceWeights([0.05, 0.15], [[0.04, 0], [0, 0.04]], 2)!;
    expect(sumsTo1(w)).toBe(true);
    expect(w[1]).toBeGreaterThan(w[0]);
  });
  it("returns null on bad input", () => {
    expect(meanVarianceWeights([0.1], [[0.04, 0], [0, 0.04]], 2)).toBeNull();
    expect(meanVarianceWeights([0.1, 0.1], [[0.04, 0], [0, 0.04]], 0)).toBeNull();
  });
});

describe("riskParityWeights — true ERC", () => {
  it("equal weights when Σ = I", () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const w = riskParityWeights(I)!;
    expect(sumsTo1(w)).toBe(true);
    for (const v of w) expect(approx(v, 1 / 3, 1e-6)).toBe(true);
  });
  it("risk contributions are equal across assets", () => {
    const sigma = covFromCorr([0.1, 0.2, 0.3], [[1, 0.2, 0.1], [0.2, 1, 0.3], [0.1, 0.3, 1]]);
    const w = riskParityWeights(sigma)!;
    // RCᵢ = wᵢ·(Σw)ᵢ — all equal
    const Sw = sigma.map(row => row.reduce((s, v, j) => s + v * w[j], 0));
    const rc = w.map((wi, i) => wi * Sw[i]);
    const mean = rc.reduce((s, v) => s + v, 0) / rc.length;
    for (const c of rc) expect(approx(c, mean, 1e-6)).toBe(true);
  });
  it("differs from inverse-vol shortcut on correlated assets", () => {
    const sigmas = [0.1, 0.2, 0.3];
    const sigma = covFromCorr(sigmas, [[1, 0.7, 0.6], [0.7, 1, 0.5], [0.6, 0.5, 1]]);
    const w = riskParityWeights(sigma)!;
    // Inverse-vol shortcut: w_i ∝ 1/σ_i
    const invVol = sigmas.map(s => 1 / s);
    const Z = invVol.reduce((a, v) => a + v, 0);
    const ivw = invVol.map(v => v / Z);
    let maxDiff = 0;
    for (let i = 0; i < w.length; i++) maxDiff = Math.max(maxDiff, Math.abs(w[i] - ivw[i]));
    // True ERC ≠ 1/σ shortcut when correlations are non-trivial
    expect(maxDiff).toBeGreaterThan(1e-3);
  });
});

describe("fractionalKellyWeights", () => {
  it("scales linearly with fraction (before clipping)", () => {
    // μ small enough that full-Kelly weights still sum < 1 (no leverage cap)
    const mu = [0.005, 0.003];
    const sigma = [[0.04, 0.01], [0.01, 0.09]];
    const full = fractionalKellyWeights(mu, sigma, 1)!;
    const half = fractionalKellyWeights(mu, sigma, 0.5)!;
    // Sanity: full-Kelly not leverage-capped here
    expect(full.risk[0] + full.risk[1]).toBeLessThan(1);
    expect(approx(half.risk[0], full.risk[0] * 0.5, 1e-9)).toBe(true);
    expect(approx(half.risk[1], full.risk[1] * 0.5, 1e-9)).toBe(true);
  });
  it("cash + risk weights ≤ 1 and ≥ 0", () => {
    const r = fractionalKellyWeights([0.5, 0.4], [[0.04, 0], [0, 0.04]], 0.25)!;
    const total = r.cash + r.risk.reduce((s, v) => s + v, 0);
    expect(approx(total, 1, 1e-9)).toBe(true);
    expect(r.cash).toBeGreaterThanOrEqual(0);
    for (const v of r.risk) expect(v).toBeGreaterThanOrEqual(0);
  });
});

describe("marchenkoPastur", () => {
  it("computes λ₊ = (1+√q)² for correlation matrix", () => {
    const N = 10, T = 100;
    // q = 0.1 → λ₊ = (1+√0.1)² ≈ 1.7325
    const eigs = new Array(N).fill(1);
    const mp = marchenkoPastur(eigs, T, N)!;
    expect(approx(mp.lambdaPlus, (1 + Math.sqrt(0.1)) ** 2, 1e-9)).toBe(true);
    // No eigenvalue exceeds λ₊ → no signal
    expect(mp.signalCount).toBe(0);
  });
  it("flags a dominant eigenvalue as signal", () => {
    const eigs = [4.0, 0.5, 0.5, 0.5, 0.5];
    const mp = marchenkoPastur(eigs, 200, 5)!;
    expect(mp.signalCount).toBe(1);
    expect(mp.signalShare).toBeGreaterThan(0.5);
  });
  it("returns null when T < N+5", () => {
    expect(marchenkoPastur([1, 1, 1], 6, 3)).toBeNull();
  });
});

describe("pc1Concentration", () => {
  it("100% for rank-1 system", () => {
    // All-ones correlation matrix has eigenvalues [n, 0, 0, ...]
    const n = 4;
    const M = Array.from({ length: n }, () => new Array(n).fill(1));
    const pc1 = pc1Concentration(M)!;
    expect(approx(pc1, 1, 1e-6)).toBe(true);
  });
  it("1/n for identity matrix (no concentration)", () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const pc1 = pc1Concentration(I)!;
    expect(approx(pc1, 1 / 3, 1e-6)).toBe(true);
  });
});

describe("wilsonInterval", () => {
  it("matches published reference 50/100 @95% ≈ [0.404, 0.596]", () => {
    const r = wilsonInterval(50, 100)!;
    expect(approx(r.p, 0.5, 1e-9)).toBe(true);
    expect(approx(r.low, 0.4038, 1e-3)).toBe(true);
    expect(approx(r.high, 0.5962, 1e-3)).toBe(true);
  });
  it("interval shrinks as n grows", () => {
    const small = wilsonInterval(5, 10)!;
    const big = wilsonInterval(500, 1000)!;
    expect(big.high - big.low).toBeLessThan(small.high - small.low);
  });
  it("handles edge cases without producing NaN", () => {
    const zero = wilsonInterval(0, 10)!;
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0);
    const all = wilsonInterval(10, 10)!;
    expect(all.high).toBe(1);
    expect(all.low).toBeLessThan(1);
  });
  it("invalid input → null", () => {
    expect(wilsonInterval(11, 10)).toBeNull();
    expect(wilsonInterval(-1, 10)).toBeNull();
    expect(wilsonInterval(5, 0)).toBeNull();
  });
});

describe("determinism across repeated runs (no Math.random)", () => {
  const mu = [0.08, 0.12, 0.05];
  const sigma = covFromCorr([0.15, 0.22, 0.10], [[1, 0.4, 0.1], [0.4, 1, 0.2], [0.1, 0.2, 1]]);
  it("min-var, mean-var, risk-parity, kelly all deterministic across 50 runs", () => {
    const ref = {
      mv: minVarianceWeights(sigma)!,
      mvo: meanVarianceWeights(mu, sigma, 2)!,
      rp: riskParityWeights(sigma)!,
      k: fractionalKellyWeights(mu, sigma, 0.25)!,
    };
    for (let i = 0; i < 50; i++) {
      expect(minVarianceWeights(sigma)).toEqual(ref.mv);
      expect(meanVarianceWeights(mu, sigma, 2)).toEqual(ref.mvo);
      expect(riskParityWeights(sigma)).toEqual(ref.rp);
      expect(fractionalKellyWeights(mu, sigma, 0.25)).toEqual(ref.k);
    }
  });
});