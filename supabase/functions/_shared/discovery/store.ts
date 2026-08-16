// Persistence for the discovery layer: the opportunity ledger and the
// per-(engine x regime) reliability cells.
//
// The ledger is what makes the learning loop possible. Every candidate the
// scan evaluates is written down with its FROZEN feature snapshot, published
// or rejected, with reasons. Without a frozen record, any later "our engine
// was right" claim is unfalsifiable, because the features would be recomputed
// from data that has since changed. This is the same reason a risk system
// stores the inputs to a valuation, not just the valuation.
//
// Reliability cells are decayed Beta-Bernoulli posteriors, read at scan time
// and updated only from REALIZED outcomes. An engine that has been wrong in
// the current regime is trusted less, and that discount is measured, not
// asserted.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { betaMean, type BetaState } from "./quantDeps.ts";
import type { ReliabilityCell } from "./types.ts";

function serviceClient(): SupabaseClient | null {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface OpportunityRow {
  symbol: string;
  signalClass: string;
  direction: 1 | -1;
  horizonDays: number;
  os: number;
  factors: Record<string, unknown>;
  regime: string | null;
  bottleneck: Record<string, unknown> | null;
  published: boolean;
  rejectReasons: string[];
  frozenFeatures: Record<string, unknown>;
}

/**
 * Append candidates to the ledger. Best-effort: a ledger write must never
 * fail a scan, because the ledger is an audit artifact, not a dependency of
 * the recommendation.
 */
export async function recordOpportunities(rows: OpportunityRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const sb = serviceClient();
  if (!sb) return 0;
  const payload = rows.map((r) => ({
    symbol: r.symbol,
    signal_class: r.signalClass,
    direction: r.direction,
    horizon_days: r.horizonDays,
    os: Number.isFinite(r.os) ? r.os : 0,
    factors: r.factors,
    regime: r.regime,
    bottleneck: r.bottleneck,
    published: r.published,
    reject_reasons: r.rejectReasons,
    frozen_features: r.frozenFeatures,
  }));
  const { error } = await sb.from("opportunities").insert(payload);
  if (error) {
    console.warn(`[discovery/store] ledger write skipped: ${error.message}`);
    return 0;
  }
  return payload.length;
}

/** Load every reliability cell for one regime, keyed by engine id. */
export async function loadReliability(regime: string): Promise<Map<string, ReliabilityCell>> {
  const out = new Map<string, ReliabilityCell>();
  const sb = serviceClient();
  if (!sb) return out;
  const { data, error } = await sb
    .from("engine_regime_stats")
    .select("engine_id, alpha, beta, n")
    .eq("regime", regime);
  if (error || !data) {
    if (error) console.warn(`[discovery/store] reliability read skipped: ${error.message}`);
    return out;
  }
  for (const row of data as Array<{ engine_id: string; alpha: number; beta: number; n: number }>) {
    out.set(row.engine_id, { alpha: row.alpha, beta: row.beta, n: row.n });
  }
  return out;
}

/**
 * Posterior mean hit-rate for an engine in a regime, with the strength of
 * evidence. An unseen cell returns the 0.55 prior at n=0, and callers must
 * treat low n as "no information" rather than as a real edge.
 */
export function reliabilityOf(
  cells: Map<string, ReliabilityCell>,
  engineId: string,
): { hitRate: number; n: number; known: boolean } {
  const c = cells.get(engineId);
  if (!c) return { hitRate: 0.55, n: 0, known: false };
  const state: BetaState = { alpha: c.alpha, beta: c.beta };
  return { hitRate: betaMean(state), n: c.n, known: c.n >= 10 };
}
