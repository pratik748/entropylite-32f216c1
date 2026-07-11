// Model reputation — Deno-side loaders for the pure builders in
// `reputationCore.ts`. See that file for the shrinkage/drift rules; this
// file only knows how to read the tables inside an edge function.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildLearningHealth,
  buildReputationBook,
  DEFAULT_LEARNING_HEALTH,
  EMPTY_BOOK,
  type CalibrationRow,
  type LearningHealth,
  type ReliabilityRow,
  type ReputationBook,
} from "./reputationCore.ts";

export type { LearningHealth, ReputationBook };

let cached: { book: ReputationBook; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

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
    const book = buildReputationBook(data as ReliabilityRow[]);
    cached = { book, at: Date.now() };
    return book;
  } catch {
    return EMPTY_BOOK;
  }
}

export async function loadLearningHealth(reputationCells: number): Promise<LearningHealth> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    if (!url || !key) return { ...DEFAULT_LEARNING_HEALTH, reputationCells };
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("calibration_params")
      .select("alpha,beta,gamma,n_samples,brier_score,fit_at")
      .eq("id", 1)
      .maybeSingle();
    if (error || !data) return { ...DEFAULT_LEARNING_HEALTH, reputationCells };
    return buildLearningHealth(data as CalibrationRow, reputationCells);
  } catch {
    return { ...DEFAULT_LEARNING_HEALTH, reputationCells };
  }
}
