/**
 * Spread vs equilibrium with ±1σ / ±2σ Ornstein-Uhlenbeck bands.
 * Pure visualization — no business logic.
 */
import { useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip,
} from "recharts";
import type { OUParameters } from "@/lib/statarb/types";

interface Props {
  spread: number[];
  ou: OUParameters;
  /** Optional pair label for the tooltip. */
  label?: string;
}

export default function OUBandChart({ spread, ou, label }: Props) {
  const data = useMemo(() => {
    if (!spread.length) return [];
    // Trim to the most recent 120 bars for legibility
    const tail = spread.slice(-120);
    const start = spread.length - tail.length;
    return tail.map((s, i) => ({
      t: start + i,
      spread: s,
      mu: ou.mu,
      lower1: ou.mu - ou.sigmaEq,
      upper1: ou.mu + ou.sigmaEq,
      lower2: ou.mu - 2 * ou.sigmaEq,
      upper2: ou.mu + 2 * ou.sigmaEq,
      band1: 2 * ou.sigmaEq,
      band2: 4 * ou.sigmaEq,
    }));
  }, [spread, ou]);

  if (!data.length) {
    return <div className="text-[10px] text-muted-foreground py-6 text-center">No spread data.</div>;
  }

  const lastZ = ou.zScore;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>{label ?? "Spread"} vs equilibrium · μ={ou.mu.toFixed(3)} · σ={ou.sigmaEq.toFixed(3)}</span>
        <span className={Math.abs(lastZ) > 2 ? "text-warning" : "text-foreground/70"}>
          z = {lastZ.toFixed(2)}σ
        </span>
      </div>
      <div className="h-40 sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ouBand2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--warning))" stopOpacity={0.10} />
                <stop offset="100%" stopColor="hsl(var(--warning))" stopOpacity={0.10} />
              </linearGradient>
              <linearGradient id="ouBand1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={40} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                fontSize: 10,
              }}
              formatter={(v: number) => v.toFixed(4)}
            />
            {/* ±2σ band */}
            <Area dataKey="upper2" stroke="none" fill="url(#ouBand2)" />
            <Area dataKey="lower2" stroke="none" fill="hsl(var(--card))" />
            {/* ±1σ band */}
            <Area dataKey="upper1" stroke="none" fill="url(#ouBand1)" />
            <Area dataKey="lower1" stroke="none" fill="hsl(var(--card))" />
            <ReferenceLine y={ou.mu} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" />
            <Line
              type="monotone" dataKey="spread"
              stroke="hsl(var(--primary))" strokeWidth={1.6} dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
