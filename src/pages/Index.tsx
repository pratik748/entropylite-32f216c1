import { useState, useCallback, useEffect, useRef } from "react";
import { Activity, LayoutDashboard, Eye, Globe, Shield, Sparkles, Target } from "lucide-react";
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

type Tab = "dashboard" | "market" | "sandbox" | "augment" | "geopolitical" | "desirable" | "risk";

const tabs: { id: Tab; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", shortLabel: "Dash", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { id: "market", label: "Markets", shortLabel: "Mkt", icon: <Globe className="h-3.5 w-3.5" /> },
  { id: "geopolitical", label: "Geopolitics", shortLabel: "Geo", icon: <Globe className="h-3.5 w-3.5" /> },
  { id: "desirable", label: "Desirable", shortLabel: "Picks", icon: <Target className="h-3.5 w-3.5" /> },
  { id: "sandbox", label: "Sandbox", shortLabel: "Sim", icon: <Eye className="h-3.5 w-3.5" /> },
  { id: "augment", label: "Augment", shortLabel: "Aug", icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: "risk", label: "Risk", shortLabel: "Risk", icon: <Shield className="h-3.5 w-3.5" /> },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [stocks, setStocks] = useLocalStorage<PortfolioStock[]>("entropy-portfolio", []);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("entropy-history", []);
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const priceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMobile = useIsMobile();

  const activeStock = stocks.find((s) => s.id === activeStockId) ?? null;
  const isLoading = activeStock?.isLoading ?? false;
  const analysis = activeStock?.analysis ?? null;

  // Real-time price streaming via polling every 10s
  useEffect(() => {
    const refreshPrices = async () => {
      const analyzed = stocks.filter(s => s.analysis && !s.isLoading);
      if (analyzed.length === 0) return;
      const t = Date.now();
      const updates: Record<string, number> = {};
      await Promise.allSettled(
        analyzed.map(async (stock) => {
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(stock.ticker)}?interval=1d&range=1d&_t=${t}`;
            const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache, no-store" } });
            const data = await res.json();
            const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
            if (price && price > 0) updates[stock.id] = price;
          } catch { /* silent */ }
        })
      );
      if (Object.keys(updates).length > 0) {
        setStocks(prev => prev.map(s => {
          if (updates[s.id] && s.analysis) return { ...s, analysis: { ...s.analysis, currentPrice: updates[s.id] } };
          return s;
        }));
      }
    };
    priceIntervalRef.current = setInterval(refreshPrices, 10000);
    return () => { if (priceIntervalRef.current) clearInterval(priceIntervalRef.current); };
  }, [stocks.length]);

  const analyzeStock = useCallback(
    async (stockId: string, ticker: string, buyPrice: number, quantity: number) => {
      setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: true, analysis: null } : s)));
      try {
        const { data, error } = await supabase.functions.invoke("analyze-stock", { body: { ticker, buyPrice, quantity } });
        if (error) throw error;
        const analysisData = { ...data, ticker, buyPrice, quantity };
        setStocks((prev) => prev.map((s) => (s.id === stockId ? { ...s, isLoading: false, analysis: analysisData } : s)));
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

      {/* Tab Navigation — Apple aesthetic */}
      <nav className="border-b border-border/30 sticky top-0 z-30 glass-panel">
        <div className="container flex items-center gap-0.5 overflow-x-auto py-1.5 scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-300 whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground/80"
              }`}
            >
              <span className={`transition-transform duration-300 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-105'}`}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.shortLabel}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pl-3 flex-shrink-0">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gain" />
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/50 tracking-wider">LIVE</span>
          </div>
        </div>
      </nav>

      <main className="container py-4 sm:py-6">
        {activeTab === "dashboard" && (
          <div className={`grid gap-4 sm:gap-6 ${isMobile ? "grid-cols-1" : "lg:grid-cols-[340px_1fr]"}`}>
            <div className="space-y-4 sm:space-y-5">
              <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />
              {stocks.length > 0 && (
                <PortfolioPanel stocks={stocks} activeStockId={activeStockId} onSelectStock={setActiveStockId} onRemoveStock={handleRemoveStock} onAddNew={() => setActiveStockId(null)} />
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
              <div className="flex flex-col items-center justify-center rounded-2xl glass-card py-20 sm:py-28 apple-appear">
                  <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-primary/8 ring-1 ring-primary/10">
                    <Activity className="h-7 w-7 text-primary/80" />
                  </div>
                  <h2 className="mb-2 text-lg font-semibold tracking-tight text-foreground">Ready to Analyze</h2>
                  <p className="max-w-sm text-center text-[13px] leading-relaxed text-muted-foreground px-6">
                    Enter any global asset — stocks, crypto, forex, or commodities — for deep intelligence with real-time pricing.
                  </p>
                </div>
              )}
              {isLoading && <LoadingState />}
              {analysis && !isLoading && (
                <>
                  <StockSummary ticker={analysis.ticker} currentPrice={analysis.currentPrice} buyPrice={analysis.buyPrice} quantity={analysis.quantity} />
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

export default Index;
