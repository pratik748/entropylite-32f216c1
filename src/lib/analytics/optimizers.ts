/**
 * Unified optimizer facade — every allocator behind one typed interface.
 * ──────────────────────────────────────────────────────────────────────
 * Wraps the existing solvers (portfolio-math, quant/allocation) and adds
 * robust MVO, risk budgeting, and CVaR minimization. Every result carries
 * diagnostics: the conditioning of the Σ actually used, shrinkage intensity,
 * convergence, explicit assumptions, and a confidence grade derived from the
 * sample-size-to-dimension ratio — nothing is asserted without basis.
 *
 * Graceful degradation, in order:
 *   1. Ledoit–Wolf shrinkage of Σ when return series are supplied.
 *   2. nearest-PSD projection of whatever Σ we end up with.
 *   3. If a solver still fails (singular Σ, non-convergence) the result is
 *      null — callers show the reason, never a silent fallback allocation.
 *
 * References: Markowitz (1952); Ledoit & Wolf (2004); Maillard–Roncalli–
 * Teiletche (2010); López de Prado (2016, HRP); Black & Litterman (1992);
 * Rockafellar & Uryasev (2000, CVaR); Bruder & Roncalli (2012, risk budgets).
 */

import {
  minVarianceWeights, meanVarianceWeights, riskParityWeights, jacobiEigen,
} from "@/lib/portfolio-math";
import { nearestPSD, simplexProject, mean } from "@/lib/quant/institutional";
import { ledoitWolfShrinkage } from "@/lib/quant/covariance";
import { hrpWeights, blackLitterman, type BLView } from "@/lib/quant/allocation";
import {
  type OptimizerId, type OptimizerResult, type OptimizerConstraints,
  type OptimizerDiagnostics, type ConfidenceGrade,
} from "./types";

const TRADING_DAYS = 252;

export interface OptimizerInput {
  tickers: string[];
  /** Daily covariance Σ aligned to tickers. */
  sigma: number[][];
  /** Daily mean returns aligned to tickers (needed by μ-based optimizers). */
  mu?: number[];
  /** Aligned daily return series (enables shrinkage + CVaR optimization). */
  returnSeries?: number[][];
  /** Current portfolio weights (turnover reference; BL equilibrium prior). */
  currentWeights?: number[];
  /** Observations behind Σ (for conditioning/confidence diagnostics). */
  sampleSize: number;
  constraints?: OptimizerConstraints;
  /** Black–Litterman views; empty ⇒ pure equilibrium prior. */
  views?: BLView[];
}

export const OPTIMIZER_LABELS: Record<OptimizerId, string> = {
  equal_weight: "Equal Weight",
  min_variance: "Minimum Variance",
  mean_variance: "Mean–Variance",
  robust_mean_variance: "Robust Mean–Variance",
  risk_parity: "Risk Parity (ERC)",
  risk_budget: "Risk Budgeting",
  hrp: "Hierarchical Risk Parity",
  black_litterman: "Black–Litterman",
  min_cvar: "Minimum CVaR",
};

// ─────────────────────────────────────────────────────────────────
// Diagnostics helpers
// ─────────────────────────────────────────────────────────────────

function conditionNumber(sigma: number[][]): number | null {
  const eig = jacobiEigen(sigma);
  if (!eig) return null;
  const vals = eig.values.filter(v => isFinite(v));
  if (vals.length === 0) return null;
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  if (min <= 0) return Infinity;
  return max / min;
}

function gradeOptimizer(sampleSize: number, n: number, converged: boolean): ConfidenceGrade {
  if (!converged) return "low";
  const ratio = sampleSize / Math.max(n, 1);
  if (sampleSize >= 180 && ratio >= 10) return "high";
  if (sampleSize >= 60 && ratio >= 5) return "medium";
  return "low";
}

// ─────────────────────────────────────────────────────────────────
// Constraint machinery
// ─────────────────────────────────────────────────────────────────

