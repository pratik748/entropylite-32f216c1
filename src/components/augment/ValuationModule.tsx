const HOLDINGS = [
  { ticker: "RELIANCE", model: "DCF + Relative", fairValue: "₹2,680", current: "₹2,485", upside: "+7.8%", pe: 24.5, pbv: 2.1, evEbitda: 12.8 },
  { ticker: "TCS", model: "DCF", fairValue: "₹4,100", current: "₹3,820", upside: "+7.3%", pe: 28.2, pbv: 12.5, evEbitda: 20.1 },
  { ticker: "HDFC BANK", model: "Residual Income", fairValue: "₹1,850", current: "₹1,665", upside: "+11.1%", pe: 18.9, pbv: 2.8, evEbitda: 0 },
  { ticker: "INFY", model: "DCF", fairValue: "₹1,720", current: "₹1,542", upside: "+11.5%", pe: 25.1, pbv: 8.2, evEbitda: 17.4 },
  { ticker: "ICICI BANK", model: "Gordon Growth", fairValue: "₹1,320", current: "₹1,180", upside: "+11.9%", pe: 16.5, pbv: 3.1, evEbitda: 0 },
];

const CASHFLOW = [
  { month: "Mar 2026", inflow: "₹2.8 Cr", outflow: "₹1.2 Cr", net: "+₹1.6 Cr", type: "Dividend + Coupon" },
  { month: "Apr 2026", inflow: "₹0.4 Cr", outflow: "₹0.8 Cr", net: "-₹0.4 Cr", type: "Bond Maturity Reinvest" },
  { month: "May 2026", inflow: "₹1.5 Cr", outflow: "₹0.3 Cr", net: "+₹1.2 Cr", type: "Coupon" },
  { month: "Jun 2026", inflow: "₹3.2 Cr", outflow: "₹2.0 Cr", net: "+₹1.2 Cr", type: "Quarterly Dividend" },
];

const COLLATERAL = [
  { type: "Cash", value: "₹1.1 Cr", haircut: "0%", usable: "₹1.1 Cr" },
  { type: "Government Securities", value: "₹7.3 Cr", haircut: "5%", usable: "₹6.9 Cr" },
  { type: "Corporate Bonds (AAA)", value: "₹4.9 Cr", haircut: "10%", usable: "₹4.4 Cr" },
  { type: "Equity (Large Cap)", value: "₹24.8 Cr", haircut: "25%", usable: "₹18.6 Cr" },
];

const ValuationModule = () => (
  <div className="space-y-6">
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Valuation & Pricing Matrix</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Ticker", "Model", "Fair Value", "Current", "Upside", "P/E", "P/BV", "EV/EBITDA"].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HOLDINGS.map(h => (
              <tr key={h.ticker} className="border-b border-border/50">
                <td className="px-2 py-2 font-mono font-medium text-foreground">{h.ticker}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{h.model}</td>
                <td className="px-2 py-2 font-mono text-foreground">{h.fairValue}</td>
                <td className="px-2 py-2 font-mono text-muted-foreground">{h.current}</td>
                <td className="px-2 py-2 font-mono text-gain">{h.upside}</td>
                <td className="px-2 py-2 font-mono text-muted-foreground">{h.pe}x</td>
                <td className="px-2 py-2 font-mono text-muted-foreground">{h.pbv}x</td>
                <td className="px-2 py-2 font-mono text-muted-foreground">{h.evEbitda > 0 ? `${h.evEbitda}x` : "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Cash Flow Forecast</h3>
        <div className="space-y-2">
          {CASHFLOW.map(c => (
            <div key={c.month} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{c.month}</p>
                <p className="text-[10px] text-muted-foreground">{c.type}</p>
              </div>
              <div className="text-right">
                <p className={`font-mono text-sm font-bold ${c.net.includes("-") ? "text-loss" : "text-gain"}`}>{c.net}</p>
                <p className="text-[10px] text-muted-foreground">In: {c.inflow} | Out: {c.outflow}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Collateral Management</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Type", "Value", "Haircut", "Usable"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COLLATERAL.map(c => (
                <tr key={c.type} className="border-b border-border/50">
                  <td className="px-3 py-2 text-foreground">{c.type}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{c.value}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{c.haircut}</td>
                  <td className="px-3 py-2 font-mono text-gain">{c.usable}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 rounded-lg bg-surface-2 p-3 flex justify-between">
          <span className="text-xs text-muted-foreground">Total Usable Collateral</span>
          <span className="font-mono text-sm font-bold text-foreground">₹31.0 Cr</span>
        </div>
      </div>
    </div>
  </div>
);

export default ValuationModule;
