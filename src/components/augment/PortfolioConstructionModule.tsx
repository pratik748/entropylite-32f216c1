import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

const ALLOCATIONS = [
  { name: "Large Cap Equity", weight: 35, target: 35, color: "hsl(0, 0%, 100%)" },
  { name: "Mid Cap Equity", weight: 18, target: 20, color: "hsl(0, 0%, 75%)" },
  { name: "Small Cap Equity", weight: 8, target: 5, color: "hsl(0, 0%, 55%)" },
  { name: "Government Bonds", weight: 15, target: 15, color: "hsl(0, 0%, 40%)" },
  { name: "Corporate Bonds", weight: 10, target: 10, color: "hsl(0, 0%, 30%)" },
  { name: "Gold / Commodities", weight: 7, target: 8, color: "hsl(0, 0%, 22%)" },
  { name: "REITs", weight: 4, target: 4, color: "hsl(0, 0%, 15%)" },
  { name: "Cash", weight: 3, target: 3, color: "hsl(0, 0%, 10%)" },
];

const EFFICIENT_FRONTIER = Array.from({ length: 20 }, (_, i) => ({
  risk: 5 + i * 1.5,
  return: 4 + Math.sqrt(i * 3) * 4 - (i > 15 ? (i - 15) * 0.5 : 0),
}));

const REBALANCE_HISTORY = [
  { date: "2026-02-01", action: "Reduced Mid Cap by 2%", drift: 2.3 },
  { date: "2026-01-15", action: "Added to Gold on dip", drift: 1.8 },
  { date: "2025-12-20", action: "Tax-loss harvesting — Small Cap", drift: 3.1 },
  { date: "2025-11-30", action: "Quarterly rebalance executed", drift: 4.2 },
];

const PortfolioConstructionModule = () => {
  const driftData = ALLOCATIONS.map(a => ({
    name: a.name.split(" ").slice(0, 2).join(" "),
    drift: a.weight - a.target,
    fill: a.weight > a.target ? "hsl(0, 62%, 50%)" : "hsl(145, 70%, 45%)",
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Total AUM</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">₹48.7 Cr</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Portfolio Sharpe</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">1.42</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Max Drawdown</p>
          <p className="mt-1 font-mono text-2xl font-bold text-loss">-12.3%</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Allocation Pie */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Current Allocation</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ALLOCATIONS} dataKey="weight" nameKey="name" cx="50%" cy="50%" outerRadius={90} strokeWidth={1} stroke="hsl(0,0%,3%)">
                  {ALLOCATIONS.map((a, i) => <Cell key={i} fill={a.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`${v}%`, "Weight"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {ALLOCATIONS.map(a => (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-muted-foreground">{a.name}</span>
                </div>
                <span className="font-mono text-foreground">{a.weight}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Drift Chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Allocation Drift vs Target</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={driftData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} width={75} />
                <Bar dataKey="drift" radius={[0, 4, 4, 0]}>
                  {driftData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rebalance log */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Rebalance History</h3>
        <div className="space-y-2">
          {REBALANCE_HISTORY.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-surface-2 p-3 text-sm">
              <div>
                <span className="font-mono text-xs text-muted-foreground">{r.date}</span>
                <p className="text-foreground">{r.action}</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">Drift: {r.drift}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PortfolioConstructionModule;
