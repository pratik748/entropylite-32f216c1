/**
 * Multi-engine book simulation — a distribution-of-outcomes engine, never a
 * prediction engine.
 * ─────────────────────────────────────────────────────────────────────────
 * Five generators over the book's own daily return history, all seeded and
 * deterministic (same inputs → same paths, per the no-Math.random doctrine):
 *
 *   bootstrap_iid       — i.i.d. resampling of realized daily returns; the
 *                         empirical distribution speaks for itself.
 *   bootstrap_block     — stationary block bootstrap (Politis–Romano, mean
 *                         block 5d) preserving short-range autocorrelation
 *                         and volatility clustering.
 *   parametric_normal   — Gaussian with σ from the SELECTED covariance model
 *                         (registry), zero drift (drift over ≤ 3 months is
 *                         noise; stated, not hidden).
 *   heavy_tailed_t      — Student-t with ν fitted from realized excess
 *                         kurtosis, variance-matched to the selected σ.
 *   regime_conditioned  — resampling restricted to historical days whose
 *                         trailing-20d volatility tercile matches today's.
 *
 * A user-defined shock (news scenario translated into a day-0 return, e.g.
 * via factor exposures) can be applied to ANY engine: the shock lands at
 * day 0 and the engine generates the aftermath. Outputs are percentile fans,
 * terminal distributions, VaR/ES — all in return space, valued by the
 * caller. Engine DISAGREEMENT is part of the output, not an error.
 */

import { mulberry32 } from "@/lib/quant/validation";

const TRADING_DAYS = 252;

export type SimEngineId =
  | "bootstrap_iid"
  | "bootstrap_block"
  | "parametric_normal"
  | "heavy_tailed_t"
  | "regime_conditioned";

export interface SimEngineDef {
  id: SimEngineId;
  label: string;
  short: string;
  description: string;
}

export const SIM_ENGINES: SimEngineDef[] = [
  { id: "bootstrap_iid", label: "Historical bootstrap", short: "Boot", description: "i.i.d. resampling of the book's own realized daily returns." },
  { id: "bootstrap_block", label: "Block bootstrap", short: "Block", description: "Stationary block resampling (mean 5d blocks) — keeps vol clustering." },
  { id: "parametric_normal", label: "Parametric Gaussian", short: "Normal", description: "N(0, σ) with σ from the selected covariance model; zero drift by design." },
  { id: "heavy_tailed_t", label: "Heavy-tailed Student-t", short: "Fat-t", description: "Student-t with ν fitted from realized kurtosis, variance-matched." },
  { id: "regime_conditioned", label: "Regime-conditioned bootstrap", short: "Regime", description: "Resamples only days whose trailing-vol regime matches today's." },
];

export interface SimShock {
  label: string;
  /** Day-0 simple return applied to the book, in % (e.g. −7.5). */
  day0ReturnPct: number;
}

export interface SimSpec {
  engine: SimEngineId;
  horizonDays: number;
  nPaths?: number;
  seed?: number;
  shock?: SimShock | null;
}

export interface SimInputs {
  /** The book's daily log returns (tail-aligned history). */
  portfolioReturns: number[];
  /** Daily portfolio σ from the selected covariance model (parametric engines). */
  sigmaDaily?: number | null;
}

export interface FanPoint {
  day: number;
  p5: number; p25: number; p50: number; p75: number; p95: number;
}

export interface SimTerminal {
  p5: number; p25: number; p50: number; p75: number; p95: number;
  mean: number;
  /** P(terminal return < 0). */
  probLoss: number;
  /** Positive loss %, 95% VaR / ES of the terminal distribution. */
  var95: number;
  es95: number;
}

export interface HistogramBin { x0: number; x1: number; share: number }

export interface SimResult {
  engine: SimEngineId;
  label: string;
  horizonDays: number;
  nPaths: number;
  seed: number;
  /** Cumulative return % percentiles per day (day 0 = shock, if any). */
  fan: FanPoint[];
  terminal: SimTerminal;
  histogram: HistogramBin[];
  method: string;
  /** Fitted t degrees of freedom (heavy_tailed_t only). */
  nu?: number;
  shock?: SimShock | null;
}

// ── Seeded draws ────────────────────────────────────────────────────

