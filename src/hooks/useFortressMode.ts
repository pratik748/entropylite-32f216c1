import { useEffect, useMemo, useState, useCallback } from "react";
import {
  scanThreats,
  proposeActions,
  simulateDefensiveOutcome,
  type Threat,
  type DefensiveAction,
  type FortressMetrics,
  type FortressHolding,
  type LiveSignals,
} from "@/lib/fortress-engine";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { governedInvoke } from "@/lib/apiGovernor";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { useGeoIntelligence } from "@/hooks/useGeoIntelligence";
import { useMacroIntelligence } from "@/hooks/useMacroIntelligence";
import { useInstitutionalFlows } from "@/hooks/useInstitutionalFlows";
import { useToast } from "@/hooks/use-toast";

// ── Hedge instrument map ──────────────────────────────────────────────
// Translate abstract action.instrument hints into REAL tradable defensive
// ETFs. These become normal portfolio positions (added to the dashboard
// and persisted to the cloud just like any user-entered ticker).
const HEDGE_INSTRUMENTS: Array<{ match: RegExp; symbol: string }> = [
  { match: /VIX/i, symbol: "VXX" },
  { match: /index put|β.?overlay|beta overlay|portfolio β/i, symbol: "SH" },
  { match: /collar/i, symbol: "SH" },
  { match: /tech|nasdaq|qqq/i, symbol: "PSQ" },
  { match: /financial|bank/i, symbol: "SEF" },
  { match: /energy|oil/i, symbol: "DUG" },
  { match: /gold|metal|safe.?haven/i, symbol: "GLD" },
  { match: /bond|treasury|rate|duration/i, symbol: "TLT" },
  { match: /dollar|usd|fx/i, symbol: "UUP" },
];
const HEDGE_NOTES: Record<string, string> = {
  SH: "Inverse S&P 500",
  VXX: "VIX volatility ETN",
  PSQ: "Inverse Nasdaq-100",
  SEF: "Inverse Financials",
  DUG: "Inverse Oil & Gas",
  GLD: "Gold (safe-haven)",
  TLT: "Long Treasuries",
  UUP: "USD Index",
};
// Conservative reference prices used only as initial cost-basis until the
// real-time price feed updates the new position on next analysis cycle.
const HEDGE_REF_PRICE: Record<string, number> = {
  SH: 42, VXX: 55, PSQ: 30, SEF: 32, DUG: 35, GLD: 215, TLT: 90, UUP: 28,
};
const FORTRESS_HEDGE_SYMBOLS = new Set(Object.keys(HEDGE_NOTES));

function resolveHedgeSymbol(action: DefensiveAction): string {
  const hint = `${action.instrument || ""} ${action.target || ""}`;
  return HEDGE_INSTRUMENTS.find((m) => m.match.test(hint))?.symbol || "SH";
}

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
  signals: LiveSignals;
}

