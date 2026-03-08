import { useLocalStorage } from "./useLocalStorage";
import { useCallback } from "react";
import type { RegimeType } from "./useMarketRegime";

export interface GeneratedStrategy {
  id: string;
  name: string;
  type: string;
  regime_fit: string;
  rationale: string;
  entry_rule: string;
  exit_rule: string;
  stop_loss_pct: number;
  take_profit_pct: number;
  position_size_pct: number;
  instruments: string[];
  confidence: number;
}

export interface StrategyMemoryEntry {
  id: string;
  strategy: GeneratedStrategy;
  regime: string;
  entryTime: number;
  exitTime: number;
  pnlPct: number;
  outcome: "win" | "loss" | "neutral";
  conditions: { vix: number; moodScore: number; topSector: string };
}

export function useStrategyMemory() {
  const [memory, setMemory] = useLocalStorage<StrategyMemoryEntry[]>("entropy-strategy-memory", []);

  const logStrategy = useCallback((entry: StrategyMemoryEntry) => {
    setMemory(prev => [entry, ...prev].slice(0, 50)); // keep last 50
  }, [setMemory]);

  const getRelevantMemories = useCallback((regime: RegimeType, vix: number) => {
    return memory
      .filter(m => m.regime === regime || Math.abs(m.conditions.vix - vix) < 5)
      .sort((a, b) => b.pnlPct - a.pnlPct)
      .slice(0, 5);
  }, [memory]);

  const getWinRate = useCallback(() => {
    if (memory.length === 0) return 0;
    const wins = memory.filter(m => m.outcome === "win").length;
    return Math.round((wins / memory.length) * 100);
  }, [memory]);

  const clearMemory = useCallback(() => {
    setMemory([]);
  }, [setMemory]);

  return { memory, logStrategy, getRelevantMemories, getWinRate, clearMemory };
}
