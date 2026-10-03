/**
 * SASHA High-Density Parallel Visual Card
 *
 * Tier-1 Institutional Financial Instrument Rendering.
 * Strict monochrome palette, glassmorphic obsidian styling, hairline borders,
 * Times New Roman / Serif accents, and razor-sharp tabular numbers.
 */

import React from "react";
import { Activity, ArrowDownRight, ArrowUpRight, BarChart2, CheckCircle2, ChevronRight, Layers, ShieldAlert, Sparkles, TrendingUp, Zap } from "lucide-react";
import type {
  SashaResult,
  SubsetRiskData,
  StockComparisonData,
  NewsImpactData,
  StressTestData,
  GeneralQuantData,
} from "../types";

// ── Subset Risk Card ─────────────────────────────────────────────────────────

export const SubsetRiskCard: React.FC<{ data: SubsetRiskData }> = ({ data }) => {
  return (
    <div className="space-y-4">
      {/* Top Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Annualized Vol</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.annualizedVolPct.toFixed(1)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">σ (252-day ann.)</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">1D CVaR (95%)</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-loss tabular-nums">
            -{data.cvar95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Expected Shortfall</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Sharpe Ratio</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-gain tabular-nums">
            {data.sharpeRatio.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Rf = 4.5%</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">1D VaR (95%)</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            -{data.var95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Parametric normal</span>
        </div>
      </div>

      {/* Euler Risk Shares vs Weight Breakdown */}
      <div className="rounded-lg border border-border/60 bg-surface-2/30 p-3 space-y-2.5">
        <div className="flex items-center justify-between border-b border-border/40 pb-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-muted-foreground" />
            Euler Risk Shares vs Capital Allocation
          </span>
          <span className="text-[9.5px] text-muted-foreground font-mono">
            Dominant: {data.dominantRiskTicker} ({data.dominantRiskSharePct}%)
          </span>
        </div>

        <div className="space-y-2">
          {data.eulerRiskShares.map((item) => (
            <div key={item.ticker} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="font-semibold text-foreground">{item.ticker}</span>
                <div className="flex items-center gap-3 text-[10px] tabular-nums">
                  <span className="text-muted-foreground">Wt: {item.weightPct}%</span>
                  <span className="text-muted-foreground">σ: {item.volatilityPct}%</span>
                  <span className="font-medium text-foreground">Euler Risk: {item.eulerRiskSharePct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 h-1.5 rounded-full overflow-hidden bg-surface-3/50">
                <div
                  className="bg-muted-foreground/40 h-full rounded-l-full"
                  style={{ width: `${Math.min(100, item.weightPct * 2)}%` }}
                  title={`Capital Weight: ${item.weightPct}%`}
                />
                <div
                  className="bg-foreground h-full rounded-r-full"
                  style={{ width: `${Math.min(100, item.eulerRiskSharePct * 2)}%` }}
                  title={`Euler Risk Share: ${item.eulerRiskSharePct}%`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Covariance Matrix Snippet */}
      {data.correlationMatrix && data.correlationMatrix.length > 1 && (
        <div className="rounded-lg border border-border/60 bg-surface-2/20 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            Pairwise Correlation Matrix (Ledoit–Wolf Shrunk)
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead>
                <tr>
                  <th className="text-left text-muted-foreground p-1"></th>
                  {data.tickers.map((t) => (
                    <th key={t} className="text-right text-muted-foreground font-semibold p-1">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.correlationMatrix.map((row, i) => (
                  <tr key={data.tickers[i] || i} className="border-t border-border/30">
                    <td className="text-left font-semibold text-foreground p-1">{data.tickers[i]}</td>
                    {row.map((val, j) => (
                      <td
                        key={j}
                        className={`text-right p-1 ${
                          i === j
                            ? "text-muted-foreground/50"
                            : val > 0.7
                            ? "text-loss font-semibold"
                            : val < 0.2
                            ? "text-gain"
                            : "text-foreground"
                        }`}
                      >
                        {val.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Stock Comparison & Pairs Trading Card ────────────────────────────────────

export const StockComparisonCard: React.FC<{ data: StockComparisonData }> = ({ data }) => {
  return (
    <div className="space-y-4">
      {/* Head-to-Head Header Bar */}
      <div className="grid grid-cols-2 gap-2 border-b border-border/60 pb-3">
        <div className="p-2 rounded-md bg-surface-2/40 border border-border/50">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-foreground">{data.tickerA}</span>
            <span className="font-mono text-[12px] text-foreground tabular-nums">${data.lastPriceA}</span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{data.nameA}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctA >= 0 ? "text-gain" : "text-loss"}>
              1M: {data.momentum.return1mPctA >= 0 ? "+" : ""}{data.momentum.return1mPctA}%
            </span>
            <span className="text-muted-foreground">σ: {data.momentum.volatilityAnnualPctA}%</span>
          </div>
        </div>

        <div className="p-2 rounded-md bg-surface-2/40 border border-border/50">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-foreground">{data.tickerB}</span>
            <span className="font-mono text-[12px] text-foreground tabular-nums">${data.lastPriceB}</span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{data.nameB}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctB >= 0 ? "text-gain" : "text-loss"}>
              1M: {data.momentum.return1mPctB >= 0 ? "+" : ""}{data.momentum.return1mPctB}%
            </span>
            <span className="text-muted-foreground">σ: {data.momentum.volatilityAnnualPctB}%</span>
          </div>
        </div>
      </div>

      {/* Regression & Cointegration Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Correlation (r)</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.correlation.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Pearson realized</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Beta (β)</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.betaRegression.beta.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">R² = {data.betaRegression.rSquared.toFixed(2)}</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cointegration</span>
          <span className={`mt-0.5 block font-mono text-[14px] font-medium tabular-nums ${data.cointegration.isCointegrated ? "text-gain" : "text-muted-foreground"}`}>
            {data.cointegration.isCointegrated ? "Stationary (✓)" : "Non-Stationary"}
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">p = {data.cointegration.pValue.toFixed(3)}</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mean-Rev Half-Life</span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.cointegration.halfLifeDays.toFixed(1)}d
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Ornstein–Uhlenbeck τ</span>
        </div>
      </div>

      {/* Relative Valuation Spread Status */}
      <div className="rounded-lg border border-border/60 bg-surface-2/30 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground">
            Price Ratio Spread ({data.tickerA} / {data.tickerB})
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            Z-Score: <strong className="text-foreground">{data.valuationSpread.spreadZScore.toFixed(2)}σ</strong> (P{data.valuationSpread.percentileRank})
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10.5px] font-mono pt-1">
          <div className="bg-surface-3/50 p-2 rounded border border-border/40">
            <span className="block text-muted-foreground text-[9px]">Current Ratio</span>
            <span className="text-foreground font-semibold">{data.valuationSpread.currentRatio.toFixed(3)}</span>
          </div>
          <div className="bg-surface-3/50 p-2 rounded border border-border/40">
            <span className="block text-muted-foreground text-[9px]">Mean Ratio</span>
            <span className="text-foreground font-semibold">{data.valuationSpread.meanRatio.toFixed(3)}</span>
          </div>
          <div className="bg-surface-3/50 p-2 rounded border border-border/40">
            <span className="block text-muted-foreground text-[9px]">Hedge Ratio (β_EG)</span>
            <span className="text-foreground font-semibold">{data.cointegration.hedgeRatio.toFixed(3)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── News Impact Card ─────────────────────────────────────────────────────────

export const NewsImpactCard: React.FC<{ data: NewsImpactData }> = ({ data }) => {
  return (
    <div className="space-y-4">
      {/* Signal / Noise & Sentiment Bar */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Signal-to-Noise Score</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[18px] font-bold text-foreground tabular-nums">
              {data.signalToNoiseScore}
            </span>
            <span className="text-[10px] text-muted-foreground">/ 100 (Institutional grade)</span>
          </div>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Net Causal Sentiment</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`font-mono text-[18px] font-bold tabular-nums ${data.sentimentScore >= 0 ? "text-gain" : "text-loss"}`}>
              {data.sentimentScore >= 0 ? "+" : ""}{data.sentimentScore.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground">Drift Index</span>
          </div>
        </div>
      </div>

      {/* 1st vs 2nd Order Transmission Channels */}
      <div className="space-y-2 rounded-lg border border-border/60 bg-surface-2/30 p-3">
        <div>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-foreground mb-0.5">
            1st-Order Direct Macro Impact
          </span>
          <p className="text-[12px] leading-snug text-foreground/90 font-serif">
            {data.firstOrderMacro}
          </p>
        </div>

        <div className="border-t border-border/40 pt-2">
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-0.5">
            2nd-Order Sector Transmission
          </span>
          <p className="text-[12px] leading-snug text-muted-foreground font-serif">
            {data.secondOrderTransmission}
          </p>
        </div>
      </div>

      {/* Exposed Portfolio Holdings */}
      {data.exposedPositionsInPortfolio.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-surface-2/20 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            Exposed Positions in Portfolio
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.exposedPositionsInPortfolio.map((pos) => (
              <span
                key={pos.ticker}
                className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-surface-3/70 px-2 py-0.5 text-[10.5px] font-mono"
              >
                <strong className="text-foreground">{pos.ticker}</strong>
                <span className="text-[9.5px] text-loss">({pos.estimatedSensitivity} sensitivity)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Stress Test Card ────────────────────────────────────────────────────────

export const StressTestCard: React.FC<{ data: StressTestData }> = ({ data }) => {
  return (
    <div className="space-y-4">
      {/* Top Headline Stress Numbers */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Portfolio Drawdown</span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-loss tabular-nums">
            {data.portfolioDrawdownPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Estimated P&L shift</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Estimated Loss</span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-loss tabular-nums">
            -${data.estimatedLossBase.toLocaleString()}
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Base currency</span>
        </div>

        <div className="rounded-lg border border-border/60 bg-surface-2/40 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Resilience Grade</span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-foreground tabular-nums">
            {data.resilienceGrade}
          </span>
          <span className="text-[9.5px] text-muted-foreground/70">Parametric stress</span>
        </div>
      </div>

      {/* Worst-Hit Positions Breakdown */}
      <div className="rounded-lg border border-border/60 bg-surface-2/30 p-3 space-y-2">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-foreground border-b border-border/40 pb-1">
          Downside Absorption by Position
        </span>
        <div className="space-y-1.5">
          {data.worstHitAssets.slice(0, 5).map((asset) => (
            <div key={asset.ticker} className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-semibold text-foreground">{asset.ticker} (β={asset.beta})</span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-loss">{asset.shockImpactPct.toFixed(2)}% shock</span>
                <span className="text-muted-foreground text-[10px]">-${asset.lossValueBase.toFixed(0)}</span>
                <span className="font-medium text-foreground">{asset.lossSharePct}% of total loss</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rebalance Suggestion */}
      <div className="rounded-lg border border-border/60 bg-surface-2/20 p-2.5 flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          <strong className="text-foreground">Hedging Strategy:</strong> {data.rebalanceSuggestion}
        </p>
      </div>
    </div>
  );
};

// ── General Quant Card ──────────────────────────────────────────────────────

export const GeneralQuantCard: React.FC<{ data: GeneralQuantData }> = ({ data }) => {
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] leading-relaxed text-foreground font-serif">
        {data.summary}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {data.metrics.map((m, idx) => (
          <div key={idx} className="rounded-lg border border-border/60 bg-surface-2/40 p-2">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{m.label}</span>
            <span className="mt-0.5 block font-mono text-[14px] font-semibold text-foreground tabular-nums">
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Root Card Dispatcher ────────────────────────────────────────────────────

export const SashaVisualCard: React.FC<{ result: SashaResult }> = ({ result }) => {
  return (
    <div className="rounded-xl border border-border/70 bg-card/95 backdrop-blur-md p-4 shadow-soft space-y-3 text-left">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-surface-3 text-[10px] font-bold font-serif text-foreground">
            S
          </span>
          <h3 className="font-serif text-[14px] font-semibold tracking-tight text-foreground">
            {result.headline}
          </h3>
        </div>
        <div className="flex items-center gap-2 text-[9.5px] font-mono text-muted-foreground/70">
          <span>{result.executionTimeMs}ms</span>
          <span>•</span>
          <span className="truncate max-w-[140px]">{result.source}</span>
        </div>
      </div>

      {/* Spoken Punchline Highlight */}
      <div className="rounded-lg border-l-2 border-foreground bg-surface-2/40 px-3 py-2">
        <p className="text-[12px] font-medium leading-snug text-foreground/90 font-serif">
          "{result.spokenPunchline}"
        </p>
      </div>

      {/* Dynamic Quantitative Payload */}
      {result.cardType === "subset_risk" && <SubsetRiskCard data={result.cardData as SubsetRiskData} />}
      {result.cardType === "stock_comparison" && <StockComparisonCard data={result.cardData as StockComparisonData} />}
      {result.cardType === "news_impact" && <NewsImpactCard data={result.cardData as NewsImpactData} />}
      {result.cardType === "stress_test" && <StressTestCard data={result.cardData as StressTestData} />}
      {result.cardType === "general_quant" && <GeneralQuantCard data={result.cardData as GeneralQuantData} />}
    </div>
  );
};
