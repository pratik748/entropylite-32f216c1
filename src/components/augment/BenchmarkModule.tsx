import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell } from "recharts";

const MONTHS = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
const CUMULATIVE = MONTHS.map((m, i) => ({
  month: m,
  portfolio: [2.1, 4.8, 3.2, 7.1, 9.4, 12.8][i],
  nifty50: [1.8, 3.5, 2.1, 5.2, 7.8, 10.1][i],
  niftyMidcap: [2.4, 5.1, 1.9, 6.8, 10.2, 13.5][i],
}));

const ATTRIBUTION = [
  { factor: "Stock Selection", value: 3.2, fill: "hsl(0,0%,100%)" },
  { factor: "Sector Allocation", value: 1.8, fill: "hsl(0,0%,75%)" },
  { factor: "Market Timing", value: -0.5, fill: "hsl(0,62%,50%)" },
  { factor: "Currency", value: 0.3, fill: "hsl(0,0%,55%)" },
  { factor: "Residual", value: -0.1, fill: "hsl(0,0%,35%)" },
];

const BenchmarkModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-4">
      {[
        { label: "Alpha (6M)", value: "+2.7%", color: "text-gain" },
        { label: "Beta", value: "0.92", color: "text-foreground" },
        { label: "Tracking Error", value: "3.1%", color: "text-foreground" },
        { label: "Info Ratio", value: "0.87", color: "text-foreground" },
      ].map(s => (
        <div key={s.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${s.color}`}>{s.value}</p>
        </div>
      ))}
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Cumulative Returns vs Benchmark</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={CUMULATIVE}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="month" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="portfolio" stroke="hsl(0,0%,100%)" strokeWidth={2} dot={false} name="Portfolio" />
              <Line type="monotone" dataKey="nifty50" stroke="hsl(0,0%,50%)" strokeWidth={1.5} dot={false} name="NIFTY 50" strokeDasharray="4 4" />
              <Line type="monotone" dataKey="niftyMidcap" stroke="hsl(0,0%,30%)" strokeWidth={1.5} dot={false} name="NIFTY Midcap" strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Performance Attribution</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ATTRIBUTION} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
              <YAxis dataKey="factor" type="category" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} width={95} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {ATTRIBUTION.map((a, i) => <Cell key={i} fill={a.fill} fillOpacity={0.8} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>

    {/* Return decomposition table */}
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Return Decomposition</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Period", "Total Return", "Market", "Alpha", "Dividend", "Currency"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { period: "1M", total: "+2.1%", market: "+1.5%", alpha: "+0.4%", div: "+0.2%", fx: "0.0%" },
              { period: "3M", total: "+7.8%", market: "+5.2%", alpha: "+1.8%", div: "+0.5%", fx: "+0.3%" },
              { period: "6M", total: "+12.8%", market: "+10.1%", alpha: "+2.7%", div: "+1.1%", fx: "-1.1%" },
              { period: "1Y", total: "+22.4%", market: "+18.2%", alpha: "+3.1%", div: "+2.2%", fx: "-1.1%" },
            ].map(r => (
              <tr key={r.period} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono text-foreground">{r.period}</td>
                <td className="px-3 py-2 font-mono text-gain">{r.total}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.market}</td>
                <td className="px-3 py-2 font-mono text-foreground">{r.alpha}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.div}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{r.fx}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default BenchmarkModule;
