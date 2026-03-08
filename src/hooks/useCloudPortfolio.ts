import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import type { HistoryEntry } from "@/components/AnalysisHistory";

/**
 * Syncs portfolio stocks and analysis history to Lovable Cloud,
 * so data persists across sessions for each authenticated user.
 */
export function useCloudPortfolio() {
  const [stocks, setStocksState] = useState<PortfolioStock[]>([]);
  const [history, setHistoryState] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const savingRef = useRef(false);

  // ─── Load from cloud on mount ───
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !alive) return;

      const [portfolioRes, historyRes] = await Promise.all([
        supabase.from("user_portfolios").select("*").eq("user_id", user.id).order("created_at"),
        supabase.from("user_analysis_history").select("*").eq("user_id", user.id).order("timestamp", { ascending: false }).limit(50),
      ]);

      if (!alive) return;

      if (portfolioRes.data) {
        const mapped: PortfolioStock[] = portfolioRes.data.map((row: any) => ({
          id: row.id,
          ticker: row.ticker,
          buyPrice: Number(row.buy_price),
          quantity: Number(row.quantity),
          analysis: row.analysis ?? undefined,
          isLoading: false,
        }));
        setStocksState(mapped);
      }

      if (historyRes.data) {
        const mapped: HistoryEntry[] = historyRes.data.map((row: any) => ({
          id: row.id,
          ticker: row.ticker,
          timestamp: Number(row.timestamp),
          suggestion: row.suggestion as HistoryEntry["suggestion"],
          currentPrice: Number(row.current_price),
          buyPrice: Number(row.buy_price),
          confidence: Number(row.confidence),
        }));
        setHistoryState(mapped);
      }

      setLoaded(true);
    };
    load();
    return () => { alive = false; };
  }, []);

  // ─── Save stocks to cloud (debounced by caller) ───
  const syncStocks = useCallback(async (updated: PortfolioStock[]) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current DB rows
      const { data: existing } = await supabase.from("user_portfolios").select("id, ticker").eq("user_id", user.id);
      const existingIds = new Set((existing ?? []).map((r: any) => r.id));
      const updatedIds = new Set(updated.map(s => s.id));

      // Delete removed
      const toDelete = [...existingIds].filter(id => !updatedIds.has(id));
      if (toDelete.length > 0) {
        await supabase.from("user_portfolios").delete().in("id", toDelete);
      }

      // Upsert remaining
      if (updated.length > 0) {
        const rows = updated.map(s => ({
          id: s.id,
          user_id: user.id,
          ticker: s.ticker,
          buy_price: s.buyPrice,
          quantity: s.quantity,
          analysis: s.analysis ?? null,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from("user_portfolios").upsert(rows, { onConflict: "id" });
      }
    } finally {
      savingRef.current = false;
    }
  }, []);

  // ─── Debounced stock setter ───
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const setStocks: React.Dispatch<React.SetStateAction<PortfolioStock[]>> = useCallback((action) => {
    setStocksState(prev => {
      const next = typeof action === "function" ? action(prev) : action;
      // Debounce cloud sync by 1s
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(() => syncStocks(next), 1000);
      return next;
    });
  }, [syncStocks]);

  // ─── Add history entry ───
  const addHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    setHistoryState(prev => [entry, ...prev.slice(0, 49)]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_analysis_history").insert({
      id: entry.id,
      user_id: user.id,
      ticker: entry.ticker,
      timestamp: entry.timestamp,
      suggestion: entry.suggestion,
      current_price: entry.currentPrice,
      buy_price: entry.buyPrice,
      confidence: entry.confidence,
    });
  }, []);

  const clearHistory = useCallback(async () => {
    setHistoryState([]);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("user_analysis_history").delete().eq("user_id", user.id);
  }, []);

  return { stocks, setStocks, history, setHistory: setHistoryState, addHistoryEntry, clearHistory, loaded };
}
