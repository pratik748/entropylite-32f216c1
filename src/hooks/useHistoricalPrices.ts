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

  const fetchHistorical = useCallback(async (tickers: string[], range = "3mo") => {
    // Only fetch tickers we haven't fetched yet
    const needed = tickers.filter(t => !fetchedRef.current.has(t));
    if (needed.length === 0) return;

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
        setPrices(prev => ({ ...prev, ...data.data }));
      }
    } catch (e: any) {
      setError(e?.message || "Failed to fetch historical prices");
    } finally {
      setLoading(false);
    }
  }, []);

  return { prices, loading, error, fetchHistorical };
}
