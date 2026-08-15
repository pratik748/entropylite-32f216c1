// Scan-level robustness layer (Deno twin of src/lib/discovery/robustness.ts).
//
// Two facts the per-candidate scorers cannot know on their own:
//
//   1. A discovery scan tests many hypotheses at once. Ranking by a raw
//      per-name statistic guarantees that the top of the list is dominated by
//      luck. Benjamini-Hochberg step-up converts the scan's p-values into
//      q-values, and P(real) = clip(1 - q, 0.05, 0.95) is an honest bounded
//      posterior for that candidate GIVEN the rest of the scan.
//
//   2. Terminal-value win rate ignores path order. A name whose 60-day
//      terminal distribution looks good can still stop out on day 4 in most
//      paths. Future-survival score evaluates target-before-stop on
//      constraint-feasible paths only (a path that gaps beyond a circuit
//      breaker is a simulator artifact, not a future).

export interface QValueResult {
  qValues: number[];
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
  return { qValues: qv, rejected: qv.map((v) => v <= q) };
}

/** P_real = clip(1 - q_i, 0.05, 0.95): permanent humility in both directions. */
export function pRealFromScan(pValues: number[]): number[] {
  const { qValues } = bhQValues(pValues);
  return qValues.map((qv) => Math.min(0.95, Math.max(0.05, 1 - qv)));
}

/** Normal CDF (Abramowitz-Stegun 7.1.26 based erf approximation). */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * poly;
  return z >= 0 ? p : 1 - p;
}

/**
 * One-sided p-value for "mean daily log return > 0" using a Newey-West
 * (lag-1) corrected standard error, so serial correlation in returns does not
 * manufacture significance. Returns 1 when the series is too short.
 */
export function driftPValue(closes: number[]): { p: number; n: number; t: number } {
  const r: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) r.push(Math.log(closes[i] / closes[i - 1]));
  }
  const n = r.length;
  if (n < 25) return { p: 1, n, t: 0 };
  const m = r.reduce((a, b) => a + b, 0) / n;
  let g0 = 0;
  let g1 = 0;
  for (let i = 0; i < n; i++) {
    g0 += (r[i] - m) ** 2;
    if (i > 0) g1 += (r[i] - m) * (r[i - 1] - m);
  }
  g0 /= n;
  g1 /= n;
  const lrv = Math.max(1e-16, g0 + 2 * 0.5 * g1); // Bartlett weight at lag 1
  const se = Math.sqrt(lrv / n);
  const t = m / se;
  return { p: Math.min(1, Math.max(0, 1 - normCdf(t))), n, t };
}

export interface FSSResult {
  fss: number;
  stopRate: number;
  nFeasible: number;
  nRejected: number;
  /** payoff asymmetry of terminal returns, Y = 2W/(1+W), W = gains/losses */
  asymmetry: number;
}

/**
 * Simulate GBM paths from the fitted daily moments and measure
 * target-before-stop survival on constraint-feasible paths.
 */
export function futureSurvival(opts: {
  entry: number;
  target: number;
  stop: number;
  muDaily: number;
  sigmaDaily: number;
  days: number;
  paths: number;
  /** per-step |log step| bound; steps beyond it mark the path infeasible */
  maxAbsLogStep?: number;
}): FSSResult {
  const { entry, target, stop, muDaily, sigmaDaily, days, paths } = opts;
  const maxStep = opts.maxAbsLogStep ?? 0.25;
  if (!(entry > 0) || !(sigmaDaily > 0) || !(target > entry) || !(stop > 0) || stop >= entry) {
    return { fss: 0, stopRate: 0, nFeasible: 0, nRejected: 0, asymmetry: 1 };
  }
  let survived = 0;
  let stopped = 0;
  let nFeasible = 0;
  let nRejected = 0;
  let gains = 0;
  let losses = 0;
  const drift = muDaily - 0.5 * sigmaDaily * sigmaDaily;

  for (let p = 0; p < paths; p++) {
    let price = entry;
    let feasible = true;
    let outcome: "target" | "stop" | "open" = "open";
    for (let d = 0; d < days; d++) {
      const u1 = Math.random() || 1e-12;
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const step = drift + sigmaDaily * z;
      if (Math.abs(step) > maxStep) { feasible = false; break; }
      price *= Math.exp(step);
      if (!Number.isFinite(price) || price <= 0) { feasible = false; break; }
      if (outcome === "open") {
        if (price >= target) outcome = "target";
        else if (price <= stop) outcome = "stop";
      }
    }
    if (!feasible) { nRejected++; continue; }
    nFeasible++;
    if (outcome === "target") survived++;
    else if (outcome === "stop") stopped++;
    const ret = price / entry - 1;
    if (ret > 0) gains += ret; else losses += -ret;
  }
  const omega = losses > 0 ? gains / losses : gains > 0 ? Infinity : 1;
  const asymmetry = Number.isFinite(omega) ? (2 * omega) / (1 + omega) : 2;
  return {
    fss: nFeasible > 0 ? survived / nFeasible : 0,
    stopRate: nFeasible > 0 ? stopped / nFeasible : 0,
    nFeasible,
    nRejected,
    asymmetry,
  };
}

// ─── path-array evaluators (twins of src/lib/discovery/robustness.ts) ───
// futureSurvival() above generates its own paths; these two evaluate paths
// produced elsewhere (gbmPath / ouSimPaths / runFGM), so an engine that has
// already simulated does not simulate twice.

export interface PathConstraints {
  maxAbsLogStep?: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface FSSThesis {
  entry: number;
  target: number;
  stop: number;
  direction: 1 | -1;
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

/** Fraction of constraint-feasible paths where target is touched before stop. */
export function futureSurvivalScore(
  paths: number[][],
  thesis: FSSThesis,
  constraints: PathConstraints = {},
): { fss: number; nFeasible: number; nRejected: number; stopRate: number } {
  let nFeasible = 0;
  let nRejected = 0;
  let survived = 0;
  let stopped = 0;
  const long = thesis.direction === 1;
  for (const path of paths) {
    if (!pathFeasible(path, constraints)) { nRejected++; continue; }
    nFeasible++;
    for (const p of path) {
      if (long ? p >= thesis.target : p <= thesis.target) { survived++; break; }
      if (long ? p <= thesis.stop : p >= thesis.stop) { stopped++; break; }
    }
  }
  return {
    fss: nFeasible > 0 ? survived / nFeasible : 0,
    nFeasible,
    nRejected,
    stopRate: nFeasible > 0 ? stopped / nFeasible : 0,
  };
}

/** RS = 1 - hit-rate dispersion across regimes; <2 usable cells = neutral 0.5. */
export function regimeStability(cells: { hitRate: number; n: number }[], minN = 10): number {
  const usable = cells.filter((c) => c.n >= minN);
  if (usable.length < 2) return 0.5;
  const rates = usable.map((c) => c.hitRate);
  return Math.max(0, 1 - (Math.max(...rates) - Math.min(...rates)));
}
