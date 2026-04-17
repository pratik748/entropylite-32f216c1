import { useEffect, useMemo, useState, useCallback } from "react";
import {
  scanThreats,
  proposeActions,
  simulateDefensiveOutcome,
  type Threat,
  type DefensiveAction,
  type FortressMetrics,
  type FortressHolding,
} from "@/lib/fortress-engine";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { governedInvoke } from "@/lib/apiGovernor";

const STORAGE_KEY = "fortress-state-v1";

interface FortressStoredState {
  active: boolean;
  lastActivatedAt: number | null;
  dismissedActionIds: string[];
  appliedActionIds: string[];
}

const defaultState: FortressStoredState = {
  active: false,
  lastActivatedAt: null,
  dismissedActionIds: [],
  appliedActionIds: [],
};

function loadState(): FortressStoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    return { ...defaultState, ...JSON.parse(raw) };
  } catch {
    return defaultState;
  }
}

function saveState(s: FortressStoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* silent */
  }
}

export interface UseFortressModeResult {
  active: boolean;
  toggle: () => void;
  threats: Threat[];
  actions: DefensiveAction[];
  appliedActions: DefensiveAction[];
  dismissedIds: string[];
  metrics: FortressMetrics;
  lastActivatedAt: number | null;
  applyAction: (id: string) => void;
  applyAll: () => void;
  dismiss: (id: string) => void;
  resetActions: () => void;
  aiNarratives: Record<string, string>;
  aiLoading: boolean;
}

export function useFortressMode(stocks: PortfolioStock[]): UseFortressModeResult {
  const { holdings, totalValue, baseCurrency } = useNormalizedPortfolio(stocks);
  const [state, setState] = useState<FortressStoredState>(() => loadState());
  const [aiNarratives, setAiNarratives] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const fortressHoldings = useMemo<FortressHolding[]>(
    () =>
      holdings.map((h) => ({
        ticker: h.ticker,
        rawTicker: h.rawTicker,
        value: h.value,
        pnlPct: h.pnlPct,
        beta: h.beta,
        risk: h.risk,
        sector: h.sector,
        suggestion: h.suggestion,
        analysis: h.analysis,
      })),
    [holdings],
  );

  const threats = useMemo(
    () => scanThreats(fortressHoldings, totalValue),
    [fortressHoldings, totalValue],
  );

  const allActions = useMemo(
    () => proposeActions(threats, fortressHoldings, totalValue),
    [threats, fortressHoldings, totalValue],
  );

  const actions = useMemo(
    () =>
      allActions.filter(
        (a) => !state.dismissedActionIds.includes(a.id) && !state.appliedActionIds.includes(a.id),
      ),
    [allActions, state.dismissedActionIds, state.appliedActionIds],
  );

  const appliedActions = useMemo(
    () => allActions.filter((a) => state.appliedActionIds.includes(a.id)),
    [allActions, state.appliedActionIds],
  );

  const metrics = useMemo(
    () => simulateDefensiveOutcome(fortressHoldings, totalValue, appliedActions, state.active),
    [fortressHoldings, totalValue, appliedActions, state.active],
  );

  // AI overlay — refines rationales when fortress is ON. Falls back gracefully.
  useEffect(() => {
    if (!state.active || actions.length === 0 || fortressHoldings.length === 0) return;
    let alive = true;
    setAiLoading(true);
    governedInvoke("fortress-intelligence", {
      body: {
        baseCurrency,
        totalValue,
        holdings: fortressHoldings.map((h) => ({
          ticker: h.ticker,
          value: h.value,
          beta: h.beta,
          risk: h.risk,
          sector: h.sector,
          pnlPct: h.pnlPct,
        })),
        threats,
        actions: actions.map((a) => ({
          id: a.id,
          kind: a.kind,
          target: a.target,
          sizePct: a.sizePct,
          rationale: a.rationale,
        })),
      },
    })
      .then(({ data }) => {
        if (!alive || !data || data.error) return;
        if (data.narratives && typeof data.narratives === "object") {
          setAiNarratives(data.narratives as Record<string, string>);
        }
      })
      .catch(() => {})
      .finally(() => alive && setAiLoading(false));
    return () => {
      alive = false;
    };
  }, [
    state.active,
    actions.map((a) => a.id).join(","),
    fortressHoldings.map((h) => h.ticker).join(","),
    baseCurrency,
    totalValue,
  ]);

  const toggle = useCallback(() => {
    setState((s) => ({
      ...s,
      active: !s.active,
      lastActivatedAt: !s.active ? Date.now() : s.lastActivatedAt,
    }));
  }, []);

  const applyAction = useCallback((id: string) => {
    setState((s) => ({ ...s, appliedActionIds: Array.from(new Set([...s.appliedActionIds, id])) }));
  }, []);

  const applyAll = useCallback(() => {
    setState((s) => ({
      ...s,
      appliedActionIds: Array.from(new Set([...s.appliedActionIds, ...allActions.map((a) => a.id)])),
    }));
  }, [allActions]);

  const dismiss = useCallback((id: string) => {
    setState((s) => ({ ...s, dismissedActionIds: Array.from(new Set([...s.dismissedActionIds, id])) }));
  }, []);

  const resetActions = useCallback(() => {
    setState((s) => ({ ...s, dismissedActionIds: [], appliedActionIds: [] }));
  }, []);

  return {
    active: state.active,
    toggle,
    threats,
    actions,
    appliedActions,
    dismissedIds: state.dismissedActionIds,
    metrics,
    lastActivatedAt: state.lastActivatedAt,
    applyAction,
    applyAll,
    dismiss,
    resetActions,
    aiNarratives,
    aiLoading,
  };
}