/** Project onto {w ≥ 0, Σw = 1, wᵢ ≤ cap} via iterative capping + renorm. */
export function capWeights(w: number[], cap: number): number[] {
  const n = w.length;
  if (cap * n < 1 - 1e-9) return w.map(() => 1 / n); // infeasible cap → equal weight
  let out = w.map(v => Math.max(v, 0));
  for (let pass = 0; pass < n; pass++) {
    const capped = out.map(v => v >= cap);
    const excess = out.reduce((s, v) => s + Math.max(v - cap, 0), 0);
    if (excess < 1e-12) break;
    const freeSum = out.reduce((s, v, i) => s + (capped[i] ? 0 : v), 0);
    const freeCount = capped.filter(c => !c).length;
    out = out.map((v, i) => {
      if (capped[i]) return cap;
      // Distribute excess pro-rata; equally when the free mass is zero.
      return freeSum > 0 ? v + (excess * v) / freeSum : v + excess / Math.max(freeCount, 1);
    });
  }
  const s = out.reduce((a, v) => a + v, 0);
  return s > 0 ? out.map(v => v / s) : w;
}

function applyConstraints(
  weights: number[],
  input: OptimizerInput,
  notes: string[],
): { weights: number[]; cashWeight: number } {
  const c = input.constraints ?? {};
  let w = weights.slice();

  if (c.maxWeight != null && c.maxWeight > 0 && c.maxWeight < 1) {
    const before = Math.max(...w);
    if (before > c.maxWeight + 1e-9) {
      w = capWeights(w, c.maxWeight);
      notes.push(`concentration cap ${(c.maxWeight * 100).toFixed(0)}% binding (max weight was ${(before * 100).toFixed(1)}%)`);
    }
  }

  if (c.maxTurnover != null && input.currentWeights && input.currentWeights.length === w.length) {
    const cur = input.currentWeights;
    let to = 0;
    for (let i = 0; i < w.length; i++) to += Math.abs(w[i] - cur[i]);
    if (to > c.maxTurnover && to > 0) {
      const k = c.maxTurnover / to;
      w = w.map((v, i) => cur[i] + k * (v - cur[i]));
      notes.push(`turnover cap ${(c.maxTurnover * 100).toFixed(0)}% binding (unconstrained turnover ${(to * 100).toFixed(0)}%)`);
    }
  }

  let cashWeight = 0;
  if (c.targetVolAnnual != null && c.targetVolAnnual > 0) {
    const volA = portfolioVolAnnual(w, input.sigma);
    if (volA > c.targetVolAnnual && volA > 0) {
      const k = c.targetVolAnnual / volA;
      w = w.map(v => v * k);
      cashWeight = 1 - k;
      notes.push(`volatility targeting: scaled risk assets ×${k.toFixed(2)}, ${(cashWeight * 100).toFixed(0)}% to cash to hit ${(c.targetVolAnnual * 100).toFixed(0)}% σₐ`);
    }
  }

  return { weights: w, cashWeight };
}

function portfolioVolAnnual(w: number[], sigma: number[][]): number {
  let v = 0;
  for (let i = 0; i < w.length; i++)
    for (let j = 0; j < w.length; j++) v += w[i] * w[j] * sigma[i][j];
  return Math.sqrt(Math.max(v, 0) * TRADING_DAYS);
}

// ─────────────────────────────────────────────────────────────────
// New solvers
// ─────────────────────────────────────────────────────────────────

/**
 * Risk budgeting — generalized ERC (Bruder & Roncalli 2012).
 * Solves wᵢ·(Σw)ᵢ = bᵢ·σ_p² by multiplicative fixed-point iteration
 * wᵢ ← wᵢ·√(bᵢ·σ_p²/RCᵢ). budgets must be positive and sum to 1.
 */
