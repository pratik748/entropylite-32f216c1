import { useState, useCallback } from "react";
import { Activity, LayoutDashboard, Eye, BookOpen, Shield, Globe } from "lucide-react";
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
import Watchlist from "@/components/Watchlist";
import TradeJournal from "@/components/TradeJournal";
import RiskDashboard from "@/components/RiskDashboard";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useLocalStorage } from "@/hooks/useLocalStorage";

type Tab = "dashboard" | "market" | "watchlist" | "journal" | "risk";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { id: "market", label: "Market", icon: <Globe className="h-4 w-4" /> },
  { id: "watchlist", label: "Watchlist", icon: <Eye className="h-4 w-4" /> },
  { id: "journal", label: "Trades", icon: <BookOpen className="h-4 w-4" /> },
  { id: "risk", label: "Risk", icon: <Shield className="h-4 w-4" /> },
];

const Index = () => {
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [stocks, setStocks] = useLocalStorage<PortfolioStock[]>("entropy-portfolio", []);
  const [history, setHistory] = useLocalStorage<HistoryEntry[]>("entropy-history", []);
  const [activeStockId, setActiveStockId] = useState<string | null>(null);

  const activeStock = stocks.find((s) => s.id === activeStockId) ?? null;
  const isLoading = activeStock?.isLoading ?? false;
  const analysis = activeStock?.analysis ?? null;

  const analyzeStock = useCallback(
    async (stockId: string, ticker: string, buyPrice: number, quantity: number) => {
      setStocks((prev) =>
        prev.map((s) => (s.id === stockId ? { ...s, isLoading: true, analysis: null } : s))
      );

      try {
        const { data, error } = await supabase.functions.invoke("analyze-stock", {
          body: { ticker, buyPrice, quantity },
        });

        if (error) throw error;

        const analysisData = { ...data, ticker, buyPrice, quantity };

        setStocks((prev) =>
          prev.map((s) =>
            s.id === stockId ? { ...s, isLoading: false, analysis: analysisData } : s
          )
        );

        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            ticker,
            timestamp: Date.now(),
            suggestion: data.suggestion,
            currentPrice: data.currentPrice,
            buyPrice,
            confidence: data.confidence,
          },
          ...prev.slice(0, 49),
        ]);
      } catch (err: any) {
        console.error("Analysis error:", err);
        setStocks((prev) =>
          prev.map((s) => (s.id === stockId ? { ...s, isLoading: false } : s))
        );
        toast({
          title: "Analysis Failed",
          description: err.message || "Could not analyze stock. Please try again.",
          variant: "destructive",
        });
      }
    },
    [setStocks, setHistory]
  );

  const handleAnalyze = (ticker: string, buyPrice: number, quantity: number) => {
    const existing = stocks.find((s) => s.ticker === ticker.toUpperCase());

    if (existing) {
      setStocks((prev) =>
        prev.map((s) => (s.id === existing.id ? { ...s, buyPrice, quantity } : s))
      );
      setActiveStockId(existing.id);
      analyzeStock(existing.id, ticker.toUpperCase(), buyPrice, quantity);
    } else {
      const newId = crypto.randomUUID();
      const newStock: PortfolioStock = {
        id: newId,
        ticker: ticker.toUpperCase(),
        buyPrice,
        quantity,
        isLoading: false,
      };
      setStocks((prev) => [...prev, newStock]);
      setActiveStockId(newId);
      analyzeStock(newId, ticker.toUpperCase(), buyPrice, quantity);
    }
  };

  const handleRemoveStock = (id: string) => {
    setStocks((prev) => prev.filter((s) => s.id !== id));
    if (activeStockId === id) {
      setActiveStockId(stocks.find((s) => s.id !== id)?.id ?? null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      {/* Tab Navigation */}
      <nav className="border-b border-border bg-surface-1 sticky top-0 z-30">
        <div className="container flex items-center gap-1 overflow-x-auto py-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-foreground/10 text-foreground"
                  : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="container py-6">
        {/* Dashboard Tab */}
        {activeTab === "dashboard" && (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <div className="space-y-6">
              <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />

              {stocks.length > 0 && (
                <PortfolioPanel
                  stocks={stocks}
                  activeStockId={activeStockId}
                  onSelectStock={setActiveStockId}
                  onRemoveStock={handleRemoveStock}
                  onAddNew={() => setActiveStockId(null)}
                />
              )}

              {stocks.filter((s) => s.analysis).length > 1 && (
                <PortfolioChart stocks={stocks} />
              )}

              {analysis && (
                <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />
              )}

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

              <AnalysisHistory entries={history} onClear={() => setHistory([])} onSelect={() => {}} />
            </div>

            <div className="space-y-6">
              {!isLoading && !analysis && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-24 animate-fade-in">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
                    <Activity className="h-8 w-8 text-foreground" />
                  </div>
                  <h2 className="mb-2 text-lg font-semibold text-foreground">No Analysis Yet</h2>
                  <p className="max-w-sm text-center text-sm text-muted-foreground">
                    Enter an Indian stock ticker with your buy price and quantity to get
                    AI-powered news analysis, risk assessment, and price simulations.
                  </p>
                </div>
              )}

              {isLoading && <LoadingState />}

              {analysis && !isLoading && (
                <>
                  <StockSummary
                    ticker={analysis.ticker}
                    currentPrice={analysis.currentPrice}
                    buyPrice={analysis.buyPrice}
                    quantity={analysis.quantity}
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

                  <LiveNewsFeed ticker={analysis.ticker} />

                  <div className="grid gap-6 lg:grid-cols-2">
                    <SimulationTable
                      currentPrice={analysis.currentPrice}
                      bullRange={analysis.bullRange}
                      neutralRange={analysis.neutralRange}
                      bearRange={analysis.bearRange}
                    />
                    <Recommendation
                      summary={analysis.summary}
                      suggestion={analysis.suggestion}
                      confidence={analysis.confidence}
                      confidenceReasoning={analysis.confidenceReasoning}
                      macroFactors={analysis.macroFactors}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Market Overview Tab */}
        {activeTab === "market" && <MarketOverview />}

        {/* Watchlist Tab */}
        {activeTab === "watchlist" && <Watchlist />}

        {/* Trade Journal Tab */}
        {activeTab === "journal" && <TradeJournal />}

        {/* Risk Dashboard Tab */}
        {activeTab === "risk" && <RiskDashboard stocks={stocks} />}
      </main>
    </div>
  );
};

export default Index;
