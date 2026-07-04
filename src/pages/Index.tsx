import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, memo } from "react";
import { motion } from "framer-motion";
import { LayoutDashboard, Eye, Globe, Shield, ShieldCheck, Sparkles, Target, ScatterChart, RefreshCw, Landmark, Activity, Newspaper } from "lucide-react";
import { springLayout } from "@/lib/motion";
import CommandPalette from "@/components/CommandPalette";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import DirectProfitMode from "@/components/DirectProfitMode";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import Header from "@/components/Header";
import StockInput from "@/components/StockInput";
import StockSummary from "@/components/StockSummary";
import NewsImpactTable from "@/components/NewsImpactTable";
import RiskIndicator from "@/components/RiskIndicator";
import SimulationTable from "@/components/SimulationTable";
import MonteCarloChart from "@/components/MonteCarloChart";
import ProfitTaskbar from "@/components/ProfitTaskbar";
import LiveNewsFeed from "@/components/LiveNewsFeed";

import Recommendation from "@/components/Recommendation";
import LoadingState from "@/components/LoadingState";
import PortfolioChart from "@/components/PortfolioChart";
import PnLWaterfall from "@/components/charts/PnLWaterfall";
import type { HistoryEntry } from "@/components/AnalysisHistory";
import MarketOverview from "@/components/MarketOverview";
import EntropySandbox from "@/components/sandbox/EntropySandbox";
import CompanyIntelligence from "@/components/CompanyIntelligence";
import StatArbEngine from "@/components/sandbox/StatArbEngine";
import GeopoliticalGlobe from "@/components/GeopoliticalGlobe";
import DesirableAssets from "@/components/DesirableAssets";
import { useGeoIntelligence } from "@/hooks/useGeoIntelligence";
import { useTradeLogger } from "@/hooks/useTradeLogger";

import RiskDashboard from "@/components/RiskDashboard";
import FortressMode from "@/components/risk/FortressMode";
import AugmentDashboard from "@/components/augment/AugmentDashboard";
import TickerStrip from "@/components/terminal/TickerStrip";
import SystemStatusBar from "@/components/terminal/SystemStatusBar";
import ThemeToggle from "@/components/ThemeToggle";
import PageTransition from "@/components/PageTransition";
import PortfolioBlotter from "@/components/terminal/PortfolioBlotter";
import PanelWrapper from "@/components/terminal/PanelWrapper";
import ProofCard from "@/components/ProofCard";
import ModuleErrorBoundary from "@/components/ModuleErrorBoundary";
import TerminalTour from "@/components/tour/TerminalTour";
import { TOUR_FLAG_KEY } from "@/components/tour/tourSteps";

import { type PortfolioStock } from "@/components/PortfolioPanel";
import { registerWatch, unregisterWatch } from "@/lib/sentinel";
import { supabase } from "@/integrations/supabase/client";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";
import { normalizeUserTicker } from "@/lib/ticker";
import { useCloudPortfolio } from "@/hooks/useCloudPortfolio";
import { useIsMobile } from "@/hooks/use-mobile";
import { FXProvider, useFX } from "@/hooks/useFX";
import { useIntelligenceRefresh } from "@/hooks/useIntelligenceRefresh";
import { useSellNotifications } from "@/hooks/useSellNotifications";
import { useOutcomeGradient } from "@/hooks/useOutcomeGradient";

type Tab = "dashboard" | "market" | "sandbox" | "statarb" | "augment" | "geopolitical" | "desirable" | "risk" | "fortress";

export type PriceFreshness = "LIVE" | "DELAYED" | "DISCONNECTED";
export type PriceStatusMap = Record<string, { lastUpdate: number; status: PriceFreshness; failCount: number }>;

