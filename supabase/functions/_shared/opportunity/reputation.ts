// Model reputation — dynamic, outcome-derived reliability weights.
//
// The nightly `calibration-fit` job settles every fired signal against the
// market (T+5) and re-aggregates per-model hit rates into the
// `engine_reliability` table, keyed by (engine_id, ticker_class, regime).
// This module loads those hit rates and converts them into the per-model
// reliability weights the ensemble consumes — so a model that stops
// working in the current regime/asset-class automatically loses influence,
// and a model that keeps being right gains it.
//
// Shrinkage: with few settled samples the hit rate is noise, so we shrink
// toward the 0.55 prior proportionally to sample size (full weight at 50+
// samples). Without any data the ensemble's static default applies.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const PRIOR = 0.55;
const FULL_WEIGHT_N = 50;
const MIN_RELIABILITY = 0.35;
const MAX_RELIABILITY = 0.80;

interface ReliabilityRow {
  engine_id: string;
  ticker_class: string;
  regime: string;
  n: number;
  hit_rate: number;
}

export interface ReputationBook {
  /** Reliability for a model in the given context; null → use ensemble default. */
  lookup(modelId: string, tickerClass: string, regime: string): number | null;
  /** Number of (model, class, regime) cells backed by settled outcomes. */
  cells: number;
}

const EMPTY_BOOK: ReputationBook = { lookup: () => null, cells: 0 };

let cached: { book: ReputationBook; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

function shrink(hitRate: number, n: number): number {
  const w = Math.min(1, n / FULL_WEIGHT_N);
  const shrunk = PRIOR + (hitRate - PRIOR) * w;
  return Math.max(MIN_RELIABILITY, Math.min(MAX_RELIABILITY, shrunk));
}

export async function loadReputation(): Promise<ReputationBook> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.book;
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return EMPTY_BOOK;
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("engine_reliability")
      .select("engine_id,ticker_class,regime,n,hit_rate")
      .limit(2000);
    if (error || !data) {
      cached = { book: EMPTY_BOOK, at: Date.now() };
      return EMPTY_BOOK;
    }
    const rows = data as ReliabilityRow[];

    const exact = new Map<string, { n: number; hit: number }>();
    const byModel = new Map<string, { n: number; wins: number }>();
    for (const r of rows) {
      const n = Number(r.n) || 0;
      const hit = Number(r.hit_rate) || 0;
      if (n <= 0) continue;
      exact.set(`${r.engine_id}|${r.ticker_class}|${r.regime}`, { n, hit });
      const agg = byModel.get(r.engine_id) ?? { n: 0, wins: 0 };
      agg.n += n;
      agg.wins += hit * n;
      byModel.set(r.engine_id, agg);
    }

    const book: ReputationBook = {
      cells: exact.size,
      lookup(modelId: string, tickerClass: string, regime: string): number | null {
        const hit = exact.get(`${modelId}|${tickerClass}|${regime}`);
        if (hit) return shrink(hit.hit, hit.n);
        const agg = byModel.get(modelId);
        if (agg && agg.n >= 10) return shrink(agg.wins / agg.n, agg.n);
        return null;
      },
    };
    cached = { book, at: Date.now() };
    return book;
  } catch {
    return EMPTY_BOOK;
  }
}

// ── Calibration / learning health ───────────────────────────────────

export interface LearningHealth {
  calibration: {
    alpha: number;
    beta: number;
    gamma: number;
    nSamples: number;
    brierScore: number;
    fitAt: string | null;
  };
  reputationCells: number;
  /** Brier ≥ 0.28 on a real sample means the calibrated probabilities have
   *  drifted from realized hit rates — surfaced so users see degradation. */
  drift: "healthy" | "degrading" | "unfit";
}

export async function loadLearningHealth(reputationCells: number): Promise<LearningHealth> {
  const fallback: LearningHealth = {
    calibration: { alpha: 3.2, beta: 1.4, gamma: -0.7, nSamples: 0, brierScore: 0.25, fitAt: null },
    reputationCells,
    drift: "unfit",
  };
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return fallback;
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("calibration_params")
      .select("alpha,beta,gamma,n_samples,brier_score,fit_at")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return fallback;
    const nSamples = Number(data.n_samples) || 0;
    const brier = Number(data.brier_score) || 0.25;
    return {
      calibration: {
        alpha: Number(data.alpha) || 3.2,
        beta: Number(data.beta) || 1.4,
        gamma: Number(data.gamma) ?? -0.7,
        nSamples,
        brierScore: brier,
        fitAt: data.fit_at ? String(data.fit_at) : null,
      },
      reputationCells,
      drift: nSamples < 30 ? "unfit" : brier >= 0.28 ? "degrading" : "healthy",
    };
  } catch {
    return fallback;
  }
}
