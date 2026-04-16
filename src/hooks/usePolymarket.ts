import { useState, useEffect } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

export interface PolymarketSignal {
  market: string;
  slug: string;
  category: string;
  probability: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  conviction: number;
  marketImpact: "high" | "medium" | "low";
  reasoning: string;
}

interface PolymarketAggregate {
  overallSentiment: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  highImpactSignals: number;
  totalMarketsScanned: number;
}

interface PolymarketData {
  signals: PolymarketSignal[];
  aggregate: PolymarketAggregate;
  categories: Record<string, number>;
  timestamp: number;
}

export function usePolymarket(enabled = true) {
  const [data, setData] = useState<PolymarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);

    governedInvoke<PolymarketData>("polymarket-signals", {
      body: { categories: ["macro", "geopolitical", "crypto", "elections", "tech"] },
    })
      .then(({ data: result, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message || "Polymarket fetch failed");
        else if (result) setData(result);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [enabled]);

  return { data, loading, error };
}
