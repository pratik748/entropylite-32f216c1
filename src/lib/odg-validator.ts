/**
 * ODG Trade Validator — outcome-path-validated gatekeeper.
 *
 * Pure deterministic module. No network calls, no model training.
 * Sits between signal detection and execution and answers:
 *   "Even if this asset is desirable, is the trade survivable from here?"
 *
 * Implements 5 layers, in order:
 *   1. Reflexivity Filter   (crowding / liquidity trap)
 *   2. Outcome Path Sim     (favorable / drift / adverse)
 *   3. Drawdown Gate        (hard kill switch, vol-scaled)
 *   4. Entry Timing Engine  (micro-confirmation triggers)
 *   5. Scar Memory Lookup   (penalize repeat failure patterns)
 *
 * Core principle: desirable asset !== desirable trade.
 */

import type { ProfitFieldEntry } from "@/hooks/useOutcomeGradient";

export type SignalKind = "invest" | "hedge" | "pair" | "avoid" | "scale_up" | "rotate";

export interface ScarRecord {
  ticker: string;
  signal_type: string;
  regime: string;
  vol_bucket: string;
  sentiment_bucket: string;
  momentum_bucket: string;
  failure_pattern: string;
  realized_pnl_pct: number;
}

export interface PathSimResult {
  path: "favorable" | "drift" | "adverse";
  probability: number;
  expectedReturnPct: number;
  maxDrawdownPct: number;
  timeToProfitDays: number;
  reflexTriggers: string[];
}

export interface ValidationResult {
  executable: boolean;
  status: "EXECUTABLE" | "ARMED" | "BLOCKED";
  rejectReasons: string[];
  paths: PathSimResult[];
  pFavorable: number;
  pAdverse: number;
  expectedDrawdownPct: number;
  drawdownBudgetPct: number;
  crowding: number;
  reflexivityScore: number;
  scarFactor: number;
  scarSimilarFailures: number;
  entryConfirmed: boolean;
  confirmationsMet: string[];
  confirmationsMissing: string[];
  microHedge: { enabled: boolean; instrument: string; trigger: string } | null;
  gNew: number;
  topReason: string;
}

export interface ValidateInput {
  ticker: string;
  signalType: SignalKind;
  features: { momentum: number; vol: number; sentiment: number };
  regime: string;
  vix?: number;
  history: ProfitFieldEntry[];
  scarMemory: ScarRecord[];
  liquidityProxy?: number;   // 0..1 thin..deep, default 0.5
  crowdingProxy?: number;    // 0..1 dispersion proxy, default null (derived)
  bias?: number;             // ODG asset bias, default 1.0
  horizonDays?: number;      // default 5
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);

// ─── Buckets (must match scar writer) ─────────────────

export function volBucket(v: number): string {
  const a = Math.abs(v);
  if (a < 15) return "low";
  if (a < 25) return "mid";
  if (a < 35) return "high";
  return "crisis";
}
export function sentimentBucket(s: number): string {
  if (s < -10) return "neg";
  if (s > 10) return "pos";
  return "neu";
}
export function momentumBucket(m: number): string {
  if (m < -5) return "neg";
  if (m > 5) return "pos";
  return "neu";
}

// ─── Realized vol from history ────────────────────────

function realizedVol5d(history: ProfitFieldEntry[], ticker: string, vixFallback?: number): number {
  const recent = history
    .filter(h => h.asset === ticker)
    .slice(0, 10)
    .map(h => h.pnlPct);
  if (recent.length >= 3) {
    const m = recent.reduce((a, b) => a + b, 0) / recent.length;
    const v = recent.reduce((a, b) => a + (b - m) * (b - m), 0) / recent.length;
    return Math.sqrt(v) || 1;
  }
  if (typeof vixFallback === "number" && vixFallback > 0) {
    // Convert annualised vix → 5d sigma in %
    return (vixFallback / Math.sqrt(52));
  }
  return 2.5; // generic equity 5d vol
}

// ─── 1. Reflexivity ───────────────────────────────────

function computeCrowding(features: ValidateInput["features"], crowdingProxy?: number): number {
  if (typeof crowdingProxy === "number") return clamp(crowdingProxy, 0, 1);
  // Strong sentiment AND strong momentum in same direction → crowded
  const sNorm = clamp(Math.abs(features.sentiment) / 80, 0, 1);
  const mNorm = clamp(Math.abs(features.momentum) / 15, 0, 1);
  const aligned = sign(features.sentiment) === sign(features.momentum) && sign(features.sentiment) !== 0 ? 1 : 0.4;
  return clamp(sNorm * mNorm * aligned, 0, 1);
}

// ─── 2. Path simulator (closed-form) ──────────────────

