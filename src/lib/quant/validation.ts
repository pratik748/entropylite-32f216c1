/**
 * Validation Framework — anti-overfitting research infrastructure.
 * ────────────────────────────────────────────────────────────────
 * Institutional research practices for evaluating strategies produced by the
 * Strategy Lab / Strategy Factory / backtester (institutional.ts runBacktest):
 *
 *   - Walk-forward split generation
 *   - Purged K-Fold with embargo (López de Prado 2018, "Advances in
 *     Financial Machine Learning", ch. 7)
 *   - CSCV / Probability of Backtest Overfitting (Bailey, Borwein,
 *     López de Prado, Zhu 2017, "The Probability of Backtest Overfitting")
 *   - Probabilistic & Deflated Sharpe Ratio (Bailey & López de Prado 2014)
 *   - Sharpe standard error (Lo 2002) and Minimum Track Record Length
 *   - White's Reality Check (White 2000) via stationary bootstrap
 *     (Politis & Romano 1994) with a seeded deterministic RNG
 *   - Benjamini–Hochberg false-discovery-rate control for signal batteries
 *
 * Determinism: every stochastic routine takes an explicit integer seed and
 * uses mulberry32 — same inputs ⇒ same outputs, satisfying the platform's
 * "deterministic paths" contract.
 *
 * Compute: CSCV with S=10 partitions is C(10,5)=252 combinations; for 50
 * strategies × 1000 bars that is ~10⁷ additions (< 100 ms). Reality check
 * with 500 bootstrap draws on 20 strategies × 1000 bars is ~10⁷ ops. Both
 * run comfortably in the browser; move to a Web Worker above ~10⁸.
 */

import { mean, stdev, normCDF, normInv } from "@/lib/quant/institutional";

// ─────────────────────────────────────────────────────────────────
// Deterministic RNG
// ─────────────────────────────────────────────────────────────────

/** mulberry32 — small, fast, seedable PRNG (deterministic across platforms). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────────
// Split generators
// ─────────────────────────────────────────────────────────────────

export interface Split { train: [number, number]; test: [number, number]; }

/**
 * Rolling walk-forward splits over n observations.
 * Each split trains on [start, start+trainSize) and tests on the following
 * testSize observations; the window advances by `step` (default testSize —
 * non-overlapping OOS segments that tile the sample).
 */
export function walkForwardSplits(n: number, trainSize: number, testSize: number, step?: number): Split[] {
  const s = Math.max(1, step ?? testSize);
  const out: Split[] = [];
  for (let start = 0; start + trainSize + testSize <= n; start += s) {
    out.push({ train: [start, start + trainSize], test: [start + trainSize, start + trainSize + testSize] });
  }
  return out;
}

export interface PurgedFold { trainIdx: number[]; testIdx: number[]; }

/**
 * Purged K-Fold with embargo.
 * Labels computed from bar t typically depend on bars [t, t+horizon); naive
 * K-fold therefore leaks test information into training. We remove ("purge")
 * training points whose label window overlaps the test block and additionally
 * embargo `embargo` bars after the test block.
 *
 * @param n        number of observations
 * @param k        folds (default 5)
 * @param horizon  label look-ahead in bars (purge width, default 5)
 * @param embargo  extra bars embargoed after each test block (default ⌈0.01n⌉)
 */
export function purgedKFoldSplits(n: number, k = 5, horizon = 5, embargo?: number): PurgedFold[] {
  const emb = embargo ?? Math.ceil(0.01 * n);
  const foldSize = Math.floor(n / k);
  if (foldSize < 2) return [];
  const folds: PurgedFold[] = [];
  for (let f = 0; f < k; f++) {
    const t0 = f * foldSize;
    const t1 = f === k - 1 ? n : (f + 1) * foldSize;
    const testIdx: number[] = [];
    for (let i = t0; i < t1; i++) testIdx.push(i);
    const trainIdx: number[] = [];
    for (let i = 0; i < n; i++) {
      if (i >= t0 && i < t1) continue;                    // in test
      if (i < t0 && i + horizon > t0) continue;           // label overlaps test start (purge)
      if (i >= t1 && i < t1 + emb) continue;              // embargo after test
      trainIdx.push(i);
    }
    folds.push({ trainIdx, testIdx });
  }
  return folds;
}

// ─────────────────────────────────────────────────────────────────
// CSCV — Probability of Backtest Overfitting
// ─────────────────────────────────────────────────────────────────

export interface PBOResult {
  /** Probability of backtest overfitting: P(OOS rank of IS-best < median). */
  pbo: number;
  /** Logits λ = log(ω̄/(1−ω̄)) per combination (ω̄ = relative OOS rank). */
  logits: number[];
  /** Number of IS/OOS combinations evaluated. */
  combinations: number;
}

