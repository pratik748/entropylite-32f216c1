import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PaperTrade {
  id: string;
  strategyId: string;
  ticker: string;
  entryPrice: number;
  currentPrice: number;
  positionSizePct: number;
  pnlPct: number;
  maxDrawdownPct: number;
  peakPrice: number;
  status: "active" | "adapting" | "deactivated" | "tp-hit" | "sl-hit";
  entryTime: number;
  exitTime?: number;
  stopLossPct: number;
  takeProfitPct: number;
}

export function usePaperTrading() {
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const openTrade = useCallback((params: {
    strategyId: string;
    ticker: string;
    entryPrice: number;
    positionSizePct: number;
    stopLossPct: number;
    takeProfitPct: number;
  }) => {
    const trade: PaperTrade = {
      id: crypto.randomUUID(),
      strategyId: params.strategyId,
      ticker: params.ticker,
      entryPrice: params.entryPrice,
      currentPrice: params.entryPrice,
      positionSizePct: params.positionSizePct,
      pnlPct: 0,
      maxDrawdownPct: 0,
      peakPrice: params.entryPrice,
      status: "active",
      entryTime: Date.now(),
      stopLossPct: params.stopLossPct,
      takeProfitPct: params.takeProfitPct,
    };
    setTrades(prev => [...prev, trade]);
    return trade.id;
  }, []);

  const updatePrices = useCallback(async () => {
    setTrades(prev => {
      const activeTrades = prev.filter(t => t.status === "active" || t.status === "adapting");
      if (activeTrades.length === 0) return prev;

      const tickers = [...new Set(activeTrades.map(t => t.ticker))];

      // Fire and forget price update
      supabase.functions.invoke("price-feed", { body: { tickers } }).then(({ data }) => {
        if (!data?.prices) return;
        setTrades(current =>
          current.map(t => {
            if (t.status !== "active" && t.status !== "adapting") return t;
            const priceData = data.prices[t.ticker];
            if (!priceData) return t;

            const currentPrice = priceData.price;
            const pnlPct = ((currentPrice - t.entryPrice) / t.entryPrice) * 100;
            const peakPrice = Math.max(t.peakPrice, currentPrice);
            const drawdownFromPeak = ((currentPrice - peakPrice) / peakPrice) * 100;
            const maxDrawdownPct = Math.min(t.maxDrawdownPct, drawdownFromPeak);

            let status = t.status;
            if (pnlPct <= t.stopLossPct) status = "sl-hit";
            else if (pnlPct >= t.takeProfitPct) status = "tp-hit";
            else if (maxDrawdownPct <= -5) status = "deactivated";

            return {
              ...t,
              currentPrice,
              pnlPct,
              peakPrice,
              maxDrawdownPct,
              status,
              exitTime: (status !== "active" && status !== "adapting") ? Date.now() : t.exitTime,
            };
          })
        );
      });

      return prev;
    });
  }, []);

  useEffect(() => {
    timerRef.current = setInterval(updatePrices, 10000);
    return () => clearInterval(timerRef.current);
  }, [updatePrices]);

  const setStrategyAdapting = useCallback((strategyId: string) => {
    setTrades(prev => prev.map(t =>
      t.strategyId === strategyId && t.status === "active"
        ? { ...t, status: "adapting" as const }
        : t
    ));
  }, []);

  const deactivateStrategy = useCallback((strategyId: string) => {
    setTrades(prev => prev.map(t =>
      (t.strategyId === strategyId && (t.status === "active" || t.status === "adapting"))
        ? { ...t, status: "deactivated" as const, exitTime: Date.now() }
        : t
    ));
  }, []);

  const getTradesForStrategy = useCallback((strategyId: string) => {
    return trades.filter(t => t.strategyId === strategyId);
  }, [trades]);

  const getActiveTrades = useCallback(() => {
    return trades.filter(t => t.status === "active" || t.status === "adapting");
  }, [trades]);

  return { trades, openTrade, setStrategyAdapting, deactivateStrategy, getTradesForStrategy, getActiveTrades };
}
