import React from "react";
import type { SashaScenarioImpact } from "../../types";
import { AlertTriangle, ShieldCheck, Flame, ArrowDownRight } from "lucide-react";

export const ScenarioStressCard: React.FC<{ impact: SashaScenarioImpact }> = ({ impact }) => {
  const isLoss = impact.estimatedPortfolioPnL < 0;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 space-y-3.5 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-400" />
          <span className="text-[12px] font-semibold tracking-wider uppercase text-zinc-200">
            {impact.scenarioName}
          </span>
        </div>
        <span className={`text-[11px] font-mono px-2 py-0.5 rounded font-bold ${
          isLoss ? "bg-rose-950/30 border border-rose-800/50 text-rose-300" : "bg-emerald-950/30 border border-emerald-800/50 text-emerald-300"
        }`}>
          {impact.estimatedPortfolioPnLPct >= 0 ? "+" : ""}{impact.estimatedPortfolioPnLPct}% Projected
        </span>
      </div>

      <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
        {impact.shockDescription}
      </p>

      {/* Vulnerable vs Resilient transmission lines */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div className="rounded-lg bg-rose-950/20 border border-rose-900/30 p-2.5">
          <div className="text-[10px] font-mono uppercase text-rose-400 flex items-center gap-1.5">
            <ArrowDownRight className="h-3 w-3" /> Most Vulnerable
          </div>
          <div className="text-[13px] font-mono font-bold text-zinc-200 mt-1">
            {impact.mostVulnerableAsset.ticker} ({impact.mostVulnerableAsset.estimatedDropPct}%)
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {impact.mostVulnerableAsset.transmissionReason}
          </div>
        </div>

        <div className="rounded-lg bg-emerald-950/20 border border-emerald-900/30 p-2.5">
          <div className="text-[10px] font-mono uppercase text-emerald-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" /> Most Resilient
          </div>
          <div className="text-[13px] font-mono font-bold text-zinc-200 mt-1">
            {impact.mostResilientAsset.ticker} ({impact.mostResilientAsset.estimatedPnLPct >= 0 ? "+" : ""}{impact.mostResilientAsset.estimatedPnLPct}%)
          </div>
          <div className="text-[10px] text-zinc-400 mt-0.5">
            {impact.mostResilientAsset.transmissionReason}
          </div>
        </div>
      </div>

      {/* Suggested Quantitative Hedge */}
      <div className="rounded-lg bg-zinc-900/50 border border-zinc-800/60 p-2.5 text-[11px] font-mono text-zinc-300 flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
        <span><strong className="text-zinc-200">Systemic Hedge:</strong> {impact.recommendedHedge}</span>
      </div>
    </div>
  );
};
