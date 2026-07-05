// Lead–lag predictive edges — the deliberate replacement for TRUTH's
// PC-algorithm causal discovery (rejected: faithfulness/Markov conditions
// are violated in markets; see docs/TRUTH_TO_ENTROPYLITE_MAP.md #10).
//
//   grangerLite(y, x)  OLS  y_t = b0 + b1·y_{t−1} + b2·x_{t−1} + e_t
//                      with Newey–West (HAC) standard error on b2.
//   leadLagScan(...)   all ordered pairs → BH-FDR gate → admitted edges.
//
// Edges are labelled *predictive*, never causal. Every scan goes through
// FDR because testing N·(N−1) pairs is a textbook multiple-testing trap.

import { benjaminiHochberg } from "@/lib/quant/validation";
import type { AssetEdge } from "./types";

export interface GrangerResult {
  /** coefficient on x_{t−1} */
  beta: number;
  /** HAC t-statistic */
  tStat: number;
  /** two-sided p-value (normal approximation, T ≥ 60 enforced) */
  pValue: number;
  n: number;
}

function normCdf(x: number): number {
  // Abramowitz–Stegun 7.1.26, |ε| < 7.5e−8
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x >= 0 ? 1 - p : p;
}

/** Solve a small SPD linear system via Gaussian elimination with partial pivoting. */
function solve(Ain: number[][], bin: number[]): number[] | null {
  const n = bin.length;
  const A = Ain.map((r) => r.slice());
  const b = bin.slice();
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b.map((v, i) => v / A[i][i]);
}

function matInv3(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array(n).fill(0);
    e[j] = 1;
    const x = solve(A, e);
    if (!x) return null;
    cols.push(x);
  }
  // cols are columns of A⁻¹
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}

/**
 * Does x lead y by one bar? Regress y_t on [1, y_{t−1}, x_{t−1}]; report the
 * x_{t−1} coefficient with a Newey–West HAC t-stat (lag L = ⌊4(T/100)^{2/9}⌋,
 * the standard Newey–West 1994 plug-in). Inputs are return series of equal
 * length; requires T ≥ 60.
 */
export function grangerLite(y: number[], x: number[], _lag = 1): GrangerResult | null {
  const T = Math.min(y.length, x.length);
  if (T < 60) return null;
  const n = T - 1; // usable rows
  const p = 3;
  // design matrix rows: [1, y_{t-1}, x_{t-1}], target y_t
  const X: number[][] = [];
  const Y: number[] = [];
  for (let t = 1; t < T; t++) {
    X.push([1, y[t - 1], x[t - 1]]);
    Y.push(y[t]);
  }
  // XtX, XtY
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0));
  const XtY = new Array(p).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < p; a++) {
      XtY[a] += X[i][a] * Y[i];
      for (let b = a; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];

  const beta = solve(XtX, XtY);
  const XtXinv = matInv3(XtX);
  if (!beta || !XtXinv) return null;

  const resid = Y.map((yv, i) => yv - (beta[0] * X[i][0] + beta[1] * X[i][1] + beta[2] * X[i][2]));

  // Newey–West meat: S = Γ0 + Σ_l w_l (Γ_l + Γ_l')
  const L = Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
  const S = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let l = 0; l <= L; l++) {
    const w = l === 0 ? 1 : 1 - l / (L + 1);
    for (let t = l; t < n; t++) {
      const u = resid[t] * resid[t - l];
      for (let a = 0; a < p; a++) {
        for (let b = 0; b < p; b++) {
          const g = u * X[t][a] * X[t - l][b];
          // l = 0: Γ0 term; l > 0: symmetrised Γ_l + Γ_l'
          S[a][b] += l === 0 ? w * g : w * (g + u * X[t - l][a] * X[t][b]);
        }
      }
    }
  }

  // Var(β) = (X'X)⁻¹ S (X'X)⁻¹
  const tmp = Array.from({ length: p }, (_, a) =>
    Array.from({ length: p }, (_, b) => {
      let s = 0;
      for (let k = 0; k < p; k++) s += XtXinv[a][k] * S[k][b];
      return s;
    }),
  );
  let varB2 = 0;
  for (let k = 0; k < p; k++) varB2 += tmp[2][k] * XtXinv[k][2];
  if (!(varB2 > 0)) return null;

  const tStat = beta[2] / Math.sqrt(varB2);
  const pValue = 2 * (1 - normCdf(Math.abs(tStat)));
  return { beta: beta[2], tStat, pValue, n };
}

export interface LeadLagScanResult {
  edges: AssetEdge[];
  tested: number;
  admitted: number;
}

/**
 * Scan all ordered pairs of a return-series map for 1-bar lead–lag edges,
 * admitting only those surviving Benjamini–Hochberg FDR at level q.
 * Edge weight = min(0.4, |t|/10): lead–lag edges are *capped* below
 * membership/cointegration edges by design (provenance weighting, TRUTH §11.2
 * reduced). O(N²·T); intended for N ≤ ~40 series.
 */
export function leadLagScan(series: Record<string, number[]>, q = 0.1): LeadLagScanResult {
  const keys = Object.keys(series);
  const cands: { src: string; dst: string; res: GrangerResult }[] = [];
  for (const src of keys) {
    for (const dst of keys) {
      if (src === dst) continue;
      const res = grangerLite(series[dst], series[src]);
      if (res) cands.push({ src, dst, res });
    }
  }
  if (cands.length === 0) return { edges: [], tested: 0, admitted: 0 };
  const mask = benjaminiHochberg(cands.map((c) => c.res.pValue), q);
  const edges: AssetEdge[] = [];
  cands.forEach((c, i) => {
    if (mask[i]) {
      edges.push({
        src: c.src,
        dst: c.dst,
        type: "lead_lag",
        weight: Math.min(0.4, Math.abs(c.res.tStat) / 10),
      });
    }
  });
  return { edges, tested: cands.length, admitted: edges.length };
}
