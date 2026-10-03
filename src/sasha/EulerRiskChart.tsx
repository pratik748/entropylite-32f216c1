/**
 * SASHA Euler Marginal Risk Breakdown Chart
 *
 * Decomposes portfolio volatility into individual percentage Euler risk contributions (PCR_i)
 * vs Capital Allocation Weight (w_i).
 */

import React from "react";
import type { EulerRiskShare } from "./types";

interface EulerRiskChartProps {
  shares: EulerRiskShare[];
  dominantTicker: string;
}

export const EulerRiskChart: React.FC<EulerRiskChartProps> = ({ shares, dominantTicker }) => {
  if (!shares || shares.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/80 bg-surface-1/90 p-3 space-y-2.5">
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono">
          Euler Risk Attribution vs Capital Allocation
        </span>
        <span className="text-[9px] text-muted-foreground font-mono">
          Dominant: <strong className="text-foreground">{dominantTicker}</strong>
        </span>
      </div>

      <div className="space-y-2.5">
        {shares.map((item) => {
          const isDominant = item.ticker === dominantTicker;
          const isRiskConcentrated = item.eulerRiskSharePct > item.weightPct * 1.5;

          return (
            <div key={item.ticker} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <div className="flex items-center gap-1.5">
                  <span className={`font-semibold ${isDominant ? "text-foreground font-bold" : "text-foreground/90"}`}>
                    {item.ticker}
                  </span>
                  <span className="text-[9px] text-muted-foreground/60 font-sans">({item.sector})</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] tabular-nums">
                  <span className="text-muted-foreground">Weight: {item.weightPct.toFixed(1)}%</span>
                  <span className="text-muted-foreground">σ: {item.volatilityPct.toFixed(1)}%</span>
                  <span
                    className={`font-semibold ${
                      isRiskConcentrated ? "text-amber-400 font-bold" : "text-foreground"
                    }`}
                  >
                    Risk Share: {item.eulerRiskSharePct.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Parallel Horizontal Share Bars */}
              <div className="space-y-0.5">
                {/* Capital Weight Bar */}
                <div className="flex items-center gap-2">
                  <span className="w-10 text-[8.5px] font-mono text-muted-foreground/70 text-right">CAP</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="bg-muted-foreground/50 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(100, item.weightPct * 2)}%` }}
                    />
                  </div>
                </div>
                {/* Euler Risk Share Bar */}
                <div className="flex items-center gap-2">
                  <span className="w-10 text-[8.5px] font-mono text-muted-foreground/70 text-right">RISK</span>
                  <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isRiskConcentrated ? "bg-amber-400" : "bg-foreground"
                      }`}
                      style={{ width: `${Math.min(100, item.eulerRiskSharePct * 2)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
