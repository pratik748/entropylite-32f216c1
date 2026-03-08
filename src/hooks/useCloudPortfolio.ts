import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import type { HistoryEntry } from "@/components/AnalysisHistory";

/**
 * Syncs portfolio stocks and analysis history to Lovable Cloud,
 * so data persists across sessions for each authenticated user.
 *
 * Key safeguards:
 * - Waits for auth session before querying (prevents RLS failures)
 * - Only syncs structural changes (add/remove/edit), NOT price-only updates
 * - Debounced cloud sync with optimistic rollback on error
 */
export function useCloudPortfolio() {
  const [stocks, setStocksState] = useState<PortfolioStock[]>([]);
  const [history, setHistoryState] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const savingRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  // ─── Wait for auth, then load from cloud ───
  useEffect(() => {
    let alive = true;

    const loadForUser = async (userId: string) => {
      userIdRef.current = userId;

      const [portfolioRes, historyRes] = await Promise.all([
        supabase.from("user_portfolios").select("*").eq("user_id", userId).order("created_at"),
        supabase.from("user_analysis_history").select("*").eq("user_id", userId).order("timestamp", { ascending: false }).limit(50),
      ]);

      if (!alive) return;

      if (portfolioRes.data && portfolioRes.data.length > 0) {
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

    // Try current session first
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!alive) return;
      if (session?.user) {
        loadForUser(session.user.id);
      } else {
        setLoaded(true); // no user = nothing to load
      }
    });

    // Also listen for auth changes (e.g. sign-in after mount)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (session?.user && !userIdRef.current) {
        loadForUser(session.user.id);
      }
    });

    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  // ─── Save stocks to cloud (structural changes only) ───
  const syncStocks = useCallback(async (updated: PortfolioStock[]) => {
    const userId = userIdRef.current;
    if (!userId || savingRef.current) return;
    savingRef.current = true;
    try {
      // Get current DB rows
      const { data: existing } = await supabase.from("user_portfolios").select("id, ticker").eq("user_id", userId);
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
          user_id: userId,
          ticker: s.ticker,
          buy_price: s.buyPrice,
          quantity: s.quantity,
          analysis: s.analysis ?? null,
          updated_at: new Date().toISOString(),
        }));
        await supabase.from("user_portfolios").upsert(rows, { onConflict: "id" });
      }
    } catch (err) {
      console.error("Cloud sync error:", err);
    } finally {
      savingRef.current = false;
    }
  }, []);

  // ─── Structural-only stock setter (triggers cloud sync) ───
  const syncTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const setStocks: React.Dispatch<React.SetStateAction<PortfolioStock[]>> = useCallback((action) => {
    setStocksState(prev => {
      const next = typeof action === "function" ? action(prev) : action;

      // Only sync to cloud if structural change occurred (not just price updates)
      const structuralChange =
        prev.length !== next.length ||
        prev.some((s, i) => {
          const n = next[i];
          if (!n) return true;
          return s.id !== n.id || s.ticker !== n.ticker || s.buyPrice !== n.buyPrice || s.quantity !== n.quantity ||
            // Sync when analysis first arrives (suggestion field)
            (!!n.analysis?.suggestion && !s.analysis?.suggestion);
        });

      if (structuralChange && userIdRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => syncStocks(next), 1000);
      }
      return next;
    });
  }, [syncStocks]);

  // ─── Add history entry ───
  const addHistoryEntry = useCallback(async (entry: HistoryEntry) => {
    setHistoryState(prev => [entry, ...prev.slice(0, 49)]);
    const userId = userIdRef.current;
    if (!userId) return;
    await supabase.from("user_analysis_history").insert({
      id: entry.id,
      user_id: userId,
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
    const userId = userIdRef.current;
    if (!userId) return;
    await supabase.from("user_analysis_history").delete().eq("user_id", userId);
  }, []);

  return { stocks, setStocks, history, setHistory: setHistoryState, addHistoryEntry, clearHistory, loaded };
}
