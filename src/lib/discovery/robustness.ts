// Robustness layer — the aggressive rejection stack.
//
//   bhQValues / pRealFromScan   the daily discovery scan tests many
//       hypotheses at once; convert raw p-values into BH-adjusted q-values
//       (Benjamini–Hochberg step-up, identical ordering to
//       quant/validation.ts::benjaminiHochberg) and an honest bounded
//       posterior P(real) = clip(1 − q, 0.05, 0.95).
//
//   futureSurvivalScore   TRUTH's Truth Crucible / feasibility polytope
//       reduced to its correct cheap form: fraction of *constraint-feasible*
//       Monte Carlo paths in which the trade thesis survives (target hit
//       before stop within horizon). Paths come from the existing simulators
//       (gbmPath / ouSimPaths / runFGM) — this module only evaluates them.
//
//   regimeStability   1 − hit-rate dispersion across regimes.

export interface QValueResult {
  qValues: number[];
  /** mask at FDR level q (matches benjaminiHochberg output) */
  rejected: boolean[];
}

/** BH step-up adjusted p-values (q-values), monotone-enforced. */
export function bhQValues(pValues: number[], q = 0.1): QValueResult {
  const n = pValues.length;
  if (n === 0) return { qValues: [], rejected: [] };
  const order = pValues.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const qv = new Array<number>(n).fill(1);
  let running = 1;
  for (let k = n - 1; k >= 0; k--) {
    const raw = (order[k][0] * n) / (k + 1);
    running = Math.min(running, raw);
    qv[order[k][1]] = Math.min(1, running);
  }
  const rejected = qv.map((v) => v <= q);
  return { qValues: qv, rejected };
}

/**
 * Bounded posterior that candidate i is real, given the whole scan's
 * p-values: P_real = clip(1 − q_i, 0.05, 0.95). The clip encodes permanent
 * humility: nothing from a screen is ever certain in either direction.
 */
export function pRealFromScan(pValues: number[]): number[] {
  const { qValues } = bhQValues(pValues);
  return qValues.map((qv) => Math.min(0.95, Math.max(0.05, 1 - qv)));
}

// ─── constraint-filtered Future Survival Score ───────────────────

export interface PathConstraints {
  /** reject path if any price ≤ 0 (always on) plus optional bounds: */
  maxAbsLogStep?: number; // per-step circuit-breaker style bound (default 0.5)
  minPrice?: number;
  maxPrice?: number;
}

export interface FSSThesis {
  /** entry price (paths are absolute prices) */
  entry: number;
  target: number;
  stop: number;
  direction: 1 | -1; // 1 = long (target > entry > stop), −1 = short
}

export interface FSSResult {
  /** fraction of feasible paths where target hit before stop ∈ [0,1] */
  fss: number;
  nFeasible: number;
  nRejected: number;
  /** fraction of feasible paths that hit the stop first */
  stopRate: number;
}

function pathFeasible(path: number[], c: PathConstraints): boolean {
  const maxStep = c.maxAbsLogStep ?? 0.5;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (!Number.isFinite(p) || p <= 0) return false;
    if (c.minPrice !== undefined && p < c.minPrice) return false;
    if (c.maxPrice !== undefined && p > c.maxPrice) return false;
    if (i > 0 && Math.abs(Math.log(p / path[i - 1])) > maxStep) return false;
  }
  return true;
}

/**
 * Evaluate simulated price paths against a trade thesis.
 * Long: survive = touch `target` (≥) before `stop` (≤).
 * Short: survive = touch `target` (≤) before `stop` (≥).
 * Paths violating hard constraints are excluded from the denominator
 * (they are simulator artifacts, not futures).
 */
export function futureSurvivalScore(
  paths: number[][],
  thesis: FSSThesis,
  constraints: PathConstraints = {},
): FSSResult {
  let nFeasible = 0;
  let nRejected = 0;
  let survived = 0;
  let stopped = 0;
  const long = thesis.direction === 1;

  for (const path of paths) {
    if (!pathFeasible(path, constraints)) {
      nRejected++;
      continue;
    }
    nFeasible++;
    for (const p of path) {
      if (long ? p >= thesis.target : p <= thesis.target) {
        survived++;
        break;
      }
      if (long ? p <= thesis.stop : p >= thesis.stop) {
        stopped++;
        break;
      }
    }
  }
  return {
    fss: nFeasible > 0 ? survived / nFeasible : 0,
    nFeasible,
    nRejected,
    stopRate: nFeasible > 0 ? stopped / nFeasible : 0,
  };
}

// ─── regime stability ────────────────────────────────────────────

/**
 * RS = 1 − (max − min) hit-rate across regimes. Cells with fewer than
 * `minN` observations are ignored; fewer than 2 usable cells → neutral 0.5
 * (unknown stability, not good stability).
 */
export function regimeStability(cells: { hitRate: number; n: number }[], minN = 10): number {
  const usable = cells.filter((c) => c.n >= minN);
  if (usable.length < 2) return 0.5;
  const rates = usable.map((c) => c.hitRate);
  return Math.max(0, 1 - (Math.max(...rates) - Math.min(...rates)));
}
