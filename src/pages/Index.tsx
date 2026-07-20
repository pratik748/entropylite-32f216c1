import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, memo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LayoutDashboard, Eye, Globe, Shield, ShieldCheck, Target, ScatterChart, RefreshCw, Landmark, Activity, Newspaper, Workflow, Briefcase, LineChart, Database } from "lucide-react";
import CommandPalette from "@/components/CommandPalette";
import ModuleRail, { ModuleStrip } from "@/components/terminal/ModuleRail";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DirectProfitMode from "@/components/DirectProfitMode";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import Header from "@/components/Header";
import StockInput from "@/components/StockInput";
import LiveNewsFeed from "@/components/LiveNewsFeed";
import OperatingTape from "@/components/OperatingTape";

import LoadingState from "@/components/LoadingState";
import DeskAnalysisStack from "@/components/DeskAnalysisStack";
import DeskPortfolioMode from "@/components/DeskPortfolioMode";
import type { HistoryEntry } from "@/components/AnalysisHistory";
import MarketOverview from "@/components/MarketOverview";
import EntropySandbox from "@/components/sandbox/EntropySandbox";
import StatArbEngine from "@/components/sandbox/StatArbEngine";
import GeopoliticalGlobe from "@/components/GeopoliticalGlobe";
import DesirableAssets from "@/components/DesirableAssets";
import { useGeoIntelligence } from "@/hooks/useGeoIntelligence";
import { useTradeLogger } from "@/hooks/useTradeLogger";

import RiskDashboard from "@/components/RiskDashboard";
import FortressMode from "@/components/risk/FortressMode";
import AugmentDashboard from "@/components/augment/AugmentDashboard";
import SystemPipeline from "@/components/system/SystemPipeline";
import TickerStrip from "@/components/terminal/TickerStrip";
import PageTransition from "@/components/PageTransition";
import PortfolioBlotter from "@/components/terminal/PortfolioBlotter";
import PanelWrapper from "@/components/terminal/PanelWrapper";
import ProofCard from "@/components/ProofCard";
import ModuleErrorBoundary from "@/components/ModuleErrorBoundary";
import TerminalTour from "@/components/tour/TerminalTour";
import { TOUR_FLAG_KEY } from "@/components/tour/tourSteps";

import { type PortfolioStock } from "@/components/PortfolioPanel";
import { registerWatch, unregisterWatch } from "@/lib/sentinel";
import { setPortfolioContext } from "@/lib/opportunities/repository";
import { supabase } from "@/integrations/supabase/client";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";
import { normalizeUserTicker } from "@/lib/ticker";
import { useCloudPortfolio } from "@/hooks/useCloudPortfolio";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useIsMobile } from "@/hooks/use-mobile";
import { FXProvider, useFX } from "@/hooks/useFX";
import { useIntelligenceRefresh } from "@/hooks/useIntelligenceRefresh";
import { useSellNotifications } from "@/hooks/useSellNotifications";
import { useOutcomeGradient } from "@/hooks/useOutcomeGradient";
import { ForesightProvider } from "@/foresight/ForesightProvider";
import ForesightSurface from "@/foresight/ui/ForesightSurface";
import Spotlight from "@/foresight/ui/Spotlight";
import { onUIEvent } from "@/foresight/uiBus";
import type { HostAdapter } from "@/foresight/types";

type Tab = "dashboard" | "market" | "sandbox" | "statarb" | "augment" | "geopolitical" | "desirable" | "risk" | "fortress" | "system";

export type PriceFreshness = "LIVE" | "DELAYED" | "DISCONNECTED";
export type PriceStatusMap = Record<string, { lastUpdate: number; status: PriceFreshness; failCount: number }>;

// Monochrome instrument set — one voice, no candy. The active module is
// indicated by position and weight, not by hue.
const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard",    label: "Desk",        icon: <LayoutDashboard className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "market",       label: "Markets",     icon: <Landmark className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "geopolitical", label: "Geo",         icon: <Globe className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "desirable",    label: "Discover",    icon: <Target className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "sandbox",      label: "Sandbox",     icon: <Eye className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "statarb",      label: "Stat Arb",    icon: <ScatterChart className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "augment",      label: "Augment",     icon: <Sparkles className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "risk",         label: "Risk",        icon: <Shield className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "fortress",     label: "Fortress",    icon: <ShieldCheck className="h-4 w-4" strokeWidth={1.75} /> },
  { id: "system",       label: "System",      icon: <Workflow className="h-4 w-4" strokeWidth={1.75} /> },
];

