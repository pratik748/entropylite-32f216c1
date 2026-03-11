import { useState, useEffect, useRef, useCallback } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import type { PortfolioStock } from "@/components/PortfolioPanel";

export interface ParallelIntelligence {
  market: {
    narrative: string;
    regime_assessment: string;
    key_drivers: string[];
    confidence: number;
    outlook_weeks: number;
    sector_rotation: string;
  } | null;
  anomaly: {
    anomalies: { type: string; severity: string; description: string; affected_tickers: string[]; recommendation: string }[];
    portfolio_health: number;
    diversification_score: number;
  } | null;
  optimization: {
    suggested_weights: { ticker: string; current_pct: number; optimal_pct: number; action: string; rationale: string }[];
    expected_sharpe_improvement: number;
    rebalance_urgency: string;
    optimization_method: string;
  } | null;
  risk: {
    tail_risks: { scenario: string; probability_pct: number; portfolio_impact_pct: number; severity: string; hedge_suggestion: string }[];
    overall_tail_risk_score: number;
    stress_test_summary: string;
    max_loss_1pct: number;
  } | null;
  cross_validation: { type: string; message: string; confidence: number }[];
  models_active: number;
  timestamp: number;
}

const FALLBACK: ParallelIntelligence = {
  market: null, anomaly: null, optimization: null, risk: null,
  cross_validation: [], models_active: 0, timestamp: 0,
};

export function useParallelIntelligence(stocks: PortfolioStock[], refreshKey: number) {
  const [data, setData] = useState<ParallelIntelligence>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const lastKey = useRef("");

  const analyzed = stocks.filter(s => s.analysis);
  const portfolio = analyzed.map(s => ({
    ticker: s.ticker,
    value: (s.analysis?.currentPrice || 0) * s.quantity,
    risk: s.analysis?.riskLevel || "medium",
  }));

  const fetch = useCallback(async () => {
    if (portfolio.length === 0) return;
    const key = portfolio.map(p => p.ticker).sort().join(",") + refreshKey;
    if (key === lastKey.current && data.timestamp > 0) return;
    lastKey.current = key;

    setLoading(true);
    try {
      const { data: result } = await governedInvoke<ParallelIntelligence>("parallel-intelligence", {
        body: { portfolio, regime: "unknown", vix: 18 },
      });
      if (result && !(result as any).error) setData(result);
    } catch { /* fallback stays */ }
    setLoading(false);
  }, [portfolio.length, refreshKey]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, refresh: fetch };
}
