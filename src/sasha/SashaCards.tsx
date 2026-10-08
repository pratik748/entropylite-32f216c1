/**
 * SASHA High-Density Quantitative Cards (SashaCards)
 *
 * Tier-1 Institutional Financial Instrument Rendering.
 * Strict monochrome palette, glassmorphic obsidian styling, hairline borders,
 * Times New Roman / Serif accents, and razor-sharp tabular numbers.
 *
 * Includes:
 *  1. Subset Risk & Euler Attribution Card
 *  2. Cross-Asset Pairs & Cointegration Radar Card
 *  3. Macro Causal Transmission & Shock Simulation Card
 *  4. Raw News & Veracity Filter Card
 *  5. General Quant Synthesis Card
 */

import React from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Layers,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
  ExternalLink,
  Sliders,
  Radio,
  FileSearch,
} from "lucide-react";
import type {
  SashaResult,
  SubsetRiskData,
  StockComparisonData,
  NewsImpactData,
  StressTestData,
  GeneralQuantData,
} from "./types";
import { useSasha } from "./SashaProvider";

// ── 1. Subset Risk & Euler Attribution Card ──────────────────────────────────

export const SubsetRiskCard: React.FC<{ data: SubsetRiskData }> = ({ data }) => {
  const { handleAction } = useSasha();

  return (
    <div className="space-y-4 text-left">
      {/* Top Metric Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Annualized Vol
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-muted-foreground tabular-nums">
            {data.annualizedVolPct.toFixed(1)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground">σ (252-day ann.)</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            1D CVaR (95%)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            -{data.cvar95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground">Expected Shortfall</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Sharpe Ratio
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-foreground tabular-nums">
            {data.sharpeRatio.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-muted-foreground">Rf = 4.5%</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            1D VaR (95%)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-muted-foreground tabular-nums">
            -{data.var95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground">Parametric normal</span>
        </div>
      </div>

      {/* Euler Risk Shares vs Capital Allocation Breakdown */}
      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between border-b border-border/80 pb-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            Euler Risk Shares vs Capital Allocation
          </span>
          <span className="text-[9.5px] text-muted-foreground font-mono">
            Dominant: <strong className="text-muted-foreground">{data.dominantRiskTicker}</strong> ({data.dominantRiskSharePct}%)
          </span>
        </div>

        <div className="space-y-2">
          {data.eulerRiskShares.map((item) => (
            <div key={item.ticker} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="font-semibold text-muted-foreground">{item.ticker}</span>
                <div className="flex items-center gap-3 text-[10px] tabular-nums">
                  <span className="text-muted-foreground">Capital: {item.weightPct}%</span>
                  <span className="text-muted-foreground">σ: {item.volatilityPct}%</span>
                  <span className="font-medium text-muted-foreground">Euler Risk: {item.eulerRiskSharePct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 h-1.5 rounded-full overflow-hidden bg-border">
                <div
                  className="bg-muted h-full rounded-l-full"
                  style={{ width: `${Math.min(100, item.weightPct * 2)}%` }}
                  title={`Capital Weight: ${item.weightPct}%`}
                />
                <div
                  className="bg-muted h-full rounded-r-full"
                  style={{ width: `${Math.min(100, item.eulerRiskSharePct * 2)}%` }}
                  title={`Euler Risk Share: ${item.eulerRiskSharePct}%`}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CLANK Structural Constraints */}
      {data.clankConstraints && data.clankConstraints.length > 0 && (
        <div className="rounded-lg border border-border bg-background/30 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground border-b border-border/60 pb-1">
            <span>CLANK Structural Constraints</span>
            <span className="text-muted-foreground font-mono">Liquidity & Kinetic Speed</span>
          </div>
          <div className="space-y-1">
            {data.clankConstraints.map((c) => (
              <div key={c.id} className="flex items-start justify-between text-[11px] gap-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      c.severity === "high" ? "bg-foreground" : c.severity === "medium" ? "bg-foreground" : "bg-foreground"
                    }`}
                  />
                  <span className="font-medium text-muted-foreground">{c.label}:</span>
                  <span className="text-muted-foreground text-[10.5px] font-serif">{c.detail}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">{c.metricValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Covariance Matrix Snippet */}
      {data.correlationMatrix && data.correlationMatrix.length > 1 && (
        <div className="rounded-lg border border-border bg-background/20 p-2.5">
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
                  <tr key={data.tickers[i] || i} className="border-t border-border/40">
                    <td className="text-left font-semibold text-muted-foreground p-1">{data.tickers[i]}</td>
                    {row.map((val, j) => (
                      <td
                        key={j}
                        className={`text-right p-1 ${
                          i === j
                            ? "text-muted-foreground"
                            : val > 0.7
                            ? "text-foreground font-semibold"
                            : val < 0.2
                            ? "text-foreground"
                            : "text-muted-foreground"
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
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-border/80 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-border hover:border-zinc-600 transition-colors"
        >
          <Sliders className="h-3 w-3 text-muted-foreground" />
          Inspect in Risk Lab
        </button>
        <button
          type="button"
          onClick={() => handleAction("fortress")}
          className="pressable flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-border transition-colors"
        >
          <ShieldCheck className="h-3 w-3 text-foreground" />
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
    <div className="space-y-4 text-left">
      {/* Head-to-Head Header Bar */}
      <div className="grid grid-cols-2 gap-2 border-b border-border pb-3">
        <div className="p-2.5 rounded-lg bg-background/60 border border-border">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-muted-foreground">{data.tickerA}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">${data.lastPriceA}</span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{data.nameA}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctA >= 0 ? "text-foreground" : "text-foreground"}>
              1M: {data.momentum.return1mPctA >= 0 ? "+" : ""}{data.momentum.return1mPctA}%
            </span>
            <span className="text-muted-foreground">σ: {data.momentum.volatilityAnnualPctA}%</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-background/60 border border-border">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-muted-foreground">{data.tickerB}</span>
            <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">${data.lastPriceB}</span>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{data.nameB}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctB >= 0 ? "text-foreground" : "text-foreground"}>
              1M: {data.momentum.return1mPctB >= 0 ? "+" : ""}{data.momentum.return1mPctB}%
            </span>
            <span className="text-muted-foreground">σ: {data.momentum.volatilityAnnualPctB}%</span>
          </div>
        </div>
      </div>

      {/* Regression & Cointegration Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Correlation (r)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-muted-foreground tabular-nums">
            {data.correlation.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-muted-foreground">Pearson realized</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Beta (β)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-muted-foreground tabular-nums">
            {data.betaRegression.beta.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-muted-foreground">R² = {data.betaRegression.rSquared.toFixed(2)}</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Cointegration
          </span>
          <span
            className={`mt-0.5 block font-mono text-[13.5px] font-medium tabular-nums ${
              data.cointegration.isCointegrated ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {data.cointegration.isCointegrated ? "Stationary (✓)" : "Non-Stationary"}
          </span>
          <span className="text-[9.5px] text-muted-foreground">p = {data.cointegration.pValue.toFixed(3)}</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Mean-Rev Half-Life
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-muted-foreground tabular-nums">
            {data.cointegration.halfLifeDays.toFixed(1)}d
          </span>
          <span className="text-[9.5px] text-muted-foreground">Ornstein–Uhlenbeck τ</span>
        </div>
      </div>

      {/* Relative Valuation Spread Status & Stat-Arb Verdict */}
      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Spread Dynamics ({data.tickerA} / {data.tickerB})
          </span>
          <span className="font-mono text-[10.5px] text-muted-foreground">
            Z-Score: <strong className="text-muted-foreground">{data.valuationSpread.spreadZScore.toFixed(2)}σ</strong> (P{data.valuationSpread.percentileRank})
          </span>
        </div>

        {/* Stat-Arb Verdict Box */}
        <div className="rounded border border-border bg-background/80 p-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Radio className="h-3 w-3 text-foreground shrink-0 animate-pulse" />
            <span className="font-semibold text-muted-foreground">Stat-Arb Signal:</span>
            <span className="text-muted-foreground truncate">{data.cointegration.spreadVerdictText}</span>
          </div>
        </div>

        {/* Ratio Stats */}
        <div className="grid grid-cols-3 gap-2 text-[10.5px] font-mono pt-0.5">
          <div className="bg-border/50 p-2 rounded border border-border/80">
            <span className="block text-muted-foreground text-[9px]">Current Ratio</span>
            <span className="text-muted-foreground font-semibold">{data.valuationSpread.currentRatio.toFixed(3)}</span>
          </div>
          <div className="bg-border/50 p-2 rounded border border-border/80">
            <span className="block text-muted-foreground text-[9px]">Mean Ratio</span>
            <span className="text-muted-foreground font-semibold">{data.valuationSpread.meanRatio.toFixed(3)}</span>
          </div>
          <div className="bg-border/50 p-2 rounded border border-border/80">
            <span className="block text-muted-foreground text-[9px]">Hedge Ratio (β_EG)</span>
            <span className="text-muted-foreground font-semibold">{data.cointegration.hedgeRatio.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* 1-Click Interactive Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.tickerA })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-border/80 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-border transition-colors"
        >
          <FileSearch className="h-3 w-3 text-muted-foreground" />
          Open {data.tickerA} Workstation
        </button>
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.tickerB })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-border transition-colors"
        >
          <FileSearch className="h-3 w-3 text-muted-foreground" />
          Open {data.tickerB} Workstation
        </button>
      </div>
    </div>
  );
};

// ── 3. News & Veracity Filter Card ───────────────────────────────────────────

export const NewsImpactCard: React.FC<{ data: NewsImpactData }> = ({ data }) => {
  return (
    <div className="space-y-4 text-left">
      {/* Veracity Score & Net Causal Sentiment Grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Institutional Veracity Score
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[18px] font-bold text-muted-foreground tabular-nums">
              {data.veracityScore}
            </span>
            <span className="text-[10px] text-muted-foreground">/ 100 (Filings vs Promo)</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Net Causal Sentiment
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-[18px] font-bold tabular-nums ${
                data.sentimentScore >= 0 ? "text-foreground" : "text-foreground"
              }`}
            >
              {data.sentimentScore >= 0 ? "+" : ""}{data.sentimentScore.toFixed(2)}
            </span>
            <span className="text-[10px] text-muted-foreground">Drift Index</span>
          </div>
        </div>
      </div>

      {/* 1st vs 2nd Order Transmission Channels */}
      <div className="space-y-2 rounded-lg border border-border bg-background/40 p-3">
        <div>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-0.5">
            1st-Order Direct Macro Impact
          </span>
          <p className="text-[12px] leading-snug text-muted-foreground font-serif">
            {data.firstOrderMacro}
          </p>
        </div>

        <div className="border-t border-border/80 pt-2">
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
        <div className="rounded-lg border border-border bg-background/30 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
            Exposed Positions in Book
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.exposedPositionsInPortfolio.map((pos) => (
              <span
                key={pos.ticker}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-border/80 px-2 py-0.5 text-[10.5px] font-mono"
              >
                <strong className="text-muted-foreground">{pos.ticker}</strong>
                <span className="text-[9.5px] text-foreground">({pos.estimatedSensitivity} sensitivity)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verified Headlines List */}
      <div className="space-y-2">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Verified Institutional Wires
        </span>
        {data.articles.map((art) => (
          <div key={art.id} className="p-2 rounded border border-border bg-background/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-muted-foreground">{art.source} • {art.timeAgo}</span>
              <span className="text-foreground font-medium">Veracity: {art.veracityScore}%</span>
            </div>
            <p className="text-[11.5px] text-muted-foreground font-serif leading-tight">{art.headline}</p>
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
    <div className="space-y-4 text-left">
      {/* Top Headline Stress Numbers */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Portfolio Drawdown
          </span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-foreground tabular-nums">
            {data.portfolioDrawdownPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-muted-foreground">Estimated P&L shift</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Estimated Loss
          </span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-foreground tabular-nums">
            -${data.estimatedLossBase.toLocaleString()}
          </span>
          <span className="text-[9.5px] text-muted-foreground">Base currency</span>
        </div>

        <div className="rounded-lg border border-border bg-background/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Resilience Grade
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-muted-foreground tabular-nums">
            {data.resilienceGrade}
          </span>
          <span className="text-[9.5px] text-muted-foreground">Parametric stress</span>
        </div>
      </div>

      {/* Downside Absorption Breakdown by Position */}
      <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground border-b border-border/80 pb-1">
          Downside Absorption by Position
        </span>
        <div className="space-y-1.5">
          {data.worstHitAssets.slice(0, 5).map((asset) => (
            <div key={asset.ticker} className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-semibold text-muted-foreground">{asset.ticker} (β={asset.beta})</span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-foreground">{asset.shockImpactPct.toFixed(2)}% shock</span>
                <span className="text-muted-foreground text-[10px]">-${asset.lossValueBase.toFixed(0)}</span>
                <span className="font-medium text-muted-foreground">{asset.lossSharePct}% of total loss</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Quantitative Hedge */}
      <div className="rounded-lg border border-border bg-background/30 p-2.5 flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 text-foreground shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[11px] leading-snug text-muted-foreground">
            <strong className="text-muted-foreground">Tail Hedge Recommendation:</strong> {data.recommendedHedge.structure} on {data.recommendedHedge.targetTicker} ({data.recommendedHedge.protectionCoveragePct}% coverage @ ~{data.recommendedHedge.estCostBps} bps).
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
          className="pressable w-full flex items-center justify-center gap-1.5 rounded-lg border border-border bg-border/80 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-border transition-colors"
        >
          <ShieldCheck className="h-3 w-3 text-foreground" />
          Execute Hedging Strategy via Fortress
        </button>
      </div>
    </div>
  );
};

// ── 5. General Quant Synthesis Card ──────────────────────────────────────────

export const GeneralQuantCard: React.FC<{ data: GeneralQuantData }> = ({ data }) => {
  return (
    <div className="space-y-3 text-left">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground font-serif">
        {data.summary}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {data.metrics.map((m, idx) => (
          <div key={idx} className="rounded-lg border border-border bg-background/50 p-2">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{m.label}</span>
            <span className="mt-0.5 block font-mono text-[14px] font-semibold text-muted-foreground tabular-nums">
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
    <div className="rounded-xl border border-border bg-background/95 backdrop-blur-xl p-4 shadow-2xl space-y-3 text-left">
      {/* Proof of Work Receipts Bar */}
      {result.receipts && result.receipts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/80 pb-2.5">
          {result.receipts.map((rcpt) => (
            <span
              key={rcpt.id}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9.5px] font-mono ${
                rcpt.status === "warning"
                  ? "border-foreground/40 bg-foreground/30 text-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-foreground" />
              <span>{rcpt.label}:</span>
              <strong className="text-muted-foreground">{rcpt.badge}</strong>
              <span className="text-muted-foreground">({rcpt.elapsedMs}ms)</span>
            </span>
          ))}
        </div>
      )}

      {/* Spoken Punchline Highlight */}
      <div className="rounded-lg border-l-2 border-zinc-100 bg-background/50 px-3 py-2">
        <p className="text-[12px] font-medium leading-snug text-muted-foreground font-serif">
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
