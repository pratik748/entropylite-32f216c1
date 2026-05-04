import React, { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, memo } from "react";
import { Activity, LayoutDashboard, Eye, Globe, Shield, ShieldCheck, Sparkles, Target, ScatterChart, RefreshCw, Newspaper, BarChart3, Brain } from "lucide-react";
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

import RiskDashboard from "@/components/RiskDashboard";
import FortressMode from "@/components/risk/FortressMode";
import AugmentDashboard from "@/components/augment/AugmentDashboard";
import TickerStrip from "@/components/terminal/TickerStrip";
import SystemStatusBar from "@/components/terminal/SystemStatusBar";
import ThemeToggle from "@/components/ThemeToggle";
import PageTransition from "@/components/PageTransition";
import PortfolioBlotter from "@/components/terminal/PortfolioBlotter";
import PanelWrapper from "@/components/terminal/PanelWrapper";
import EntropyBrief from "@/components/EntropyBrief";
import ProofCard from "@/components/ProofCard";
import ModuleErrorBoundary from "@/components/ModuleErrorBoundary";
import TerminalTour from "@/components/tour/TerminalTour";
import { TOUR_FLAG_KEY } from "@/components/tour/tourSteps";

import { type PortfolioStock } from "@/components/PortfolioPanel";
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

const tabs: { id: Tab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dash", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: "market", label: "Markets", shortLabel: "Mkt", icon: <Globe className="h-3.5 w-3.5" /> },
  { id: "geopolitical", label: "Geopolitics", shortLabel: "Geo", icon: <Globe className="h-3.5 w-3.5" /> },
  { id: "desirable", label: "Desirable", shortLabel: "Picks", icon: <Target className="h-3.5 w-3.5" /> },
  { id: "sandbox", label: "Sandbox", shortLabel: "Sim", icon: <Eye className="h-3.5 w-3.5" /> },
  { id: "statarb", label: "Stat Arb", shortLabel: "Stat", icon: <ScatterChart className="h-3.5 w-3.5" /> },
  { id: "augment", label: "Augment", shortLabel: "Aug", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "risk", label: "Risk", shortLabel: "Risk", icon: <Shield className="h-3.5 w-3.5" /> },
  { id: "fortress", label: "Fortress", shortLabel: "Fort", icon: <ShieldCheck className="h-3.5 w-3.5" /> },
];

