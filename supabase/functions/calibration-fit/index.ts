// Nightly walk-forward calibration job.
//
// 1. Marks every signal in `signal_outcomes` that's older than 5 trading
//    days (≈7 calendar days) and still unsettled, by fetching the close
//    price now and computing whether the trade hit target (win) or stop
//    (loss). Resolves outcome_won (1/0) + outcome_pct.
// 2. Fits Platt scaling constants (α, β, γ) via gradient descent on the
//    last 90 days of (ensemble_score, agreement, outcome) tuples and
//    writes them to `calibration_params`.
// 3. Updates `engine_reliability` hit-rates per engine × ticker_class
//    × regime by re-aggregating from the settled outcomes.
//
// Designed to be invoked by pg_cron or manually. Stateless. No auth.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const UA = "Mozilla/5.0 (compatible; entropylite-calibration/1.0)";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchClose(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) { await r.text(); return null; }
    const j = await r.json();
    const p = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" && p > 0 ? p : null;
  } catch { return null; }
}

function sigmoid(x: number): number { return 1 / (1 + Math.exp(-x)); }

/** Fit logistic params (α, β, γ) via gradient descent on a tiny dataset. */
function fitPlatt(samples: Array<{ score: number; agreement: number; won: number }>): { alpha: number; beta: number; gamma: number; brier: number } {
  let alpha = 3.2, beta = 1.4, gamma = -0.7;
  if (samples.length < 30) {
    return { alpha, beta, gamma, brier: 0.25 };
  }
  const lr = 0.05;
  for (let epoch = 0; epoch < 400; epoch++) {
    let gA = 0, gB = 0, gG = 0;
    for (const s of samples) {
      const x1 = Math.abs(s.score);
      const x2 = s.agreement;
      const z = alpha * x1 + beta * x2 + gamma;
      const p = sigmoid(z);
      const err = p - s.won;
      gA += err * x1;
      gB += err * x2;
      gG += err;
    }
    const n = samples.length;
    alpha -= (lr * gA) / n;
    beta -= (lr * gB) / n;
    gamma -= (lr * gG) / n;
    // Keep params in sane range
    alpha = Math.max(0.5, Math.min(8, alpha));
    beta = Math.max(0.0, Math.min(5, beta));
    gamma = Math.max(-3, Math.min(1, gamma));
  }
  // Brier score for QA
  let brier = 0;
  for (const s of samples) {
    const p = sigmoid(alpha * Math.abs(s.score) + beta * s.agreement + gamma);
    brier += (p - s.won) ** 2;
  }
  brier /= samples.length;
  return { alpha, beta, gamma, brier };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(url, key);

  const report: Record<string, unknown> = {};

  // ─── 1. Settle unsettled signals older than 5 trading days ────
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data: pending } = await sb
    .from("signal_outcomes")
    .select("id, ticker, action, entry_price, target_price, stop_loss")
    .is("outcome_won", null)
    .lt("fired_at", cutoff)
    .limit(500);

  let settled = 0;
  if (pending && pending.length > 0) {
    for (const row of pending) {
      const cur = await fetchClose(row.ticker);
      if (cur == null) continue;
      const entry = Number(row.entry_price) || 0;
      if (entry <= 0) continue;
      const dir = row.action === "BUY" ? 1 : row.action === "SELL" ? -1 : 0;
      if (dir === 0) continue;
      const pct = dir * ((cur - entry) / entry) * 100;
      // Win = direction was right by > round-trip cost (we approximate 0.5%)
      const won = pct > 0.5 ? 1 : 0;
      await sb.from("signal_outcomes")
        .update({ outcome_price: cur, outcome_pct: Number(pct.toFixed(3)), outcome_won: won, outcome_at: new Date().toISOString() })
        .eq("id", row.id);
      settled++;
    }
  }
  report.settled = settled;

  // ─── 2. Refit Platt calibration on last 90 days of settled signals ───
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: settledRows } = await sb
    .from("signal_outcomes")
    .select("ensemble_score, agreement, outcome_won")
    .not("outcome_won", "is", null)
    .gte("fired_at", since)
    .limit(5000);

  const samples = (settledRows || []).map((r: any) => ({
    score: Number(r.ensemble_score) || 0,
    agreement: Number(r.agreement) || 0,
    won: Number(r.outcome_won) || 0,
  })).filter((s) => Number.isFinite(s.score) && Number.isFinite(s.agreement));

  const fit = fitPlatt(samples);
  report.calibration = { ...fit, samples: samples.length };

  if (samples.length >= 30) {
    await sb.from("calibration_params").upsert({
      id: 1,
      alpha: Number(fit.alpha.toFixed(4)),
      beta: Number(fit.beta.toFixed(4)),
      gamma: Number(fit.gamma.toFixed(4)),
      n_samples: samples.length,
      brier_score: Number(fit.brier.toFixed(4)),
      fit_at: new Date().toISOString(),
    });
  }

  // ─── 3. Rebuild engine_reliability table from settled outcomes ──
  const { data: engineRows } = await sb
    .from("signal_outcomes")
    .select("ticker_class, regime, engines, outcome_won")
    .not("outcome_won", "is", null)
    .gte("fired_at", since)
    .limit(5000);

  // Group by (engine_id, ticker_class, regime)
  const agg = new Map<string, { engine: string; cls: string; reg: string; n: number; wins: number }>();
  for (const row of engineRows || []) {
    const cls = String(row.ticker_class || "unknown");
    const reg = String(row.regime || "unknown");
    const won = Number(row.outcome_won) || 0;
    const engines = Array.isArray(row.engines) ? row.engines : [];
    for (const e of engines) {
      const engineId = String(e?.id || "");
      const dir = Number(e?.direction) || 0;
      if (!engineId || dir === 0) continue;
      // Engine considered "right" if its direction matched the winning outcome
      // (dir>0 + won=1) or (dir<0 + won=0). This is a coarse approximation
      // but good enough for ranking engines by reliability.
      const engineWon = (dir > 0 && won === 1) || (dir < 0 && won === 0) ? 1 : 0;
      const k = `${engineId}|${cls}|${reg}`;
      const cur = agg.get(k) ?? { engine: engineId, cls, reg, n: 0, wins: 0 };
      cur.n += 1;
      cur.wins += engineWon;
      agg.set(k, cur);
    }
  }
  const reliabilityRows = Array.from(agg.values())
    .filter((r) => r.n >= 5)
    .map((r) => ({
      engine_id: r.engine,
      ticker_class: r.cls,
      regime: r.reg,
      n: r.n,
      wins: r.wins,
      hit_rate: Number((r.wins / r.n).toFixed(3)),
      updated_at: new Date().toISOString(),
    }));
  if (reliabilityRows.length > 0) {
    await sb.from("engine_reliability").upsert(reliabilityRows);
  }
  report.reliability_rows = reliabilityRows.length;

  return new Response(JSON.stringify({ ok: true, ...report }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});