import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const ComplianceModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { checks, complianceScore, violations, auditTrail } = useMemo(() => {
    if (analyzed.length === 0) return { checks: [], complianceScore: 100, violations: 0, auditTrail: [] };

    const totalValue = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);
    const maxSinglePct = analyzed.reduce((max, s) => {
      const pct = ((s.analysis.currentPrice || s.buyPrice) * s.quantity / totalValue) * 100;
      return Math.max(max, pct);
    }, 0);
    const maxTicker = analyzed.reduce((best, s) => {
      const pct = ((s.analysis.currentPrice || s.buyPrice) * s.quantity / totalValue) * 100;
      return pct > best.pct ? { ticker: s.ticker.replace(".NS", "").replace(".BO", ""), pct } : best;
    }, { ticker: "", pct: 0 });

    // Sector concentration
    const sectorMap: Record<string, number> = {};
    analyzed.forEach(s => {
      const sector = s.analysis.sector || "Unknown";
      const val = (s.analysis.currentPrice || s.buyPrice) * s.quantity;
      sectorMap[sector] = (sectorMap[sector] || 0) + val;
    });
    const maxSectorPct = Object.values(sectorMap).reduce((max, v) => Math.max(max, (v / totalValue) * 100), 0);
    const maxSector = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

    const ruleChecks = [
      { rule: "Single stock exposure ≤ 10%", status: maxSinglePct <= 10 ? "PASS" : maxSinglePct <= 15 ? "WARNING" : "FAIL", detail: `Max: ${maxTicker.ticker} ${maxSinglePct.toFixed(1)}%`, severity: maxSinglePct <= 10 ? "low" : "medium" },
      { rule: "Sector concentration ≤ 25%", status: maxSectorPct <= 25 ? "PASS" : "WARNING", detail: `Max: ${maxSector} ${maxSectorPct.toFixed(1)}%`, severity: maxSectorPct <= 25 ? "low" : "medium" },
      { rule: "Portfolio diversification ≥ 5 stocks", status: analyzed.length >= 5 ? "PASS" : "WARNING", detail: `Current: ${analyzed.length} stocks`, severity: analyzed.length >= 5 ? "low" : "medium" },
      { rule: "No single stock > ₹50L exposure", status: analyzed.every(s => (s.analysis.currentPrice || s.buyPrice) * s.quantity <= 5000000) ? "PASS" : "WARNING", detail: `Checked ${analyzed.length} holdings`, severity: "low" },
      { rule: "High-risk allocation ≤ 30%", status: (() => {
        const highRisk = analyzed.filter(s => (s.analysis.riskScore || 0) >= 60);
        const hrPct = highRisk.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0) / totalValue * 100;
        return hrPct <= 30 ? "PASS" : "WARNING";
      })(), detail: (() => {
        const highRisk = analyzed.filter(s => (s.analysis.riskScore || 0) >= 60);
        const hrPct = highRisk.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0) / totalValue * 100;
        return `High-risk: ${hrPct.toFixed(1)}%`;
      })(), severity: "low" },
    ];

    const v = ruleChecks.filter(c => c.status === "FAIL").length;
    const w = ruleChecks.filter(c => c.status === "WARNING").length;
    const score = 100 - v * 15 - w * 5;

    const audit = analyzed.map(s => ({
      time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      user: "System",
      action: `Compliance check — ${s.ticker.replace(".NS", "").replace(".BO", "")} ${s.analysis.suggestion || "Hold"} position`,
      result: (s.analysis.riskScore || 0) < 70 ? "APPROVED" : "FLAGGED — High Risk",
    }));

    return { checks: ruleChecks, complianceScore: score, violations: v, auditTrail: audit };
  }, [analyzed]);

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see real compliance checks.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Compliance Score</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${complianceScore >= 90 ? "text-gain" : complianceScore >= 70 ? "text-warning" : "text-loss"}`}>{complianceScore}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Violations</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${violations === 0 ? "text-foreground" : "text-loss"}`}>{violations}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Holdings Checked</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{analyzed.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Mandate & Rule Checks</h3>
        <div className="space-y-2">
          {checks.map(c => (
            <div key={c.rule} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm text-foreground">{c.rule}</p>
                <p className="text-[10px] text-muted-foreground">{c.detail}</p>
              </div>
              <span className={`font-mono text-xs font-bold ${c.status === "PASS" ? "text-gain" : c.status === "WARNING" ? "text-warning" : "text-loss"}`}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Audit Trail</h3>
        <div className="space-y-2">
          {auditTrail.map((a, i) => (
            <div key={i} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-muted-foreground">{a.time}</span>
                <span className={`font-mono text-[10px] font-bold ${a.result.includes("FLAGGED") ? "text-warning" : "text-gain"}`}>{a.result}</span>
              </div>
              <p className="text-xs text-foreground">{a.action}</p>
              <p className="text-[10px] text-muted-foreground">by {a.user}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ComplianceModule;
