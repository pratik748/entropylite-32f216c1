import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  type LodgerTrade,
  rollingSharpe,
  rollingSortino,
  drawdownElasticity,
  edgeDecayFit,
  holdTimeHistogram,
  overtradingInflection,
  compoundingEquity,
  targetEnvelopes,
  disciplineState,
  dailyTargetProbability,
} from "@/lib/lodgers-math";
import { useOutcomeGradient } from "@/hooks/useOutcomeGradient";

const LIMIT = 500;

function rowToTrade(r: any): LodgerTrade {
  return {
    id: r.id,
    ticker: r.ticker,
    side: (r.side === "short" ? "short" : "long"),
    entry_ts: Number(r.entry_ts) || 0,
    exit_ts: Number(r.exit_ts) || 0,
    entry_px: Number(r.entry_px) || 0,
    exit_px: Number(r.exit_px) || 0,
    qty: Number(r.qty) || 0,
    pnl_pct: Number(r.pnl_pct) || 0,
    pnl_abs: Number(r.pnl_abs) || 0,
    expected_pct: Number(r.expected_pct) || 0,
    expected_hold_min: Number(r.expected_hold_min) || 0,
    actual_hold_min: Number(r.actual_hold_min) || 0,
    regime: r.regime || "unknown",
    vol_at_entry: Number(r.vol_at_entry) || 0,
    liquidity_score: Number(r.liquidity_score) || 0,
    reflex_score: Number(r.reflex_score) || 0,
    exec_latency_ms: Number(r.exec_latency_ms) || 0,
    slippage_bps: Number(r.slippage_bps) || 0,
    realized_sharpe: Number(r.realized_sharpe) || 0,
    divergence_pct: Number(r.divergence_pct) || 0,
    drawdown_elasticity: Number(r.drawdown_elasticity) || 0,
    lesson: r.lesson ?? null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    pattern_id: r.pattern_id ?? null,
    created_at: r.created_at,
  };
}