/**
 * Combinatorially Symmetric Cross-Validation.
 * @param strategyReturns  matrix [T][S]: per-bar returns of S strategy variants
 * @param nPartitions      even number of time blocks (default 10 → 252 combos)
 *
 * For each way of choosing half the blocks as in-sample: pick the IS-best
 * strategy by Sharpe, find its rank among all strategies out-of-sample.
 * PBO = fraction of combinations where that rank is in the bottom half.
 * PBO ≲ 0.1 acceptable; ≥ 0.5 means selection is pure noise.
 */
export function cscvPBO(strategyReturns: number[][], nPartitions = 10): PBOResult | null {
  const T = strategyReturns.length;
  if (T < 40) return null;
  const S = strategyReturns[0]?.length ?? 0;
  if (S < 2) return null;
  const P = nPartitions % 2 === 0 ? nPartitions : nPartitions + 1;
  const blockSize = Math.floor(T / P);
  if (blockSize < 2) return null;

  // Precompute per-block sums and sums of squares per strategy: O(T·S)
  const blockSum: number[][] = Array.from({ length: P }, () => new Array(S).fill(0));
  const blockSum2: number[][] = Array.from({ length: P }, () => new Array(S).fill(0));
  for (let b = 0; b < P; b++) {
    const t0 = b * blockSize;
    const t1 = b === P - 1 ? T : (b + 1) * blockSize;
    for (let t = t0; t < t1; t++)
      for (let s = 0; s < S; s++) {
        const r = strategyReturns[t][s];
        blockSum[b][s] += r;
        blockSum2[b][s] += r * r;
      }
  }
  const blockLen: number[] = Array.from({ length: P }, (_, b) =>
    (b === P - 1 ? T : (b + 1) * blockSize) - b * blockSize);

  // Enumerate combinations of P/2 blocks (indices) as in-sample
  const half = P / 2;
  const combos: number[][] = [];
  const cur: number[] = [];
  const rec = (start: number) => {
    if (cur.length === half) { combos.push(cur.slice()); return; }
    for (let i = start; i < P; i++) { cur.push(i); rec(i + 1); cur.pop(); }
  };
  rec(0);

  const sharpeOf = (blocks: number[], s: number): number => {
    let n = 0, sum = 0, sum2 = 0;
    for (const b of blocks) { n += blockLen[b]; sum += blockSum[b][s]; sum2 += blockSum2[b][s]; }
    const m = sum / n;
    const v = Math.max(sum2 / n - m * m, 1e-18);
    return m / Math.sqrt(v);
  };

  const logits: number[] = [];
  let below = 0;
  for (const isBlocks of combos) {
    const inIS = new Set(isBlocks);
    const oosBlocks: number[] = [];
    for (let b = 0; b < P; b++) if (!inIS.has(b)) oosBlocks.push(b);
    // IS-best strategy
    let best = 0, bestSh = -Infinity;
    for (let s = 0; s < S; s++) {
      const sh = sharpeOf(isBlocks, s);
      if (sh > bestSh) { bestSh = sh; best = s; }
    }
    // OOS rank of that strategy
    const oosSh = Array.from({ length: S }, (_, s) => sharpeOf(oosBlocks, s));
    let rank = 0;
    for (let s = 0; s < S; s++) if (oosSh[s] <= oosSh[best]) rank++;
    const omega = rank / (S + 1); // relative rank ∈ (0,1)
    const lambda = Math.log(omega / (1 - omega));
    logits.push(lambda);
    if (lambda <= 0) below++;
  }
  return { pbo: below / combos.length, logits, combinations: combos.length };
}

// ─────────────────────────────────────────────────────────────────
// Sharpe inference — PSR, DSR, MinTRL, Lo standard error
// ─────────────────────────────────────────────────────────────────

/**
 * Standard error of the Sharpe ratio under non-normality (Lo 2002 /
 * Mertens 2002):  SE(SR) = √[(1 − γ₃·SR + (γ₄−1)/4·SR²) / (T−1)]
 * where γ₃ = skewness, γ₄ = raw kurtosis (3 for a Gaussian).
 */
export function sharpeStdErr(sr: number, T: number, skew = 0, kurt = 3): number {
  if (T < 3) return Infinity;
  const v = (1 - skew * sr + ((kurt - 1) / 4) * sr * sr) / (T - 1);
  return Math.sqrt(Math.max(v, 0));
}

/**
 * Probabilistic Sharpe Ratio: P(true SR > srBenchmark | observed sr).
 * PSR = Φ( (sr − srBenchmark) / SE(sr) )
 */