export function riskBudgetWeights(
  sigma: number[][], budgets: number[], maxIter = 800, tol = 1e-8,
): { weights: number[]; iterations: number } | null {
  const n = sigma.length;
  if (n < 2 || budgets.length !== n || budgets.some(b => !(b > 0))) return null;
  const bSum = budgets.reduce((a, v) => a + v, 0);
  const b = budgets.map(v => v / bSum);
  const diag = sigma.map((r, i) => r[i]);
  if (diag.some(d => d <= 0)) return null;
  let w = diag.map((d, i) => b[i] / Math.sqrt(d));
  const s = w.reduce((a, v) => a + v, 0);
  w = w.map(v => v / s);

  for (let iter = 0; iter < maxIter; iter++) {
    const Sw = sigma.map(row => row.reduce((acc, v, j) => acc + v * w[j], 0));
    const variance = w.reduce((acc, wi, i) => acc + wi * Sw[i], 0);
    if (!(variance > 0)) return null;
    const next = w.map((wi, i) => {
      const rc = wi * Sw[i];
      if (rc <= 0) return wi;
      return wi * Math.sqrt((b[i] * variance) / rc);
    });
    const sum = next.reduce((a, v) => a + v, 0);
    if (!(sum > 0) || !isFinite(sum)) return null;
    const norm = next.map(v => v / sum);
    let err = 0;
    const SwN = sigma.map(row => row.reduce((acc, v, j) => acc + v * norm[j], 0));
    const varN = norm.reduce((acc, wi, i) => acc + wi * SwN[i], 0);
    for (let i = 0; i < n; i++) {
      const e = Math.abs(norm[i] * SwN[i] - b[i] * varN) / Math.max(b[i] * varN, 1e-14);
      if (e > err) err = e;
    }
    w = norm;
    if (err < tol) return { weights: w, iterations: iter + 1 };
  }
  return null;
}

/**
 * Minimum-CVaR portfolio by projected subgradient descent on the empirical
 * scenario matrix (Rockafellar–Uryasev objective). At each step the
 * subgradient of CVaR_α(w) is −mean(asset returns over the α-tail scenarios
 * of the current w); we descend and project onto the simplex. Deterministic.
 */
export function minCVaRWeights(
  returnSeries: number[][], alpha = 0.95, maxIter = 400, step = 0.05,
): { weights: number[]; cvar: number; iterations: number } | null {
  const n = returnSeries.length;
  if (n < 2) return null;
  const T = Math.min(...returnSeries.map(s => s.length));
  if (T < 40) return null;
  const R = returnSeries.map(s => s.slice(-T)); // n × T
  const tailCount = Math.max(1, Math.floor((1 - alpha) * T));

  const portRets = (w: number[]): number[] => {
    const out = new Array(T).fill(0);
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += w[i] * R[i][t];
      out[t] = s;
    }
    return out;
  };
  const cvarOf = (w: number[]): number => {
    const p = portRets(w);
    const sorted = [...p].sort((a, b) => a - b);
    let s = 0;
    for (let k = 0; k < tailCount; k++) s += sorted[k];
    return -(s / tailCount);
  };

  let w = new Array(n).fill(1 / n);
  let bestW = w.slice();
  let bestCVaR = cvarOf(w);
  let iterations = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterations = iter + 1;
    const p = portRets(w);
    // Identify tail scenario indices of the CURRENT w
    const idx = p.map((v, t) => [v, t] as const).sort((a, b) => a[0] - b[0]).slice(0, tailCount).map(x => x[1]);
    // Subgradient of CVaR wrt w = −mean over tail of asset returns
    const g = new Array(n).fill(0);
    for (const t of idx) for (let i = 0; i < n; i++) g[i] -= R[i][t];
    for (let i = 0; i < n; i++) g[i] /= tailCount;
    // Descent + simplex projection (diminishing step)
    const eta = step / Math.sqrt(iter + 1);
    const cand = simplexProject(w.map((wi, i) => wi - eta * g[i]));
    const c = cvarOf(cand);
    if (c < bestCVaR - 1e-12) { bestCVaR = c; bestW = cand.slice(); }
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(cand[i] - w[i]);
    w = cand;
    if (diff < 1e-8) break;
  }
  if (!isFinite(bestCVaR)) return null;
  return { weights: bestW, cvar: bestCVaR, iterations };
}

