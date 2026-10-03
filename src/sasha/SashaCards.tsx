/**
 * SASHA High-Density Quantitative Cards (SashaCards)
 *
 * Tier-1 Institutional Financial Instrument Rendering.
 * Strict monochrome palette, hairline borders, Times New Roman accents,
 * razor-sharp tabular numbers, interactive SVG Causal Transmission DAGs,
 * Euler risk waterfalls, and Cointegration sparklines.
 *
 * Zero AI marketing slop or promotional slogans. Pure quantitative utility.
 */

import React from "react";
import {
  CheckCircle2,
  ChevronRight,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Radio,
  FileSearch,
  ExternalLink,
} from "lucide-react";
import type {
  SashaResult,
  SingleStockData,
  SubsetRiskData,
  StockComparisonData,
  NewsImpactData,
  StressTestData,
  GeneralQuantData,
} from "./types";
import type { GoogleGroundingResult } from "./googleSearchProxy";
import { useSasha } from "./SashaProvider";
import { CausalDAGViewer } from "./CausalDAGViewer";
import { SpreadSparkline } from "./SpreadSparkline";
import { EulerRiskChart } from "./EulerRiskChart";

// ── 1. Subset Risk & Euler Attribution Card ──────────────────────────────────

export const SubsetRiskCard: React.FC<{ data: SubsetRiskData }> = ({ data }) => {
  const { handleAction } = useSasha();

  return (
    <div className="space-y-3.5 text-left">
      {/* Top Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Annualized Vol (σ)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.annualizedVolPct.toFixed(1)}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">252-day ann.</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            1D CVaR (95%)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-red-400 tabular-nums">
            -{data.cvar95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Expected Shortfall</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Sharpe Ratio
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-emerald-400 tabular-nums">
            {data.sharpeRatio.toFixed(2)}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Rf = 4.5%</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            1D VaR (95%)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            -{data.var95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Parametric normal</span>
        </div>
      </div>

      {/* Euler Risk Attribution Chart */}
      <EulerRiskChart
        shares={data.eulerRiskShares}
        dominantTicker={data.dominantRiskTicker}
      />

      {/* CLANK Structural Constraints */}
      {data.clankConstraints && data.clankConstraints.length > 0 && (
        <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono border-b border-border/50 pb-1">
            <span>CLANK Structural Constraints</span>
            <span className="text-muted-foreground/60 font-mono">Kinetic Liquidity</span>
          </div>
          <div className="space-y-1">
            {data.clankConstraints.map((c) => (
              <div key={c.id} className="flex items-start justify-between text-[11px] gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      c.severity === "high" ? "bg-red-400" : c.severity === "medium" ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  <span className="font-medium text-foreground">{c.label}:</span>
                  <span className="text-muted-foreground text-[10.5px] font-serif">{c.detail}</span>
                </div>
                <span className="font-mono text-[10px] text-foreground shrink-0">{c.metricValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correlation Matrix Snippet */}
      {data.correlationMatrix && data.correlationMatrix.length > 1 && (
        <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono mb-1.5">
            Pairwise Correlation Matrix (Ledoit–Wolf Shrunk)
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead>
                <tr>
                  <th className="text-left text-muted-foreground/60 p-1"></th>
                  {data.tickers.map((t) => (
                    <th key={t} className="text-right text-muted-foreground font-semibold p-1">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.correlationMatrix.map((row, i) => (
                  <tr key={data.tickers[i] || i} className="border-t border-border/40">
                    <td className="text-left font-semibold text-foreground p-1">{data.tickers[i]}</td>
                    {row.map((val, j) => (
                      <td
                        key={j}
                        className={`text-right p-1 ${
                          i === j
                            ? "text-muted-foreground/40"
                            : val > 0.7
                            ? "text-red-400 font-semibold"
                            : val < 0.2
                            ? "text-emerald-400"
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

      {/* 1-Click Interactive Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleAction("risk_lab")}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-surface-3 transition-colors"
        >
          <Sliders className="h-3 w-3 text-muted-foreground" />
          Inspect in Risk Lab
        </button>
        <button
          type="button"
          onClick={() => handleAction("fortress")}
          className="pressable flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-surface-2 transition-colors"
        >
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          Fortress Stress Mode
        </button>
      </div>
    </div>
  );
};

// ── 2. Stock Comparison & Pairs Trading Card ──────────────────────────────────

export const StockComparisonCard: React.FC<{ data: StockComparisonData }> = ({ data }) => {
  const { handleAction } = useSasha();

  return (
    <div className="space-y-3.5 text-left">
      {/* Head-to-Head Header Bar */}
      <div className="grid grid-cols-2 gap-2 border-b border-border/60 pb-2.5">
        <div className="p-2.5 rounded-lg bg-surface-2/60 border border-border/70">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-foreground">{data.tickerA}</span>
            <span className="font-mono text-[12.5px] text-foreground tabular-nums">${data.lastPriceA}</span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate font-serif">{data.nameA}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctA >= 0 ? "text-emerald-400" : "text-red-400"}>
              1M: {data.momentum.return1mPctA >= 0 ? "+" : ""}{data.momentum.return1mPctA}%
            </span>
            <span className="text-muted-foreground/60">σ: {data.momentum.volatilityAnnualPctA}%</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-surface-2/60 border border-border/70">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-foreground">{data.tickerB}</span>
            <span className="font-mono text-[12.5px] text-foreground tabular-nums">${data.lastPriceB}</span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate font-serif">{data.nameB}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctB >= 0 ? "text-emerald-400" : "text-red-400"}>
              1M: {data.momentum.return1mPctB >= 0 ? "+" : ""}{data.momentum.return1mPctB}%
            </span>
            <span className="text-muted-foreground/60">σ: {data.momentum.volatilityAnnualPctB}%</span>
          </div>
        </div>
      </div>

      {/* Regression & Cointegration Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Correlation (r)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.correlation.toFixed(2)}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Pearson</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Beta (β)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.betaRegression.beta.toFixed(2)}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">R² = {data.betaRegression.rSquared.toFixed(2)}</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Cointegration (ADF)
          </span>
          <span
            className={`mt-0.5 block font-mono text-[13.5px] font-medium tabular-nums ${
              data.cointegration.isCointegrated ? "text-emerald-400" : "text-muted-foreground"
            }`}
          >
            {data.cointegration.isCointegrated ? "Stationary (✓)" : "Non-Stationary"}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">p = {data.cointegration.pValue.toFixed(3)}</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            OU Half-Life (τ)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.cointegration.halfLifeDays.toFixed(1)}d
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Mean reversion</span>
        </div>
      </div>

      {/* Spread Sparkline & Z-Score Chart */}
      <SpreadSparkline
        sparkline={data.spreadSparkline}
        zScore={data.valuationSpread.spreadZScore}
        tickerA={data.tickerA}
        tickerB={data.tickerB}
        halfLifeDays={data.cointegration.halfLifeDays}
      />

      {/* Ratio Stats */}
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <div className="bg-surface-2/50 p-2 rounded border border-border/70">
          <span className="block text-muted-foreground text-[8.5px]">Current Ratio</span>
          <span className="text-foreground font-semibold">{data.valuationSpread.currentRatio.toFixed(3)}</span>
        </div>
        <div className="bg-surface-2/50 p-2 rounded border border-border/70">
          <span className="block text-muted-foreground text-[8.5px]">Mean Ratio (μ)</span>
          <span className="text-foreground font-semibold">{data.valuationSpread.meanRatio.toFixed(3)}</span>
        </div>
        <div className="bg-surface-2/50 p-2 rounded border border-border/70">
          <span className="block text-muted-foreground text-[8.5px]">Percentile Rank</span>
          <span className="text-foreground font-semibold">P{data.valuationSpread.percentileRank}</span>
        </div>
      </div>

      {/* 1-Click Interactive Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.tickerA })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-surface-3 transition-colors"
        >
          <FileSearch className="h-3 w-3 text-muted-foreground" />
          {data.tickerA} Workstation
        </button>
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.tickerB })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-surface-2 transition-colors"
        >
          <FileSearch className="h-3 w-3 text-muted-foreground" />
          {data.tickerB} Workstation
        </button>
      </div>
    </div>
  );
};

// ── 3. News & Veracity Filter Card ───────────────────────────────────────────

export const NewsImpactCard: React.FC<{ data: NewsImpactData }> = ({ data }) => {
  return (
    <div className="space-y-3.5 text-left">
      {/* Veracity Score & Net Causal Sentiment Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Institutional Veracity Score
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[18px] font-bold text-foreground tabular-nums">
              {data.veracityScore}
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">/ 100</span>
          </div>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Net Causal Sentiment
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-[18px] font-bold tabular-nums ${
                data.sentimentScore >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {data.sentimentScore >= 0 ? "+" : ""}{data.sentimentScore.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground/60 font-mono">Drift Index</span>
          </div>
        </div>
      </div>

      {/* Causal Transmission DAG Flowchart */}
      {data.dag && <CausalDAGViewer dag={data.dag} />}

      {/* 1st vs 2nd Order Transmission Channels */}
      <div className="space-y-2 rounded-lg border border-border/80 bg-surface-1/90 p-3">
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-foreground font-mono mb-0.5">
            1st-Order Direct Macro Impact
          </span>
          <p className="text-[12px] leading-snug text-foreground/90 font-serif">
            {data.firstOrderMacro}
          </p>
        </div>

        <div className="border-t border-border/60 pt-2">
          <span className="block text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground font-mono mb-0.5">
            2nd-Order Sector Transmission
          </span>
          <p className="text-[12px] leading-snug text-muted-foreground font-serif">
            {data.secondOrderTransmission}
          </p>
        </div>
      </div>

      {/* Exposed Portfolio Holdings */}
      {data.exposedPositionsInPortfolio.length > 0 && (
        <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono mb-1.5">
            Exposed Positions in Portfolio
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.exposedPositionsInPortfolio.map((pos) => (
              <span
                key={pos.ticker}
                className="inline-flex items-center gap-1.5 rounded border border-border/70 bg-surface-2 px-2 py-0.5 text-[10.5px] font-mono"
              >
                <strong className="text-foreground">{pos.ticker}</strong>
                <span className="text-[9.5px] text-red-400">({pos.estimatedSensitivity} sensitivity)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verified Headlines List */}
      <div className="space-y-1.5">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
          Verified Institutional Wires
        </span>
        {data.articles.map((art) => (
          <div key={art.id} className="p-2 rounded border border-border/70 bg-surface-1/80 space-y-0.5">
            <div className="flex items-center justify-between text-[9.5px] font-mono">
              <span className="text-muted-foreground">{art.source} • {art.timeAgo}</span>
              <span className="text-emerald-400 font-medium">Veracity: {art.veracityScore}%</span>
            </div>
            <p className="text-[11.5px] text-foreground font-serif leading-tight">{art.headline}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 4. Macro Causal Transmission & Shock Simulation Card ─────────────────────

export const StressTestCard: React.FC<{ data: StressTestData }> = ({ data }) => {
  const { handleAction } = useSasha();

  return (
    <div className="space-y-3.5 text-left">
      {/* Top Headline Stress Numbers */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Portfolio Drawdown
          </span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-red-400 tabular-nums">
            {data.portfolioDrawdownPct.toFixed(2)}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">P&L shift</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Estimated Loss
          </span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-red-400 tabular-nums">
            -${data.estimatedLossBase.toLocaleString()}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Base currency</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2.5">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Resilience Grade
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-foreground tabular-nums">
            {data.resilienceGrade}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Parametric stress</span>
        </div>
      </div>

      {/* Causal Transmission Directed Acyclic Graph (DAG) */}
      {data.dag && <CausalDAGViewer dag={data.dag} />}

      {/* Downside Absorption Breakdown by Position */}
      <div className="rounded-lg border border-border/80 bg-surface-1/90 p-3 space-y-2">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-foreground font-mono border-b border-border/60 pb-1">
          Downside Absorption by Position
        </span>
        <div className="space-y-1.5">
          {data.worstHitAssets.slice(0, 5).map((asset) => (
            <div key={asset.ticker} className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-semibold text-foreground">{asset.ticker} (β={asset.beta})</span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-red-400">{asset.shockImpactPct.toFixed(2)}%</span>
                <span className="text-muted-foreground text-[10px]">-${asset.lossValueBase.toFixed(0)}</span>
                <span className="font-medium text-foreground">{asset.lossSharePct}% of loss</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Quantitative Hedge */}
      <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5 flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[11px] leading-snug text-foreground">
            <strong className="text-foreground">Tail Hedge Recommendation:</strong> {data.recommendedHedge.structure} on {data.recommendedHedge.targetTicker} ({data.recommendedHedge.protectionCoveragePct}% coverage @ ~{data.recommendedHedge.estCostBps} bps).
          </p>
          <p className="text-[10px] text-muted-foreground font-serif">
            {data.rebalanceSuggestion}
          </p>
        </div>
      </div>

      {/* 1-Click Interactive Action */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => handleAction("fortress")}
          className="pressable w-full flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-surface-3 transition-colors"
        >
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          Execute Hedging Strategy via Fortress
        </button>
      </div>
    </div>
  );
};

// ── 5. Single Stock Fact Sheet & Quant Telemetry Card ──────────────────────────

export const SingleStockCard: React.FC<{ data: SingleStockData }> = ({ data }) => {
  const { handleAction } = useSasha();
  const isPositive = data.periodReturnPct >= 0;
  const currSym = data.currency === "INR" ? "₹" : data.currency === "USD" ? "$" : "";

  // Sparkline path generator
  const minP = Math.min(...data.sparkline);
  const maxP = Math.max(...data.sparkline);
  const rangeP = maxP - minP || 1;
  const w = 340;
  const h = 54;
  const padding = 4;
  const points = data.sparkline.map((val, idx) => {
    const x = padding + (idx / Math.max(1, data.sparkline.length - 1)) * (w - 2 * padding);
    const y = h - padding - ((val - minP) / rangeP) * (h - 2 * padding);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const sparklineD = `M ${points.join(" L ")}`;

  return (
    <div className="space-y-3.5 text-left">
      {/* Header Snapshot */}
      <div className="flex items-start justify-between border-b border-border/60 pb-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[16px] font-bold text-foreground tracking-tight">{data.ticker}</span>
            <span className="rounded bg-surface-2 border border-border/80 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground uppercase">
              {data.sector}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground font-serif">{data.name}</p>
        </div>
        <div className="text-right">
          <div className="font-mono text-[16px] font-bold text-foreground tabular-nums">
            {currSym}{data.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            {data.currency === "INR" ? " INR" : ""}
          </div>
          <div className={`text-[10px] font-mono font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
            {isPositive ? "+" : ""}{data.periodReturnPct.toFixed(2)}% ({data.range})
          </div>
        </div>
      </div>

      {/* Mini SVG Sparkline */}
      {data.sparkline && data.sparkline.length > 1 && (
        <div className="rounded-lg border border-border/80 bg-surface-2/40 p-2 space-y-1">
          <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
            <span>Price Trajectory ({data.range})</span>
            <span>Range: {currSym}{minP.toFixed(1)} – {currSym}{maxP.toFixed(1)}</span>
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12 overflow-visible">
            <path
              d={sparklineD}
              fill="none"
              stroke={isPositive ? "#34d399" : "#f87171"}
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}

      {/* Primary Quantitative Telemetry Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Beta (β vs {data.benchmark})
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-foreground tabular-nums">
            {data.betaRegression.beta.toFixed(2)}
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">R² = {data.betaRegression.rSquared.toFixed(2)}</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Annual Vol (σ)
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-foreground tabular-nums">
            {data.volatilityAnnualPct.toFixed(1)}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">252-day realized</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            P/E (TTM)
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-foreground tabular-nums">
            {data.fundamentals.peRatio.toFixed(1)}x
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">Fwd: {data.fundamentals.forwardPe.toFixed(1)}x</span>
        </div>

        <div className="rounded-lg border border-border/80 bg-surface-2/50 p-2">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
            Return on Equity
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-emerald-400 tabular-nums">
            {data.fundamentals.returnOnEquityPct.toFixed(1)}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 font-mono">ROE (LTM)</span>
        </div>
      </div>

      {/* Institutional Multiples & Margin Table */}
      <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5 space-y-2">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground font-mono border-b border-border/60 pb-1">
          Fundamental Ratios & Financial Profile
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
          <div>
            <span className="text-muted-foreground text-[8.5px] block">Market Cap</span>
            <span className="font-semibold text-foreground">${data.fundamentals.marketCapBln.toFixed(1)}B</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">EV / EBITDA</span>
            <span className="font-semibold text-foreground">{data.fundamentals.evToEbitda.toFixed(1)}x</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">Gross Margin</span>
            <span className="font-semibold text-foreground">{data.fundamentals.grossMarginPct.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">Operating Margin</span>
            <span className="font-semibold text-foreground">{data.fundamentals.operatingMarginPct.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">Rev Growth (YoY)</span>
            <span className="font-semibold text-foreground">{data.fundamentals.revenueGrowthYoyPct >= 0 ? "+" : ""}{data.fundamentals.revenueGrowthYoyPct.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">Debt / Equity</span>
            <span className="font-semibold text-foreground">{data.fundamentals.debtToEquity.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">FCF Yield</span>
            <span className="font-semibold text-foreground">{data.fundamentals.freeCashFlowYieldPct.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground text-[8.5px] block">Correlation (r)</span>
            <span className="font-semibold text-foreground">{data.betaRegression.correlation.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* News Sentiment & Headlines */}
      {data.news && data.news.headlines.length > 0 && (
        <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9px] font-mono border-b border-border/50 pb-1">
            <span className="font-semibold uppercase tracking-[0.12em] text-muted-foreground">Catalysts & Wire Sentiment</span>
            <span className={`font-semibold capitalize ${data.news.sentiment === "bullish" ? "text-emerald-400" : data.news.sentiment === "bearish" ? "text-red-400" : "text-muted-foreground"}`}>
              {data.news.sentiment} (Veracity: {data.news.veracityScore}%)
            </span>
          </div>
          <div className="space-y-1">
            {data.news.headlines.slice(0, 2).map((headline, idx) => (
              <p key={idx} className="text-[11px] text-foreground font-serif leading-tight">
                • {headline}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* 1-Click Interactive Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.ticker })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-foreground hover:bg-surface-3 transition-colors"
        >
          <FileSearch className="h-3 w-3 text-muted-foreground" />
          Open {data.ticker} Workstation
        </button>
        <button
          type="button"
          onClick={() => handleAction("screener")}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border/80 bg-surface-1 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-surface-2 transition-colors"
        >
          <Sliders className="h-3 w-3 text-muted-foreground" />
          Factor Screener
        </button>
      </div>
    </div>
  );
};

// ── 6. General Quant Synthesis Card ──────────────────────────────────────────

export const GeneralQuantCard: React.FC<{ data: GeneralQuantData }> = ({ data }) => {
  return (
    <div className="space-y-3 text-left">
      <p className="text-[12px] leading-relaxed text-foreground/90 font-serif">
        {data.summary}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {data.metrics.map((m, idx) => (
          <div key={idx} className="rounded-lg border border-border/80 bg-surface-2/50 p-2">
            <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground font-mono">{m.label}</span>
            <span className="mt-0.5 block font-mono text-[14px] font-semibold text-foreground tabular-nums">
              {m.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── 6. Google & Financial Web AI Grounding Drawer ───────────────────────────

export const GoogleGroundingView: React.FC<{ grounding: GoogleGroundingResult }> = ({ grounding }) => {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="rounded-lg border border-border/80 bg-surface-1/90 p-3 space-y-2.5 text-left">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-2">
          <span className="flex h-4 w-4 items-center justify-center rounded bg-foreground text-[8px] font-bold font-serif text-background">
            G
          </span>
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-foreground font-mono">
            Google & Wire AI Grounding
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-emerald-400 font-medium">
            Veracity: {grounding.veracityScore}%
          </span>
          <span className="text-muted-foreground/40">•</span>
          <span className="text-[9px] font-mono text-muted-foreground">
            {grounding.elapsedMs}ms
          </span>
        </div>
      </div>

      <p className="text-[11.5px] leading-relaxed text-foreground font-serif">
        {grounding.groundedSummary}
      </p>

      {/* Metric Pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[9.5px] font-mono">
        {grounding.keyFacts.map((fact, idx) => (
          <div key={idx} className="bg-surface-2/60 p-1.5 rounded border border-border/60">
            <span className="block text-muted-foreground text-[8.5px]">{fact.label}</span>
            <span className="text-foreground font-medium">{fact.value}</span>
          </div>
        ))}
      </div>

      {/* Sources list toggle */}
      {grounding.sources.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="pressable flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>{expanded ? "Hide" : "View"} {grounding.sources.length} Verified Sources & Citations</span>
            <ChevronRight className={`h-3 w-3 transform transition-transform ${expanded ? "rotate-90" : ""}`} />
          </button>

          {expanded && (
            <div className="mt-2 space-y-1.5 pl-1 border-l border-border/60">
              {grounding.sources.map((src, i) => (
                <a
                  key={i}
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block p-1.5 rounded bg-surface-2/40 hover:bg-surface-2 transition-colors group"
                >
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span className="text-muted-foreground group-hover:text-foreground font-medium flex items-center gap-1">
                      {src.source}
                      {src.tier === 1 && (
                        <span className="text-[8px] bg-foreground text-background px-1 rounded font-bold">
                          TIER 1
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground/60 flex items-center gap-0.5">
                      {src.timeAgo}
                      <ExternalLink className="h-2.5 w-2.5 opacity-60 group-hover:opacity-100" />
                    </span>
                  </div>
                  <div className="text-[10.5px] text-foreground font-serif line-clamp-1 group-hover:underline">
                    {src.title}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Root Card Dispatcher ────────────────────────────────────────────────────

export const SashaVisualCard: React.FC<{ result: SashaResult }> = ({ result }) => {
  return (
    <div className="rounded-xl border border-border/80 bg-surface-1/95 p-3.5 shadow-xl space-y-3 text-left">
      {/* Proof of Work Receipts Bar */}
      {result.receipts && result.receipts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 pb-2">
          {result.receipts.map((rcpt) => (
            <span
              key={rcpt.id}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9px] font-mono ${
                rcpt.status === "warning"
                  ? "border-amber-500/40 bg-amber-950/20 text-amber-300"
                  : "border-border/70 bg-surface-2/70 text-foreground"
              }`}
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
              <span>{rcpt.label}:</span>
              <strong className="text-foreground">{rcpt.badge}</strong>
              <span className="text-muted-foreground/60">({rcpt.elapsedMs}ms)</span>
            </span>
          ))}
        </div>
      )}

      {/* Spoken Punchline Highlight */}
      <div className="rounded-md border-l-2 border-foreground bg-surface-2/60 px-3 py-2">
        <p className="text-[12px] font-medium leading-snug text-foreground font-serif">
          "{result.spokenPunchline}"
        </p>
      </div>

      {/* Dynamic Quantitative Payload */}
      {result.cardType === "single_stock" && <SingleStockCard data={result.cardData as SingleStockData} />}
      {result.cardType === "subset_risk" && <SubsetRiskCard data={result.cardData as SubsetRiskData} />}
      {result.cardType === "stock_comparison" && <StockComparisonCard data={result.cardData as StockComparisonData} />}
      {result.cardType === "news_impact" && <NewsImpactCard data={result.cardData as NewsImpactData} />}
      {result.cardType === "stress_test" && <StressTestCard data={result.cardData as StressTestData} />}
      {result.cardType === "general_quant" && <GeneralQuantCard data={result.cardData as GeneralQuantData} />}

      {/* Google & Web AI Grounding Panel */}
      {result.googleGrounding && <GoogleGroundingView grounding={result.googleGrounding} />}
    </div>
  );
};
