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
  thesis: string | null;
  actionable: ReflexivityActionable | null;
  aiError?: string | null;
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

  // Stable cache key — derived ONLY from structural identity, not live-drifting
  // numeric fields (vix, intensities, scores). Without this the cache never hits
  // because every poll produces a slightly different body and a new key.
  const stableKey = (() => {
    const tickers = (input.portfolio || []).map((p: any) => p?.ticker).filter(Boolean).sort().join(",");
    const flowCount = input.flows?.length ?? 0;
    const hasSent = input.sentiment ? 1 : 0;
    const hasCausal = input.causal?.scenario_tree?.length ? 1 : 0;
    const vixBucket = typeof input.vix === "number" ? Math.round(input.vix / 2) : "n";
    return `v1|${tickers}|f${flowCount}|s${hasSent}|c${hasCausal}|r${input.regime || "n"}|x${vixBucket}`;
  })();

  const compute = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await governedInvoke<ReflexivityData>(
        "reflexivity-engine",
        { body: input, force, cacheKey: stableKey },
      );
      if (err) throw err;
      setData(result);
    } catch (e: any) {
      setError(e.message || "Reflexivity failed");
    } finally {
      setLoading(false);
    }
  }, [stableKey]);

  useEffect(() => {
    // Only compute when we have at least one source signal
    const has = !!(input.flows?.length || input.sentiment || input.causal);
    if (has) compute(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, stableKey]);

  return { data, loading, error, refresh: () => compute(true) };
}
