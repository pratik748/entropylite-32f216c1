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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Annualized Vol
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-zinc-100 tabular-nums">
            {data.annualizedVolPct.toFixed(1)}%
          </span>
          <span className="text-[9.5px] text-zinc-500">σ (252-day ann.)</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            1D CVaR (95%)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-red-400 tabular-nums">
            -{data.cvar95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-zinc-500">Expected Shortfall</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Sharpe Ratio
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-emerald-400 tabular-nums">
            {data.sharpeRatio.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-zinc-500">Rf = 4.5%</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            1D VaR (95%)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-zinc-100 tabular-nums">
            -{data.var95DailyPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-zinc-500">Parametric normal</span>
        </div>
      </div>

      {/* Euler Risk Shares vs Capital Allocation Breakdown */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-1.5">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-200 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-zinc-400" />
            Euler Risk Shares vs Capital Allocation
          </span>
          <span className="text-[9.5px] text-zinc-400 font-mono">
            Dominant: <strong className="text-zinc-200">{data.dominantRiskTicker}</strong> ({data.dominantRiskSharePct}%)
          </span>
        </div>

        <div className="space-y-2">
          {data.eulerRiskShares.map((item) => (
            <div key={item.ticker} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="font-semibold text-zinc-200">{item.ticker}</span>
                <div className="flex items-center gap-3 text-[10px] tabular-nums">
                  <span className="text-zinc-400">Capital: {item.weightPct}%</span>
                  <span className="text-zinc-400">σ: {item.volatilityPct}%</span>
                  <span className="font-medium text-zinc-100">Euler Risk: {item.eulerRiskSharePct}%</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 h-1.5 rounded-full overflow-hidden bg-zinc-800">
                <div
                  className="bg-zinc-500 h-full rounded-l-full"
                  style={{ width: `${Math.min(100, item.weightPct * 2)}%` }}
                  title={`Capital Weight: ${item.weightPct}%`}
                />
                <div
                  className="bg-zinc-100 h-full rounded-r-full"
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 border-b border-zinc-800/60 pb-1">
            <span>CLANK Structural Constraints</span>
            <span className="text-zinc-500 font-mono">Liquidity & Kinetic Speed</span>
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
                  <span className="font-medium text-zinc-300">{c.label}:</span>
                  <span className="text-zinc-400 text-[10.5px] font-serif">{c.detail}</span>
                </div>
                <span className="font-mono text-[10px] text-zinc-300 shrink-0">{c.metricValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Covariance Matrix Snippet */}
      {data.correlationMatrix && data.correlationMatrix.length > 1 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/20 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
            Pairwise Correlation Matrix (Ledoit–Wolf Shrunk)
          </span>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono tabular-nums">
              <thead>
                <tr>
                  <th className="text-left text-zinc-500 p-1"></th>
                  {data.tickers.map((t) => (
                    <th key={t} className="text-right text-zinc-400 font-semibold p-1">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.correlationMatrix.map((row, i) => (
                  <tr key={data.tickers[i] || i} className="border-t border-zinc-800/40">
                    <td className="text-left font-semibold text-zinc-300 p-1">{data.tickers[i]}</td>
                    {row.map((val, j) => (
                      <td
                        key={j}
                        className={`text-right p-1 ${
                          i === j
                            ? "text-zinc-600"
                            : val > 0.7
                            ? "text-red-400 font-semibold"
                            : val < 0.2
                            ? "text-emerald-400"
                            : "text-zinc-300"
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
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700 hover:border-zinc-600 transition-colors"
        >
          <Sliders className="h-3 w-3 text-zinc-400" />
          Inspect in Risk Lab
        </button>
        <button
          type="button"
          onClick={() => handleAction("fortress")}
          className="pressable flex items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
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
    <div className="space-y-4 text-left">
      {/* Head-to-Head Header Bar */}
      <div className="grid grid-cols-2 gap-2 border-b border-zinc-800 pb-3">
        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-zinc-100">{data.tickerA}</span>
            <span className="font-mono text-[12.5px] text-zinc-100 tabular-nums">${data.lastPriceA}</span>
          </div>
          <p className="text-[10px] text-zinc-400 truncate">{data.nameA}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctA >= 0 ? "text-emerald-400" : "text-red-400"}>
              1M: {data.momentum.return1mPctA >= 0 ? "+" : ""}{data.momentum.return1mPctA}%
            </span>
            <span className="text-zinc-500">σ: {data.momentum.volatilityAnnualPctA}%</span>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-zinc-900/60 border border-zinc-800">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[13px] font-bold text-zinc-100">{data.tickerB}</span>
            <span className="font-mono text-[12.5px] text-zinc-100 tabular-nums">${data.lastPriceB}</span>
          </div>
          <p className="text-[10px] text-zinc-400 truncate">{data.nameB}</p>
          <div className="mt-1 flex items-center gap-2 text-[9.5px] font-mono">
            <span className={data.momentum.return1mPctB >= 0 ? "text-emerald-400" : "text-red-400"}>
              1M: {data.momentum.return1mPctB >= 0 ? "+" : ""}{data.momentum.return1mPctB}%
            </span>
            <span className="text-zinc-500">σ: {data.momentum.volatilityAnnualPctB}%</span>
          </div>
        </div>
      </div>

      {/* Regression & Cointegration Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Correlation (r)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-zinc-100 tabular-nums">
            {data.correlation.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-zinc-500">Pearson realized</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Beta (β)
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-zinc-100 tabular-nums">
            {data.betaRegression.beta.toFixed(2)}
          </span>
          <span className="text-[9.5px] text-zinc-500">R² = {data.betaRegression.rSquared.toFixed(2)}</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Cointegration
          </span>
          <span
            className={`mt-0.5 block font-mono text-[13.5px] font-medium tabular-nums ${
              data.cointegration.isCointegrated ? "text-emerald-400" : "text-zinc-400"
            }`}
          >
            {data.cointegration.isCointegrated ? "Stationary (✓)" : "Non-Stationary"}
          </span>
          <span className="text-[9.5px] text-zinc-500">p = {data.cointegration.pValue.toFixed(3)}</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Mean-Rev Half-Life
          </span>
          <span className="mt-0.5 block font-mono text-[16px] font-medium text-zinc-100 tabular-nums">
            {data.cointegration.halfLifeDays.toFixed(1)}d
          </span>
          <span className="text-[9.5px] text-zinc-500">Ornstein–Uhlenbeck τ</span>
        </div>
      </div>

      {/* Relative Valuation Spread Status & Stat-Arb Verdict */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-200">
            Spread Dynamics ({data.tickerA} / {data.tickerB})
          </span>
          <span className="font-mono text-[10.5px] text-zinc-400">
            Z-Score: <strong className="text-zinc-100">{data.valuationSpread.spreadZScore.toFixed(2)}σ</strong> (P{data.valuationSpread.percentileRank})
          </span>
        </div>

        {/* Stat-Arb Verdict Box */}
        <div className="rounded border border-zinc-800 bg-zinc-950/80 p-2 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <Radio className="h-3 w-3 text-emerald-400 shrink-0 animate-pulse" />
            <span className="font-semibold text-zinc-100">Stat-Arb Signal:</span>
            <span className="text-zinc-300 truncate">{data.cointegration.spreadVerdictText}</span>
          </div>
        </div>

        {/* Ratio Stats */}
        <div className="grid grid-cols-3 gap-2 text-[10.5px] font-mono pt-0.5">
          <div className="bg-zinc-800/50 p-2 rounded border border-zinc-800/80">
            <span className="block text-zinc-400 text-[9px]">Current Ratio</span>
            <span className="text-zinc-100 font-semibold">{data.valuationSpread.currentRatio.toFixed(3)}</span>
          </div>
          <div className="bg-zinc-800/50 p-2 rounded border border-zinc-800/80">
            <span className="block text-zinc-400 text-[9px]">Mean Ratio</span>
            <span className="text-zinc-100 font-semibold">{data.valuationSpread.meanRatio.toFixed(3)}</span>
          </div>
          <div className="bg-zinc-800/50 p-2 rounded border border-zinc-800/80">
            <span className="block text-zinc-400 text-[9px]">Hedge Ratio (β_EG)</span>
            <span className="text-zinc-100 font-semibold">{data.cointegration.hedgeRatio.toFixed(3)}</span>
          </div>
        </div>
      </div>

      {/* 1-Click Interactive Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.tickerA })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <FileSearch className="h-3 w-3 text-zinc-400" />
          Open {data.tickerA} Workstation
        </button>
        <button
          type="button"
          onClick={() => handleAction("workstation", { ticker: data.tickerB })}
          className="pressable flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          <FileSearch className="h-3 w-3 text-zinc-400" />
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Institutional Veracity Score
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-mono text-[18px] font-bold text-zinc-100 tabular-nums">
              {data.veracityScore}
            </span>
            <span className="text-[10px] text-zinc-500">/ 100 (Filings vs Promo)</span>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
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
            <span className="text-[10px] text-zinc-500">Drift Index</span>
          </div>
        </div>
      </div>

      {/* 1st vs 2nd Order Transmission Channels */}
      <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
        <div>
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-zinc-200 mb-0.5">
            1st-Order Direct Macro Impact
          </span>
          <p className="text-[12px] leading-snug text-zinc-300 font-serif">
            {data.firstOrderMacro}
          </p>
        </div>

        <div className="border-t border-zinc-800/80 pt-2">
          <span className="block text-[9.5px] font-bold uppercase tracking-[0.14em] text-zinc-400 mb-0.5">
            2nd-Order Sector Transmission
          </span>
          <p className="text-[12px] leading-snug text-zinc-400 font-serif">
            {data.secondOrderTransmission}
          </p>
        </div>
      </div>

      {/* Exposed Portfolio Holdings */}
      {data.exposedPositionsInPortfolio.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400 mb-1.5">
            Exposed Positions in Book
          </span>
          <div className="flex flex-wrap gap-1.5">
            {data.exposedPositionsInPortfolio.map((pos) => (
              <span
                key={pos.ticker}
                className="inline-flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-800/80 px-2 py-0.5 text-[10.5px] font-mono"
              >
                <strong className="text-zinc-200">{pos.ticker}</strong>
                <span className="text-[9.5px] text-red-400">({pos.estimatedSensitivity} sensitivity)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verified Headlines List */}
      <div className="space-y-2">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
          Verified Institutional Wires
        </span>
        {data.articles.map((art) => (
          <div key={art.id} className="p-2 rounded border border-zinc-800 bg-zinc-900/40 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-mono">
              <span className="text-zinc-400">{art.source} • {art.timeAgo}</span>
              <span className="text-emerald-400 font-medium">Veracity: {art.veracityScore}%</span>
            </div>
            <p className="text-[11.5px] text-zinc-200 font-serif leading-tight">{art.headline}</p>
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
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Portfolio Drawdown
          </span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-red-400 tabular-nums">
            {data.portfolioDrawdownPct.toFixed(2)}%
          </span>
          <span className="text-[9.5px] text-zinc-500">Estimated P&L shift</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Estimated Loss
          </span>
          <span className="mt-0.5 block font-mono text-[17px] font-bold text-red-400 tabular-nums">
            -${data.estimatedLossBase.toLocaleString()}
          </span>
          <span className="text-[9.5px] text-zinc-500">Base currency</span>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2.5">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
            Resilience Grade
          </span>
          <span className="mt-0.5 block font-mono text-[15px] font-semibold text-zinc-100 tabular-nums">
            {data.resilienceGrade}
          </span>
          <span className="text-[9.5px] text-zinc-500">Parametric stress</span>
        </div>
      </div>

      {/* Downside Absorption Breakdown by Position */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
        <span className="block text-[10.5px] font-semibold uppercase tracking-[0.12em] text-zinc-200 border-b border-zinc-800/80 pb-1">
          Downside Absorption by Position
        </span>
        <div className="space-y-1.5">
          {data.worstHitAssets.slice(0, 5).map((asset) => (
            <div key={asset.ticker} className="flex items-center justify-between text-[11px] font-mono">
              <span className="font-semibold text-zinc-200">{asset.ticker} (β={asset.beta})</span>
              <div className="flex items-center gap-3 tabular-nums">
                <span className="text-red-400">{asset.shockImpactPct.toFixed(2)}% shock</span>
                <span className="text-zinc-500 text-[10px]">-${asset.lossValueBase.toFixed(0)}</span>
                <span className="font-medium text-zinc-200">{asset.lossSharePct}% of total loss</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Quantitative Hedge */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-2.5 flex items-start gap-2.5">
        <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-[11px] leading-snug text-zinc-300">
            <strong className="text-zinc-100">Tail Hedge Recommendation:</strong> {data.recommendedHedge.structure} on {data.recommendedHedge.targetTicker} ({data.recommendedHedge.protectionCoveragePct}% coverage @ ~{data.recommendedHedge.estCostBps} bps).
          </p>
          <p className="text-[10px] text-zinc-400 font-serif">
            {data.rebalanceSuggestion}
          </p>
        </div>
      </div>

      {/* 1-Click Interactive Action */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => handleAction("fortress")}
          className="pressable w-full flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 text-[11px] font-semibold text-zinc-100 hover:bg-zinc-700 transition-colors"
        >
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
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
      <p className="text-[12.5px] leading-relaxed text-zinc-200 font-serif">
        {data.summary}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {data.metrics.map((m, idx) => (
          <div key={idx} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-2">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-zinc-400">{m.label}</span>
            <span className="mt-0.5 block font-mono text-[14px] font-semibold text-zinc-100 tabular-nums">
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
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 backdrop-blur-xl p-4 shadow-2xl space-y-3 text-left">
      {/* Proof of Work Receipts Bar */}
      {result.receipts && result.receipts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800/80 pb-2.5">
          {result.receipts.map((rcpt) => (
            <span
              key={rcpt.id}
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[9.5px] font-mono ${
                rcpt.status === "warning"
                  ? "border-amber-500/40 bg-amber-950/30 text-amber-300"
                  : "border-zinc-800 bg-zinc-900 text-zinc-300"
              }`}
            >
              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
              <span>{rcpt.label}:</span>
              <strong className="text-zinc-100">{rcpt.badge}</strong>
              <span className="text-zinc-500">({rcpt.elapsedMs}ms)</span>
            </span>
          ))}
        </div>
      )}

      {/* Spoken Punchline Highlight */}
      <div className="rounded-lg border-l-2 border-zinc-100 bg-zinc-900/50 px-3 py-2">
        <p className="text-[12px] font-medium leading-snug text-zinc-200 font-serif">
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
