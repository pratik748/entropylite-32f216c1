/**
 * useStatArbIntelligence — Hybrid hook that fuses server HMM/cointegration
 * with client-side OU + Monte Carlo for live, non-destructive signal scaling.
 *
 * NEVER mutates S_base. Returns:
 *   - baseSignals    : original signal per pair (in [-1, 1])
 *   - intelSignals   : gated/scaled signal + structured "why" object
 *   - suppressed     : pairs killed by the kill-switch (visible in audit drawer)
 *   - regime         : current HMM posterior (per pair)
 *   - modelHealth    : insufficient-history / stale / ok
 */
import { useEffect, useMemo, useState, useRef } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import {
  cointegrate,
  fitOU,
  runMCRobustness,
  composeSignal,
  decodeRegime,
  type HMMModel,
} from "@/lib/statarb";
import type {
  IntelSignal,
  RegimePosterior,
  ModelHealth,
  CointegrationResult,
  OUParameters,
  MCRobustness,
} from "@/lib/statarb/types";

export interface PairInput {
  /** Stable id, e.g. `${tickerA}|${tickerB}`. */
  id: string;
  tickerA: string;
  tickerB: string;
  /** Optional base signal in [-1, 1]. Defaults to 0 (neutral) if omitted. */
  sBase?: number;
}

export interface PairIntel {
  id: string;
  tickerA: string;
  tickerB: string;
  sBase: number;
  signal: IntelSignal;
  cointegration: CointegrationResult;
  ou: OUParameters;
  mc: MCRobustness;
  regime: RegimePosterior;
  modelHealth: ModelHealth;
  /** Spread series for charts. */
  spread: number[];
}

interface ServerPayload {
  tickerA: string;
  tickerB: string;
  fitBars: number;
  cointegration: Omit<CointegrationResult, "residuals">;
  spread: number[];
  hmm: { model: HMMModel; regime: RegimePosterior };
  modelHealth: ModelHealth;
  generatedAt: number;
  cached?: boolean;
  error?: string;
  message?: string;
}

interface State {
  intel: PairIntel[];
  suppressed: PairIntel[];
  loading: boolean;
  error: string | null;
}

const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function buildSignal(payload: ServerPayload, sBaseRaw?: number): PairIntel | null {
  if (!payload.spread || payload.spread.length < 30) return null;
  const sBase = isFiniteNum(sBaseRaw) ? Math.max(-1, Math.min(1, sBaseRaw!)) : 0;
  const cointegration: CointegrationResult = {
    ...payload.cointegration,
    residuals: payload.spread,
  };

  const ou = fitOU(payload.spread);
  const mc = runMCRobustness(payload.spread, ou, { paths: 1500, horizon: 30 });

  // Refresh regime locally — gives a near-real-time posterior off the server model
  const regime = decodeRegime(payload.hmm.model, payload.spread) ?? payload.hmm.regime;

  // Crude vol regime delta: realised vol of last 20 vs prior 20 spread diffs
  const diffs: number[] = [];
  for (let i = 1; i < payload.spread.length; i++) diffs.push(payload.spread[i] - payload.spread[i - 1]);
  const tail = diffs.slice(-20);
  const prev = diffs.slice(-40, -20);
  const std = (a: number[]) => {
    const m = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length));
  };
  const sPrev = std(prev) || 1e-9;
  const volRegimeDelta = (std(tail) - sPrev) / sPrev;

  const signal = composeSignal({ sBase, cointegration, ou, mc, regime, volRegimeDelta });

  return {
    id: `${payload.tickerA}|${payload.tickerB}`,
    tickerA: payload.tickerA,
    tickerB: payload.tickerB,
    sBase,
    signal,
    cointegration,
    ou,
    mc,
    regime,
    modelHealth: payload.modelHealth,
    spread: payload.spread,
  };
}

export function useStatArbIntelligence(pairs: PairInput[], lookback: "6mo" | "1y" | "2y" = "1y") {
  const [state, setState] = useState<State>({ intel: [], suppressed: [], loading: false, error: null });
  const reqId = useRef(0);

  // Stable key — only refetch when the actual pair list / lookback changes
  const pairKey = useMemo(
    () => pairs.map((p) => `${p.tickerA}|${p.tickerB}`).sort().join(","),
    [pairs],
  );

  useEffect(() => {
    if (pairs.length === 0) {
      setState({ intel: [], suppressed: [], loading: false, error: null });
      return;
    }
    const myReq = ++reqId.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const results = await Promise.all(
          pairs.map(async (p) => {
            const { data, error } = await governedInvoke<ServerPayload>("statarb-intelligence", {
              tier: "heavy",
              body: { tickerA: p.tickerA, tickerB: p.tickerB, lookback, iterations: 25 },
            });
            if (error || !data) return null;
            if ((data as any).error) return null;
            return buildSignal(data, p.sBase);
          }),
        );
        if (myReq !== reqId.current) return;
        const all = results.filter((r): r is PairIntel => r != null);
        const intel = all.filter((p) => !p.signal.killSwitch.active);
        const suppressed = all.filter((p) => p.signal.killSwitch.active);
        setState({ intel, suppressed, loading: false, error: null });
      } catch (err) {
        if (myReq !== reqId.current) return;
        setState({ intel: [], suppressed: [], loading: false, error: (err as Error).message });
      }
    })();
  }, [pairKey, lookback]);

  return state;
}
