const ESG_SCORES = [
  { ticker: "RELIANCE", overall: 68, env: 55, social: 72, governance: 78, controversy: "Low" },
  { ticker: "TCS", overall: 82, env: 75, social: 85, governance: 88, controversy: "None" },
  { ticker: "HDFC BANK", overall: 74, env: 62, social: 78, governance: 82, controversy: "None" },
  { ticker: "INFY", overall: 85, env: 80, social: 88, governance: 90, controversy: "None" },
  { ticker: "ICICI BANK", overall: 71, env: 58, social: 75, governance: 80, controversy: "Low" },
];

const POLICY_CHECKS = [
  { policy: "Carbon Intensity < 200 tCO2e/₹Cr", status: "PASS", detail: "Current: 142 tCO2e/₹Cr" },
  { policy: "No tobacco exposure", status: "PASS", detail: "0% exposure" },
  { policy: "No controversial weapons", status: "PASS", detail: "0% exposure" },
  { policy: "Min ESG score > 50", status: "PASS", detail: "Min: 68 (RELIANCE)" },
  { policy: "Gender diversity > 30% board", status: "WARNING", detail: "2 of 5 holdings below threshold" },
  { policy: "UN Global Compact compliance", status: "PASS", detail: "All holdings compliant" },
];

const scoreColor = (v: number) => v >= 75 ? "text-gain" : v >= 50 ? "text-warning" : "text-loss";

const ESGModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-4">
      {[
        { label: "Portfolio ESG Score", value: "76/100" },
        { label: "Carbon Intensity", value: "142 tCO2e" },
        { label: "Policy Compliance", value: "95%" },
        { label: "Controversies", value: "0 High" },
      ].map(s => (
        <div key={s.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{s.value}</p>
        </div>
      ))}
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">ESG Score Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Ticker", "Overall", "Environment", "Social", "Governance", "Controversy"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ESG_SCORES.map(e => (
              <tr key={e.ticker} className="border-b border-border/50">
                <td className="px-3 py-2 font-mono font-medium text-foreground">{e.ticker}</td>
                <td className={`px-3 py-2 font-mono font-bold ${scoreColor(e.overall)}`}>{e.overall}</td>
                <td className={`px-3 py-2 font-mono ${scoreColor(e.env)}`}>{e.env}</td>
                <td className={`px-3 py-2 font-mono ${scoreColor(e.social)}`}>{e.social}</td>
                <td className={`px-3 py-2 font-mono ${scoreColor(e.governance)}`}>{e.governance}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{e.controversy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">ESG Policy Monitoring</h3>
      <div className="space-y-2">
        {POLICY_CHECKS.map(p => (
          <div key={p.policy} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
            <div>
              <p className="text-sm text-foreground">{p.policy}</p>
              <p className="text-[10px] text-muted-foreground">{p.detail}</p>
            </div>
            <span className={`font-mono text-xs font-bold ${p.status === "PASS" ? "text-gain" : "text-warning"}`}>{p.status}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default ESGModule;
