import { useState, useEffect, useRef, useCallback } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import { useLocalStorage } from "./useLocalStorage";
import { useOutcomeGradient } from "./useOutcomeGradient";
import type { PortfolioStock } from "@/components/PortfolioPanel";

export interface EvolvedStrategy {
  id: string;
  name: string;
  type: string;
  entry_rule: string;
  exit_rule: string;
  stop_loss_pct: number;
  take_profit_pct: number;
  position_size_pct: number;
  instruments: string[];
  estimated_sharpe: number;
  estimated_max_dd_pct: number;
  regime_fit: string;
  confidence: number;
  edge_explanation: string;
  evolved_from: string | null;
}

export interface EvolutionResult {
  evolved_strategies: EvolvedStrategy[];
  generation: number;
  candidates_generated: number;
  candidates_filtered: number;
  avg_sharpe: number;
  best_strategy_id: string | null;
  evolution_note: string;
  timestamp: number;
  provider: string;
}

export function useStrategyEvolution(stocks: PortfolioStock[], refreshKey: number) {
  const [latestResult, setLatestResult] = useState<EvolutionResult | null>(null);
  const [allStrategies, setAllStrategies] = useLocalStorage<EvolvedStrategy[]>("entropy-evolved-strategies", []);
  const [generation, setGeneration] = useLocalStorage<number>("entropy-evolution-gen", 0);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { desirableZones, combinationScores, gradient } = useOutcomeGradient();

  const analyzed = stocks.filter(s => s.analysis);
  const portfolio = analyzed.map(s => ({
    ticker: s.ticker,
    value: (s.analysis?.currentPrice || 0) * s.quantity,
    risk: s.analysis?.riskLevel || "medium",
  }));

  const evolve = useCallback(async () => {
    if (portfolio.length === 0) return;
    setLoading(true);
    try {
      const nextGen = generation + 1;
      const { data: result } = await governedInvoke<EvolutionResult>("strategy-evolution", {
        body: {
          portfolio,
          regime: "unknown",
          vix: 18,
          memory: allStrategies.slice(0, 10),
          generation: nextGen,
        },
      });
      if (result && result.evolved_strategies?.length > 0) {
        setLatestResult(result);
        setGeneration(nextGen);
        // Accumulate strategies, keep top 30 by Sharpe
        setAllStrategies(prev => {
          const merged = [...result.evolved_strategies, ...prev];
          return merged
            .sort((a, b) => b.estimated_sharpe - a.estimated_sharpe)
            .slice(0, 30);
        });
      }
    } catch { /* fallback */ }
    setLoading(false);
  }, [portfolio.length, generation, allStrategies]);

  useEffect(() => {
    if (portfolio.length === 0) return;
    evolve();
    intervalRef.current = setInterval(evolve, 120_000); // 120s loop
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [portfolio.length, refreshKey]);

  const clearStrategies = useCallback(() => {
    setAllStrategies([]);
    setGeneration(0);
    setLatestResult(null);
  }, [setAllStrategies, setGeneration]);

  return {
    latestResult,
    allStrategies,
    generation,
    loading,
    evolve,
    clearStrategies,
  };
}
