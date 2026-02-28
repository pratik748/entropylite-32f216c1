const SECTOR_EXPOSURE = [
  { sector: "Financials", long: 22.1, short: 2.0, net: 20.1 },
  { sector: "Technology", long: 18.4, short: 0, net: 18.4 },
  { sector: "Energy", long: 12.8, short: 3.2, net: 9.6 },
  { sector: "Consumer", long: 9.2, short: 0, net: 9.2 },
  { sector: "Healthcare", long: 6.5, short: 0, net: 6.5 },
  { sector: "Industrials", long: 5.1, short: 0, net: 5.1 },
  { sector: "Materials", long: 3.8, short: 1.5, net: 2.3 },
];

const GEOGRAPHY = [
  { region: "India", pct: 92.4, value: "₹45.0 Cr" },
  { region: "US ADR", pct: 4.2, value: "₹2.0 Cr" },
  { region: "Singapore", pct: 2.1, value: "₹1.0 Cr" },
  { region: "UK", pct: 1.3, value: "₹0.6 Cr" },
];

const RISK_HEATMAP = [
  { factor: "Market Risk", q1: 45, q2: 52, q3: 68, q4: 58, current: 62 },
  { factor: "Credit Risk", q1: 28, q2: 31, q3: 35, q4: 32, current: 30 },
  { factor: "Liquidity Risk", q1: 22, q2: 25, q3: 42, q4: 35, current: 28 },
  { factor: "FX Risk", q1: 15, q2: 18, q3: 28, q4: 22, current: 20 },
  { factor: "Concentration", q1: 55, q2: 58, q3: 62, q4: 60, current: 58 },
];

const heatColor = (v: number) => {
  if (v >= 60) return "bg-loss/30 text-loss";
  if (v >= 40) return "bg-warning/20 text-warning";
  return "bg-gain/10 text-gain";
};

const ExposureDashboardModule = () => (
  <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Sector Exposure (Long/Short)</h3>
        <div className="space-y-2">
          {SECTOR_EXPOSURE.map(s => (
            <div key={s.sector} className="flex items-center gap-3">
              <span className="w-20 text-sm text-muted-foreground">{s.sector}</span>
              <div className="flex-1 flex items-center gap-1">
                <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden relative">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${s.long}%` }} />
                  {s.short > 0 && (
                    <div className="absolute right-0 top-0 h-full rounded-full bg-loss/60" style={{ width: `${s.short}%` }} />
                  )}
                </div>
              </div>
              <span className="font-mono text-xs text-foreground w-12 text-right">{s.net.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Geographic Exposure</h3>
        <div className="space-y-2">
          {GEOGRAPHY.map(g => (
            <div key={g.region} className="flex items-center gap-3">
              <span className="w-20 text-sm text-muted-foreground">{g.region}</span>
              <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full rounded-full bg-foreground" style={{ width: `${g.pct}%` }} />
              </div>
              <span className="font-mono text-xs text-foreground w-16 text-right">{g.pct}%</span>
              <span className="font-mono text-xs text-muted-foreground w-16 text-right">{g.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Risk Heatmap */}
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Risk Heatmap (Quarterly Trend)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Factor</th>
              {["Q1 '25", "Q2 '25", "Q3 '25", "Q4 '25", "Current"].map(h => (
                <th key={h} className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RISK_HEATMAP.map(r => (
              <tr key={r.factor} className="border-b border-border/50">
                <td className="px-3 py-2 text-foreground">{r.factor}</td>
                {[r.q1, r.q2, r.q3, r.q4, r.current].map((v, i) => (
                  <td key={i} className="px-3 py-2 text-center">
                    <span className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-bold ${heatColor(v)}`}>{v}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* Transparency report */}
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Portfolio Transparency Summary</h3>
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Gross Exposure", value: "119.4%" },
          { label: "Net Exposure", value: "86.2%" },
          { label: "Leverage", value: "1.19x" },
          { label: "Turnover (30d)", value: "28.4%" },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-surface-2 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ExposureDashboardModule;