// Apple-style tinted SF-Symbol tiles: each tab gets a distinct hue rendered
// as a raised, skeuomorphic gradient chip (like Settings.app icons).
const tabs: { id: Tab; label: string; shortLabel: string; icon: React.ReactNode; tint: string }[] = [
  { id: "dashboard",    label: "Dashboard",   shortLabel: "Dash",  icon: <LayoutDashboard className="h-3 w-3" strokeWidth={2.5} />, tint: "from-[#0A84FF] to-[#0060DF]" },   // systemBlue
  { id: "market",       label: "Markets",     shortLabel: "Mkt",   icon: <Landmark className="h-3 w-3" strokeWidth={2.5} />,        tint: "from-[#30D158] to-[#1F9F42]" },   // systemGreen
  { id: "geopolitical", label: "Geopolitics", shortLabel: "Geo",   icon: <Globe className="h-3 w-3" strokeWidth={2.5} />,           tint: "from-[#64D2FF] to-[#0A84FF]" },   // systemTeal→Blue
  { id: "desirable",    label: "Desirable",   shortLabel: "Picks", icon: <Target className="h-3 w-3" strokeWidth={2.5} />,          tint: "from-[#FF9F0A] to-[#E8730B]" },   // systemOrange
  { id: "sandbox",      label: "Sandbox",     shortLabel: "Sim",   icon: <Eye className="h-3 w-3" strokeWidth={2.5} />,             tint: "from-[#BF5AF2] to-[#8944E0]" },   // systemPurple
  { id: "statarb",      label: "Stat Arb",    shortLabel: "Stat",  icon: <ScatterChart className="h-3 w-3" strokeWidth={2.5} />,    tint: "from-[#5E5CE6] to-[#3634A3]" },   // systemIndigo
  { id: "augment",      label: "Augment",     shortLabel: "Aug",   icon: <Sparkles className="h-3 w-3" strokeWidth={2.5} />,        tint: "from-[#FF375F] to-[#C9184A]" },   // systemPink
  { id: "risk",         label: "Risk",        shortLabel: "Risk",  icon: <Shield className="h-3 w-3" strokeWidth={2.5} />,          tint: "from-[#FFD60A] to-[#E8A50B]" },   // systemYellow
  { id: "fortress",     label: "Fortress",    shortLabel: "Fort",  icon: <ShieldCheck className="h-3 w-3" strokeWidth={2.5} />,     tint: "from-[#FF453A] to-[#C81E13]" },   // systemRed
];

