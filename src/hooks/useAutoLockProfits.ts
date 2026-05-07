import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useHistoricalPrices } from "./useHistoricalPrices";
import { useQuantSnapshot } from "./useQuantSnapshot";
import { evaluateExit, type ExitDecision } from "@/lib/exit-signal-engine";
import { resolveAssetCurrency } from "@/lib/currency";
import type { PortfolioStock } from "@/components/PortfolioPanel";

export interface LockedExit {
  id: string;
  ticker: string;
  buy_price: number;
  exit_price: number;
  quantity: number;
  peak_price: number;
  pnl_abs: number;
  pnl_pct: number;
  trigger_reason: string;
  currency: string;
  position_key: string;
  locked_at: string;
}

export interface AutoLockConfig {
  enabled: boolean;
  aggressiveness: "conservative" | "balanced" | "aggressive";
  minProfitPct: number;
}

const CONFIG_KEY = "entropy_autolock_config";
const PEAK_KEY = "entropy_autolock_peaks";

const DEFAULT_CONFIG: AutoLockConfig = {
  enabled: true,
  aggressiveness: "balanced",
  minProfitPct: 0.5,
};

function loadConfig(): AutoLockConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function loadPeaks(): Record<string, { peak: number; created: number }> {
  try {
    const raw = localStorage.getItem(PEAK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function savePeaks(p: Record<string, { peak: number; created: number }>) {
  try { localStorage.setItem(PEAK_KEY, JSON.stringify(p)); } catch {}
}

function positionKey(s: PortfolioStock): string {
  return `${s.ticker}|${s.buyPrice}|${s.quantity}|${s.createdAt ?? s.id}`;
}

export function useAutoLockProfits(stocks: PortfolioStock[]) {
  const [config, setConfigState] = useState<AutoLockConfig>(loadConfig);
  const [locked, setLocked] = useState<LockedExit[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const peaksRef = useRef<Record<string, { peak: number; created: number }>>(loadPeaks());
  const lockedKeysRef = useRef<Set<string>>(new Set());
  const inFlightRef = useRef<Set<string>>(new Set());

  const snapshot = useQuantSnapshot(stocks);
  const { prices, fetchHistorical } = useHistoricalPrices();

  const setConfig = useCallback((c: Partial<AutoLockConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...c };
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Auth + initial load of locked exits
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) { setLocked([]); return; }
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("locked_exits")
        .select("*")
        .order("locked_at", { ascending: false })
        .limit(200);
      if (!alive || !data) return;
      setLocked(data as LockedExit[]);
      lockedKeysRef.current = new Set(data.map((d: any) => d.position_key));
    })();
    return () => { alive = false; };
  }, [userId]);

  // Fetch history for any ticker we don't have yet
  useEffect(() => {
    const tickers = stocks.filter(s => s.analysis).map(s => s.ticker);
    if (tickers.length > 0) fetchHistorical(tickers, "1y");
  }, [stocks, fetchHistorical]);

  // Evaluate exit signals on every stock change
  useEffect(() => {
    if (!config.enabled || !userId) return;
    const now = Date.now();
    const peaks = peaksRef.current;
    let dirty = false;

    for (const s of stocks) {
      if (!s.analysis?.currentPrice || s.isLoading) continue;
      const key = positionKey(s);
      if (lockedKeysRef.current.has(key) || inFlightRef.current.has(key)) continue;

      const current = s.analysis.currentPrice as number;
      const tracker = peaks[key];
      if (!tracker) {
        peaks[key] = { peak: current, created: now };
        dirty = true;
        continue;
      }
      // 60s grace
      if (now - tracker.created < 60_000) continue;

      if (current > tracker.peak) {
        tracker.peak = current;
        dirty = true;
      }

      const stats = snapshot.assetStats[s.ticker];
      const series = prices[s.ticker];
      const decision = evaluateExit({
        currentPrice: current,
        buyPrice: s.buyPrice,
        peakPrice: tracker.peak,
        closes: series?.closes,
        stats,
        riskScore: s.analysis?.riskScore,
        suggestion: s.analysis?.suggestion,
        aggressiveness: config.aggressiveness,
        minProfitPct: config.minProfitPct,
      });

      if (decision) {
        inFlightRef.current.add(key);
        void recordLock(s, current, tracker.peak, decision, userId)
          .then(row => {
            if (row) {
              lockedKeysRef.current.add(key);
              setLocked(prev => [row, ...prev]);
              const pnl = (current - s.buyPrice) * s.quantity;
              const pnlPct = ((current - s.buyPrice) / s.buyPrice) * 100;
              const verb = pnl >= 0 ? "Profit locked" : "Loss capped";
              toast({
                title: `🔒 ${s.ticker} — ${verb} at ${pnl >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`,
                description: `${decision.reason}. Captured P&L: ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}. Holding continues; live price may diverge.`,
                duration: 18000,
              });
            }
          })
          .finally(() => inFlightRef.current.delete(key));
      }
    }

    if (dirty) savePeaks(peaks);

    // Cleanup peaks for removed stocks
    const live = new Set(stocks.map(positionKey));
    for (const k of Object.keys(peaks)) {
      if (!live.has(k)) { delete peaks[k]; dirty = true; }
    }
    if (dirty) savePeaks(peaks);
  }, [stocks, snapshot.assetStats, prices, config, userId]);

  const totalRealized = locked.reduce((s, l) => s + Number(l.pnl_abs || 0), 0);
  const wins = locked.filter(l => Number(l.pnl_abs) > 0).length;

  const clearLocked = useCallback(async (id: string) => {
    await supabase.from("locked_exits").delete().eq("id", id);
    setLocked(prev => prev.filter(l => l.id !== id));
  }, []);

  return { config, setConfig, locked, totalRealized, wins, clearLocked };
}

async function recordLock(
  s: PortfolioStock,
  exitPrice: number,
  peak: number,
  decision: ExitDecision,
  userId: string,
): Promise<LockedExit | null> {
  const pnlAbs = (exitPrice - s.buyPrice) * s.quantity;
  const pnlPct = ((exitPrice - s.buyPrice) / s.buyPrice) * 100;
  const currency = resolveAssetCurrency(s.ticker, s.analysis?.currency);
  const row = {
    user_id: userId,
    ticker: s.ticker,
    buy_price: s.buyPrice,
    exit_price: exitPrice,
    quantity: s.quantity,
    peak_price: peak,
    pnl_abs: pnlAbs,
    pnl_pct: pnlPct,
    trigger_reason: decision.trigger,
    currency,
    position_key: positionKey(s),
  };
  const { data, error } = await supabase.from("locked_exits").insert(row).select().single();
  if (error) {
    console.warn("[autolock] insert failed", error);
    return null;
  }
  return data as LockedExit;
}
