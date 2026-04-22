import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface LodgerTrade {
  id: string;
  ticker: string;
  side: string;
  entry_ts: number;
  exit_ts: number;
  entry_px: number;
  exit_px: number;
  qty: number;
  pnl_pct: number;
  pnl_abs: number;
  expected_pct: number;
  expected_hold_min: number;
  actual_hold_min: number;
  regime: string;
  reflex_score: number;
  realized_sharpe: number;
  divergence_pct: number;
  drawdown_elasticity: number;
  lesson: string | null;
  created_at: string;
}

export function useLodgers() {
  const [trades, setTrades] = useState<LodgerTrade[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setTrades([]); setLoaded(true); return; }
    const { data } = await supabase
      .from("lodger_trades")
      .select("*")
      .order("exit_ts", { ascending: false })
      .limit(200);
    setTrades((data || []) as LodgerTrade[]);
    setLoaded(true);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Realtime audit trail
  useEffect(() => {
    const ch = supabase
      .channel("lodger_trades_rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "lodger_trades" }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  // Aggregations
  const winRate = trades.length
    ? Math.round((trades.filter(t => t.pnl_pct > 0).length / trades.length) * 100)
    : 0;
  const avgHoldMin = trades.length
    ? Math.round(trades.reduce((s, t) => s + (t.actual_hold_min || 0), 0) / trades.length)
    : 0;
  const sharpeSeries = trades.slice(0, 40).map(t => t.realized_sharpe || 0).reverse();
  const lastLesson = trades.find(t => t.lesson)?.lesson || null;
  const cumulativePnL = trades.reduce((s, t) => s + (t.pnl_abs || 0), 0);

  return { trades, loaded, refresh, winRate, avgHoldMin, sharpeSeries, lastLesson, cumulativePnL };
}
