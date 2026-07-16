import StockSummary from "@/components/StockSummary";
import MonteCarloChart from "@/components/MonteCarloChart";
import NewsImpactTable from "@/components/NewsImpactTable";
import SimulationTable from "@/components/SimulationTable";
import Recommendation from "@/components/Recommendation";
import RiskIndicator from "@/components/RiskIndicator";
import CompanyIntelligence from "@/components/CompanyIntelligence";
import ProfitTaskbar from "@/components/ProfitTaskbar";
import PortfolioChart from "@/components/PortfolioChart";
import PnLWaterfall from "@/components/charts/PnLWaterfall";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface DeskAnalysisStackProps {
  analysis: PortfolioStock["analysis"] | null;
  stocks: PortfolioStock[];
  isMobile: boolean;
  /** Mobile only: tapping an asset in the portfolio chart focuses it. */
  onSelectTicker?: (ticker: string) => void;
}

/**
 * The Desk's analysis pane stack — one tree serving both the mobile stacked
 * layout and the desktop center column (previously duplicated in Index.tsx).
 */
const DeskAnalysisStack = ({ analysis, stocks, isMobile, onSelectTicker }: DeskAnalysisStackProps) => {
  const multiPosition = stocks.filter((s) => s.analysis).length > 1;

  const portfolioCharts = multiPosition && (
    <div className={isMobile ? "space-y-1.5" : "grid gap-3 grid-cols-1 lg:grid-cols-2"}>
      <PortfolioChart
        stocks={stocks}
        onAssetTap={
          isMobile && onSelectTicker
            ? (ticker) => {
                onSelectTicker(ticker);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }
            : undefined
        }
      />
      <PnLWaterfall stocks={stocks} />
    </div>
  );

  return (
    <>
      {analysis && (
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
          <div className={isMobile ? "space-y-1.5" : "grid gap-3 grid-cols-1 lg:grid-cols-2"}>
            <SimulationTable
              currentPrice={analysis.currentPrice}
              bullRange={analysis.bullRange}
              neutralRange={analysis.neutralRange}
              bearRange={analysis.bearRange}
              currency={analysis.currency}
              rangeModel={analysis.rangeModel ?? null}
            />
            <Recommendation
              summary={analysis.summary}
              suggestion={analysis.suggestion}
              confidence={analysis.confidence}
              confidenceReasoning={analysis.confidenceReasoning}
              macroFactors={analysis.macroFactors}
              verdict={analysis.verdict}
              hedgeStrategy={analysis.hedgeStrategy}
              liveWebContext={analysis.liveWebContext}
            />
          </div>
        </>
      )}

      {!isMobile && portfolioCharts}

      {analysis && (
        <>
          <RiskIndicator level={analysis.riskLevel} keyRisks={analysis.keyRisks} />
          <CompanyIntelligence ticker={analysis.ticker} />
          {!isMobile && (
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
              currency={analysis.currency}
            />
          )}
        </>
      )}

      {isMobile && portfolioCharts}
    </>
  );
};

export default DeskAnalysisStack;