const IndexContent = () => {
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
  const { convertToBase } = useFX();

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

  // Live total portfolio value in base currency (used for risk-budgeted position sizing)
  const portfolioValueBase = useMemo(() => {
    return stocks.reduce((sum, s) => {
      if (!s.analysis?.currentPrice) return sum;
      const ccy = s.analysis.currency || "USD";
      return sum + convertToBase(s.analysis.currentPrice * s.quantity, ccy);
    }, 0);
  }, [stocks, convertToBase]);

  // Force refresh when user switches tabs
  const handleTabSwitch = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      tabSwitchCounter.current++;
      // Note: we intentionally do NOT flush caches or trigger a global
      // refresh on tab switches anymore. That caused every heavy module
      // (desirable-assets, risk, deep-intel, etc.) to refire concurrently
      // and stampede the backend, leading to "Unable to reach service"
      // errors and the app feeling crashed. The per-module caches in
      // apiGovernor already serve fresh-enough data; users can hit the
      // explicit Refresh button for a hard reload.
    },
    [],
  );
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
      setActiveStockId(existing.id);
      analyzeStock(existing.id, normalizedTicker, buyPrice, quantity);
      registerWatch(normalizedTicker, buyPrice, quantity);
    } else {
      const newId = crypto.randomUUID();
      const newStock: PortfolioStock = { id: newId, ticker: normalizedTicker, buyPrice, quantity, isLoading: false };
      setStocks((prev) => [...prev, newStock]);
      setActiveStockId(newId);
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
  if (!loaded) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-subheadline text-muted-foreground animate-breathe">Loading your portfolio…</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header
        directProfitMode={directProfitMode}
        onToggleDirectProfit={() => setDirectProfitMode((p) => !p)}
      />
      <CommandPalette
        tabs={tabs}
        onSelectTab={(id) => handleTabSwitch(id as Tab)}
        onToggleDirectProfit={() => setDirectProfitMode((p) => !p)}
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

          {/* Tab Navigation — segmented control with a sliding glass pill */}
          <nav data-density="compact" data-tour="tab-bar" className="glass-panel border-b border-border/60 sticky top-0 z-30 shrink-0">
            <div
              className="px-2 sm:container flex items-center gap-0.5 overflow-x-auto scrollbar-hide relative py-1.5"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {tabs.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleTabSwitch(tab.id)}
                    data-tour-tab={tab.id}
                    style={{ scrollSnapAlign: "start" }}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-1.5 rounded-full pl-1 pr-2.5 sm:pr-3.5 py-1 text-[12px] sm:text-[13px] font-semibold tracking-tight whitespace-nowrap flex-shrink-0 transition-colors duration-200 ${
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="tab-pill"
                        transition={springLayout}
                        className="absolute inset-0 rounded-full border border-border/70 bg-surface-3/90 shadow-soft"
                      />
                    )}
                    {/* Skeuomorphic tinted SF-Symbol tile — like Settings.app */}
                    <span
                      className={`relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-[6px] bg-gradient-to-b ${tab.tint} text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.35)] ring-1 ring-black/20`}
                    >
                      {tab.icon}
                    </span>
                    <span className="relative z-10 hidden sm:inline ml-0.5">{tab.label}</span>
                    <span className="relative z-10 sm:hidden ml-0.5">{tab.shortLabel}</span>
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-2 pl-3 pr-1 flex-shrink-0">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gain" />
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">Live</span>
                <span className="hidden lg:inline-flex items-center gap-1 rounded-md border border-border/70 bg-surface-2/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground/80">
                  ⌘K
                </span>
              </div>
            </div>
          </nav>

          {/* Global Ticker Strip */}
          <TickerStrip />

          {/* Main Content, fills all remaining space, above the status bar */}
          <main className="flex-1 min-h-0 pb-7 overflow-auto no-touch-bounce">
            <PageTransition tabKey={activeTab}>
              {activeTab === "dashboard" &&
                (isMobile ? (
                  /* Mobile: stacked layout */
                  <div className="p-1.5 space-y-1.5 pb-24">
                    <div data-tour="stock-input">
                      <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />
                    </div>
                    {effectiveLoading && <LoadingState />}
                    {analysis && !effectiveLoading && (
                      <>
                        <StockSummary
                          ticker={analysis.ticker}
                          currentPrice={analysis.currentPrice}
                          buyPrice={analysis.buyPrice}
                          quantity={analysis.quantity}
                          currency={analysis.currency}
                        />
                        <MonteCarloChart
                          currentPrice={analysis.currentPrice}
                          bullRange={analysis.bullRange}
                          bearRange={analysis.bearRange}
                          ticker={analysis.ticker}
                        />
                        <NewsImpactTable
                          news={analysis.news || []}
                          overallSentiment={analysis.overallSentiment}
                          totalPressure={analysis.totalPressure}
                        />
                        <SimulationTable
                          currentPrice={analysis.currentPrice}
                          bullRange={analysis.bullRange}
                          neutralRange={analysis.neutralRange}
                          bearRange={analysis.bearRange}
                          currency={analysis.currency}
                        />
                        <Recommendation
                          summary={analysis.summary}
                          suggestion={analysis.suggestion}
                          confidence={analysis.confidence}
                          confidenceReasoning={analysis.confidenceReasoning}
                          macroFactors={analysis.macroFactors}
                          verdict={analysis.verdict}
                          hedgeStrategy={analysis.hedgeStrategy}
                          liveWebContext={(analysis as any).liveWebContext}
                        />
                        <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />
                        <CompanyIntelligence ticker={analysis.ticker} />
                      </>
                    )}
                    {stocks.filter((s) => s.analysis).length > 1 && (
                      <>
                        <PortfolioChart stocks={stocks} onAssetTap={(ticker) => {
                          const stock = stocks.find(s => s.ticker === ticker || s.ticker.replace(".NS", "").replace(".BO", "") === ticker);
                          if (stock) {
                            setActiveStockId(stock.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }
                        }} />
                        <PnLWaterfall stocks={stocks} />
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
                          onSelectStock={setActiveStockId}
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
                            {!effectiveLoading && !analysis && (
                              <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card py-16 shadow-soft animate-scale-in">
                                <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 shadow-soft">
                                  <Activity className="h-7 w-7 text-muted-foreground animate-breathe" />
                                </div>
                                <h2 className="mb-1.5 text-title-3 text-foreground">Ready when you are</h2>
                                <p className="max-w-sm text-center text-footnote text-muted-foreground px-4">
                                  Add any global asset — stocks, crypto, forex, or commodities — and Entropy will run a
                                  full analysis with live pricing.
                                </p>
                                <p className="mt-4 text-caption-1 text-muted-foreground/60">
                                  Press <kbd className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-medium">⌘K</kbd> to jump anywhere
                                </p>
                              </div>
                            )}
                            {effectiveLoading && <LoadingState />}
                            {analysis && !effectiveLoading && (
                              <>
                                <StockSummary
                                  ticker={analysis.ticker}
                                  currentPrice={analysis.currentPrice}
                                  buyPrice={analysis.buyPrice}
                                  quantity={analysis.quantity}
                                  currency={analysis.currency}
                                />
                                <MonteCarloChart
                                  currentPrice={analysis.currentPrice}
                                  bullRange={analysis.bullRange}
                                  bearRange={analysis.bearRange}
                                  ticker={analysis.ticker}
                                />
                                <NewsImpactTable
                                  news={analysis.news || []}
                                  overallSentiment={analysis.overallSentiment}
                                  totalPressure={analysis.totalPressure}
                                />
                                <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                                  <SimulationTable
                                    currentPrice={analysis.currentPrice}
                                    bullRange={analysis.bullRange}
                                    neutralRange={analysis.neutralRange}
                                    bearRange={analysis.bearRange}
                                    currency={analysis.currency}
                                  />
                                  <Recommendation
                                    summary={analysis.summary}
                                    suggestion={analysis.suggestion}
                                    confidence={analysis.confidence}
                                    confidenceReasoning={analysis.confidenceReasoning}
                                    macroFactors={analysis.macroFactors}
                                    verdict={analysis.verdict}
                                    hedgeStrategy={analysis.hedgeStrategy}
                          liveWebContext={(analysis as any).liveWebContext}
                                  />
                                </div>
                              </>
                            )}
                            {stocks.filter((s) => s.analysis).length > 1 && (
                              <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                                <PortfolioChart stocks={stocks} />
                                <PnLWaterfall stocks={stocks} />
                              </div>
                            )}
                            {analysis && <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />}
                            {analysis && <CompanyIntelligence ticker={analysis.ticker} />}
                            {analysis && (
                              <ProfitTaskbar
                                ticker={analysis.ticker}
                                currentPrice={analysis.currentPrice}
                                buyPrice={analysis.buyPrice}
                                quantity={analysis.quantity}
                                suggestion={analysis.suggestion}
                                confidence={analysis.confidence}
                                bullRange={analysis.bullRange}
                                bearRange={analysis.bearRange}
                                riskLevel={analysis.riskLevel}
                                currency={(analysis as any).currency}
                              />
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
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <MarketOverview key={refreshKey} />
                </div>
              )}
              {activeTab === "augment" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <AugmentDashboard key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "sandbox" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <EntropySandbox key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "statarb" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <StatArbEngine key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "geopolitical" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
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
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <ModuleErrorBoundary
                    title="Desirable Assets module recovered"
                    description="The recommendations board hit a render error. Retry will remount just this module."
                  >
                    <DesirableAssets key={refreshKey} stocks={stocks} onAddToPortfolio={handleAnalyze} />
                  </ModuleErrorBoundary>
                </div>
              )}
              {activeTab === "risk" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <RiskDashboard key={refreshKey} stocks={stocks} />
                </div>
              )}
              {activeTab === "fortress" && (
                <div className="px-3 sm:container py-3 sm:py-5 pb-16">
                  <FortressMode key={refreshKey} stocks={stocks} setStocks={setStocks} />
                </div>
              )}
            </PageTransition>
          </main>

          {showMobileDashboardDock && (
            <motion.div
              initial={{ y: 32, opacity: 0 }}
              animate={{ y: 0, opacity: 1, transition: { type: "spring", stiffness: 320, damping: 30 } }}
              className="fixed inset-x-0 bottom-9 z-30 flex justify-center px-6 pointer-events-none"
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
                        onSelectStock={(id) => {
                          setActiveStockId(id);
                        }}
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

          {/* System Status Bar */}
          <SystemStatusBar stockCount={stocks.filter((s) => s.analysis).length} />
          <ThemeToggle />
        </>
      )}
    </div>
  );
};

const Index = () => (
  <FXProvider>
    <IndexContent />
  </FXProvider>
);

export default Index;
