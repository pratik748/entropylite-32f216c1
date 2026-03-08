import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const COLORS = [
  "hsl(0, 0%, 100%)", "hsl(0, 0%, 80%)", "hsl(0, 0%, 65%)", "hsl(0, 0%, 50%)",
  "hsl(0, 0%, 40%)", "hsl(0, 0%, 30%)", "hsl(0, 0%, 22%)", "hsl(0, 0%, 15%)",
];

const PortfolioConstructionModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { allocations, sharpe, maxDrawdown, driftData } = useMemo(() => {
    if (holdings.length === 0) {
      return { allocations: [], sharpe: 0, maxDrawdown: 0, driftData: [] };
    }

    const alloc = holdings.map((h, i) => ({
      name: h.ticker,
      weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      target: totalValue > 0 ? 100 / holdings.length : 0,
      color: COLORS[i % COLORS.length],
      value: h.value,
    }));

    const returns = holdings.map(h => h.pnlPct / 100);
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const riskFreeRate = 0.065;
    const annualizedReturn = avgReturn * 252;
    const annualizedVol = stdDev * Math.sqrt(252);
    const computedSharpe = annualizedVol > 0 ? (annualizedReturn - riskFreeRate) / annualizedVol : 0;

    const drawdowns = holdings.map(h => h.pnlPct);
    const worstDrawdown = Math.min(...drawdowns, 0);

    const drift = alloc.map(a => ({
      name: a.name,
      drift: +(a.weight - a.target).toFixed(1),
      fill: a.weight > a.target ? "hsl(0, 62%, 50%)" : "hsl(145, 70%, 45%)",
    }));

    return { allocations: alloc, sharpe: computedSharpe, maxDrawdown: worstDrawdown, driftData: drift };
  }, [holdings, totalValue]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks in the Dashboard to see real portfolio construction data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Portfolio Value</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{fmt(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sharpe Ratio</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${sharpe >= 1 ? "text-gain" : sharpe >= 0 ? "text-foreground" : "text-loss"}`}>
            {sharpe.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Max Drawdown</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${maxDrawdown < -10 ? "text-loss" : maxDrawdown < -5 ? "text-warning" : "text-gain"}`}>
            {maxDrawdown.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Current Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={allocations} dataKey="weight" nameKey="name" cx="50%" cy="50%" outerRadius={90} strokeWidth={1} stroke="hsl(var(--background))">
                  {allocations.map((a, i) => <Cell key={i} fill={a.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v.toFixed(1)}%`, "Weight"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {allocations.map(a => (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-muted-foreground">{a.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-foreground">{a.weight.toFixed(1)}%</span>
                  <span className="font-mono text-muted-foreground/50 text-[10px]">{fmt(a.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Drift vs Equal-Weight Target</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={driftData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} width={75} />
                <Bar dataKey="drift" radius={[0, 4, 4, 0]}>
                  {driftData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Rebalance Suggestions</h3>
        <div className="space-y-2">
          {driftData.filter(d => Math.abs(d.drift) > 2).map(d => (
            <div key={d.name} className="flex items-center justify-between rounded-lg bg-surface-2 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.fill }} />
                <span className="text-foreground font-medium">{d.name}</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {d.drift > 0 ? `Reduce by ${d.drift.toFixed(1)}%` : `Increase by ${Math.abs(d.drift).toFixed(1)}%`}
              </span>
            </div>
          ))}
          {driftData.filter(d => Math.abs(d.drift) > 2).length === 0 && (
            <p className="text-sm text-muted-foreground">Portfolio is within tolerance. No rebalancing needed.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortfolioConstructionModule;
