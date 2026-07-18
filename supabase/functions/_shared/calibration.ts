// Calibration for the ensemble's Platt map.
//
// The nightly-fitted `calibration_params` row is NO LONGER consumed. The
// fit was never decisive — the gate's discrimination comes from the ensemble
// score and agreement, and the priors map them faithfully — while a single
// degenerate fit (observed live: α=0.97, β=0, γ=−2.67, whose maximum output
// is 15%, clamped to the 0.50 floor) silently killed every verdict in the
// product. A knob that can only subtract value does not deserve a seat in
// the decision path: the engine now always runs on the priors, and the
// nightly job keeps fitting purely as an observability report.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { CalibrationParams } from "./ensemble.ts";

const DEFAULTS: CalibrationParams = { alpha: 3.2, beta: 1.4, gamma: -0.7 };

export async function loadCalibration(): Promise<CalibrationParams> {
  return DEFAULTS;
}

export interface ReliabilityReport {
  createdAt: string;
  windowDays: number;
  nSettled: number;
  /** Brier score of the probabilities the product displayed (lower = better; 0.25 = coin flip on a 50% base). */
  brierDisplayed: number | null;
  /** Realized win rate over all settled displayed signals. */
  hitRate: number | null;
  /** Reliability bins: displayed-prob band vs realized frequency. */
  bins: Array<{ pLow: number; pHigh: number; meanForecast: number; meanOutcome: number; n: number }>;
  notes: string | null;
}

/**
 * Latest nightly reliability report for the displayed prior-map probability.
 * This is the empirical evidence that decides how much belief the number
 * deserves. Returns null when the table is missing or empty — callers must
 * treat "no evidence yet" as exactly that, never as "calibrated".
 */
export async function loadReliabilityReport(): Promise<ReliabilityReport | null> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      || Deno.env.get("SUPABASE_ANON_KEY")
      || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return null;
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("calibration_reports")
      .select("created_at, window_days, n_settled, brier_displayed, hit_rate, bins, notes")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      createdAt: String(data.created_at),
      windowDays: Number(data.window_days) || 90,
      nSettled: Number(data.n_settled) || 0,
      brierDisplayed: data.brier_displayed != null ? Number(data.brier_displayed) : null,
      hitRate: data.hit_rate != null ? Number(data.hit_rate) : null,
      bins: Array.isArray(data.bins) ? data.bins : [],
      notes: data.notes != null ? String(data.notes) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget log of a fired signal to `signal_outcomes` so the
 * nightly job can mark it to market T+5 days later.
 */
export async function logSignalOutcome(payload: {
  source: string;
  ticker: string;
  tickerClass: string;
  regime: string;
  action: string;
  ensembleScore: number;
  agreement: number;
  calibratedProb: number;
  expectedR: number;
  bucketADir: number;
  bucketBDir: number;
  bucketCDir: number;
  engines: Array<{ id: string; direction: number; confidence: number }>;
  entryPrice: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  costHaircut: number;
  userId?: string | null;
}): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
      || Deno.env.get("SUPABASE_ANON_KEY")
      || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return;
    const sb = createClient(url, key);
    await sb.from("signal_outcomes").insert({
      source: payload.source,
      user_id: payload.userId ?? null,
      ticker: payload.ticker,
      ticker_class: payload.tickerClass,
      regime: payload.regime,
      action: payload.action,
      ensemble_score: payload.ensembleScore,
      agreement: payload.agreement,
      calibrated_prob: payload.calibratedProb,
      expected_r: payload.expectedR,
      bucket_a_dir: payload.bucketADir,
      bucket_b_dir: payload.bucketBDir,
      bucket_c_dir: payload.bucketCDir,
      engines: payload.engines,
      entry_price: payload.entryPrice,
      target_price: payload.targetPrice ?? null,
      stop_loss: payload.stopLoss ?? null,
      cost_haircut: payload.costHaircut,
    });
  } catch (e) {
    console.warn("logSignalOutcome failed:", (e as Error).message);
  }
}