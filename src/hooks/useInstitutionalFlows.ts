import { useState, useEffect } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

interface OptionsFlow {
  ticker: string;
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  unusualActivity: boolean;
  impliedVolatility: number;
  signal: "bullish" | "bearish" | "neutral";
}

interface ETFFlow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  volume: number;
  flowSignal: "inflow" | "outflow" | "neutral";
}

interface FlowAggregate {
  smartMoneyDirection: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
  optionsSentiment: { bullish: number; bearish: number; neutral: number };
  etfSentiment: { inflows: number; outflows: number; neutral: number };
  unusualActivityCount: number;
}

interface InstitutionalFlowData {
  optionsFlow: OptionsFlow[];
  etfFlows: ETFFlow[];
  aggregate: FlowAggregate;
  timestamp: number;
}

export function useInstitutionalFlows(tickers: string[]) {
  const [data, setData] = useState<InstitutionalFlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const tickerKey = tickers.join(",");

  useEffect(() => {
    if (tickers.length === 0) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    governedInvoke<InstitutionalFlowData>("institutional-flows", { body: { tickers } })
      .then(({ data: result, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message || "Flows fetch failed"); }
        else if (result) { setData(result); }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tickerKey]);

  return { data, loading, error };
}
