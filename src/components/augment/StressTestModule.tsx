import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const SCENARIO_IMPACTS: Record<string, { portfolioMultiplier: number; niftyImpact: number; recovery: string }> = {
  "2008 GFC Replay": { portfolioMultiplier: -0.325, niftyImpact: -52.0, recovery: "18 months" },
  "COVID-19 Crash": { portfolioMultiplier: -0.241, niftyImpact: -38.0, recovery: "5 months" },
  "RBI Rate +150bps": { portfolioMultiplier: -0.082, niftyImpact: -12.5, recovery: "6 months" },
  "Crude Oil $120/bbl": { portfolioMultiplier: -0.114, niftyImpact: -15.2, recovery: "4 months" },
  "INR Depreciation 10%": { portfolioMultiplier: -0.058, niftyImpact: -8.1, recovery: "3 months" },
  "FII Outflow ₹50K Cr": { portfolioMultiplier: -0.142, niftyImpact: -18.5, recovery: "8 months" },
  "Earnings Miss 15%": { portfolioMultiplier: -0.187, niftyImpact: -22.0, recovery: "9 months" },
};

const StressTestModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { totalValue, scenarios, sensitivity } = useMemo(() => {
    const total = analyzed.reduce((s, st) => s + (st.analysis?.currentPrice || st.buyPrice) * st.quantity, 0);
    const avgRisk = analyzed.length > 0
      ? analyzed.reduce((s, st) => s + (st.analysis?.riskScore || 40), 0) / analyzed.length
      : 40;

    // Risk-adjust scenario impacts
    const riskMultiplier = avgRisk / 50; // normalize around 50
    const scenarioData = Object.entries(SCENARIO_IMPACTS).map(([name, s]) => ({
      name,
      portfolioImpact: +(s.portfolioMultiplier * riskMultiplier * 100).toFixed(1),
      niftyImpact: s.niftyImpact,
      recovery: s.recovery,
      pnlLoss: total * Math.abs(s.portfolioMultiplier * riskMultiplier),
    }));

    // Sensitivity from real portfolio
    const avgBeta = analyzed.length > 0
      ? analyzed.reduce((s, st) => s + (st.analysis?.beta || 1), 0) / analyzed.length
      : 1;
    const sensitivityData = [
      { factor: "Equity β", shock: "+1σ", pnl: `₹${(total * 0.037 * avgBeta / 100000).toFixed(1)} L`, pct: `${(-3.7 * avgBeta).toFixed(1)}%` },
      { factor: "Interest Rate", shock: "+50bps", pnl: `₹${(total * 0.018 / 100000).toFixed(1)} L`, pct: "-1.8%" },
      { factor: "Credit Spread", shock: "+100bps", pnl: `₹${(total * 0.010 / 100000).toFixed(1)} L`, pct: "-1.0%" },
      { factor: "FX (USD/INR)", shock: "+5%", pnl: `₹${(total * 0.008 / 100000).toFixed(1)} L`, pct: "-0.8%" },
      { factor: "Crude Oil", shock: "+20%", pnl: `₹${(total * 0.014 / 100000).toFixed(1)} L`, pct: "-1.4%" },
      { factor: "VIX Spike", shock: "+10pts", pnl: `₹${(total * 0.025 / 100000).toFixed(1)} L`, pct: "-2.5%" },
    ];

    return { totalValue: total, scenarios: scenarioData, sensitivity: sensitivityData };
  }, [analyzed]);

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to run stress tests on your actual portfolio.</p>
      </div>
    );
  }

  const chartData = scenarios.map(s => ({ name: s.name, portfolio: s.portfolioImpact, benchmark: s.niftyImpact }));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Scenario Impact — Your Portfolio</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="name" type="category" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} width={115} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="portfolio" fill="hsl(0,0%,100%)" fillOpacity={0.8} radius={[0, 4, 4, 0]} name="Your Portfolio" />
              <Bar dataKey="benchmark" fill="hsl(0,0%,40%)" fillOpacity={0.6} radius={[0, 4, 4, 0]} name="NIFTY 50" />
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
                  <p className="font-mono text-[10px] text-loss">-₹{(s.pnlLoss / 100000).toFixed(1)} L</p>
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
