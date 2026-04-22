import { useState, useCallback, useRef } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

export interface HistoricalData {
  closes: number[];
  volumes: number[];
  timestamps: number[];
}

export function useHistoricalPrices() {
  const [prices, setPrices] = useState<Record<string, HistoricalData>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<Set<string>>(new Set());

  const cacheRef = useRef<Record<string, HistoricalData>>({});

  const fetchHistorical = useCallback(async (tickers: string[], range = "3mo"): Promise<Record<string, HistoricalData>> => {
    // Return cached entries immediately for already-fetched tickers
    const needed = tickers.filter(t => !fetchedRef.current.has(t));
    if (needed.length === 0) {
      const slice: Record<string, HistoricalData> = {};
      tickers.forEach(t => { if (cacheRef.current[t]) slice[t] = cacheRef.current[t]; });
      return slice;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await governedInvoke<{ data: Record<string, HistoricalData> }>(
        "historical-prices",
        { tier: "slow", body: { tickers: needed, range } }
      );
      if (err) throw err;
      if (data?.data) {
        needed.forEach(t => fetchedRef.current.add(t));
        Object.assign(cacheRef.current, data.data);
        setPrices(prev => ({ ...prev, ...data.data }));
      }
      const slice: Record<string, HistoricalData> = {};
      tickers.forEach(t => { if (cacheRef.current[t]) slice[t] = cacheRef.current[t]; });
      return slice;
    } catch (e: any) {
      setError(e?.message || "Failed to fetch historical prices");
      return {};
    } finally {
      setLoading(false);
    }
  }, []);

  return { prices, loading, error, fetchHistorical };
}
