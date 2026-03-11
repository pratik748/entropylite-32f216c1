import { useState, useEffect, useRef } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import type { PortfolioStock } from "@/components/PortfolioPanel";

export interface ContinuousSimData {
  scenario_tree: { path: string; probability: number; expected_return_pct: number; vol_regime: string; description: string }[];
  regime_transitions: {
    current: string;
    transition_probabilities: Record<string, number>;
    expected_duration_days: number;
  };
  liquidity_stress: { ticker: string; stress_level: number; trigger_price: number; forced_selling_risk: string }[];
  risk_surface: { var_1d_pct: number; var_5d_pct: number; vol_forecast_5d: number; correlation_stress: number };
  calibration_note: string;
  timestamp: number;
  provider: string;
}

const FALLBACK: ContinuousSimData = {
  scenario_tree: [],
  regime_transitions: { current: "normal", transition_probabilities: { normal: 0.6, high: 0.25, crisis: 0.05, low: 0.1 }, expected_duration_days: 15 },
  liquidity_stress: [],
  risk_surface: { var_1d_pct: -1.5, var_5d_pct: -3.5, vol_forecast_5d: 16, correlation_stress: 0.3 },
  calibration_note: "Not yet loaded",
  timestamp: 0,
  provider: "fallback",
};

export function useContinuousSimulation(stocks: PortfolioStock[], refreshKey: number) {
  const [data, setData] = useState<ContinuousSimData>(FALLBACK);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const analyzed = stocks.filter(s => s.analysis);
  const portfolio = analyzed.map(s => ({
    ticker: s.ticker,
    value: (s.analysis?.currentPrice || 0) * s.quantity,
    risk: s.analysis?.riskLevel || "medium",
    beta: 1,
  }));
  const totalValue = portfolio.reduce((s, p) => s + p.value, 0);

  useEffect(() => {
    if (portfolio.length === 0) return;

    const run = async () => {
      setLoading(true);
      try {
        const { data: result } = await governedInvoke<ContinuousSimData>("continuous-simulation", {
          body: { portfolio, regime: "unknown", vix: 18, totalValue },
        });
        if (result && !(result as any).error) setData(result);
      } catch { /* keep fallback */ }
      setLoading(false);
    };

    run();
    intervalRef.current = setInterval(run, 60_000); // 60s loop
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [portfolio.length, refreshKey]);

  return { data, loading, isLive: data.provider !== "fallback" };
}
