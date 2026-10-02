import React from "react";
import type { SashaSubsetMetrics } from "../../types";
import { ShieldAlert, TrendingDown, Activity, PieChart } from "lucide-react";

export const SubsetRiskCard: React.FC<{ metrics: SashaSubsetMetrics }> = ({ metrics }) => {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3.5 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-emerald-400" />
          <span className="text-[12px] font-semibold tracking-wider uppercase text-zinc-200">
            {metrics.title}
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
          {(metrics.weightInPortfolio * 100).toFixed(0)}% of book
        </span>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Annualized σ</div>
          <div className="text-[14px] font-bold font-mono text-zinc-200 mt-0.5">
            {(metrics.annualizedVol * 100).toFixed(1)}%
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">1D VaR 95%</div>
          <div className="text-[14px] font-bold font-mono text-rose-400 mt-0.5">
            -${Math.round(metrics.var95_1d).toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">1D Exp. Shortfall</div>
          <div className="text-[14px] font-bold font-mono text-amber-400 mt-0.5">
            -${Math.round(metrics.cvar95_1d).toLocaleString()}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Sharpe Ratio</div>
          <div className="text-[14px] font-bold font-mono text-emerald-400 mt-0.5">
            {metrics.sharpeRatio}
          </div>
        </div>
      </div>

      {/* Euler Risk Attribution Driver */}
      <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-3">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-zinc-400 flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-rose-400" />
            Top Euler Risk Driver
          </span>
          <span className="text-zinc-200 font-semibold">
            {metrics.topRiskContributor.ticker} ({metrics.topRiskContributor.riskSharePct.toFixed(0)}% of tail risk)
          </span>
        </div>
        <div className="w-full bg-zinc-800/80 rounded-full h-1.5 mt-2 overflow-hidden">
          <div 
            className="bg-rose-500 h-1.5 rounded-full transition-all duration-500" 
            style={{ width: `${Math.min(100, metrics.topRiskContributor.riskSharePct)}%` }}
          />
        </div>
      </div>

      {/* CLANK Warnings */}
      {metrics.clankWarnings.length > 0 && (
        <div className="space-y-1.5 pt-1">
          {metrics.clankWarnings.map((w, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[11px] font-mono text-amber-300/90 bg-amber-950/20 border border-amber-900/30 rounded-lg px-2.5 py-1.5">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span>[{w.ticker}] {w.dimension}: {w.note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
