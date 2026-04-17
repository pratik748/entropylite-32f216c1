/**
 * Monte Carlo probability cone — P5/P50/P95 envelopes of forward spread paths.
 * Probabilistic-language only.
 */
import { useMemo } from "react";
import {
  ComposedChart, Area, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine,
} from "recharts";
import type { MCRobustness, OUParameters } from "@/lib/statarb/types";

interface Props {
  mc: MCRobustness;
  ou: OUParameters;
}

export default function ProbabilityCone({ mc, ou }: Props) {
  const data = useMemo(() => {
    return mc.pathsP50.map((p50, i) => ({
      t: i + 1,
      p5: mc.pathsP5[i],
      p50,
      p95: mc.pathsP95[i],
      mu: ou.mu,
      // Recharts stacked-area trick: render lower then a positive band
      band: mc.pathsP95[i] - mc.pathsP5[i],
      lower: mc.pathsP5[i],
    }));
  }, [mc, ou]);

  if (!data.length) {
    return <div className="text-[10px] text-muted-foreground py-6 text-center">No paths simulated.</div>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>Monte Carlo cone (P5 / P50 / P95) · {mc.pathsP50.length} bars ahead</span>
        <span className="text-foreground/80">
          P(reversion) ≈ {(mc.pReversion * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-40 sm:h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="coneFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
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
            {/* invisible lower */}
            <Area dataKey="lower" stackId="cone" stroke="none" fill="transparent" />
            <Area dataKey="band" stackId="cone" stroke="none" fill="url(#coneFill)" />
            <Line type="monotone" dataKey="p50" stroke="hsl(var(--primary))" strokeWidth={1.4} dot={false} isAnimationActive={false} />
            <ReferenceLine y={ou.mu} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 3" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