export function probabilisticSharpe(sr: number, srBenchmark: number, T: number, skew = 0, kurt = 3): number {
  const se = sharpeStdErr(sr, T, skew, kurt);
  if (!isFinite(se) || se === 0) return sr > srBenchmark ? 1 : 0;
  return normCDF((sr - srBenchmark) / se);
}

/**
 * Expected maximum Sharpe among N independent trials with per-trial variance
 * varSR (false-strategy theorem, Bailey & López de Prado 2014):
 *   E[max SR] ≈ √varSR · [(1−γ)·Φ⁻¹(1−1/N) + γ·Φ⁻¹(1−1/(N·e))],  γ ≈ 0.5772
 */
export function expectedMaxSharpe(nTrials: number, varSR: number): number {
  if (nTrials <= 1 || varSR <= 0) return 0;
  const gamma = 0.5772156649015329;
  const a = normInv(1 - 1 / nTrials);
  const b = normInv(1 - 1 / (nTrials * Math.E));
  return Math.sqrt(varSR) * ((1 - gamma) * a + gamma * b);
}

/**
 * Deflated Sharpe Ratio: PSR against the benchmark SR₀ = E[max SR] implied by
 * the number of trials actually run. DSR < 0.95 ⇒ the "discovered" strategy
 * is not distinguishable from selection bias at 95%.
 *
 * @param sr        observed (non-annualised) Sharpe of the selected strategy
 * @param T         number of return observations
 * @param nTrials   number of strategy variants tried during research
 * @param varSRAcrossTrials  variance of SR estimates across the trials
 * @param skew,kurt sample skewness / raw kurtosis of the selected returns
 */
export function deflatedSharpe(
  sr: number, T: number, nTrials: number, varSRAcrossTrials: number, skew = 0, kurt = 3,
): { dsr: number; sr0: number } {
  const sr0 = expectedMaxSharpe(Math.max(nTrials, 1), Math.max(varSRAcrossTrials, 0));
  return { dsr: probabilisticSharpe(sr, sr0, T, skew, kurt), sr0 };
}

/**
 * Minimum Track Record Length: smallest T such that
 * P(true SR > srBenchmark) ≥ conf given observed sr.
 *   MinTRL = 1 + (1 − γ₃·sr + (γ₄−1)/4·sr²) · (z_conf / (sr − srBenchmark))²
 * Returns Infinity if sr ≤ srBenchmark.
 */
export function minTrackRecordLength(sr: number, srBenchmark: number, conf = 0.95, skew = 0, kurt = 3): number {
  if (sr <= srBenchmark) return Infinity;
  const z = normInv(conf);
  const num = 1 - skew * sr + ((kurt - 1) / 4) * sr * sr;
  return 1 + Math.max(num, 0) * (z / (sr - srBenchmark)) ** 2;
}

// ─────────────────────────────────────────────────────────────────
// Stationary bootstrap + White's Reality Check
// ─────────────────────────────────────────────────────────────────

/**
 * Stationary bootstrap index resampling (Politis & Romano 1994).
 * Geometric block lengths with mean `avgBlockLen`; wraps around the sample.
 */
export function stationaryBootstrapIndices(n: number, avgBlockLen: number, rng: () => number): number[] {
  const p = 1 / Math.max(avgBlockLen, 1);
  const idx: number[] = new Array(n);
  let t = Math.floor(rng() * n);
  for (let i = 0; i < n; i++) {
    idx[i] = t;
    if (rng() < p) t = Math.floor(rng() * n);
    else t = (t + 1) % n;
  }
  return idx;
}

export interface RealityCheckResult {
  /** p-value: P(best observed mean excess is explained by luck). */
  pValue: number;
  /** Index of the best strategy by mean excess return. */
  bestIndex: number;
  /** Observed mean excess return of the best strategy. */
  bestMean: number;
}

/**
 * White's Reality Check (White 2000, "A Reality Check for Data Snooping").
 * H0: max_k E[r_k − r_benchmark] ≤ 0 — no strategy beats the benchmark.
 *
 * Test statistic V = max_k √T·(f̄_k); bootstrap distribution built from
 * stationary-bootstrap resamples of the centred excess returns.
 *
 * @param strategyReturns [T][S] per-bar strategy returns
 * @param benchmark       length-T benchmark returns (e.g. buy-and-hold)
 * @param nBoot           bootstrap replications (default 500)
 * @param avgBlockLen     mean block length (default ⌈T^{1/3}⌉)
 * @param seed            RNG seed (deterministic)
 */