export function useFortressMode(
  stocks: PortfolioStock[],
  setStocks?: React.Dispatch<React.SetStateAction<PortfolioStock[]>>,
): UseFortressModeResult {
  const { holdings, totalValue, baseCurrency } = useNormalizedPortfolio(stocks);
  const [state, setState] = useState<FortressStoredState>(() => loadState());
  const [aiNarratives, setAiNarratives] = useState<Record<string, string>>({});
  const [aiLoading, setAiLoading] = useState(false);

  // ── LIVE SYSTEM SIGNALS ──────────────────────────────────────────────
  const regime = useMarketRegime(20_000);
  const { tickerThreats } = useGeoIntelligence(stocks);
  const { data: macroData } = useMacroIntelligence();
  const tickerKey = useMemo(() => holdings.map((h) => h.rawTicker).join(","), [holdings]);
  const { data: flowsData } = useInstitutionalFlows(
    useMemo(() => holdings.map((h) => h.rawTicker), [tickerKey]),
  );

  const signals = useMemo<LiveSignals>(
    () => ({
      regime: regime
        ? {
            label: regime.regime,
            vix: regime.vix,
            moodScore: regime.moodScore,
            conditions: regime.conditions,
          }
        : undefined,
      macro: macroData?.regime
        ? {
            regime: macroData.regime.regime,
            confidence: macroData.regime.confidence,
            signals: macroData.regime.signals,
          }
        : undefined,
      flows: flowsData?.aggregate
        ? {
            smartMoneyDirection: flowsData.aggregate.smartMoneyDirection,
            unusualActivityCount: flowsData.aggregate.unusualActivityCount,
          }
        : undefined,
      geoThreats: tickerThreats,
    }),
    [regime, macroData, flowsData, tickerThreats],
  );

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
    () => scanThreats(fortressHoldings, totalValue, signals),
    [fortressHoldings, totalValue, signals],
  );

  const allActions = useMemo(
    () => proposeActions(threats, fortressHoldings, totalValue, signals),
    [threats, fortressHoldings, totalValue, signals],
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
    () => simulateDefensiveOutcome(fortressHoldings, totalValue, appliedActions, state.active, signals),
    [fortressHoldings, totalValue, appliedActions, state.active, signals],
  );

  // AI overlay, refines rationales when fortress is ON. Falls back gracefully.
  useEffect(() => {
    if (!state.active || actions.length === 0 || fortressHoldings.length === 0) return;
    let alive = true;
    setAiLoading(true);
    governedInvoke("fortress-intelligence", {
      body: {
        baseCurrency,
        totalValue,
        regime: signals.regime,
        macro: signals.macro,
        flows: signals.flows,
        holdings: fortressHoldings.map((h) => ({
          ticker: h.ticker,
          value: h.value,
          beta: h.beta,
          risk: h.risk,
          sector: h.sector,
          pnlPct: h.pnlPct,
          geoThreat: signals.geoThreats?.[h.rawTicker]?.threatLevel,
        })),
        threats,
        actions: actions.map((a) => ({
          id: a.id,
          kind: a.kind,
          target: a.target,
          sizePct: a.sizePct,
          rationale: a.rationale,
          upsideClippedPct: a.upsideClippedPct,
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
    signals.regime?.label,
    signals.regime?.vix,
    signals.flows?.smartMoneyDirection,
    signals.macro?.regime,
  ]);

  const { toast } = useToast();

  // ── Materialize a defensive action onto the REAL portfolio ─────────────
  // Trims/rebalances reduce existing holdings. Hedges add real defensive
  // instruments (inverse/safe-haven ETFs) as normal portfolio positions
  // that persist to the cloud just like any user-added stock.
  const materializeAction = useCallback(
    (action: DefensiveAction) => {
      if (!setStocks) return;

      // TRIM / REBALANCE → reduce quantity of the matching holding
      if (action.kind === "trim" || action.kind === "rebalance") {
        setStocks((prev) =>
          prev.map((s) => {
            if (s.ticker !== action.target) return s;
            const reduction = Math.max(0.01, Math.min(0.95, action.sizePct / 100));
            const newQty = +(s.quantity * (1 - reduction)).toFixed(6);
            return newQty <= 0 ? s : { ...s, quantity: newQty };
          }),
        );
        toast({
          title: `Fortress · ${action.kind === "trim" ? "Trimmed" : "Rebalanced"} ${action.target}`,
          description: `Reduced exposure by ${action.sizePct.toFixed(1)}%, risk −${action.riskReductionBps}bps`,
        });
        return;
      }

      // HEDGE / CONVERT → add a REAL defensive ETF position
      if (action.kind === "hedge" || action.kind === "convert") {
        const hedgeSymbol = resolveHedgeSymbol(action);
        const targetHolding = stocks.find((s) => s.ticker === action.target);
        const refPrice =
          targetHolding?.analysis?.currentPrice ?? targetHolding?.buyPrice ?? 100;
        const baseNotional = targetHolding
          ? targetHolding.quantity * refPrice
          : totalValue * 0.05;
        const notional = baseNotional * (action.sizePct / 100);

        const hedgePrice = HEDGE_REF_PRICE[hedgeSymbol] ?? 30;
        const hedgeQty = +Math.max(1, notional / hedgePrice).toFixed(4);

        setStocks((prev) => {
          // Top-up if we already hold this hedge symbol; otherwise add new position.
          const existing = prev.find((s) => s.ticker.toUpperCase() === hedgeSymbol);
          if (existing) {
            return prev.map((s) =>
              s.id === existing.id
                ? { ...s, quantity: +(s.quantity + hedgeQty).toFixed(4) }
                : s,
            );
          }
          return [
            ...prev,
            {
              id: `fortress-${hedgeSymbol}-${Date.now()}`,
              ticker: hedgeSymbol,
              buyPrice: hedgePrice,
              quantity: hedgeQty,
              isLoading: false,
            },
          ];
        });
        toast({
          title: `Fortress · Hedge added: ${hedgeSymbol}`,
          description: `${HEDGE_NOTES[hedgeSymbol] ?? "Defensive position"} sized to ${action.sizePct.toFixed(1)}%`,
        });
      }
    },
    [setStocks, stocks, totalValue, toast],
  );

  const toggle = useCallback(() => {
    setState((s) => ({
      ...s,
      active: !s.active,
      lastActivatedAt: !s.active ? Date.now() : s.lastActivatedAt,
    }));
  }, []);

  const applyAction = useCallback(
    (id: string) => {
      const action = allActions.find((a) => a.id === id);
      if (!action) return;
      setState((s) =>
        s.appliedActionIds.includes(id)
          ? s
          : { ...s, appliedActionIds: [...s.appliedActionIds, id] },
      );
      materializeAction(action);
    },
    [allActions, materializeAction],
  );

  const applyAll = useCallback(() => {
    const pending = allActions.filter((a) => !state.appliedActionIds.includes(a.id));
    if (pending.length === 0) return;
    setState((s) => ({
      ...s,
      appliedActionIds: Array.from(new Set([...s.appliedActionIds, ...pending.map((a) => a.id)])),
    }));
    pending.forEach(materializeAction);
  }, [allActions, state.appliedActionIds, materializeAction]);

  const dismiss = useCallback((id: string) => {
    setState((s) => ({ ...s, dismissedActionIds: Array.from(new Set([...s.dismissedActionIds, id])) }));
  }, []);

  const resetActions = useCallback(() => {
    // Reset only clears the proposal ledger. Real portfolio mutations
    // (trims, added hedges) stay, undo them manually from the dashboard.
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
    signals,
  };
}
