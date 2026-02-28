import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

const RISK_FACTORS = [
  { risk: "Market β", value: 72 },
  { risk: "Credit Spread", value: 45 },
  { risk: "Liquidity", value: 58 },
  { risk: "Counterparty", value: 32 },
  { risk: "Concentration", value: 67 },
  { risk: "FX", value: 41 },
];

const CONCENTRATION_DATA = [
  { name: "RELIANCE", pct: 18.2 },
  { name: "HDFC Bank", pct: 14.5 },
  { name: "TCS", pct: 12.1 },
  { name: "Infosys", pct: 9.8 },
  { name: "ICICI Bank", pct: 8.4 },
  { name: "Others", pct: 37.0 },
];

const RiskModelingModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-4">
      {[
        { label: "Portfolio VaR (95%)", value: "₹2.1 Cr", sub: "1-day parametric" },
        { label: "CVaR (95%)", value: "₹3.4 Cr", sub: "Expected shortfall" },
        { label: "Liquidity VaR", value: "₹2.8 Cr", sub: "5-day adjusted" },
        { label: "Stress VaR", value: "₹5.2 Cr", sub: "2008-type scenario" },
      ].map(s => (
        <div key={s.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="mt-1 font-mono text-xl font-bold text-loss">{s.value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
        </div>
      ))}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Multi-Factor Risk Radar</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={RISK_FACTORS}>
              <PolarGrid stroke="hsl(0,0%,14%)" />
              <PolarAngleAxis dataKey="risk" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(0,0%,45%)", fontSize: 9 }} />
              <Radar dataKey="value" stroke="hsl(0,0%,100%)" fill="hsl(0,0%,100%)" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Concentration Risk (Top Holdings)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={CONCENTRATION_DATA} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                {CONCENTRATION_DATA.map((_, i) => (
                  <Cell key={i} fill={`hsl(0, 0%, ${100 - i * 12}%)`} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>

    {/* Credit risk table */}
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Credit & Counterparty Risk Matrix</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Counterparty", "Rating", "Exposure", "PD", "LGD", "EL"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: "HDFC Bank", rating: "AAA", exp: "₹8.2 Cr", pd: "0.02%", lgd: "45%", el: "₹0.74 L" },
              { name: "SBI", rating: "AAA", exp: "₹5.1 Cr", pd: "0.03%", lgd: "45%", el: "₹0.69 L" },
              { name: "ICICI Bank", rating: "AA+", exp: "₹4.8 Cr", pd: "0.05%", lgd: "50%", el: "₹1.20 L" },
              { name: "Axis Bank", rating: "AA+", exp: "₹3.2 Cr", pd: "0.05%", lgd: "50%", el: "₹0.80 L" },
              { name: "Kotak Mahindra", rating: "AAA", exp: "₹2.9 Cr", pd: "0.02%", lgd: "40%", el: "₹0.23 L" },
            ].map(r => (
              <tr key={r.name} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono text-foreground">{r.name}</td>
                <td className="px-3 py-2"><span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-xs text-foreground">{r.rating}</span></td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.exp}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.pd}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.lgd}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.el}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default RiskModelingModule;