function simulatePaths(
  sigma: number,
  regime: string,
  vix: number | undefined,
  crowding: number,
  signalType: SignalKind,
): PathSimResult[] {
  const isLong = signalType === "invest" || signalType === "scale_up" || signalType === "pair";
  const dirMult = isLong ? 1 : -1;

  // Regime tilts
  const r = (regime || "").toLowerCase();
  const bullTilt = r.includes("bull") || r.includes("rally") || r.includes("low") ? 0.10 : 0;
  const crisisTilt = r.includes("crisis") || r.includes("bear") ? 0.15 : 0;

  const vixStress = typeof vix === "number" && vix > 22 ? 0.10 : 0;

  let pFav = 0.35 + bullTilt - crisisTilt;
  let pDrift = 0.40 - 0.05 * crowding;
  let pAdv = 0.25 + crowding * 0.15 + vixStress + crisisTilt - bullTilt;

  // Normalise
  const total = pFav + pDrift + pAdv;
  pFav = clamp(pFav / total, 0.05, 0.85);
  pDrift = clamp(pDrift / total, 0.05, 0.85);
  pAdv = clamp(pAdv / total, 0.05, 0.85);
  const norm = pFav + pDrift + pAdv;
  pFav /= norm; pDrift /= norm; pAdv /= norm;

  const reflex = (label: string, conds: boolean[]): string[] =>
    [label, ...(conds[0] ? ["crowded"] : []), ...(conds[1] ? ["vix_stress"] : [])];

  return [
    {
      path: "favorable",
      probability: pFav,
      expectedReturnPct: dirMult * 1.5 * sigma,
      maxDrawdownPct: 0.4 * sigma,
      timeToProfitDays: 2,
      reflexTriggers: [],
    },
    {
      path: "drift",
      probability: pDrift,
      expectedReturnPct: 0,
      maxDrawdownPct: 0.7 * sigma,
      timeToProfitDays: 4,
      reflexTriggers: [],
    },
    {
      path: "adverse",
      probability: pAdv,
      expectedReturnPct: -1.2 * sigma * dirMult,
      maxDrawdownPct: 1.4 * sigma,
      timeToProfitDays: 5,
      reflexTriggers: reflex("reflexive_reversal", [crowding > 0.5, !!vix && vix > 22]),
    },
  ];
}

// ─── 3. Drawdown gate ─────────────────────────────────

function drawdownBudget(sigma: number, horizonDays: number): number {
  return clamp(0.6 * sigma * Math.sqrt(horizonDays), 1.5, 8);
}

// ─── 4. Entry timing engine ───────────────────────────

interface TimingResult {
  confirmed: boolean;
  met: string[];
  missing: string[];
}
function checkTiming(
  history: ProfitFieldEntry[],
  ticker: string,
  features: ValidateInput["features"],
  liquidityProxy: number,
  signalType: SignalKind,
): TimingResult {
  const isLong = signalType === "invest" || signalType === "scale_up";
  const dir = isLong ? 1 : -1;

  const recent = history.filter(h => h.asset === ticker);
  const vols = recent.slice(0, 20).map(h => Math.abs(h.features.vol));
  const vol5 = vols.slice(0, 5);
  const vol20 = vols;
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

  const checks: { name: string; pass: boolean }[] = [
    {
      name: "momentum_aligned",
      pass: sign(features.momentum) === dir,
    },
    {
      name: "vol_contraction_to_expansion",
      pass: vol5.length >= 2 && vol20.length >= 5
        ? Math.abs(features.vol) > avg(vol5) && avg(vol5) < avg(vol20)
        : Math.abs(features.vol) > 0, // fallback when no history
    },
    {
      name: "liquidity_absorption",
      pass: liquidityProxy >= 0.5,
    },
  ];
  const met = checks.filter(c => c.pass).map(c => c.name);
  const missing = checks.filter(c => !c.pass).map(c => c.name);
  return { confirmed: met.length >= 2, met, missing };
}

// ─── 5. Scar lookup ───────────────────────────────────

function scarFactor(scars: ScarRecord[], input: ValidateInput): { factor: number; similar: number } {
  if (!scars.length) return { factor: 1, similar: 0 };
  const vb = volBucket(input.features.vol);
  const sb = sentimentBucket(input.features.sentiment);
  const mb = momentumBucket(input.features.momentum);
  const matches = scars.filter(s =>
    s.ticker === input.ticker &&
    s.regime === (input.regime || "unknown") &&
    s.vol_bucket === vb &&
    (s.sentiment_bucket === sb || s.momentum_bucket === mb)
  );
  const total = scars.filter(s => s.ticker === input.ticker).length;
  const denom = Math.max(5, total);
  const factor = clamp(1 - matches.length / denom, 0.3, 1);
  return { factor, similar: matches.length };
}

// ─── Main entry point ─────────────────────────────────

