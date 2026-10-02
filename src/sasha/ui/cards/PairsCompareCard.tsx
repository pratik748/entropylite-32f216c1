import React from "react";
import type { SashaPairsMetrics } from "../../types";
import { ArrowRightLeft, GitCompare, Gauge, Zap } from "lucide-react";

export const PairsCompareCard: React.FC<{ metrics: SashaPairsMetrics }> = ({ metrics }) => {
  const isAOver = metrics.verdict === "A_OVERVALUED_VS_B";
  const isBOver = metrics.verdict === "B_OVERVALUED_VS_A";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3.5 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <GitCompare className="h-4 w-4 text-cyan-400" />
          <span className="text-[12px] font-semibold tracking-wider uppercase text-zinc-200">
            {metrics.tickerA} <span className="text-zinc-500">vs</span> {metrics.tickerB}
          </span>
        </div>
        <span className={`text-[10.5px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${
          isAOver || isBOver 
            ? "bg-amber-950/30 border-amber-800/50 text-amber-300"
            : "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
        }`}>
          {metrics.isCointegrated ? "Cointegrated (p<0.05)" : "Correlated"}
        </span>
      </div>

      {/* Primary Pairs Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Pearson r</div>
          <div className="text-[14px] font-bold font-mono text-zinc-200 mt-0.5">
            {metrics.correlation}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Spread Z-Score</div>
          <div className={`text-[14px] font-bold font-mono mt-0.5 ${
            Math.abs(metrics.spreadZScore) > 1.5 ? "text-amber-400" : "text-zinc-200"
          }`}>
            {metrics.spreadZScore > 0 ? `+${metrics.spreadZScore}` : metrics.spreadZScore}σ
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Half-Life</div>
          <div className="text-[14px] font-bold font-mono text-cyan-400 mt-0.5">
            {metrics.halfLifeDays} days
          </div>
        </div>

        <div className="rounded-lg bg-zinc-900/60 p-2.5 border border-zinc-800/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">OLS Beta (A on B)</div>
          <div className="text-[14px] font-bold font-mono text-zinc-200 mt-0.5">
            {metrics.beta}x
          </div>
        </div>
      </div>

      {/* Arbitrage Spread Verdict */}
      <div className="rounded-lg bg-zinc-900/40 border border-zinc-800/60 p-3">
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-300">
          <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
          <span>{metrics.verdictRationale}</span>
        </div>
      </div>
    </div>
  );
};
