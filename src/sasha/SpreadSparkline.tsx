/**
 * SASHA Cointegration Spread Sparkline & Z-Score Distribution
 *
 * Visualizes the synthetic spread S_t = Price_A - beta * Price_B
 * relative to mean reversion equilibrium with +/- 1.0 sigma and +/- 2.0 sigma stat-arb thresholds.
 */

import React from "react";

interface SpreadSparklineProps {
  sparkline: number[];
  zScore: number;
  tickerA: string;
  tickerB: string;
  halfLifeDays: number;
}

export const SpreadSparkline: React.FC<SpreadSparklineProps> = ({
  sparkline,
  zScore,
  tickerA,
  tickerB,
  halfLifeDays,
}) => {
  if (!sparkline || sparkline.length < 2) return null;

  const min = Math.min(...sparkline);
  const max = Math.max(...sparkline);
  const range = max - min || 1;

  const width = 360;
  const height = 70;
  const padding = 6;

  // Generate SVG path points
  const points = sparkline.map((val, idx) => {
    const x = padding + (idx / (sparkline.length - 1)) * (width - padding * 2);
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(" L ")}`;

  // Mean equilibrium line (0 z-score level roughly middle)
  const meanY = height / 2;

  // Last point coordinates
  const lastPoint = points[points.length - 1].split(",");
  const lastX = parseFloat(lastPoint[0]);
  const lastY = parseFloat(lastPoint[1]);

  return (
    <div className="rounded-lg border border-border/80 bg-surface-1/90 p-2.5 space-y-2">
      <div className="flex items-center justify-between text-[9.5px] font-mono border-b border-border/50 pb-1 text-muted-foreground">
        <span className="font-semibold text-foreground uppercase tracking-[0.1em]">
          Spread Time Series ({tickerA} / {tickerB})
        </span>
        <span>
          OU Half-Life: <strong className="text-foreground">{halfLifeDays.toFixed(1)}d</strong> • Z:{" "}
          <strong className={Math.abs(zScore) >= 2 ? "text-amber-400" : "text-foreground"}>
            {zScore > 0 ? "+" : ""}{zScore.toFixed(2)}σ
          </strong>
        </span>
      </div>

      <div className="relative w-full overflow-hidden flex items-center justify-center">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[70px] stroke-foreground fill-none overflow-visible"
        >
          {/* Upper Threshold (+2.0 sigma) */}
          <line
            x1={padding}
            y1={height * 0.2}
            x2={width - padding}
            y2={height * 0.2}
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeDasharray="2 2"
            strokeWidth="1"
          />
          {/* Mean Equilibrium (0.0 sigma) */}
          <line
            x1={padding}
            y1={meanY}
            x2={width - padding}
            y2={meanY}
            stroke="currentColor"
            strokeOpacity="0.35"
            strokeDasharray="4 2"
            strokeWidth="1"
          />
          {/* Lower Threshold (-2.0 sigma) */}
          <line
            x1={padding}
            y1={height * 0.8}
            x2={width - padding}
            y2={height * 0.8}
            stroke="currentColor"
            strokeOpacity="0.2"
            strokeDasharray="2 2"
            strokeWidth="1"
          />

          {/* Spread Path */}
          <path d={pathD} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />

          {/* Current Observation Node */}
          <circle
            cx={lastX}
            cy={lastY}
            r="3.5"
            fill="currentColor"
            className={Math.abs(zScore) >= 2 ? "text-amber-400" : "text-emerald-400"}
          />
        </svg>
      </div>

      <div className="flex items-center justify-between text-[8.5px] font-mono text-muted-foreground/60">
        <span>-60D History</span>
        <span>Equilibrium (μ)</span>
        <span>Current (t=0)</span>
      </div>
    </div>
  );
};
