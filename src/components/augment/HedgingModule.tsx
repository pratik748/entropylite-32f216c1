const HEDGES = [
  { instrument: "NIFTY 50 PUT 23000", type: "Index Option", notional: "₹3.4 Cr", premium: "₹8.2 L", delta: -0.35, expiry: "2026-03-27", purpose: "Tail risk" },
  { instrument: "USD/INR Forward", type: "FX Forward", notional: "₹1.9 Cr", premium: "₹2.1 L", delta: -0.98, expiry: "2026-06-30", purpose: "Currency hedge" },
  { instrument: "BANKNIFTY PUT 48000", type: "Index Option", notional: "₹1.8 Cr", premium: "₹5.4 L", delta: -0.28, expiry: "2026-03-27", purpose: "Sector hedge" },
  { instrument: "Gold Futures", type: "Commodity", notional: "₹0.8 Cr", premium: "₹0.5 L", delta: 0.95, expiry: "2026-04-30", purpose: "Inflation hedge" },
];

const CAPITAL_EFFICIENCY = [
  { metric: "Gross Exposure", value: "₹58.2 Cr" },
  { metric: "Net Exposure", value: "₹42.1 Cr" },
  { metric: "Hedge Ratio", value: "27.6%" },
  { metric: "Cost of Hedging (ann.)", value: "1.2%" },
  { metric: "Capital Freed by Netting", value: "₹16.1 Cr" },
  { metric: "Margin Utilization", value: "68.4%" },
];

const STRATEGIES = [
  { name: "Protective Collar", description: "Buy OTM put + Sell OTM call on NIFTY 50. Net cost: minimal. Caps upside at 8%, protects downside beyond -5%.", effectiveness: "High" },
  { name: "Macro Hedge — Crude", description: "Short crude futures to offset energy-sensitive portfolio holdings. Covers ~₹4 Cr oil-correlated exposure.", effectiveness: "Medium" },
  { name: "Duration Management", description: "Interest rate swap to reduce bond portfolio duration from 5.2Y to 3.1Y ahead of potential RBI tightening.", effectiveness: "High" },
];

const HedgingModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3">
      {[
        { label: "Total Hedge Notional", value: "₹7.9 Cr" },
        { label: "Portfolio Delta", value: "0.72" },
        { label: "Cost of Protection", value: "₹16.2 L" },
      ].map(s => (
        <div key={s.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{s.value}</p>
        </div>
      ))}
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Active Hedges</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Instrument", "Type", "Notional", "Premium", "Delta", "Expiry", "Purpose"].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HEDGES.map(h => (
              <tr key={h.instrument} className="border-b border-border/50">
                <td className="px-2 py-2 font-mono text-xs text-foreground">{h.instrument}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{h.type}</td>
                <td className="px-2 py-2 font-mono text-foreground">{h.notional}</td>
                <td className="px-2 py-2 font-mono text-muted-foreground">{h.premium}</td>
                <td className="px-2 py-2 font-mono text-foreground">{h.delta}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{h.expiry}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{h.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Capital Efficiency</h3>
        <div className="space-y-2">
          {CAPITAL_EFFICIENCY.map(c => (
            <div key={c.metric} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <span className="text-sm text-muted-foreground">{c.metric}</span>
              <span className="font-mono text-sm font-bold text-foreground">{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Hedging Strategies</h3>
        <div className="space-y-3">
          {STRATEGIES.map(s => (
            <div key={s.name} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <span className={`font-mono text-[10px] font-bold ${s.effectiveness === "High" ? "text-gain" : "text-warning"}`}>{s.effectiveness}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default HedgingModule;
