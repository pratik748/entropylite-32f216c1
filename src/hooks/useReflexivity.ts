import { useEffect, useState, useCallback } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

export interface ReflexivityComponents {
  flow: number;
  sentiment: number;
  causal: number;
}

export interface ReflexivityConsensus {
  direction: number;
  label: string;
  components: ReflexivityComponents;
}

export interface ReflexivityConviction {
  score: number;
  label: string;
  spread: number;
}

export interface ReflexivityContradiction {
  pair: string;
  gap: number;
  description: string;
}

export interface ReflexivityShiftETA {
  probability: number;
  window: string;
  pressure: number;
  label: string;
}

export interface ReflexivityActionable {
  trigger: string;
  trade: string;
  risk: string;
}

export interface ReflexivityData {
  consensus: ReflexivityConsensus;
  conviction: ReflexivityConviction;
  contradictions: ReflexivityContradiction[];
  shiftETA: ReflexivityShiftETA;
  thesis: string;
  actionable: ReflexivityActionable | null;
  signalCount: number;
  timestamp: string;
}

interface ReflexivityInput {
  flows?: any[];
  sentiment?: any;
  causal?: any;
  vix?: number;
  regime?: string;
  portfolio?: any[];
}

export function useReflexivity(input: ReflexivityInput, refreshKey?: number) {
  const [data, setData] = useState<ReflexivityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compute = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await governedInvoke<ReflexivityData>(
        "reflexivity-engine",
        { body: input, force },
      );
      if (err) throw err;
      setData(result);
    } catch (e: any) {
      setError(e.message || "Reflexivity failed");
    } finally {
      setLoading(false);
    }
  }, [JSON.stringify(input)]);

  useEffect(() => {
    // Only compute when we have at least one source signal
    const has = !!(input.flows?.length || input.sentiment || input.causal);
    if (has) compute(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, JSON.stringify(input)]);

  return { data, loading, error, refresh: () => compute(true) };
}