const IndexContent = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [directProfitMode, setDirectProfitMode] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const tabSwitchCounter = useRef(0);
  const { stocks, setStocks, history, addHistoryEntry, clearHistory, loaded } = useCloudPortfolio();
  const { logTrade } = useTradeLogger();
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [priceStatus, setPriceStatus] = useState<PriceStatusMap>({});
  const priceStatusRef = useRef(priceStatus);
  const isMobile = useIsMobile();
  const { refreshKey, isRefreshing } = useIntelligenceRefresh();
  const { ingestTrade, desirableZones } = useOutcomeGradient();
  const { baseCurrency } = useFX();

  // First-time tutorial: open after portfolio loaded
  useEffect(() => {
    if (!loaded) return;
    try {
      const done = localStorage.getItem(TOUR_FLAG_KEY);
      if (!done) {
        const t = setTimeout(() => setTourOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {}
  }, [loaded]);

  // Backfill Portfolio Sentinel with any positions loaded from cloud so
  // pre-existing holdings are monitored without re-adding them manually.
  const sentinelSyncedRef = useRef(false);
  useEffect(() => {
    if (!loaded || sentinelSyncedRef.current) return;
    if (!stocks || stocks.length === 0) { sentinelSyncedRef.current = true; return; }
    sentinelSyncedRef.current = true;
    stocks.forEach((s) => registerWatch(s.ticker, s.buyPrice, s.quantity));
  }, [loaded, stocks]);

  // Press "?" to replay tour
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        setTourOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The one book valuation (FX-normalized, every position) — the same spine
  // the blotter, Book mode and Augment read, so no surface can disagree.
  const { totalValue: portfolioValueBase, holdings: bookHoldings } = useNormalizedPortfolio(stocks);

  // Register holdings with the shared Opportunity Engine repository so its
  // ranking is diversification-aware (correlation vs current exposure) and
  // sizing can quote whole units. Weights come from base-currency values —
  // mixing native currencies here previously skewed every weight.
  useEffect(() => {
    const weighted = bookHoldings.filter((h) => h.value > 0);
    const total = weighted.reduce((sum, h) => sum + h.value, 0);
    setPortfolioContext(
      total > 0
        ? {
            positions: weighted.map((h) => ({ symbol: h.rawTicker, weight: h.value / total })),
            value: portfolioValueBase > 0 ? portfolioValueBase : undefined,
            currency: baseCurrency,
          }
        : null,
    );
  }, [bookHoldings, portfolioValueBase, baseCurrency]);

  // Force refresh when user switches tabs
  const handleTabSwitch = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      tabSwitchCounter.current++;
      // Note: we intentionally do NOT flush caches or trigger a global
      // refresh on tab switches anymore. That caused every heavy module
      // (opportunity-engine, risk, deep-intel, etc.) to refire concurrently
      // and stampede the backend, leading to "Unable to reach service"
      // errors and the app feeling crashed. The per-module caches in
      // apiGovernor already serve fresh-enough data; users can hit the
      // explicit Refresh button for a hard reload.
    },
    [],
  );
  // ── Foresight operating layer — bus subscriptions + host adapter ──
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  useEffect(() => {
    const offNav = onUIEvent("navigate", ({ tab }) => handleTabSwitch(tab as Tab));
    const offStock = onUIEvent("set_active_stock", ({ positionId }) => {
      setActiveStockId(positionId);
      setDeskView("position");
    });
    return () => { offNav(); offStock(); };
  }, [handleTabSwitch]);

  const {
    data: geoData,
    loading: geoLoading,
    tickerThreats,
    exposedTickers,
    refresh: geoRefresh,
  } = useGeoIntelligence(stocks, refreshKey);

  // Sell notification system, monitors positions for profit drawdowns and sell signals
  useSellNotifications(stocks);

  // Proof Card auto-pops when a trade is CLOSED (crossed off) with a positive PnL
  const [proofStock, setProofStock] = useState<PortfolioStock | null>(null);

  const stocksRef = useRef(stocks);
  useEffect(() => {
    stocksRef.current = stocks;
  }, [stocks]);
  useEffect(() => {
    priceStatusRef.current = priceStatus;
  }, [priceStatus]);

  // ── Desk view: single-instrument vs full-book synthesis ──
  // null = auto (book when ≥2 analyzed positions and no instrument focused).
  const [deskView, setDeskView] = useState<"position" | "book" | null>(null);
  const analyzedCount = stocks.filter((s) => s.analysis).length;

  const activeStock = stocks.find((s) => s.id === activeStockId) ?? null;
  const isLoading = activeStock?.isLoading ?? false;
  const rawAnalysis = activeStock?.analysis ?? null;
  // A "stub" analysis (e.g. a Direct Profit context placeholder) is missing
  // the fields the dashboard panes require. Treat it as "no analysis yet"
  // so we render the loading / empty state instead of crashing on
  // undefined.bullRange.map / undefined.toFixed in child components.
  const analysisIsStub = !!rawAnalysis && ((rawAnalysis as any).bullRange == null || (rawAnalysis as any).suggestion == null);
  const analysis = analysisIsStub ? null : rawAnalysis;
  const effectiveLoading = isLoading || analysisIsStub;
  const showMobileDashboardDock = isMobile && activeTab === "dashboard";

  // Resolve the desk view. Explicit choice wins; auto shows the book when
  // there is no focused instrument and the book has enough analyzed
  // positions to say anything credible.
  const bookAvailable = analyzedCount >= 2;
  const autoDeskView: "position" | "book" =
    analysis || effectiveLoading ? "position" : bookAvailable ? "book" : "position";
  const resolvedDeskView: "position" | "book" =
    deskView === "book" ? (bookAvailable ? "book" : "position") : deskView ?? autoDeskView;

  const focusPosition = useCallback((id: string) => {
    setActiveStockId(id);
    setDeskView("position");
  }, []);
  const focusTicker = useCallback((rawTicker: string) => {
    const s = stocksRef.current.find((x) => x.ticker === rawTicker);
    if (s) {
      setActiveStockId(s.id);
      setDeskView("position");
    }
  }, []);

  // Real-time price subscription
  useEffect(() => {
    let alive = true;
    const refreshPrices = async () => {
      const current = stocksRef.current;
      const analyzed = current.filter((s) => s.analysis && !s.isLoading);
      if (analyzed.length === 0) return;
      const t = Date.now();
      const tickers = analyzed.map((s) => s.ticker);
      try {
        const { data, error } = await governedInvoke("price-feed", { body: { tickers } });
        if (!alive) return;
        if (error || !data?.prices) {
          const statusUpdates: PriceStatusMap = {};
          analyzed.forEach((stock) => {
            const prev = priceStatusRef.current[stock.id];
            const failCount = (prev?.failCount || 0) + 1;
            statusUpdates[stock.id] = {
              lastUpdate: prev?.lastUpdate || 0,
              status: failCount >= 3 ? "DISCONNECTED" : "DELAYED",
              failCount,
            };
          });
          setPriceStatus((prev) => ({ ...prev, ...statusUpdates }));
          return;
        }
        const updates: Record<string, number> = {};
        const statusUpdates: PriceStatusMap = {};
        analyzed.forEach((stock) => {
          const priceData = data.prices[stock.ticker];
          if (priceData?.price && priceData.price > 0) {
            updates[stock.id] = priceData.price;
            statusUpdates[stock.id] = { lastUpdate: t, status: "LIVE", failCount: 0 };
          } else {
            const prev = priceStatusRef.current[stock.id];
            const failCount = (prev?.failCount || 0) + 1;
            statusUpdates[stock.id] = {
              lastUpdate: prev?.lastUpdate || 0,
              status: failCount >= 3 ? "DISCONNECTED" : "DELAYED",
              failCount,
            };
          }
        });
        if (Object.keys(updates).length > 0) {
          setStocks((prev) =>
            prev.map((s) => {
              if (updates[s.id] && s.analysis) {
                return { ...s, analysis: { ...s.analysis, currentPrice: updates[s.id] } };
              }
              return s;
            }),
          );
        }
        setPriceStatus((prev) => ({ ...prev, ...statusUpdates }));
      } catch {
        /* silent */
      }
    };
    refreshPrices();
    const interval = setInterval(refreshPrices, 15000); // Slowed from 8s, governor caches
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [stocks.length]);

  const analyzeStock = useCallback(
    async (stockId: string, ticker: string, buyPrice: number, quantity: number) => {
      // Preserve the stock's existing Direct Profit context (if any) across
      // the analysis-in-progress wipe, then forward it to the edge function
      // so the deeper view stays consistent with the original entry decision.
      let directProfitContext: any = null;
      setStocks((prev) =>
        prev.map((s) => {
          if (s.id !== stockId) return s;
          directProfitContext = s.analysis?.directProfitContext ?? null;
          return {
            ...s,
            isLoading: true,
            analysis: directProfitContext ? { directProfitContext } : null,
          };
        }),
      );
      try {
        // Compute Desirable Assets (ODGS) hint so analyze-stock can override
        // a borderline "Skip" verdict when the asset is a high-edge zone pick.
        const norm = ticker.replace(/\.(NS|BO)$/i, "").toUpperCase();
        const matches = desirableZones.filter((z) =>
          z.assets.some((a) => a.replace(/\.(NS|BO)$/i, "").toUpperCase() === norm),
        );
        const desirableHint = matches.length === 0
          ? null
          : {
              listed: true,
              avgPnlPct: Number(
                (matches.reduce((s, z) => s + z.avgPnlPct, 0) / matches.length).toFixed(2),
              ),
              zoneCount: matches.length,
              regimes: matches.map((z) => z.regime).slice(0, 3),
            };
        const { data, error } = await governedInvoke("analyze-stock", {
          body: { ticker, buyPrice, quantity, directProfitContext, desirableHint },
        });
        if (error) throw error;
        const analysisData = { ...data, ticker, buyPrice, quantity };
        setStocks((prev) =>
          prev.map((s) => (s.id === stockId ? { ...s, isLoading: false, analysis: analysisData } : s)),
        );
        setPriceStatus((prev) => ({ ...prev, [stockId]: { lastUpdate: Date.now(), status: "LIVE", failCount: 0 } }));
        addHistoryEntry({
          id: crypto.randomUUID(),
          ticker,
          timestamp: Date.now(),
          suggestion: data.suggestion,
          currentPrice: data.currentPrice,
          buyPrice,
          confidence: data.confidence,
        });
      } catch (err: any) {
        console.error("Analysis error:", err);
        setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: false } : s)));
        toast({ title: "Analysis Failed", description: err.message || "Could not analyze.", variant: "destructive" });
      }
    },
    [setStocks, addHistoryEntry, desirableZones],
  );

  const handleAnalyze = (ticker: string, buyPrice: number, quantity: number) => {
    const normalizedTicker = normalizeUserTicker(ticker);
    if (!normalizedTicker) return;

    const existing = stocks.find((s) => s.ticker === normalizedTicker);
    if (existing) {
      setStocks((prev) => prev.map((s) => (s.id === existing.id ? { ...s, buyPrice, quantity } : s)));
      focusPosition(existing.id);
      analyzeStock(existing.id, normalizedTicker, buyPrice, quantity);
      registerWatch(normalizedTicker, buyPrice, quantity);
    } else {
      const newId = crypto.randomUUID();
      const newStock: PortfolioStock = { id: newId, ticker: normalizedTicker, buyPrice, quantity, isLoading: false };
      setStocks((prev) => [...prev, newStock]);
      focusPosition(newId);
      analyzeStock(newId, normalizedTicker, buyPrice, quantity);
      registerWatch(normalizedTicker, buyPrice, quantity);
      logTrade({
        ticker: normalizedTicker,
        action: "BUY",
        price: buyPrice,
        qty: quantity,
        pnl: 0,
        source: "Manual entry · Portfolio",
        catalyst: "Position opened",
      });
    }
  };

  // Auto-hydrate stocks that were added with only a Direct Profit stub.
  // The stub lacks bullRange/suggestion/keyRisks etc., so the dashboard
  // detail panes (MonteCarloChart, RiskIndicator, Recommendation, …) would
  // crash on undefined fields. When such a stock becomes active, kick off a
  // full analyze-stock run so the analysis object is fully populated.
  const hydratingRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeStock) return;
    if (activeStock.isLoading) return;
    const a: any = activeStock.analysis;
    if (!a) return;
    const isStub = a.bullRange == null || a.suggestion == null;
    if (!isStub) return;
    if (hydratingRef.current.has(activeStock.id)) return;
    hydratingRef.current.add(activeStock.id);
    analyzeStock(activeStock.id, activeStock.ticker, activeStock.buyPrice, activeStock.quantity)
      .finally(() => hydratingRef.current.delete(activeStock.id));
  }, [activeStock?.id, activeStock?.analysis, activeStock?.isLoading, analyzeStock]);

  const handleRemoveStock = (id: string) => {
    const stock = stocks.find((s) => s.id === id);
    // Ingest closed position into ODGS Profit Gradient
    if (stock?.analysis) {
      const currentPrice = stock.analysis.currentPrice ?? stock.buyPrice;
      const pnlPct = ((currentPrice - stock.buyPrice) / stock.buyPrice) * 100;
      const pnlAbs = (currentPrice - stock.buyPrice) * stock.quantity;
      logTrade({
        ticker: stock.ticker,
        action: "SELL",
        price: currentPrice,
        qty: stock.quantity,
        pnl: pnlAbs,
        source: `Close · entry ${stock.buyPrice.toFixed(2)} → exit ${currentPrice.toFixed(2)}`,
        catalyst: `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% realized`,
      });
      ingestTrade({
        asset: stock.ticker,
        assetClass: "equity",
        features: {
          momentum: stock.analysis.momentum ?? 0,
          vol: stock.analysis.volatility ?? 0,
          sentiment: stock.analysis.sentiment ?? 0,
          regime: stock.analysis.regime ?? "unknown",
        },
        pnlPct,
        returnAbs: (currentPrice - stock.buyPrice) * stock.quantity,
        duration: Math.max(1, (Date.now() - new Date(stock.analysis.analyzedAt || Date.now()).getTime()) / 3_600_000),
        timestamp: Date.now(),
      });
      toast({
        title: "Trade crossed → Profit Gradient",
        description: `${stock.ticker} ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}% ingested into ODGS`,
      });
      // Auto-pop Proof Card on a winning close
      if (pnlPct > 0) {
        setProofStock({ ...stock });
      }
    } else if (stock) {
      logTrade({
        ticker: stock.ticker,
        action: "SELL",
        price: stock.buyPrice,
        qty: stock.quantity,
        pnl: 0,
        source: "Position closed",
        catalyst: "Closed before analysis",
      });
    }
    setStocks((prev) => prev.filter((s) => s.id !== id));
    if (activeStockId === id) setActiveStockId(stocks.find((s) => s.id !== id)?.id ?? null);
    if (stock) unregisterWatch(stock.ticker);
  };
  // Live application handles for Foresight's tools. Reads go through refs so
  // the runtime (constructed once) always sees current state; mutations reuse
  // the exact same paths as manual interaction (analysis, journaling, sentinel).
  const foresightHost: HostAdapter = {
    getPositions: () =>
      stocksRef.current.map((s) => ({
        id: s.id,
        ticker: s.ticker,
        buyPrice: s.buyPrice,
        quantity: s.quantity,
        currentPrice: s.analysis?.currentPrice,
        currency: s.analysis?.currency,
        analysis: s.analysis ?? null,
      })),
    getActiveTab: () => activeTabRef.current,
    navigate: (tab) => handleTabSwitch(tab as Tab),
    openAugmentModule: () => handleTabSwitch("augment"),
    setActiveStock: (id) => setActiveStockId(id),
    addPosition: (ticker, buyPrice, quantity) => handleAnalyze(ticker, buyPrice, quantity),
    removePosition: (id) => handleRemoveStock(id),
    updatePosition: (id, changes) =>
      setStocks((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, buyPrice: changes.buyPrice ?? s.buyPrice, quantity: changes.quantity ?? s.quantity }
            : s,
        ),
      ),
    getHistoryEntries: () =>
      history.map((h) => ({
        ticker: h.ticker,
        timestamp: h.timestamp,
        suggestion: h.suggestion,
        currentPrice: h.currentPrice,
        confidence: h.confidence,
      })),
  };

  if (!loaded) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-subheadline text-muted-foreground animate-breathe">Loading your portfolio…</p>
      </div>
    );
  }

  // Instrument ↔ Book segmented control for the Desk center pane.
  const deskViewToggle = (
    <div className="flex items-center justify-between gap-2">
      <div className="inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
        {([
          { id: "position" as const, label: "Instrument", icon: <LineChart className="h-3 w-3" strokeWidth={1.75} />, enabled: true, hint: "Single-position analysis" },
          { id: "book" as const, label: "Book", icon: <Briefcase className="h-3 w-3" strokeWidth={1.75} />, enabled: bookAvailable, hint: bookAvailable ? "Full-portfolio synthesis — quant, verdicts, news" : "Needs at least two analyzed positions" },
        ]).map((v) => (
          <button
            key={v.id}
            onClick={() => v.enabled && setDeskView(v.id)}
            disabled={!v.enabled}
            title={v.hint}
            className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
              resolvedDeskView === v.id
                ? "bg-surface-3 text-foreground"
                : v.enabled
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/40 cursor-not-allowed"
            }`}
          >
            {v.icon}
            <span>{v.label}</span>
          </button>
        ))}
      </div>
      {resolvedDeskView === "book" && (
        <span className="hidden font-mono text-[9px] text-muted-foreground/60 sm:inline">
          whole-book pass · one spine, three signal families
        </span>
      )}
    </div>
  );

  return (
    <ForesightProvider host={foresightHost}>
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header
        directProfitMode={directProfitMode}
        onToggleDirectProfit={() => setDirectProfitMode((p) => !p)}
      />
      <CommandPalette
        tabs={tabs}
        onSelectTab={(id) => handleTabSwitch(id as Tab)}
        onToggleDirectProfit={() => setDirectProfitMode((p) => !p)}
        workstationTickers={stocks.filter((s) => s.analysis).map((s) => s.ticker)}
        onOpenWorkstation={(ticker) => navigate(`/company/${encodeURIComponent(ticker)}`)}
      />
      <TerminalTour
        open={tourOpen}
        onClose={() => setTourOpen(false)}
        setActiveTab={(t) => handleTabSwitch(t as Tab)}
      />
      {proofStock && (
        <ProofCard open={!!proofStock} onClose={() => setProofStock(null)} stock={proofStock} />
      )}
      {/* Direct Profit Mode, replaces entire UI */}
      {directProfitMode ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <DirectProfitMode
            portfolioValueBase={portfolioValueBase}
            onAddToMainPortfolio={(ticker, buyPrice, quantity, dpCtx) => {
              const normalizedTicker = normalizeUserTicker(ticker);
              if (!normalizedTicker) return;
              // Stash the Direct Profit context on the stock as a stub
              // analysis. When dashboard analysis runs, this context is
              // forwarded to analyze-stock so the deeper view stays
              // consistent (no contradictory BUY vs Exit verdicts).
              const dpStub = {
                directProfitContext: dpCtx,
                currentPrice: dpCtx.currentPrice,
                currency: dpCtx.currency,
              };
              setStocks((prev) => {
                const existing = prev.find((s) => s.ticker === normalizedTicker);
                if (existing) {
                  return prev.map((s) =>
                    s.id === existing.id
                      ? {
                          ...s,
                          buyPrice,
                          quantity,
                          analysis: s.analysis
                            ? { ...s.analysis, directProfitContext: dpCtx }
                            : dpStub,
                        }
                      : s,
                  );
                }
                return [
                  ...prev,
                  {
                    id: crypto.randomUUID(),
                    ticker: normalizedTicker,
                    buyPrice,
                    quantity,
                    isLoading: false,
                    analysis: dpStub,
                  },
                ];
              });
              toast({
                title: "Added to Dashboard Portfolio",
                description: `${normalizedTicker} • qty ${quantity} @ ${buyPrice.toFixed(2)} — open Dashboard to run full analysis`,
              });
            }}
          />
        </div>
      ) : (
        <>
          {/* Refresh Banner */}
          {isRefreshing && (
            <div className="border-b border-info/15 bg-info/5 px-4 py-1.5 flex items-center gap-2 shrink-0">
              <RefreshCw className="h-3 w-3 text-info animate-spin" />
              <span className="text-[11px] font-medium tracking-tight text-info">
                Updating intelligence…
              </span>
              <div className="ml-auto h-1 w-24 rounded-full bg-info/15 overflow-hidden">
                <div className="h-full bg-info rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {/* Global Ticker Strip */}
          <TickerStrip />
          <OperatingTape stocks={stocks} portfolioValueBase={portfolioValueBase} baseCurrency={baseCurrency} priceStatus={priceStatus} analyzedCount={analyzedCount} />

          {/* Workspace — module rail (desktop) / module strip (mobile) + content */}
          <div className="flex flex-1 min-h-0">
            {!isMobile && (
              <ModuleRail
                modules={tabs}
                activeId={activeTab}
                onSelect={(id) => handleTabSwitch(id as Tab)}
              />
            )}
            <div className="flex flex-col flex-1 min-w-0">
              {isMobile && (
                <ModuleStrip
                  modules={tabs}
                  activeId={activeTab}
                  onSelect={(id) => handleTabSwitch(id as Tab)}
                />
              )}

          {/* Main Content, fills all remaining space, above the status bar */}
          <main className="flex-1 min-h-0 overflow-auto no-touch-bounce">
            <PageTransition tabKey={activeTab}>
              {activeTab === "dashboard" &&
                (isMobile ? (
                  /* Mobile: stacked layout */
                  <div className="p-1.5 space-y-1.5 pb-20">
                    <div data-tour="stock-input">
                      <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />
                    </div>
                    {deskViewToggle}
                    {resolvedDeskView === "book" ? (
                      <ModuleErrorBoundary
                        title="Book synthesis recovered"
                        description="The portfolio pass hit a render error. Retry remounts just this module."
                      >
                        <DeskPortfolioMode
                          stocks={stocks}
                          onSelectTicker={(t) => {
                            focusTicker(t);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        />
                      </ModuleErrorBoundary>
                    ) : (
                      <>
                        {effectiveLoading && <LoadingState />}
                        <DeskAnalysisStack
                          analysis={effectiveLoading ? null : analysis}
                          stocks={stocks}
                          isMobile
                          onSelectTicker={(ticker) => {
                            const stock = stocks.find(s => s.ticker === ticker || s.ticker.replace(".NS", "").replace(".BO", "") === ticker);
                            if (stock) focusPosition(stock.id);
                          }}
                        />
                      </>
                    )}
                  </div>
                ) : (
                  /* Desktop: Bloomberg-style resizable 3-column layout */
                  <ResizablePanelGroup direction="horizontal" className="h-full">
                    {/* Left: Portfolio Blotter */}
                    <ResizablePanel defaultSize={22} minSize={15} maxSize={35}>
                      <PanelWrapper title="Portfolio" icon={<LayoutDashboard className="h-3 w-3" />} noPad>
                        <PortfolioBlotter
                          stocks={stocks}
                          activeStockId={activeStockId}
                          onSelectStock={focusPosition}
                          onRemoveStock={handleRemoveStock}
                          onAnalyze={handleAnalyze}
                          isLoading={isLoading}
                          priceStatus={priceStatus}
                          tickerThreats={tickerThreats}
                        />
                      </PanelWrapper>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    {/* Center: Analysis + Charts */}
                    <ResizablePanel defaultSize={55} minSize={30}>
                      <ResizablePanelGroup direction="vertical">
                        {/* Top center: Main analysis */}
                        <ResizablePanel defaultSize={65} minSize={30}>
                          <div className="h-full overflow-auto p-3 space-y-3">
                            {deskViewToggle}
                            {resolvedDeskView === "book" ? (
                              <ModuleErrorBoundary
                                title="Book synthesis recovered"
                                description="The portfolio pass hit a render error. Retry remounts just this module."
                              >
                                <DeskPortfolioMode stocks={stocks} onSelectTicker={focusTicker} />
                              </ModuleErrorBoundary>
                            ) : (
                              <>
                                {!effectiveLoading && !analysis && (
                                  <div className="mx-auto flex max-w-2xl flex-col items-start justify-center border border-border bg-card px-8 py-12 shadow-none animate-fade-in">
                                    <div className="mb-6 flex h-12 w-12 items-center justify-center border border-border bg-surface-2">
                                      <Activity className="h-6 w-6 text-muted-foreground animate-breathe" strokeWidth={1.5} />
                                    </div>
                                    <p className="data-label mb-2.5">No instrument selected</p>
                                    <h2 className="mb-2 text-title-3 text-foreground">Capital desk standing by</h2>
                                    <p className="max-w-sm text-center text-footnote text-muted-foreground px-4">
                                      Add any global asset — equities, crypto, FX or commodities — and twelve
                                      engines will run a full pass with live pricing. Every position opens into
                                      the Equity Workstation: evidence graph, thesis engine, and risk lab.
                                    </p>
                                    <p className="mt-5 text-caption-1 text-muted-foreground/60">
                                      Press <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-medium">⌘K</kbd> to jump anywhere
                                    </p>
                                  </div>
                                )}
                                {effectiveLoading && <LoadingState />}
                                <DeskAnalysisStack
                                  analysis={effectiveLoading ? null : analysis}
                                  stocks={stocks}
                                  isMobile={false}
                                />
                              </>
                            )}
                          </div>
                        </ResizablePanel>
                      </ResizablePanelGroup>
                    </ResizablePanel>

                    <ResizableHandle withHandle />

                    {/* Right: News + Flow Detection */}
                    <ResizablePanel defaultSize={23} minSize={15} maxSize={35}>
                      <div className="flex flex-col h-full min-h-0">
                        <div className="flex-1 min-h-0">
                          <PanelWrapper title="Live Intel" icon={<Activity className="h-3 w-3" />} noPad>
                            <LiveNewsFeed ticker={analysis?.ticker} compact />
                          </PanelWrapper>
                        </div>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                ))}

              {activeTab === "market" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <MarketOverview key={refreshKey} />
                </div>
              )}
              {activeTab === "augment" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <AugmentDashboard key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "sandbox" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <EntropySandbox key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "statarb" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <StatArbEngine key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "geopolitical" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <ModuleErrorBoundary
                    title="Geopolitical module recovered"
                    description="The live geopolitics panel hit a render error. Retry keeps the rest of the terminal running."
                  >
                    <GeopoliticalGlobe
                      key={refreshKey}
                      stocks={stocks}
                      geoData={geoData}
                      geoLoading={geoLoading}
                      exposedTickers={exposedTickers}
                      tickerThreats={tickerThreats}
                      onRefresh={geoRefresh}
                    />
                  </ModuleErrorBoundary>
                </div>
              )}
              {activeTab === "desirable" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <ModuleErrorBoundary
                    title="Desirable Assets module recovered"
                    description="The recommendations board hit a render error. Retry will remount just this module."
                  >
                    <DesirableAssets key={refreshKey} stocks={stocks} onAddToPortfolio={handleAnalyze} />
                  </ModuleErrorBoundary>
                </div>
              )}
              {activeTab === "risk" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <RiskDashboard key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "fortress" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <FortressMode key={refreshKey} stocks={stocks} setStocks={setStocks} />
                </div>
              )}
              {activeTab === "system" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-8">
                  <SystemPipeline stocks={stocks} onNavigate={(id) => handleTabSwitch(id as Tab)} />
                </div>
              )}
            </PageTransition>
          </main>
            </div>

            {/* Foresight — docked operating surface (⌘J) */}
            <ForesightSurface />
          </div>

          {showMobileDashboardDock && (
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { type: "spring", stiffness: 320, damping: 30 } }}
              className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-6 pointer-events-none"
            >
              <div className="pointer-events-auto flex items-center gap-1 rounded-full glass-thick p-1.5 shadow-soft-xl">
                <Sheet>
                  <SheetTrigger asChild>
                    <button className="pressable flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium tracking-tight text-foreground/90 active:bg-surface-3/70">
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Portfolio</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[88vw] max-w-sm border-border bg-background p-0 flex flex-col">
                    <SheetHeader className="shrink-0 border-b border-border/70 px-4 py-3">
                      <SheetTitle className="flex items-center gap-2 text-headline text-foreground">
                        <LayoutDashboard className="h-4 w-4 text-muted-foreground" /> Portfolio
                      </SheetTitle>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <PortfolioBlotter
                        stocks={stocks}
                        activeStockId={activeStockId}
                        onSelectStock={focusPosition}
                        onRemoveStock={handleRemoveStock}
                        onAnalyze={handleAnalyze}
                        isLoading={isLoading}
                        priceStatus={priceStatus}
                        tickerThreats={tickerThreats}
                      />
                    </div>
                  </SheetContent>
                </Sheet>

                <div className="h-5 w-px bg-border/70" />

                <Sheet>
                  <SheetTrigger asChild>
                    <button className="pressable flex items-center gap-2 rounded-full px-4 py-2.5 text-[13px] font-medium tracking-tight text-foreground/90 active:bg-surface-3/70">
                      <Newspaper className="h-4 w-4" />
                      <span>News</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[88vw] max-w-sm border-border bg-background p-0 flex flex-col">
                    <SheetHeader className="shrink-0 border-b border-border/70 px-4 py-3">
                      <SheetTitle className="flex items-center gap-2 text-headline text-foreground">
                        <Newspaper className="h-4 w-4 text-muted-foreground" /> Live Intel
                      </SheetTitle>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <LiveNewsFeed ticker={analysis?.ticker} compact />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </motion.div>
          )}
        </>
      )}
    </div>
    <Spotlight />
    </ForesightProvider>
  );
};

const Index = () => (
  <FXProvider>
    <IndexContent />
  </FXProvider>
);

export default Index;
