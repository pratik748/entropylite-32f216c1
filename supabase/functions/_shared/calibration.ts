// Load nightly-fit calibration params from the `calibration_params`
// table. Falls back to v1 defaults if the table is empty or unreachable
// so the host engine never breaks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { CalibrationParams } from "./ensemble.ts";

const DEFAULTS: CalibrationParams = { alpha: 3.2, beta: 1.4, gamma: -0.7 };

let cached: { params: CalibrationParams; at: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * A stored calibration is usable only if it can still discriminate: at full
 * consensus (ensemble score 1, agreement 1) it must be able to express a
 * probability that can clear a trade gate. A fit whose maximum output sits
 * below 0.60 maps EVERY ticket to the 0.50 clamp floor — zero discrimination,
 * every verdict becomes WAIT, the engine is silently dead (this exactly
 * happened: α=0.97, β=0, γ=−2.67 ⇒ p_max=15%). Such fits are degenerate for
 * decision purposes and must fall back to the priors.
 */
export function isUsableCalibration(p: CalibrationParams): boolean {
  if (![p.alpha, p.beta, p.gamma].every(Number.isFinite)) return false;
  return sigmoid(p.alpha + p.beta + p.gamma) >= 0.6;
}

export async function loadCalibration(): Promise<CalibrationParams> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.params;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return DEFAULTS;
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("calibration_params")
      .select("alpha,beta,gamma")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) {
      cached = { params: DEFAULTS, at: Date.now() };
      return DEFAULTS;
    }
    const fitted: CalibrationParams = {
      alpha: Number(data.alpha) || DEFAULTS.alpha,
      beta: Number(data.beta) || DEFAULTS.beta,
      gamma: Number(data.gamma) ?? DEFAULTS.gamma,
    };
    const params = isUsableCalibration(fitted) ? fitted : DEFAULTS;
    if (params !== fitted) {
      console.warn(
        `calibration: stored fit rejected (α=${fitted.alpha}, β=${fitted.beta}, γ=${fitted.gamma} ⇒ p_max=${sigmoid(fitted.alpha + fitted.beta + fitted.gamma).toFixed(3)} < 0.6) — using priors`,
      );
    }
    cached = { params, at: Date.now() };
    return params;
  } catch {
    return DEFAULTS;
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