// ─────────────────────────────────────────────────────────────────
// Facade
// ─────────────────────────────────────────────────────────────────

export function runOptimizer(id: OptimizerId, input: OptimizerInput): OptimizerResult | null {
  const { tickers, sampleSize } = input;
  const n = tickers.length;
  if (n < 2 || input.sigma.length !== n) return null;

  const notes: string[] = [];
  const assumptions: string[] = [];
  let shrinkageDelta: number | null = null;
  let iterations: number | null = null;
  let converged = true;

  // Σ hygiene: shrink when series exist, then PSD-project. HRP intentionally
  // gets the raw Σ (it never inverts and benefits from the true structure).
  let sigma = input.sigma;
  const wantsShrunk = id !== "hrp" && id !== "equal_weight";
  if (wantsShrunk && input.returnSeries && input.returnSeries.length === n) {
    const lw = ledoitWolfShrinkage(input.returnSeries);
    if (lw) {
      sigma = lw.sigma;
      shrinkageDelta = lw.delta;
      assumptions.push(`Ledoit–Wolf constant-correlation shrinkage, δ=${lw.delta.toFixed(3)}`);
    }
  }
  if (wantsShrunk) {
    const psd = nearestPSD(sigma);
    if (psd) sigma = psd;
  }

  const mu = input.mu ?? null;
  let weights: number[] | null = null;
  let expectedReturnAnnual: number | null = null;

  switch (id) {
    case "equal_weight": {
      weights = new Array(n).fill(1 / n);
      assumptions.push("uniform allocation; no estimation risk taken");
      break;
    }
    case "min_variance": {
      weights = minVarianceWeights(sigma);
      assumptions.push("long-only active-set on Σ⁻¹·1; μ not used");
      if (!weights) { converged = false; notes.push("Σ singular or active-set failed"); }
      break;
    }
    case "mean_variance": {
      if (!mu) { notes.push("μ vector required"); converged = false; break; }
      weights = meanVarianceWeights(mu, sigma, 2);
      assumptions.push("Markowitz utility max μᵀw − 2·wᵀΣw; sample means as μ (estimation-noise sensitive)");
      if (!weights) { converged = false; notes.push("Σ singular"); }
      break;
    }
    case "robust_mean_variance": {
      if (!mu) { notes.push("μ vector required"); converged = false; break; }
      // James–Stein-style shrinkage of μ toward the grand mean: kills the
      // main failure mode of MVO (error-maximizing corner solutions).
      const grand = mean(mu);
      const muShrunk = mu.map(m => 0.5 * m + 0.5 * grand);
      weights = meanVarianceWeights(muShrunk, sigma, 4);
      assumptions.push("μ shrunk 50% toward grand mean (James–Stein style)", "risk aversion λ=4 (conservative)");
      if (!weights) { converged = false; notes.push("Σ singular"); }
      break;
    }
    case "risk_parity": {
      weights = riskParityWeights(sigma);
      assumptions.push("equal risk contribution wᵢ(Σw)ᵢ = σ²/n (Maillard 2010); μ not used");
      if (!weights) { converged = false; notes.push("ERC iteration did not converge"); }
      break;
    }
    case "risk_budget": {
      // Budgets proportional to current capital weights: keep the investor's
      // expressed conviction but equalize per-unit-of-budget risk.
      const cur = input.currentWeights && input.currentWeights.length === n
        ? input.currentWeights.map(v => Math.max(v, 0.01))
        : new Array(n).fill(1 / n);
      const rb = riskBudgetWeights(sigma, cur);
      if (rb) { weights = rb.weights; iterations = rb.iterations; }
      assumptions.push("risk budgets ∝ current capital weights (Bruder–Roncalli 2012)");
      if (!weights) { converged = false; notes.push("risk-budget iteration did not converge"); }
      break;
    }
    case "hrp": {
      const hrp = hrpWeights(input.sigma); // raw Σ by design
      if (hrp) weights = hrp.weights;
      assumptions.push("single-linkage clustering on correlation distance; no matrix inversion (López de Prado 2016)");
      if (!weights) { converged = false; notes.push("degenerate Σ diagonal"); }
      break;
    }
    case "black_litterman": {
      const wMkt = input.currentWeights && input.currentWeights.length === n
        ? input.currentWeights
        : new Array(n).fill(1 / n);
      const bl = blackLitterman(sigma, wMkt, input.views ?? [], 2.5, 0.05);
      if (bl) {
        weights = meanVarianceWeights(bl.mu, sigma, 2.5);
        expectedReturnAnnual = weights
          ? weights.reduce((s, w, i) => s + w * bl.mu[i], 0) * TRADING_DAYS
          : null;
        assumptions.push(
          `equilibrium prior Π = δΣw with current weights as the market portfolio (δ=2.5, τ=0.05)`,
          (input.views?.length ?? 0) > 0
            ? `${input.views!.length} view(s) blended at stated confidence`
            : "no active views — posterior equals equilibrium prior",
        );
      }
      if (!weights) { converged = false; notes.push("BL posterior or Σ inversion failed"); }
      break;
    }
    case "min_cvar": {
      if (!input.returnSeries || input.returnSeries.length !== n) {
        notes.push("aligned return series required for CVaR optimization");
        converged = false;
        break;
      }
      const mc = minCVaRWeights(input.returnSeries, 0.95);
      if (mc) {
        weights = mc.weights;
        iterations = mc.iterations;
        assumptions.push("minimizes empirical 95% CVaR over historical scenarios (Rockafellar–Uryasev 2000)");
      } else {
        converged = false;
        notes.push("needs ≥ 40 aligned observations");
      }
      break;
    }
  }

  if (!weights) {
    return {
      id, label: OPTIMIZER_LABELS[id], tickers,
      weights: [], cashWeight: 0,
      expectedReturnAnnual: null, volAnnual: 0, turnoverFromCurrent: 0,
      diagnostics: {
        conditionNumber: conditionNumber(sigma), shrinkageDelta,
        converged: false, iterations, assumptions,
        confidence: "low", notes,
      },
    };
  }

  const { weights: constrained, cashWeight } = applyConstraints(weights, { ...input, sigma }, notes);
  weights = constrained;

  if (mu && expectedReturnAnnual == null && id !== "equal_weight") {
    expectedReturnAnnual = weights.reduce((s, w, i) => s + w * mu[i], 0) * TRADING_DAYS;
  }
  if (mu && id === "equal_weight") {
    expectedReturnAnnual = weights.reduce((s, w, i) => s + w * mu[i], 0) * TRADING_DAYS;
  }

  let turnover = 0;
  if (input.currentWeights && input.currentWeights.length === n) {
    for (let i = 0; i < n; i++) turnover += Math.abs(weights[i] - input.currentWeights[i]);
  }

  const diagnostics: OptimizerDiagnostics = {
    conditionNumber: conditionNumber(sigma),
    shrinkageDelta,
    converged,
    iterations,
    assumptions,
    confidence: gradeOptimizer(sampleSize, n, converged),
    notes,
  };

  return {
    id,
    label: OPTIMIZER_LABELS[id],
    tickers,
    weights,
    cashWeight,
    expectedReturnAnnual,
    volAnnual: portfolioVolAnnual(weights, sigma),
    turnoverFromCurrent: turnover,
    diagnostics,
  };
}

/** Run the full optimizer set; failed solvers come back with converged=false. */
export function runAllOptimizers(input: OptimizerInput, ids?: OptimizerId[]): OptimizerResult[] {
  const list = ids ?? (Object.keys(OPTIMIZER_LABELS) as OptimizerId[]);
  const out: OptimizerResult[] = [];
  for (const id of list) {
    const r = runOptimizer(id, input);
    if (r) out.push(r);
  }
  return out;
}
