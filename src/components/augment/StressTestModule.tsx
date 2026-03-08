import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const SCENARIO_IMPACTS: Record<string, { portfolioMultiplier: number; benchmarkImpact: number; recovery: string }> = {
  "2008 GFC Replay": { portfolioMultiplier: -0.325, benchmarkImpact: -52.0, recovery: "18 months" },
  "COVID-19 Crash": { portfolioMultiplier: -0.241, benchmarkImpact: -38.0, recovery: "5 months" },
  "Rate Hike +150bps": { portfolioMultiplier: -0.082, benchmarkImpact: -12.5, recovery: "6 months" },
  "Crude Oil $120/bbl": { portfolioMultiplier: -0.114, benchmarkImpact: -15.2, recovery: "4 months" },
  "Currency Depreciation 10%": { portfolioMultiplier: -0.058, benchmarkImpact: -8.1, recovery: "3 months" },
  "Large FII Outflow": { portfolioMultiplier: -0.142, benchmarkImpact: -18.5, recovery: "8 months" },
  "Earnings Miss 15%": { portfolioMultiplier: -0.187, benchmarkImpact: -22.0, recovery: "9 months" },
};

const StressTestModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { scenarios, sensitivity } = useMemo(() => {
    const avgRisk = holdings.length > 0
      ? holdings.reduce((s, h) => s + h.risk, 0) / holdings.length : 40;
    const avgBeta = holdings.length > 0
      ? holdings.reduce((s, h) => s + h.beta, 0) / holdings.length : 1;

    const riskMultiplier = avgRisk / 50;
    const scenarioData = Object.entries(SCENARIO_IMPACTS).map(([name, s]) => ({
      name,
      portfolioImpact: +(s.portfolioMultiplier * riskMultiplier * 100).toFixed(1),
      benchmarkImpact: s.benchmarkImpact,
      recovery: s.recovery,
      pnlLoss: totalValue * Math.abs(s.portfolioMultiplier * riskMultiplier),
    }));

    const sensitivityData = [
      { factor: "Equity β", shock: "+1σ", pnl: fmt(totalValue * 0.037 * avgBeta), pct: `${(-3.7 * avgBeta).toFixed(1)}%` },
      { factor: "Interest Rate", shock: "+50bps", pnl: fmt(totalValue * 0.018), pct: "-1.8%" },
      { factor: "Credit Spread", shock: "+100bps", pnl: fmt(totalValue * 0.010), pct: "-1.0%" },
      { factor: "FX", shock: "+5%", pnl: fmt(totalValue * 0.008), pct: "-0.8%" },
      { factor: "Crude Oil", shock: "+20%", pnl: fmt(totalValue * 0.014), pct: "-1.4%" },
      { factor: "VIX Spike", shock: "+10pts", pnl: fmt(totalValue * 0.025), pct: "-2.5%" },
    ];

    return { scenarios: scenarioData, sensitivity: sensitivityData };
  }, [holdings, totalValue, fmt]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to run stress tests on your actual portfolio.</p>
      </div>
    );
  }

  const chartData = scenarios.map(s => ({ name: s.name, portfolio: s.portfolioImpact, benchmark: s.benchmarkImpact }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Scenario Impact — Your Portfolio</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} width={115} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="portfolio" fill="hsl(var(--foreground))" fillOpacity={0.8} radius={[0, 4, 4, 0]} name="Your Portfolio" />
              <Bar dataKey="benchmark" fill="hsl(var(--muted-foreground))" fillOpacity={0.6} radius={[0, 4, 4, 0]} name="Benchmark" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Estimated P&L Impact</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {scenarios.map(s => (
              <div key={s.name} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">Recovery: {s.recovery}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-loss">{s.portfolioImpact}%</p>
                  <p className="font-mono text-[10px] text-loss">-{fmt(s.pnlLoss)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sensitivity Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Factor", "Shock", "P&L Impact", "% Impact"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sensitivity.map(s => (
                  <tr key={s.factor} className="border-b border-border/50">
                    <td className="px-3 py-2 text-foreground">{s.factor}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{s.shock}</td>
                    <td className="px-3 py-2 font-mono text-loss">-{s.pnl}</td>
                    <td className="px-3 py-2 font-mono text-loss">{s.pct}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StressTestModule;
