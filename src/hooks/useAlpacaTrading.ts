import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  change_today: string;
}

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  side: string;
  type: string;
  status: string;
  filled_avg_price: string | null;
  submitted_at: string;
  filled_at: string | null;
}

export interface AlpacaAccount {
  buying_power: string;
  equity: string;
  portfolio_value: string;
  cash: string;
  long_market_value: string;
  short_market_value: string;
  status: string;
}

export interface AlpacaPortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
  timeframe: string;
}

async function alpacaCall<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("alpaca-trading", {
    body: { action, ...params },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function useAlpacaTrading() {
  const [account, setAccount] = useState<AlpacaAccount | null>(null);
  const [positions, setPositions] = useState<AlpacaPosition[]>([]);
  const [orders, setOrders] = useState<AlpacaOrder[]>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<AlpacaPortfolioHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async () => {
    try {
      const [acc, pos, ord] = await Promise.all([
        alpacaCall<AlpacaAccount>("account"),
        alpacaCall<AlpacaPosition[]>("list_positions"),
        alpacaCall<AlpacaOrder[]>("list_orders", { status: "all" }),
      ]);
      setAccount(acc);
      setPositions(Array.isArray(pos) ? pos : []);
      setOrders(Array.isArray(ord) ? ord.slice(0, 20) : []);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const fetchHistory = useCallback(async (period = "1W", timeframe = "15Min") => {
    try {
      const data = await alpacaCall<AlpacaPortfolioHistory>("portfolio_history", { period, timeframe });
      setPortfolioHistory(data);
    } catch (e: any) {
      console.error("Portfolio history error:", e.message);
    }
  }, []);

  const submitOrder = useCallback(async (params: {
    symbol: string;
    qty: number;
    side: "buy" | "sell";
    type?: "market" | "limit" | "stop" | "stop_limit";
    time_in_force?: "day" | "gtc" | "ioc";
    limit_price?: number;
    stop_price?: number;
  }) => {
    setLoading(true);
    try {
      const result = await alpacaCall<AlpacaOrder>("submit_order", params);
      await refresh();
      return result;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const cancelOrder = useCallback(async (orderId: string) => {
    await alpacaCall("cancel_order", { order_id: orderId });
    await refresh();
  }, [refresh]);

  const closePosition = useCallback(async (symbol: string) => {
    await alpacaCall("close_position", { symbol });
    await refresh();
  }, [refresh]);

  const closeAll = useCallback(async () => {
    await alpacaCall("close_all");
    await refresh();
  }, [refresh]);

  // Auto-refresh every 15s
  useEffect(() => {
    refresh();
    fetchHistory();
    pollRef.current = setInterval(() => { refresh(); fetchHistory(); }, 15_000);
    return () => clearInterval(pollRef.current);
  }, [refresh, fetchHistory]);

  return {
    account, positions, orders, portfolioHistory, loading, error,
    submitOrder, cancelOrder, closePosition, closeAll, refresh, fetchHistory,
  };
}
