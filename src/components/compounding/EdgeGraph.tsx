import { useMemo } from "react";
import { BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid, ScatterChart, Scatter, ZAxis } from "recharts";
import { TrendingUp, Clock, AlertTriangle, LineChart as LineIcon } from "lucide-react";
import type { LodgerTrade } from "@/lib/lodgers-math";

interface Props {
  histogram: { range: string; count: number; midMin: number; avgPnl: number }[];
  decay: { a: number; b: number; optimalHold: number; rSquared: number };
  overtrade: { byCount: { tradesPerDay: number; avgPnl: number; n: number }[]; inflection: number };
  equityCurve: { idx: number; equity: number; date: string }[];
  envelopes: { day: number; target1: number; target2: number; ruin: number }[];
  trades: LodgerTrade[];
}

const Card = ({ title, icon, children, badge }: { title: string; icon: React.ReactNode; children: React.ReactNode; badge?: string }) => (
  <div className="rounded-sm border border-border bg-card p-2.5">
    <div className="flex items-center justify-between mb-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <h4 className="text-[10px] font-mono uppercase tracking-wider text-foreground">{title}</h4>
      </div>
      {badge && <span className="text-[9px] font-mono text-muted-foreground">{badge}</span>}
    </div>
    {children}
  </div>
);

const tipStyle = { background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 };

const EdgeGraph = ({ histogram, decay, overtrade, equityCurve, envelopes, trades }: Props) => {
  // Decay curve: synthesize fitted line over observed hold-time range
  const decayCurve = useMemo(() => {
    if (trades.length < 5) return [];
    const holds = trades.map(t => t.actual_hold_min).filter(h => h > 0).sort((a, b) => a - b);
    if (holds.length === 0) return [];
    const min = Math.max(1, holds[0]);
    const max = Math.max(min + 1, holds[holds.length - 1]);
    const pts: { hold: number; fit: number; observed?: number }[] = [];
    for (let h = min; h <= max; h += Math.max(1, (max - min) / 30)) {
      pts.push({ hold: Math.round(h), fit: decay.a - decay.b * Math.log(1 + h) });
    }
    // Observed scatter merged
    const scatter = trades
      .filter(t => t.actual_hold_min > 0)
      .map(t => ({ hold: t.actual_hold_min, observed: t.pnl_pct, fit: NaN }));
    return [...pts, ...scatter];
  }, [trades, decay]);

  // Combine equity with envelopes (align lengths)
  const equityVsTargets = useMemo(() => {
    const len = Math.max(equityCurve.length, envelopes.length);
    const out: { idx: number; equity: number | null; target1: number; target2: number; ruin: number }[] = [];
    for (let i = 0; i < len; i++) {
      out.push({
        idx: i,
        equity: i < equityCurve.length ? equityCurve[i].equity : null,
        target1: envelopes[i]?.target1 ?? 100,
        target2: envelopes[i]?.target2 ?? 100,
        ruin: envelopes[i]?.ruin ?? 100,
      });
    }
    return out;
  }, [equityCurve, envelopes]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
      <Card title="Optimal Hold-Time" icon={<Clock className="h-3 w-3 text-primary" />} badge={`Optimal ≈ ${decay.optimalHold.toFixed(0)}m`}>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={histogram}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="range" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Edge Decay" icon={<TrendingUp className="h-3 w-3 text-primary" />} badge={`R² ${decay.rSquared.toFixed(2)}`}>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis type="number" dataKey="hold" name="hold" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} unit="m" />
              <YAxis type="number" dataKey="observed" name="pnl" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} unit="%" />
              <ZAxis range={[20, 20]} />
              <Tooltip contentStyle={tipStyle} />
              <Scatter data={decayCurve.filter(p => Number.isFinite(p.observed))} fill="hsl(var(--primary))" />
              <Line type="monotone" data={decayCurve.filter(p => Number.isFinite(p.fit))} dataKey="fit" stroke="hsl(var(--warning))" strokeWidth={1.5} dot={false} />
              <ReferenceLine x={decay.optimalHold} stroke="hsl(var(--gain))" strokeDasharray="4 4" />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Overtrading Threshold" icon={<AlertTriangle className="h-3 w-3 text-warning" />} badge={`Inflection @ ${overtrade.inflection || "—"}/day`}>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overtrade.byCount}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="tradesPerDay" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="avgPnl" radius={[2, 2, 0, 0]}>
                {overtrade.byCount.map((row, i) => (
                  <rect key={i} fill={row.avgPnl >= 0 ? "hsl(var(--gain))" : "hsl(var(--loss))"} />
                ))}
              </Bar>
              {overtrade.inflection > 0 && (
                <ReferenceLine x={overtrade.inflection} stroke="hsl(var(--warning))" strokeDasharray="4 4" />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Compounding Curve" icon={<LineIcon className="h-3 w-3 text-primary" />} badge={`Trades: ${equityCurve.length}`}>
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={equityVsTargets}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="idx" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} domain={["auto", "auto"]} />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="target1" stroke="hsl(var(--gain))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="target2" stroke="hsl(var(--gain))" strokeWidth={1} strokeDasharray="6 3" dot={false} />
              <Line type="monotone" dataKey="ruin"    stroke="hsl(var(--loss))" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="equity"  stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="2 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
};

export default EdgeGraph;