export function whiteRealityCheck(
  strategyReturns: number[][],
  benchmark: number[],
  nBoot = 500,
  avgBlockLen?: number,
  seed = 42,
): RealityCheckResult | null {
  const T = strategyReturns.length;
  if (T < 30 || benchmark.length !== T) return null;
  const S = strategyReturns[0]?.length ?? 0;
  if (S < 1) return null;
  const block = avgBlockLen ?? Math.ceil(Math.cbrt(T));

  // Excess return panel f[t][s]
  const f: number[][] = Array.from({ length: T }, (_, t) =>
    Array.from({ length: S }, (_, s) => strategyReturns[t][s] - benchmark[t]),
  );
  const fBar: number[] = new Array(S).fill(0);
  for (let t = 0; t < T; t++) for (let s = 0; s < S; s++) fBar[s] += f[t][s];
  for (let s = 0; s < S; s++) fBar[s] /= T;

  let bestIndex = 0;
  for (let s = 1; s < S; s++) if (fBar[s] > fBar[bestIndex]) bestIndex = s;
  const V = Math.sqrt(T) * fBar[bestIndex];

  const rng = mulberry32(seed);
  let exceed = 0;
  for (let b = 0; b < nBoot; b++) {
    const idx = stationaryBootstrapIndices(T, block, rng);
    let vMax = -Infinity;
    for (let s = 0; s < S; s++) {
      let m = 0;
      for (let i = 0; i < T; i++) m += f[idx[i]][s];
      m = m / T - fBar[s]; // centre under H0
      const v = Math.sqrt(T) * m;
      if (v > vMax) vMax = v;
    }
    if (vMax >= V) exceed++;
  }
  return { pValue: exceed / nBoot, bestIndex, bestMean: fBar[bestIndex] };
}

// ─────────────────────────────────────────────────────────────────
// False discovery control
// ─────────────────────────────────────────────────────────────────

/**
 * Benjamini–Hochberg FDR control.
 * @returns boolean mask: which hypotheses are rejected at FDR level q.
 */
export function benjaminiHochberg(pValues: number[], q = 0.1): boolean[] {
  const n = pValues.length;
  const order = pValues.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  let kMax = -1;
  for (let k = 0; k < n; k++) {
    if (order[k][0] <= ((k + 1) / n) * q) kMax = k;
  }
  const rejected = new Array(n).fill(false);
  for (let k = 0; k <= kMax; k++) rejected[order[k][1]] = true;
  return rejected;
}

// ─────────────────────────────────────────────────────────────────
// Convenience: full validation report for a strategy battery
// ─────────────────────────────────────────────────────────────────

export interface ValidationReport {
  pbo: number | null;
  dsr: number | null;
  sr0: number;
  bestSharpe: number;
  realityCheckP: number | null;
  verdict: "robust" | "borderline" | "overfit" | "insufficient-data";
}

/**
 * One-call research gate: given the return panel of every variant tried,
 * decide whether the best variant survives institutional scrutiny.
 * Intended consumer: Strategy Lab / Strategy Factory before promoting a
 * strategy to the executable list.
 */
export function validateStrategyBattery(
  strategyReturns: number[][],
  benchmark?: number[],
  seed = 42,
): ValidationReport {
  const T = strategyReturns.length;
  const S = strategyReturns[0]?.length ?? 0;
  if (T < 60 || S < 2) {
    return { pbo: null, dsr: null, sr0: 0, bestSharpe: 0, realityCheckP: null, verdict: "insufficient-data" };
  }
  // Per-strategy Sharpe
  const sharpes: number[] = [];
  for (let s = 0; s < S; s++) {
    const col = strategyReturns.map(r => r[s]);
    const sd = stdev(col);
    sharpes.push(sd > 0 ? mean(col) / sd : 0);
  }
  const bestSharpe = Math.max(...sharpes);
  const varSR = stdev(sharpes) ** 2;

  const pboRes = cscvPBO(strategyReturns);
  const best = strategyReturns.map(r => r[sharpes.indexOf(bestSharpe)]);
  const m = mean(best), sd = stdev(best);
  const skew = sd > 0 ? mean(best.map(x => ((x - m) / sd) ** 3)) : 0;
  const kurt = sd > 0 ? mean(best.map(x => ((x - m) / sd) ** 4)) : 3;
  const { dsr, sr0 } = deflatedSharpe(bestSharpe, T, S, varSR, skew, kurt);

  const rc = benchmark ? whiteRealityCheck(strategyReturns, benchmark, 500, undefined, seed) : null;

  let verdict: ValidationReport["verdict"];
  const pbo = pboRes?.pbo ?? null;
  if (dsr >= 0.95 && (pbo === null || pbo < 0.2) && (rc === null || rc.pValue < 0.1)) verdict = "robust";
  else if (dsr >= 0.8 && (pbo === null || pbo < 0.5)) verdict = "borderline";
  else verdict = "overfit";
  return { pbo, dsr, sr0, bestSharpe, realityCheckP: rc?.pValue ?? null, verdict };
}
