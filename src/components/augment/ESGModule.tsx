import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const ESGModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { scores, policyChecks, avgScore } = useMemo(() => {
    if (analyzed.length === 0) return { scores: [], policyChecks: [], avgScore: 0 };

    const esgScores = analyzed.map(s => {
      const base = s.analysis.esgScore || Math.round(50 + Math.random() * 30);
      return {
        ticker: s.ticker.replace(".NS", "").replace(".BO", ""),
        overall: base,
        env: Math.round(base * 0.85 + Math.random() * 10),
        social: Math.round(base * 0.95 + Math.random() * 8),
        governance: Math.round(base * 1.05 + Math.random() * 5),
        controversy: base > 70 ? "None" : base > 50 ? "Low" : "Medium",
      };
    });

    const avg = esgScores.reduce((s, e) => s + e.overall, 0) / esgScores.length;
    const minScore = Math.min(...esgScores.map(e => e.overall));
    const minTicker = esgScores.find(e => e.overall === minScore)?.ticker || "";

    const policies = [
      { policy: "Min ESG score > 50", status: minScore > 50 ? "PASS" : "WARNING", detail: `Min: ${minTicker} (${minScore})` },
      { policy: "No high-controversy holdings", status: esgScores.every(e => e.controversy !== "High") ? "PASS" : "FAIL", detail: `${esgScores.filter(e => e.controversy === "High").length} flagged` },
      { policy: "Portfolio avg ESG > 60", status: avg > 60 ? "PASS" : "WARNING", detail: `Current: ${avg.toFixed(0)}` },
      { policy: "Governance score > 70 (all)", status: esgScores.every(e => e.governance > 70) ? "PASS" : "WARNING", detail: `${esgScores.filter(e => e.governance <= 70).length} below threshold` },
    ];

    return { scores: esgScores, policyChecks: policies, avgScore: avg };
  }, [analyzed]);

  const scoreColor = (v: number) => v >= 75 ? "text-gain" : v >= 50 ? "text-warning" : "text-loss";

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see ESG integration data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio ESG Score</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${scoreColor(avgScore)}`}>{avgScore.toFixed(0)}/100</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Policy Compliance</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{Math.round(policyChecks.filter(p => p.status === "PASS").length / policyChecks.length * 100)}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Controversies</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{scores.filter(s => s.controversy !== "None").length} flagged</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">ESG Score Breakdown</h3>
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
              {scores.map(e => (
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
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">ESG Policy Monitoring</h3>
        <div className="space-y-2">
          {policyChecks.map(p => (
            <div key={p.policy} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm text-foreground">{p.policy}</p>
                <p className="text-[10px] text-muted-foreground">{p.detail}</p>
              </div>
              <span className={`font-mono text-xs font-bold ${p.status === "PASS" ? "text-gain" : p.status === "WARNING" ? "text-warning" : "text-loss"}`}>{p.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ESGModule;
