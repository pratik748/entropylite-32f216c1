import { useState, useCallback } from "react";
import Header from "@/components/Header";
import StockInput from "@/components/StockInput";
import StockSummary from "@/components/StockSummary";
import NewsImpactTable from "@/components/NewsImpactTable";
import RiskIndicator from "@/components/RiskIndicator";
import SimulationTable from "@/components/SimulationTable";
import Recommendation from "@/components/Recommendation";
import LoadingState from "@/components/LoadingState";
import UpgradeModal from "@/components/UpgradeModal";
import PortfolioPanel from "@/components/PortfolioPanel";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const Index = () => {
  const [stocks, setStocks] = useState<PortfolioStock[]>([]);
  const [activeStockId, setActiveStockId] = useState<string | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

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

        setStocks((prev) =>
          prev.map((s) =>
            s.id === stockId
              ? { ...s, isLoading: false, analysis: { ...data, ticker, buyPrice, quantity } }
              : s
          )
        );
        setUsageCount((c) => c + 1);
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
    []
  );

  const handleAnalyze = (ticker: string, buyPrice: number, quantity: number) => {
    if (usageCount >= 50) {
      setShowUpgrade(true);
      return;
    }

    // Check if stock already exists in portfolio
    const existing = stocks.find(
      (s) => s.ticker === ticker.toUpperCase()
    );

    if (existing) {
      // Update and re-analyze
      setStocks((prev) =>
        prev.map((s) =>
          s.id === existing.id ? { ...s, buyPrice, quantity } : s
        )
      );
      setActiveStockId(existing.id);
      analyzeStock(existing.id, ticker.toUpperCase(), buyPrice, quantity);
    } else {
      // Add new stock to portfolio
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

  const handleAddNew = () => {
    // Just scroll to / focus on the input — handled by clearing active
    setActiveStockId(null);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header usageCount={usageCount} />

      <main className="container py-8">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left sidebar */}
          <div className="space-y-6">
            <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />

            {stocks.length > 0 && (
              <PortfolioPanel
                stocks={stocks}
                activeStockId={activeStockId}
                onSelectStock={setActiveStockId}
                onRemoveStock={handleRemoveStock}
                onAddNew={handleAddNew}
              />
            )}

            {analysis && (
              <RiskIndicator
                level={analysis.riskLevel}
                keyRisks={analysis.keyRisks}
              />
            )}
          </div>

          {/* Main content */}
          <div className="space-y-6">
            {!isLoading && !analysis && (
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card py-24 animate-fade-in">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2">
                  <span className="text-3xl">📊</span>
                </div>
                <h2 className="mb-2 text-lg font-semibold text-foreground">
                  No Analysis Yet
                </h2>
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

                <NewsImpactTable
                  news={analysis.news || []}
                  overallSentiment={analysis.overallSentiment}
                  totalPressure={analysis.totalPressure}
                />

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
      </main>

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} />
    </div>
  );
};

export default Index;