export function validateTrade(input: ValidateInput): ValidationResult {
  const horizon = input.horizonDays ?? 5;
  const liquidityProxy = input.liquidityProxy ?? 0.55;
  const bias = input.bias ?? 1.0;
  const sigma = realizedVol5d(input.history, input.ticker, input.vix);

  const isExecutableType = input.signalType === "invest" || input.signalType === "scale_up" || input.signalType === "pair";

  // 1. Reflexivity
  const crowding = computeCrowding(input.features, input.crowdingProxy);
  const liquidityThin = liquidityProxy < 0.3;
  const reflexivityScore = clamp(crowding * (liquidityThin ? 1 : 0.6), 0, 1);

  // 2. Paths
  const paths = simulatePaths(sigma, input.regime, input.vix, crowding, input.signalType);
  const pFav = paths.find(p => p.path === "favorable")!.probability;
  const pAdv = paths.find(p => p.path === "adverse")!.probability;
  const expectedDD =
    paths.reduce((s, p) => s + p.probability * p.maxDrawdownPct, 0);

  // 3. Drawdown gate
  const ddBudget = drawdownBudget(sigma, horizon);

  // 4. Timing
  const timing = checkTiming(input.history, input.ticker, input.features, liquidityProxy, input.signalType);

  // 5. Scar
  const { factor: scar, similar } = scarFactor(input.scarMemory, input);

  // ─── Reject conditions ──────────────────────────────
  const rejectReasons: string[] = [];

  if (isExecutableType) {
    if (pAdv > 0.30) rejectReasons.push(`adverse_path_${(pAdv * 100).toFixed(0)}%`);
    if (expectedDD > ddBudget) rejectReasons.push(`drawdown_gate_${expectedDD.toFixed(1)}%>${ddBudget.toFixed(1)}%`);
    if (reflexivityScore > 0.6) rejectReasons.push("reflexive_crowded");
    if (crowding > 0.75 && liquidityThin) rejectReasons.push("crowded_thin_liquidity");
    if (scar < 0.4) rejectReasons.push(`scar_pattern_${similar}_failures`);
  }

  // ─── Gradient (G_new) ───────────────────────────────
  const eGain = Math.max(0.01, paths[0].expectedReturnPct);
  const eLoss = Math.max(0.01, Math.abs(paths[2].expectedReturnPct));
  const payoffAsymmetry = clamp(eGain / eLoss, 0.2, 3.0);
  const timeliness = Math.exp(-paths[0].timeToProfitDays / horizon);
  const gNew = bias * pFav * (1 - pAdv) * payoffAsymmetry * timeliness * (1 - crowding) * scar;

  // ─── Status ─────────────────────────────────────────
  let status: ValidationResult["status"];
  let executable = false;
  if (!isExecutableType) {
    status = "ARMED"; // hedge/avoid/rotate are advisory, never EXECUTABLE
  } else if (rejectReasons.length > 0) {
    status = "BLOCKED";
  } else if (!timing.confirmed) {
    status = "ARMED";
    rejectReasons.push("await_confirmation");
  } else {
    status = "EXECUTABLE";
    executable = true;
  }

  // ─── CROWN-lite micro-hedge ─────────────────────────
  const microHedge =
    isExecutableType && pAdv > 0.20
      ? {
          enabled: status === "EXECUTABLE",
          instrument: "protective_put_or_inverse_etf",
          trigger: "sentiment_flip_AND_vol_expansion",
        }
      : null;

  const topReason =
    rejectReasons[0]?.replace(/_/g, " ").toUpperCase() ||
    (status === "EXECUTABLE" ? "ALL GATES PASSED" : "WAITING");

  return {
    executable,
    status,
    rejectReasons,
    paths,
    pFavorable: pFav,
    pAdverse: pAdv,
    expectedDrawdownPct: expectedDD,
    drawdownBudgetPct: ddBudget,
    crowding,
    reflexivityScore,
    scarFactor: scar,
    scarSimilarFailures: similar,
    entryConfirmed: timing.confirmed,
    confirmationsMet: timing.met,
    confirmationsMissing: timing.missing,
    microHedge,
    gNew,
    topReason,
  };
}

/**
 * Classify a losing trade into a failure pattern for scar memory.
 */
export function classifyFailure(
  features: { momentum: number; vol: number; sentiment: number },
  pnlPct: number,
  regime: string,
): string {
  if (pnlPct >= 0) return "none";
  // Reflexive: strong sentiment+momentum in same direction yet lost
  if (Math.abs(features.sentiment) > 30 && sign(features.sentiment) === sign(features.momentum)) {
    return "adverse_reflex";
  }
  if (Math.abs(features.vol) > 25) return "vol_blowout";
  if ((regime || "").toLowerCase().includes("crisis")) return "regime_misread";
  if (Math.abs(features.momentum) < 3) return "timing_premature";
  return "drift_loss";
}

export function bucketsFor(features: { momentum: number; vol: number; sentiment: number }) {
  return {
    vol_bucket: volBucket(features.vol),
    sentiment_bucket: sentimentBucket(features.sentiment),
    momentum_bucket: momentumBucket(features.momentum),
  };
}