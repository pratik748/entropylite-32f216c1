import { useState, useCallback, useEffect, useRef, useMemo, lazy, Suspense, memo } from "react";
import { Activity, LayoutDashboard, Eye, Globe, Shield, Sparkles, Target, ScatterChart } from "lucide-react";
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
import AnalysisHistory, { type HistoryEntry } from "@/components/AnalysisHistory";
import MarketOverview from "@/components/MarketOverview";
import EntropySandbox from "@/components/sandbox/EntropySandbox";
import StatArbEngine from "@/components/sandbox/StatArbEngine";
import GeopoliticalGlobe from "@/components/GeopoliticalGlobe";
import DesirableAssets from "@/components/DesirableAssets";
import RiskDashboard from "@/components/RiskDashboard";
import AugmentDashboard from "@/components/augment/AugmentDashboard";
import TickerStrip from "@/components/terminal/TickerStrip";
import SystemStatusBar from "@/components/terminal/SystemStatusBar";
import PortfolioBlotter from "@/components/terminal/PortfolioBlotter";
import FlowDetectionPanel from "@/components/terminal/FlowDetectionPanel";
import PanelWrapper from "@/components/terminal/PanelWrapper";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { supabase } from "@/integrations/supabase/client";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useIsMobile } from "@/hooks/use-mobile";
import { FXProvider } from "@/hooks/useFX";

type Tab = "dashboard" | "market" | "sandbox" | "statarb" | "augment" | "geopolitical" | "desirable" | "risk";

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
];