function boxMuller(rng: () => number): number {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang Gamma(shape k ≥ 1, scale 1) sampler. */
function gammaDraw(rng: () => number, k: number): number {
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x = 0, v = 0;
    do { x = boxMuller(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Student-t draw with ν > 2, unit variance (variance-normalized). */
function studentTDraw(rng: () => number, nu: number): number {
  const z = boxMuller(rng);
  const g = gammaDraw(rng, nu / 2) * 2; // χ²_ν
  const t = z / Math.sqrt(g / nu);
  return t * Math.sqrt((nu - 2) / nu);
}

/** Deterministic seed from spec inputs so the same run reproduces exactly. */
export function seedFrom(spec: { engine: string; horizonDays: number; nPaths: number; shockPct: number; n: number }): number {
  let h = 2166136261;
  const s = `${spec.engine}|${spec.horizonDays}|${spec.nPaths}|${spec.shockPct.toFixed(4)}|${spec.n}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Statistics helpers ─────────────────────────────────────────────

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = q * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function excessKurtosis(rets: number[]): number {
  const n = rets.length;
  if (n < 30) return 0;
  const m = rets.reduce((s, v) => s + v, 0) / n;
  let v2 = 0, v4 = 0;
  for (const r of rets) {
    const d = r - m;
    v2 += d * d;
    v4 += d ** 4;
  }
  v2 /= n;
  if (v2 <= 0) return 0;
  return v4 / n / (v2 * v2) - 3;
}

/** Trailing-20d vol tercile per day; used for regime conditioning. */
export function volRegimeLabels(rets: number[], window = 20): { labels: number[]; today: number } | null {
  const n = rets.length;
  if (n < window + 30) return null;
  const vols: number[] = [];
  for (let t = window; t <= n; t++) {
    let m = 0;
    for (let i = t - window; i < t; i++) m += rets[i];
    m /= window;
    let acc = 0;
    for (let i = t - window; i < t; i++) acc += (rets[i] - m) ** 2;
    vols.push(Math.sqrt(acc / (window - 1)));
  }
  const sorted = [...vols].sort((a, b) => a - b);
  const t1 = percentile(sorted, 1 / 3);
  const t2 = percentile(sorted, 2 / 3);
  const tercile = (v: number) => (v <= t1 ? 0 : v <= t2 ? 1 : 2);
  return { labels: vols.map(tercile), today: tercile(vols[vols.length - 1]) };
}

// ── The engine ─────────────────────────────────────────────────────

/**
 * Run one engine. Returns null when the inputs cannot support the engine
 * honestly (thin history, missing σ for parametric engines) — the UI shows
 * "unavailable", never a silently substituted engine.
 */
export function runSimulation(inputs: SimInputs, spec: SimSpec): SimResult | null {
  const rets = inputs.portfolioReturns;
  const n = rets.length;
  const H = spec.horizonDays;
  const nPaths = spec.nPaths ?? 2000;
  if (n < 60 || H < 1 || H > 260 || nPaths < 200) return null;

  const def = SIM_ENGINES.find((e) => e.id === spec.engine);
  if (!def) return null;

  const shockPct = spec.shock?.day0ReturnPct ?? 0;
  const shockLog = shockPct !== 0 ? Math.log(1 + shockPct / 100) : 0;
  if (!isFinite(shockLog)) return null;

  const seed = spec.seed ?? seedFrom({ engine: spec.engine, horizonDays: H, nPaths, shockPct, n });
  const rng = mulberry32(seed);

  // Per-engine daily draw setup
  let draw: (() => number) | null = null;
  let method = "";
  let nu: number | undefined;

  switch (spec.engine) {
    case "bootstrap_iid": {
      draw = () => rets[Math.floor(rng() * n)];
      method = `i.i.d. resampling of ${n} realized daily returns`;
      break;
    }
    case "bootstrap_block": {
      // Stationary bootstrap: geometric block continuation (mean block 5d).
      const p = 1 / 5;
      let t = Math.floor(rng() * n);
      draw = () => {
        const v = rets[t];
        t = rng() < p ? Math.floor(rng() * n) : (t + 1) % n;
        return v;
      };
      method = `stationary block bootstrap over ${n}d, mean block 5d`;
      break;
    }
    case "parametric_normal": {
      const sigma = inputs.sigmaDaily ?? null;
      if (sigma == null || !(sigma > 0)) return null;
      draw = () => sigma * boxMuller(rng);
      method = `Gaussian, σ_d=${(sigma * 100).toFixed(2)}% from the selected Σ model, zero drift by design`;
      break;
    }
    case "heavy_tailed_t": {
      const sigma = inputs.sigmaDaily ?? null;
      if (sigma == null || !(sigma > 0)) return null;
      const exKurt = excessKurtosis(rets);
      nu = exKurt > 0.5 ? Math.max(4.5, Math.min(12, 4 + 6 / exKurt)) : 12;
      const nuFixed = nu;
      draw = () => sigma * studentTDraw(rng, nuFixed);
      method = `Student-t ν=${nu.toFixed(1)} fitted from excess kurtosis ${exKurt.toFixed(1)}, variance-matched to selected σ`;
      break;
    }
    case "regime_conditioned": {
      const reg = volRegimeLabels(rets);
      if (!reg) return null;
      const offset = n - reg.labels.length;
      const pool: number[] = [];
      reg.labels.forEach((lab, i) => { if (lab === reg.today) pool.push(rets[offset + i]); });
      if (pool.length < 30) return null;
      draw = () => pool[Math.floor(rng() * pool.length)];
      const regimeName = ["low-vol", "mid-vol", "high-vol"][reg.today];
      method = `bootstrap restricted to ${pool.length} ${regimeName} days (trailing-20d σ tercile of today)`;
      break;
    }
  }
  if (!draw) return null;

  // Simulate cumulative log-return paths
  const cum: Float64Array[] = [];
  for (let d = 0; d <= H; d++) cum.push(new Float64Array(nPaths));
  for (let pth = 0; pth < nPaths; pth++) {
    let acc = shockLog;
    cum[0][pth] = acc;
    for (let d = 1; d <= H; d++) {
      acc += draw();
      cum[d][pth] = acc;
    }
  }

  // Percentile fan in simple-return %
  const fan: FanPoint[] = [];
  for (let d = 0; d <= H; d++) {
    const sorted = Array.from(cum[d]).sort((a, b) => a - b);
    const cv = (q: number) => (Math.exp(percentile(sorted, q)) - 1) * 100;
    fan.push({ day: d, p5: cv(0.05), p25: cv(0.25), p50: cv(0.5), p75: cv(0.75), p95: cv(0.95) });
  }

  // Terminal distribution
  const terminalSorted = Array.from(cum[H]).map((v) => Math.exp(v) - 1).sort((a, b) => a - b);
  const q = (x: number) => percentile(terminalSorted, x) * 100;
  const mean = (terminalSorted.reduce((s, v) => s + v, 0) / nPaths) * 100;
  const var95 = -q(0.05);
  const tailCount = Math.max(1, Math.floor(0.05 * nPaths));
  const es95 = -(terminalSorted.slice(0, tailCount).reduce((s, v) => s + v, 0) / tailCount) * 100;
  const probLoss = terminalSorted.filter((v) => v < 0).length / nPaths;

  // Histogram over [p1, p99]
  const lo = percentile(terminalSorted, 0.01) * 100;
  const hi = percentile(terminalSorted, 0.99) * 100;
  const BINS = 21;
  const width = (hi - lo) / BINS || 1;
  const bins: HistogramBin[] = Array.from({ length: BINS }, (_, i) => ({
    x0: lo + i * width, x1: lo + (i + 1) * width, share: 0,
  }));
  for (const v of terminalSorted) {
    const pct = v * 100;
    const idx = Math.max(0, Math.min(BINS - 1, Math.floor((pct - lo) / width)));
    bins[idx].share += 1 / nPaths;
  }

  return {
    engine: spec.engine,
    label: def.label,
    horizonDays: H,
    nPaths,
    seed,
    fan,
    terminal: { p5: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95), mean, probLoss, var95, es95 },
    histogram: bins,
    method,
    ...(nu != null ? { nu } : {}),
    shock: spec.shock ?? null,
  };
}

/** Run every engine that can run — the model-disagreement table. */
export function runAllEngines(inputs: SimInputs, base: Omit<SimSpec, "engine">): SimResult[] {
  return SIM_ENGINES
    .map((e) => runSimulation(inputs, { ...base, engine: e.id }))
    .filter((r): r is SimResult => r != null);
}

/** Annualization note for the UI: horizon in fraction of a trading year. */
export const horizonYears = (days: number) => days / TRADING_DAYS;
