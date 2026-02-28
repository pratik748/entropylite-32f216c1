const CLIENTS = [
  { name: "Sovereign Wealth Fund A", aum: "₹18.2 Cr", mandate: "Multi-Asset Growth", ytd: "+14.8%", benchmark: "NIFTY 50", alpha: "+2.1%", nextReport: "2026-03-15" },
  { name: "Family Office B", aum: "₹12.4 Cr", mandate: "Conservative Income", ytd: "+8.2%", benchmark: "CRISIL Composite", alpha: "+1.4%", nextReport: "2026-03-01" },
  { name: "Pension Fund C", aum: "₹10.8 Cr", mandate: "Balanced Growth", ytd: "+11.5%", benchmark: "NIFTY 50 + Bond Index", alpha: "+0.8%", nextReport: "2026-03-31" },
  { name: "Insurance Pool D", aum: "₹7.3 Cr", mandate: "Capital Preservation", ytd: "+5.4%", benchmark: "10Y G-Sec", alpha: "+1.2%", nextReport: "2026-03-15" },
];

const CUSTODIANS = [
  { name: "HDFC Bank Custody", status: "Connected", reconciled: "100%", lastSync: "Just now" },
  { name: "SBI Custody Services", status: "Connected", reconciled: "99.8%", lastSync: "5m ago" },
  { name: "Deutsche Bank (Intl)", status: "Connected", reconciled: "100%", lastSync: "15m ago" },
];

const ACCOUNTING = [
  { item: "NAV Calculation", status: "COMPUTED", time: "16:00 IST" },
  { item: "Fee Accrual", status: "POSTED", time: "16:05 IST" },
  { item: "Dividend Accrual", status: "POSTED", time: "16:02 IST" },
  { item: "Corporate Actions", status: "APPLIED", time: "09:30 IST" },
  { item: "Cash Reconciliation", status: "MATCHED", time: "16:10 IST" },
];

const ClientReportingModule = () => (
  <div className="space-y-6">
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Client Portfolio Summary</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Client", "AUM", "Mandate", "YTD", "Benchmark", "Alpha", "Next Report"].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLIENTS.map(c => (
              <tr key={c.name} className="border-b border-border/50">
                <td className="px-2 py-2 text-foreground font-medium">{c.name}</td>
                <td className="px-2 py-2 font-mono text-foreground">{c.aum}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{c.mandate}</td>
                <td className="px-2 py-2 font-mono text-gain">{c.ytd}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{c.benchmark}</td>
                <td className="px-2 py-2 font-mono text-gain">{c.alpha}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{c.nextReport}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Custodian / Broker Connectivity</h3>
        <div className="space-y-2">
          {CUSTODIANS.map(c => (
            <div key={c.name} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm font-medium text-foreground">{c.name}</p>
                <p className="text-[10px] text-muted-foreground">Reconciled: {c.reconciled} · Last sync: {c.lastSync}</p>
              </div>
              <span className="font-mono text-xs font-bold text-gain">{c.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Accounting Integration</h3>
        <div className="space-y-2">
          {ACCOUNTING.map(a => (
            <div key={a.item} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm text-foreground">{a.item}</p>
                <p className="text-[10px] text-muted-foreground">{a.time}</p>
              </div>
              <span className="font-mono text-xs font-bold text-gain">{a.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default ClientReportingModule;
