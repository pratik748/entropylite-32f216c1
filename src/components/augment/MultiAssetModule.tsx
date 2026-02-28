const ASSET_CLASSES = [
  { asset: "Indian Equities", nav: "₹24.8 Cr", weight: "50.9%", dayPnl: "+₹18.2 L", ytd: "+14.2%" },
  { asset: "Government Bonds", nav: "₹7.3 Cr", weight: "15.0%", dayPnl: "+₹1.2 L", ytd: "+4.8%" },
  { asset: "Corporate Bonds", nav: "₹4.9 Cr", weight: "10.1%", dayPnl: "+₹0.8 L", ytd: "+6.2%" },
  { asset: "Gold ETF", nav: "₹3.4 Cr", weight: "7.0%", dayPnl: "+₹5.4 L", ytd: "+18.5%" },
  { asset: "REITs", nav: "₹2.0 Cr", weight: "4.1%", dayPnl: "-₹0.3 L", ytd: "+8.1%" },
  { asset: "FX Forwards", nav: "₹1.9 Cr", weight: "3.9%", dayPnl: "+₹0.4 L", ytd: "+2.1%" },
  { asset: "Index Options", nav: "₹2.4 Cr", weight: "4.9%", dayPnl: "-₹1.8 L", ytd: "-3.2%" },
  { asset: "Structured Products", nav: "₹0.9 Cr", weight: "1.8%", dayPnl: "+₹0.1 L", ytd: "+9.4%" },
  { asset: "Cash & Equivalents", nav: "₹1.1 Cr", weight: "2.3%", dayPnl: "₹0", ytd: "+3.5%" },
];

const MultiAssetModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Total NAV</p>
        <p className="mt-1 font-mono text-2xl font-bold text-foreground">₹48.7 Cr</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Asset Classes</p>
        <p className="mt-1 font-mono text-2xl font-bold text-foreground">9</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Day P&L</p>
        <p className="mt-1 font-mono text-2xl font-bold text-gain">+₹24.0 L</p>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Multi-Asset Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Asset Class", "NAV", "Weight", "Day P&L", "YTD Return"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ASSET_CLASSES.map(a => (
              <tr key={a.asset} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium text-foreground">{a.asset}</td>
                <td className="px-3 py-2 font-mono text-foreground">{a.nav}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">{a.weight}</td>
                <td className={`px-3 py-2 font-mono ${a.dayPnl.includes("-") ? "text-loss" : "text-gain"}`}>{a.dayPnl}</td>
                <td className={`px-3 py-2 font-mono ${a.ytd.includes("-") ? "text-loss" : "text-gain"}`}>{a.ytd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Cross-Asset Correlation Matrix</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="px-2 py-1 text-left text-muted-foreground"></th>
              {["Equity", "GovBond", "CorpBond", "Gold", "REIT", "FX"].map(h => (
                <th key={h} className="px-2 py-1 text-center text-muted-foreground font-mono">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: "Equity", vals: [1.00, -0.32, 0.15, -0.18, 0.45, -0.22] },
              { name: "GovBond", vals: [-0.32, 1.00, 0.72, 0.28, -0.08, 0.15] },
              { name: "CorpBond", vals: [0.15, 0.72, 1.00, 0.12, 0.10, 0.05] },
              { name: "Gold", vals: [-0.18, 0.28, 0.12, 1.00, -0.05, 0.42] },
              { name: "REIT", vals: [0.45, -0.08, 0.10, -0.05, 1.00, -0.12] },
              { name: "FX", vals: [-0.22, 0.15, 0.05, 0.42, -0.12, 1.00] },
            ].map(r => (
              <tr key={r.name}>
                <td className="px-2 py-1 font-mono text-muted-foreground">{r.name}</td>
                {r.vals.map((v, i) => (
                  <td key={i} className="px-2 py-1 text-center font-mono" style={{
                    backgroundColor: `hsl(0, 0%, ${v === 1 ? 20 : v > 0 ? 10 + v * 10 : 10}%)`,
                    color: Math.abs(v) > 0.3 ? "hsl(0,0%,93%)" : "hsl(0,0%,45%)",
                  }}>
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default MultiAssetModule;
