import { useState, useCallback, useEffect, useRef } from "react";
import { Activity, LayoutDashboard, Eye, Globe, Shield, Sparkles, Target, ScatterChart } from "lucide-react";
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
import PortfolioPanel from "@/components/PortfolioPanel";
import PortfolioChart from "@/components/PortfolioChart";
import AnalysisHistory, { type HistoryEntry } from "@/components/AnalysisHistory";
import MarketOverview from "@/components/MarketOverview";
import EntropySandbox from "@/components/sandbox/EntropySandbox";
import GeopoliticalGlobe from "@/components/GeopoliticalGlobe";
import DesirableAssets from "@/components/DesirableAssets";
import RiskDashboard from "@/components/RiskDashboard";
import AugmentDashboard from "@/components/augment/AugmentDashboard";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { supabase } from "@/integrations/supabase/client";
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
  const stocksRef = useRef(stocks);
  const isMobile = useIsMobile();

  // Keep ref in sync
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);

  const activeStock = stocks.find((s) => s.id === activeStockId) ?? null;
  const isLoading = activeStock?.isLoading ?? false;
  const analysis = activeStock?.analysis ?? null;

  // Persistent real-time price subscription via server-side proxy (avoids CORS)
  useEffect(() => {
    let alive = true;

    const refreshPrices = async () => {
      const current = stocksRef.current;
      const analyzed = current.filter(s => s.analysis && !s.isLoading);
      if (analyzed.length === 0) return;

      const t = Date.now();
      const tickers = analyzed.map(s => s.ticker);

      try {
        const { data, error } = await supabase.functions.invoke("price-feed", {
          body: { tickers },
        });

        if (!alive) return;

        if (error || !data?.prices) {
          // Mark all as delayed on error
          const statusUpdates: PriceStatusMap = {};
          analyzed.forEach(stock => {
            const prev = priceStatus[stock.id];
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
            const prev = priceStatus[stock.id];
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
      } catch {
        // Silent fail — status indicators handle visibility
      }
    };

    refreshPrices();
    const interval = setInterval(refreshPrices, 8000);

    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [stocks.length]);

  const analyzeStock = useCallback(
    async (stockId: string, ticker: string, buyPrice: number, quantity: number) => {
      setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: true, analysis: null } : s)));
      try {
        const { data, error } = await supabase.functions.invoke("analyze-stock", { body: { ticker, buyPrice, quantity } });
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
    <div className="min-h-screen bg-background">
      <Header />

      {/* Tab Navigation */}
      <nav className="border-b border-border glass-panel sticky top-0 z-30">
        <div className="container flex items-center gap-0 sm:gap-0.5 overflow-x-auto py-1 scrollbar-hide relative z-10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 sm:gap-1.5 rounded-md px-2 sm:px-3 py-2 text-[10px] sm:text-xs font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? "glass-subtle glass-glow-primary text-primary"
                  : "text-muted-foreground hover:text-foreground border border-transparent"
              }`}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5 pl-2 flex-shrink-0">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gain" />
            </span>
            <span className="text-[8px] sm:text-[9px] font-mono text-muted-foreground">LIVE</span>
          </div>
        </div>
      </nav>

      <main className="container py-4 sm:py-6">
        {activeTab === "dashboard" && (
          <div className={`grid gap-4 sm:gap-6 ${isMobile ? "grid-cols-1" : "lg:grid-cols-[340px_1fr]"}`}>
            <div className="space-y-4 sm:space-y-5">
              <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />
              {stocks.length > 0 && (
                <PortfolioPanel stocks={stocks} activeStockId={activeStockId} onSelectStock={setActiveStockId} onRemoveStock={handleRemoveStock} onAddNew={() => setActiveStockId(null)} priceStatus={priceStatus} />
              )}
              {stocks.filter((s) => s.analysis).length > 1 && <PortfolioChart stocks={stocks} />}
              {analysis && <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />}
              {analysis && (
                <ProfitTaskbar ticker={analysis.ticker} currentPrice={analysis.currentPrice} buyPrice={analysis.buyPrice} quantity={analysis.quantity} suggestion={analysis.suggestion} confidence={analysis.confidence} bullRange={analysis.bullRange} bearRange={analysis.bearRange} riskLevel={analysis.riskLevel} />
              )}
              {!isMobile && <AnalysisHistory entries={history} onClear={() => setHistory([])} onSelect={() => {}} />}
            </div>
            <div className="space-y-4 sm:space-y-5">
              {!isLoading && !analysis && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-16 sm:py-24 animate-fade-in">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                    <Activity className="h-7 w-7 text-primary" />
                  </div>
                  <h2 className="mb-2 text-base sm:text-lg font-semibold text-foreground">Ready to Analyze</h2>
                  <p className="max-w-md text-center text-xs sm:text-sm text-muted-foreground px-4">
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
                  <LiveNewsFeed ticker={analysis.ticker} />
                  <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2">
                    <SimulationTable currentPrice={analysis.currentPrice} bullRange={analysis.bullRange} neutralRange={analysis.neutralRange} bearRange={analysis.bearRange} />
                    <Recommendation summary={analysis.summary} suggestion={analysis.suggestion} confidence={analysis.confidence} confidenceReasoning={analysis.confidenceReasoning} macroFactors={analysis.macroFactors} />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === "market" && <MarketOverview />}
        {activeTab === "augment" && <AugmentDashboard stocks={stocks} />}
        {activeTab === "sandbox" && <EntropySandbox stocks={stocks} />}
        {activeTab === "geopolitical" && <GeopoliticalGlobe stocks={stocks} />}
        {activeTab === "desirable" && <DesirableAssets stocks={stocks} onAddToPortfolio={handleAnalyze} />}
        {activeTab === "risk" && <RiskDashboard stocks={stocks} />}
      </main>
    </div>
  );
};

const Index = () => (
  <FXProvider>
    <IndexContent />
  </FXProvider>
);

export default Index;
