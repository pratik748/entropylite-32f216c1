// Market Context — a lightweight, knowledge-based macro classifier.
//
// It does NOT re-fetch anything and does NOT score securities. It reads the
// already-measured MacroContext and the benchmark-derived MarketRegime and
// classifies the current environment along three orthogonal axes:
//
//   trend       trending  | range_bound | unknown
//   volatility  high_vol  | normal_vol  | low_vol
//   risk        risk_on   | neutral     | risk_off
//
// Every classification is backed by a measured number (VIX percentile,
// benchmark 21-day drift, above/below 200-day, credit spreads, curve, the
// dollar) — the "signature quant edge" expressed as economic knowledge, not
// an LLM opinion.
//
// The context INFLUENCES CONFIDENCE, it never overrides model outputs. It is
// applied as a bounded, direction-aware multiplier on a *validated*
// opportunity's confidence (centred on 1.0, so a neutral environment leaves
// conviction — and therefore ranking — unchanged). It cannot change a model's
// direction, cannot change the consensus decision, and cannot move a
// candidate across the accept/reject line (the consensus gate has already
// run on the raw calibrated probability before this multiplier is applied).

import type { MacroContext } from "./macro.ts";
import type { MarketRegime } from "./models.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export type TrendState = "trending" | "range_bound" | "unknown";
export type VolState = "high_vol" | "normal_vol" | "low_vol";
export type RiskState = "risk_on" | "neutral" | "risk_off";
export type MarketContextLabel = TrendState | VolState | RiskState;

export interface MarketContext {
  trend: TrendState;
  volatility: VolState;
  risk: RiskState;
  /** Compact labels for badges / diagnostics, e.g. ["trending","low_vol","risk_on"]. */
  labels: MarketContextLabel[];
  /** Multiplier applied to a long's confidence (bounded, 1.0 = no effect). */
  longConfidenceMultiplier: number;
  /** Multiplier applied to a short's confidence (bounded, 1.0 = no effect). */
  shortConfidenceMultiplier: number;
  /** Measured, human-readable reasons for the classification. */
  evidence: string[];
}

// Confidence nudge is deliberately small and bounded: context tilts
// conviction at the margin, it does not dominate the models. In a neutral /
// normal / range-bound environment every term is zero and both multipliers
// are exactly 1.0 — behaviour is then identical to the pre-context engine.
const MULT_FLOOR = 0.90;
const MULT_CEIL = 1.06;

/**
 * Classify the environment from already-measured macro + regime evidence.
 * Pure and deterministic — same inputs always yield the same context.
 */
export function classifyMarketContext(macro: MacroContext, regime: MarketRegime): MarketContext {
  const evidence: string[] = [];

  // ── Volatility axis ──────────────────────────────────────────────
  // Prefer the VIX 1-year percentile (India VIX in India mode); fall back
  // to the benchmark's own realized vol when the vol index is unavailable.
  const vixPctile = macro.volatility.vixPercentile1y;
  const vix = macro.volatility.vix;
  let volatility: VolState = "normal_vol";
  if (vixPctile != null) {
    if (vixPctile >= 0.70) { volatility = "high_vol"; evidence.push(`Volatility elevated — VIX ${vix != null ? vix.toFixed(1) : ""} in the ${Math.round(vixPctile * 100)}th percentile of its 1-year range.`); }
    else if (vixPctile <= 0.30) { volatility = "low_vol"; evidence.push(`Volatility subdued — VIX ${vix != null ? vix.toFixed(1) : ""} in the ${Math.round(vixPctile * 100)}th percentile of its 1-year range.`); }
    else evidence.push(`Volatility mid-range — VIX in the ${Math.round(vixPctile * 100)}th percentile.`);
  } else if (regime.benchmarkVolAnnual > 0) {
    if (regime.benchmarkVolAnnual > 0.25) { volatility = "high_vol"; evidence.push(`Benchmark realized volatility ${pct(regime.benchmarkVolAnnual)} annualized — elevated.`); }
    else if (regime.benchmarkVolAnnual < 0.13) { volatility = "low_vol"; evidence.push(`Benchmark realized volatility ${pct(regime.benchmarkVolAnnual)} annualized — subdued.`); }
  }

  // ── Trend axis ───────────────────────────────────────────────────
  // Trending when the benchmark drifts with conviction on the right side of
  // its 200-day; range-bound when drift is small and vol is not elevated.
  const ret21 = regime.benchmarkRet21d;
  const above200 = regime.benchmarkAboveSma200;
  let trend: TrendState = "unknown";
  if (above200 != null && Math.abs(ret21) >= 0.02 && ((ret21 > 0) === above200)) {
    trend = "trending";
    evidence.push(`Benchmark ${above200 ? "above" : "below"} its 200-day average with a ${ret21 >= 0 ? "+" : ""}${pct(ret21)} 21-day drift — a ${ret21 >= 0 ? "up" : "down"}trend.`);
  } else if (Math.abs(ret21) < 0.015 && volatility !== "high_vol") {
    trend = "range_bound";
    evidence.push(`Benchmark 21-day drift only ${ret21 >= 0 ? "+" : ""}${pct(ret21)} with contained volatility — range-bound.`);
  }

  // ── Risk axis ────────────────────────────────────────────────────
  // Anchored on the benchmark regime, corroborated by credit spreads.
  let risk: RiskState = regime.label === "risk-on" ? "risk_on" : regime.label === "risk-off" ? "risk_off" : "neutral";
  const credit = macro.credit.highYieldRelStrength63d;
  if (credit != null) {
    if (credit <= -0.01 && risk !== "risk_off") evidence.push(`Corroborating risk-off tone: high-yield lagging investment-grade by ${pct(Math.abs(credit))} over 63 days (spreads widening).`);
    else if (credit >= 0.01 && risk !== "risk_on") evidence.push(`Corroborating risk-on tone: high-yield leading investment-grade by ${pct(credit)} over 63 days (spreads tightening).`);
  }
  evidence.push(`Environment classified ${risk.replace("_", "-")} (benchmark regime: ${regime.label}).`);

  // ── Confidence tilt (bounded, direction-aware) ───────────────────
  let bias = 0;   // + favours longs, − favours shorts
  if (risk === "risk_on") bias += 0.03;
  else if (risk === "risk_off") bias -= 0.03;
  if (trend === "trending") bias += above200 ? 0.02 : -0.02;

  let damp = 0;   // applies to BOTH sides — uncertainty shrinks conviction
  if (volatility === "high_vol") damp -= 0.03;
  else if (volatility === "low_vol") damp += 0.01;

  const longConfidenceMultiplier = Number(clamp(1 + bias + damp, MULT_FLOOR, MULT_CEIL).toFixed(3));
  const shortConfidenceMultiplier = Number(clamp(1 - bias + damp, MULT_FLOOR, MULT_CEIL).toFixed(3));

  return {
    trend,
    volatility,
    risk,
    labels: [trend, volatility, risk],
    longConfidenceMultiplier,
    shortConfidenceMultiplier,
    evidence,
  };
}

/** The multiplier to apply to a validated opportunity's confidence. */
export function contextConfidenceMultiplier(ctx: MarketContext, direction: "long" | "short"): number {
  return direction === "long" ? ctx.longConfidenceMultiplier : ctx.shortConfidenceMultiplier;
}
