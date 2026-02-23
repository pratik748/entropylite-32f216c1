import { useState } from "react";
import Header from "@/components/Header";
import StockInput from "@/components/StockInput";
import StockSummary from "@/components/StockSummary";
import NewsImpactTable from "@/components/NewsImpactTable";
import RiskIndicator from "@/components/RiskIndicator";
import SimulationTable from "@/components/SimulationTable";
import Recommendation from "@/components/Recommendation";
import LoadingState from "@/components/LoadingState";
import UpgradeModal from "@/components/UpgradeModal";
import { demoAnalysis, demoNews } from "@/lib/demoData";

const Index = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<typeof demoAnalysis | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const handleAnalyze = (ticker: string, buyPrice: number, quantity: number) => {
    if (usageCount >= 50) {
      setShowUpgrade(true);
      return;
    }

    setIsLoading(true);
    setAnalysis(null);

    // Simulate API call — will be replaced with real backend
    setTimeout(() => {
      setAnalysis({
        ...demoAnalysis,
        ticker,
        buyPrice,
        quantity,
      });
      setUsageCount((c) => c + 1);
      setIsLoading(false);
    }, 2500);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header usageCount={usageCount} />

      <main className="container py-8">
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Left sidebar */}
          <div className="space-y-6">
            <StockInput onAnalyze={handleAnalyze} isLoading={isLoading} />

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
                  news={demoNews}
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