const IndexContent = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [directProfitMode, setDirectProfitMode] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const tabSwitchCounter = useRef(0);
  const { stocks, setStocks, history, addHistoryEntry, clearHistory, loaded } = useCloudPortfolio();
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [priceStatus, setPriceStatus] = useState<PriceStatusMap>({});
  const priceStatusRef = useRef(priceStatus);
  const isMobile = useIsMobile();
  const { refreshKey, isRefreshing } = useIntelligenceRefresh();
  const { ingestTrade } = useOutcomeGradient();
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
        const { data, error } = await governedInvoke("analyze-stock", {
          body: { ticker, buyPrice, quantity, directProfitContext },
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
    [setStocks, addHistoryEntry],
  );

  const handleAnalyze = (ticker: string, buyPrice: number, quantity: number) => {
    const normalizedTicker = normalizeUserTicker(ticker);
    if (!normalizedTicker) return;

    const existing = stocks.find((s) => s.ticker === normalizedTicker);
    if (existing) {
      setStocks((prev) => prev.map((s) => (s.id === existing.id ? { ...s, buyPrice, quantity } : s)));
      setActiveStockId(existing.id);
      analyzeStock(existing.id, normalizedTicker, buyPrice, quantity);
    } else {
      const newId = crypto.randomUUID();
      const newStock: PortfolioStock = { id: newId, ticker: normalizedTicker, buyPrice, quantity, isLoading: false };
      setStocks((prev) => [...prev, newStock]);
      setActiveStockId(newId);
      analyzeStock(newId, normalizedTicker, buyPrice, quantity);
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
    }
    setStocks((prev) => prev.filter((s) => s.id !== id));
    if (activeStockId === id) setActiveStockId(stocks.find((s) => s.id !== id)?.id ?? null);
  };
  if (!loaded) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-mono text-sm animate-pulse">Loading portfolio...</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header
        directProfitMode={directProfitMode}
        onToggleDirectProfit={() => setDirectProfitMode((p) => !p)}
        onOpenBrief={() => setBriefOpen(true)}
      />
      <EntropyBrief open={briefOpen} onClose={() => setBriefOpen(false)} stocks={stocks} />
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
            <div className="border-b border-primary/20 bg-primary/5 px-4 py-1.5 flex items-center gap-2 shrink-0">
              <RefreshCw className="h-3 w-3 text-primary animate-spin" />
              <span className="text-[10px] font-mono text-primary tracking-wider">
                UPDATING INTELLIGENCE: LIVE RECOMPUTATION IN PROGRESS
              </span>
              <div className="ml-auto h-1 w-24 rounded-full bg-primary/20 overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: "60%" }} />
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <nav data-density="compact" data-tour="tab-bar" className="border-b border-border/70 bg-surface-1/95 backdrop-blur-md sticky top-0 z-30 shrink-0">
            <div
              className="px-2 sm:container flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide relative"
              style={{ scrollSnapType: "x mandatory" }}
            >
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => handleTabSwitch(tab.id)}
                  data-tour-tab={tab.id}
                  style={{ scrollSnapAlign: "start" }}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-mono font-medium transition-all whitespace-nowrap flex-shrink-0 border-b-2 rounded-t ${
                    activeTab === tab.id
                      ? "border-foreground text-foreground bg-surface-2/60"
                      : "border-transparent text-muted-foreground/80 hover:text-foreground hover:bg-surface-2/40"
                  }`}
                >
                  <span className="sm:hidden">
                    {React.cloneElement(tab.icon as React.ReactElement, { className: "h-3 w-3" })}
                  </span>
                  <span className="hidden sm:block">{tab.icon}</span>
                  <span className="hidden sm:inline uppercase tracking-wider">{tab.label}</span>
                  <span className="sm:hidden uppercase tracking-wider">{tab.shortLabel}</span>
                </button>
              ))}
              <div className="ml-auto flex items-center gap-1.5 pl-2 pr-2 flex-shrink-0">
                <span className="relative flex h-1 w-1">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-60" />
                  <span className="relative inline-flex h-1 w-1 rounded-full bg-gain" />
                </span>
                <span className="text-[8px] font-mono text-gain/80 uppercase tracking-[0.2em]">Live</span>
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
                              <div className="flex flex-col items-center justify-center rounded-sm border border-border bg-card py-16 animate-fade-in">
                                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-sm bg-primary/10">
                                  <Activity className="h-7 w-7 text-primary" />
                                </div>
                                <h2 className="mb-2 text-base font-semibold text-foreground">Ready to Analyze</h2>
                                <p className="max-w-md text-center text-xs text-muted-foreground px-4">
                                  Enter any global asset: stocks (AAPL, TCS.NS), crypto (BTC-USD), forex (EURUSD=X), or
                                  commodities (GC=F) for deep analysis with real-time pricing.
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
            <div className="fixed inset-x-0 bottom-6 z-30 border-t border-border/80 bg-surface-1/95 backdrop-blur-xl shadow-[0_-8px_28px_hsl(var(--foreground)/0.08)]">
              <div className="grid grid-cols-2 gap-px bg-border/60">
                <Sheet>
                  <SheetTrigger asChild>
                    <button className="flex min-h-14 flex-col items-center justify-center gap-1 bg-surface-1 px-2 py-2 text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground transition-all active:bg-surface-2 active:text-foreground">
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Portfolio</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[88vw] max-w-sm border-border bg-background p-0 flex flex-col">
                    <SheetHeader className="shrink-0 border-b border-border px-3 py-2">
                      <SheetTitle className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-foreground">
                        <LayoutDashboard className="h-3.5 w-3.5 text-primary" /> Portfolio
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

                <Sheet>
                  <SheetTrigger asChild>
                    <button className="flex min-h-14 flex-col items-center justify-center gap-1 bg-surface-1 px-2 py-2 text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground transition-all active:bg-surface-2 active:text-foreground">
                      <Newspaper className="h-4 w-4" />
                      <span>News</span>
                    </button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[88vw] max-w-sm border-border bg-background p-0 flex flex-col">
                    <SheetHeader className="shrink-0 border-b border-border px-3 py-2">
                      <SheetTitle className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-foreground">
                        <Newspaper className="h-3.5 w-3.5 text-primary" /> Live Intel
                      </SheetTitle>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-auto">
                      <LiveNewsFeed ticker={analysis?.ticker} compact />
                    </div>
                  </SheetContent>
                </Sheet>

              </div>
            </div>
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
