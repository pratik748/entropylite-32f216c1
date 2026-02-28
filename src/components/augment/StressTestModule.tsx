import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const SCENARIOS = [
  { name: "2008 GFC", portfolioImpact: -32.5, niftyImpact: -52.0, recovery: "18 months" },
  { name: "COVID Crash", portfolioImpact: -24.1, niftyImpact: -38.0, recovery: "5 months" },
  { name: "RBI Rate +150bps", portfolioImpact: -8.2, niftyImpact: -12.5, recovery: "6 months" },
  { name: "Crude $120/bbl", portfolioImpact: -11.4, niftyImpact: -15.2, recovery: "4 months" },
  { name: "INR depreciation 10%", portfolioImpact: -5.8, niftyImpact: -8.1, recovery: "3 months" },
  { name: "FII outflow ₹50K Cr", portfolioImpact: -14.2, niftyImpact: -18.5, recovery: "8 months" },
  { name: "Earnings miss 15%", portfolioImpact: -18.7, niftyImpact: -22.0, recovery: "9 months" },
];

const SENSITIVITY = [
  { factor: "Equity β", shock: "+1σ", pnl: "-₹1.8 Cr", pct: "-3.7%" },
  { factor: "Interest Rate", shock: "+50bps", pnl: "-₹0.9 Cr", pct: "-1.8%" },
  { factor: "Credit Spread", shock: "+100bps", pnl: "-₹0.5 Cr", pct: "-1.0%" },
  { factor: "FX (USD/INR)", shock: "+5%", pnl: "-₹0.4 Cr", pct: "-0.8%" },
  { factor: "Crude Oil", shock: "+20%", pnl: "-₹0.7 Cr", pct: "-1.4%" },
  { factor: "VIX Spike", shock: "+10pts", pnl: "-₹1.2 Cr", pct: "-2.5%" },
];

const chartData = SCENARIOS.map(s => ({
  name: s.name,
  portfolio: s.portfolioImpact,
  benchmark: s.niftyImpact,
}));

const StressTestModule = () => (
  <div className="space-y-6">
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Scenario Impact Analysis</h3>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" horizontal={false} />
            <XAxis type="number" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v}%`} />
            <YAxis dataKey="name" type="category" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} width={115} />
            <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
            <Bar dataKey="portfolio" fill="hsl(0,0%,100%)" fillOpacity={0.8} radius={[0, 4, 4, 0]} name="Portfolio" />
            <Bar dataKey="benchmark" fill="hsl(0,0%,40%)" fillOpacity={0.6} radius={[0, 4, 4, 0]} name="NIFTY 50" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Stress Scenarios Detail</h3>
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {SCENARIOS.map(s => (
            <div key={s.name} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{s.name}</p>
                <p className="text-[10px] text-muted-foreground">Recovery: {s.recovery}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-sm font-bold text-loss">{s.portfolioImpact}%</p>
                <p className="font-mono text-[10px] text-muted-foreground">NIFTY: {s.niftyImpact}%</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Sensitivity Analysis</h3>
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
              {SENSITIVITY.map(s => (
                <tr key={s.factor} className="border-b border-border/50">
                  <td className="px-3 py-2 text-foreground">{s.factor}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{s.shock}</td>
                  <td className="px-3 py-2 font-mono text-loss">{s.pnl}</td>
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

export default StressTestModule;