export function useLodgers() {
  const [trades, setTrades] = useState<LodgerTrade[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { ingestTrade } = useOutcomeGradient();

  // Hydrate
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) { setLoading(false); return; }
      const { data } = await supabase
        .from("lodger_trades")
        .select("*")
        .order("entry_ts", { ascending: true })
        .limit(LIMIT);
      if (!cancelled && data) setTrades(data.map(rowToTrade));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /** Persist a closed lodge. Also fires the lodger-distill AI lesson and ODGS ingestion. */
  const closeLodge = useCallback(async (raw: Omit<LodgerTrade, "id" | "created_at" | "lesson" | "tags" | "pattern_id" | "realized_sharpe" | "divergence_pct" | "drawdown_elasticity">) => {
    if (!userId) return null;
    // Compute derived fingerprints from prior + this trade
    const provisional: LodgerTrade = {
      ...raw,
      realized_sharpe: 0,
      divergence_pct: raw.pnl_pct - raw.expected_pct,
      drawdown_elasticity: 0,
      tags: [],
      lesson: null,
      pattern_id: null,
    };
    const allWithThis = [...trades, provisional];
    provisional.realized_sharpe = rollingSharpe(allWithThis, 30, 4);
    provisional.drawdown_elasticity = drawdownElasticity(allWithThis);

    // Insert
    const insertRow: Record<string, any> = {
      user_id: userId,
      ticker: provisional.ticker,
      side: provisional.side,
      entry_ts: provisional.entry_ts,
      exit_ts: provisional.exit_ts,
      entry_px: provisional.entry_px,
      exit_px: provisional.exit_px,
      qty: provisional.qty,
      pnl_pct: provisional.pnl_pct,
      pnl_abs: provisional.pnl_abs,
      expected_pct: provisional.expected_pct,
      expected_hold_min: provisional.expected_hold_min,
      actual_hold_min: provisional.actual_hold_min,
      regime: provisional.regime,
      vol_at_entry: provisional.vol_at_entry,
      liquidity_score: provisional.liquidity_score,
      reflex_score: provisional.reflex_score,
      exec_latency_ms: provisional.exec_latency_ms,
      slippage_bps: provisional.slippage_bps,
      realized_sharpe: provisional.realized_sharpe,
      divergence_pct: provisional.divergence_pct,
      drawdown_elasticity: provisional.drawdown_elasticity,
    };
    const { data: inserted, error } = await supabase.from("lodger_trades").insert(insertRow).select().single();
    if (error || !inserted) {
      console.error("[lodger] insert failed", error);
      return null;
    }
    const newTrade = rowToTrade(inserted);
    setTrades(prev => [...prev, newTrade]);

    // Feed ODGS profit-bias graph
    try {
      ingestTrade({
        asset: newTrade.ticker,
        assetClass: "equity",
        features: {
          momentum: 0,
          vol: newTrade.vol_at_entry,
          sentiment: 0,
          regime: newTrade.regime,
        },
        pnlPct: newTrade.pnl_pct,
        returnAbs: newTrade.pnl_abs,
        duration: Math.max(0.01, newTrade.actual_hold_min / 60),
        timestamp: newTrade.exit_ts || newTrade.entry_ts || Date.now(),
        source: "lodger",
      });
    } catch (e) { /* non-fatal */ }

    // Distill lesson via edge function (non-blocking)
    (async () => {
      try {
        const recent = [...trades, newTrade].slice(-20).map(t => ({
          ticker: t.ticker, regime: t.regime,
          pnl_pct: t.pnl_pct, expected_pct: t.expected_pct,
          actual_hold_min: t.actual_hold_min, expected_hold_min: t.expected_hold_min,
          divergence_pct: t.divergence_pct, lesson: t.lesson || null,
        }));
        const { data: distilled, error: dErr } = await supabase.functions.invoke("lodger-distill", {
          body: { trade: newTrade, recent },
        });
        if (dErr || !distilled?.lesson) return;
        const { error: uErr } = await supabase
          .from("lodger_trades")
          .update({ lesson: distilled.lesson, tags: distilled.tags || [], pattern_id: distilled.pattern_id || null })
          .eq("id", newTrade.id!);
        if (!uErr) {
          setTrades(prev => prev.map(t => t.id === newTrade.id ? { ...t, lesson: distilled.lesson, tags: distilled.tags || [], pattern_id: distilled.pattern_id || null } : t));
        }
      } catch (e) {
        console.warn("[lodger] distill failed (soft)", e);
      }
    })();

    return newTrade;
  }, [userId, trades, ingestTrade]);

  // Aggregates
  const sharpe = useMemo(() => rollingSharpe(trades, 30, 4), [trades]);
  const sortino = useMemo(() => rollingSortino(trades, 30, 4), [trades]);
  const elasticity = useMemo(() => drawdownElasticity(trades), [trades]);
  const decay = useMemo(() => edgeDecayFit(trades), [trades]);
  const histogram = useMemo(() => holdTimeHistogram(trades, 8), [trades]);
  const overtrade = useMemo(() => overtradingInflection(trades), [trades]);
  const equityCurve = useMemo(() => compoundingEquity(trades), [trades]);
  const envelopes = useMemo(() => targetEnvelopes(Math.max(20, trades.length), 100), [trades.length]);

  const todayStats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const t = trades.filter(x => new Date(x.entry_ts).toISOString().slice(0, 10) === today);
    const pnl = t.reduce((s, x) => s + x.pnl_pct, 0);
    return { count: t.length, pnlPct: pnl, trades: t };
  }, [trades]);

  const discipline = useMemo(() => disciplineState(trades, {
    dailyLossCapPct: 2,
    consecutiveLossLimit: 3,
    overtradeLimit: overtrade.inflection || 0,
    postWinCooloffMin: 5,
  }), [trades, overtrade.inflection]);

  const targetProb = useMemo(() => {
    const last30 = trades.slice(-30);
    const avg = last30.length ? last30.reduce((s, t) => s + t.pnl_pct, 0) / last30.length : 0.3;
    const sig = (() => {
      if (last30.length < 3) return 0.5;
      const m = last30.reduce((s, t) => s + t.pnl_pct, 0) / last30.length;
      const v = last30.reduce((s, t) => s + (t.pnl_pct - m) ** 2, 0) / (last30.length - 1);
      return Math.sqrt(v);
    })();
    // Assume 4 trades/day cadence remaining
    const remaining = Math.max(0, 4 - todayStats.count);
    return dailyTargetProbability({
      todayPnlPct: todayStats.pnlPct,
      avgPnlPerTrade: avg,
      sigmaPerTrade: sig,
      tradesRemaining: remaining,
    });
  }, [trades, todayStats]);

  return {
    loading,
    trades,
    closeLodge,
    // analytics
    sharpe,
    sortino,
    elasticity,
    decay,
    histogram,
    overtrade,
    equityCurve,
    envelopes,
    todayStats,
    discipline,
    targetProb,
  };
}