const IndexContent = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [stocks, setStocks] = useLocalStorage<PortfolioStock[]>("entropy-portfolio", []);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("entropy-history", []);
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [priceStatus, setPriceStatus] = useState<PriceStatusMap>({});
  const priceStatusRef = useRef(priceStatus);
  const isMobile = useIsMobile();

  const stocksRef = useRef(stocks);
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => { priceStatusRef.current = priceStatus; }, [priceStatus]);

  const activeStock = stocks.find((s) => s.id === activeStockId) ?? null;
  const isLoading = activeStock?.isLoading ?? false;
  const analysis = activeStock?.analysis ?? null;

  // Real-time price subscription
  useEffect(() => {
    let alive = true;
    const refreshPrices = async () => {
      const current = stocksRef.current;
      const analyzed = current.filter(s => s.analysis && !s.isLoading);
      if (analyzed.length === 0) return;
      const t = Date.now();
      const tickers = analyzed.map(s => s.ticker);
      try {
        const { data, error } = await governedInvoke("price-feed", { body: { tickers } });
        if (!alive) return;
        if (error || !data?.prices) {
          const statusUpdates: PriceStatusMap = {};
          analyzed.forEach(stock => {
            const prev = priceStatusRef.current[stock.id];
            const failCount = (prev?.failCount || 0) + 1;
            statusUpdates[stock.id] = { lastUpdate: prev?.lastUpdate || 0, status: failCount >= 3 ? "DISCONNECTED" : "DELAYED", failCount };
          });
          setPriceStatus(prev => ({ ...prev, ...statusUpdates }));
          return;
        }
        const updates: Record<string, number> = {};
        const statusUpdates: PriceStatusMap = {};
        analyzed.forEach(stock => {
          const priceData = data.prices[stock.ticker];
          if (priceData?.price && priceData.price > 0) {
            updates[stock.id] = priceData.price;
            statusUpdates[stock.id] = { lastUpdate: t, status: "LIVE", failCount: 0 };
          } else {
            const prev = priceStatusRef.current[stock.id];
            const failCount = (prev?.failCount || 0) + 1;
            statusUpdates[stock.id] = { lastUpdate: prev?.lastUpdate || 0, status: failCount >= 3 ? "DISCONNECTED" : "DELAYED", failCount };
          }
        });
        if (Object.keys(updates).length > 0) {
          setStocks(prev => prev.map(s => {
            if (updates[s.id] && s.analysis) {
              return { ...s, analysis: { ...s.analysis, currentPrice: updates[s.id] } };
            }
            return s;
          }));
        }
        setPriceStatus(prev => ({ ...prev, ...statusUpdates }));
      } catch { /* silent */ }
    };
    refreshPrices();
    const interval = setInterval(refreshPrices, 15000); // Slowed from 8s, governor caches
    return () => { alive = false; clearInterval(interval); };
  }, [stocks.length]);

  const analyzeStock = useCallback(
    async (stockId: string, ticker: string, buyPrice: number, quantity: number) => {
      setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: true, analysis: null } : s)));
      try {
        const { data, error } = await governedInvoke("analyze-stock", { body: { ticker, buyPrice, quantity } });
        if (error) throw error;
        const analysisData = { ...data, ticker, buyPrice, quantity };
        setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: false, analysis: analysisData } : s)));
        setPriceStatus(prev => ({ ...prev, [stockId]: { lastUpdate: Date.now(), status: "LIVE", failCount: 0 } }));
        setHistory((prev) => [
          { id: crypto.randomUUID(), ticker, timestamp: Date.now(), suggestion: data.suggestion, currentPrice: data.currentPrice, buyPrice, confidence: data.confidence },
          ...prev.slice(0, 49),
        ]);
      } catch (err: any) {
        console.error("Analysis error:", err);
        setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: false } : s)));
        toast({ title: "Analysis Failed", description: err.message || "Could not analyze.", variant: "destructive" });
      }
    },
    [setStocks, setHistory]
  );

  const handleAnalyze = (ticker: string, buyPrice: number, quantity: number) => {
    const existing = stocks.find((s) => s.ticker === ticker.toUpperCase());
    if (existing) {
      setStocks((prev) => prev.map((s) => (s.id === existing.id ? { ...s, buyPrice, quantity } : s)));
      setActiveStockId(existing.id);
      analyzeStock(existing.id, ticker.toUpperCase(), buyPrice, quantity);
    } else {
      const newId = crypto.randomUUID();
      const newStock: PortfolioStock = { id: newId, ticker: ticker.toUpperCase(), buyPrice, quantity, isLoading: false };
      setStocks((prev) => [...prev, newStock]);
      setActiveStockId(newId);
      analyzeStock(newId, ticker.toUpperCase(), buyPrice, quantity);
    }
  };

  const handleRemoveStock = (id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
    if (activeStockId === id) setActiveStockId(stocks.find((s) => s.id !== id)?.id ?? null);
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <Header />

      {/* Tab Navigation */}
      <nav className="border-b border-border glass-panel sticky top-0 z-30 shrink-0">
        <div className="px-1 sm:container flex items-center gap-0 overflow-x-auto py-0.5 sm:py-1 scrollbar-hide relative z-10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-md px-1.5 sm:px-3 py-1.5 sm:py-2 text-[9px] sm:text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? "glass-subtle glass-glow-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              <span className="sm:hidden">{React.cloneElement(tab.icon as React.ReactElement, { className: "h-3 w-3" })}</span>
              <span className="hidden sm:block">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 pl-1 flex-shrink-0">
            <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-gain" />
            </span>
            <span className="text-[7px] sm:text-[9px] font-mono text-muted-foreground">LIVE</span>
          </div>
        </div>
      </nav>

      {/* Global Ticker Strip */}
      <TickerStrip />

      {/* Main Content — fills all remaining space, above the status bar */}
      <main className="flex-1 min-h-0 pb-8 sm:pb-6 overflow-auto">
        {activeTab === "dashboard" && (
          isMobile ? (
            /* Mobile: stacked layout */
            <div className="p-2 space-y-2 pb-12">
              <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />
              {isLoading && <LoadingState />}
              {analysis && !isLoading && (
                <>
                  <StockSummary ticker={analysis.ticker} currentPrice={analysis.currentPrice} buyPrice={analysis.buyPrice} quantity={analysis.quantity} currency={analysis.currency} />
                  <MonteCarloChart currentPrice={analysis.currentPrice} bullRange={analysis.bullRange} bearRange={analysis.bearRange} ticker={analysis.ticker} />
                  <NewsImpactTable news={analysis.news || []} overallSentiment={analysis.overallSentiment} totalPressure={analysis.totalPressure} />
                  <SimulationTable currentPrice={analysis.currentPrice} bullRange={analysis.bullRange} neutralRange={analysis.neutralRange} bearRange={analysis.bearRange} currency={analysis.currency} />
                  <Recommendation summary={analysis.summary} suggestion={analysis.suggestion} confidence={analysis.confidence} confidenceReasoning={analysis.confidenceReasoning} macroFactors={analysis.macroFactors} />
                  <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />
                  <LiveNewsFeed ticker={analysis.ticker} compact />
                </>
              )}
              {stocks.filter((s) => s.analysis).length > 1 && <PortfolioChart stocks={stocks} />}
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
                      {!isLoading && !analysis && (
                        <div className="flex flex-col items-center justify-center rounded border border-border bg-card py-16 animate-fade-in">
                          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <Activity className="h-7 w-7 text-primary" />
                          </div>
                          <h2 className="mb-2 text-base font-semibold text-foreground">Ready to Analyze</h2>
                          <p className="max-w-md text-center text-xs text-muted-foreground px-4">
                            Enter any global asset — stocks (AAPL, TCS.NS), crypto (BTC-USD), forex (EURUSD=X), or commodities (GC=F) — for deep analysis with real-time pricing.
                          </p>
                        </div>
                      )}
                      {isLoading && <LoadingState />}
                      {analysis && !isLoading && (
                        <>
                          <StockSummary ticker={analysis.ticker} currentPrice={analysis.currentPrice} buyPrice={analysis.buyPrice} quantity={analysis.quantity} currency={analysis.currency} />
                          <MonteCarloChart currentPrice={analysis.currentPrice} bullRange={analysis.bullRange} bearRange={analysis.bearRange} ticker={analysis.ticker} />
                          <NewsImpactTable news={analysis.news || []} overallSentiment={analysis.overallSentiment} totalPressure={analysis.totalPressure} />
                          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                            <SimulationTable currentPrice={analysis.currentPrice} bullRange={analysis.bullRange} neutralRange={analysis.neutralRange} bearRange={analysis.bearRange} currency={analysis.currency} />
                            <Recommendation summary={analysis.summary} suggestion={analysis.suggestion} confidence={analysis.confidence} confidenceReasoning={analysis.confidenceReasoning} macroFactors={analysis.macroFactors} />
                          </div>
                        </>
                      )}
                      {stocks.filter((s) => s.analysis).length > 1 && <PortfolioChart stocks={stocks} />}
                      {analysis && <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />}
                      {analysis && (
                        <ProfitTaskbar ticker={analysis.ticker} currentPrice={analysis.currentPrice} buyPrice={analysis.buyPrice} quantity={analysis.quantity} suggestion={analysis.suggestion} confidence={analysis.confidence} bullRange={analysis.bullRange} bearRange={analysis.bearRange} riskLevel={analysis.riskLevel} />
                      )}
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  {/* Bottom center: History (collapsible) */}
                  {history.length > 0 && (
                    <ResizablePanel defaultSize={35} minSize={15}>
                      <PanelWrapper title="Analysis History" noPad collapsible defaultCollapsed>
                        <AnalysisHistory entries={history} onClear={() => setHistory([])} onSelect={() => {}} />
                      </PanelWrapper>
                    </ResizablePanel>
                  )}
                </ResizablePanelGroup>
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Right: News + Flow Detection */}
              <ResizablePanel defaultSize={23} minSize={15} maxSize={35}>
                <ResizablePanelGroup direction="vertical">
                  <ResizablePanel defaultSize={55} minSize={20}>
                    <PanelWrapper title="Live Intel" icon={<Activity className="h-3 w-3" />} noPad>
                      <LiveNewsFeed ticker={analysis?.ticker} compact />
                    </PanelWrapper>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  <ResizablePanel defaultSize={45} minSize={20}>
                    <PanelWrapper title="Flow Detection" icon={<Eye className="h-3 w-3" />} noPad>
                      <FlowDetectionPanel stocks={stocks} />
                    </PanelWrapper>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
          )
        )}

        {activeTab === "market" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><MarketOverview /></div>}
        {activeTab === "augment" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><AugmentDashboard stocks={stocks} /></div>}
        {activeTab === "sandbox" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><EntropySandbox stocks={stocks} /></div>}
        {activeTab === "statarb" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><StatArbEngine stocks={stocks} /></div>}
        {activeTab === "geopolitical" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><GeopoliticalGlobe stocks={stocks} /></div>}
        {activeTab === "desirable" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><DesirableAssets stocks={stocks} onAddToPortfolio={handleAnalyze} /></div>}
        {activeTab === "risk" && <div className="px-2 sm:container py-2 sm:py-4 pb-12"><RiskDashboard stocks={stocks} /></div>}
      </main>

      {/* System Status Bar */}
      <SystemStatusBar stockCount={stocks.filter(s => s.analysis).length} />
    </div>
  );
};

const Index = () => (
  <FXProvider>
    <IndexContent />
  </FXProvider>
);

export default Index;
