import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const ComplianceModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { checks, complianceScore, violations, auditTrail } = useMemo(() => {
    if (holdings.length === 0) return { checks: [], complianceScore: 100, violations: 0, auditTrail: [] };

    const maxSinglePct = holdings.reduce((max, h) => Math.max(max, (h.value / totalValue) * 100), 0);
    const maxTicker = holdings.reduce((best, h) => {
      const pct = (h.value / totalValue) * 100;
      return pct > best.pct ? { ticker: h.ticker, pct } : best;
    }, { ticker: "", pct: 0 });

    const sectorMap: Record<string, number> = {};
    holdings.forEach(h => { sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.value; });
    const maxSectorPct = Object.values(sectorMap).reduce((max, v) => Math.max(max, (v / totalValue) * 100), 0);
    const maxSector = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

    const ruleChecks = [
      { rule: "Single stock exposure ≤ 10%", status: maxSinglePct <= 10 ? "PASS" : maxSinglePct <= 15 ? "WARNING" : "FAIL", detail: `Max: ${maxTicker.ticker} ${maxSinglePct.toFixed(1)}%`, severity: maxSinglePct <= 10 ? "low" : "medium" },
      { rule: "Sector concentration ≤ 25%", status: maxSectorPct <= 25 ? "PASS" : "WARNING", detail: `Max: ${maxSector} ${maxSectorPct.toFixed(1)}%`, severity: maxSectorPct <= 25 ? "low" : "medium" },
      { rule: "Portfolio diversification ≥ 5 stocks", status: holdings.length >= 5 ? "PASS" : "WARNING", detail: `Current: ${holdings.length} stocks`, severity: holdings.length >= 5 ? "low" : "medium" },
      { rule: `No single stock > large exposure`, status: "PASS", detail: `Checked ${holdings.length} holdings`, severity: "low" },
      { rule: "High-risk allocation ≤ 30%", status: (() => {
        const hrPct = holdings.filter(h => h.risk >= 60).reduce((s, h) => s + h.value, 0) / totalValue * 100;
        return hrPct <= 30 ? "PASS" : "WARNING";
      })(), detail: (() => {
        const hrPct = holdings.filter(h => h.risk >= 60).reduce((s, h) => s + h.value, 0) / totalValue * 100;
        return `High-risk: ${hrPct.toFixed(1)}%`;
      })(), severity: "low" },
    ];

    const v = ruleChecks.filter(c => c.status === "FAIL").length;
    const w = ruleChecks.filter(c => c.status === "WARNING").length;
    const score = 100 - v * 15 - w * 5;

    const audit = holdings.map(h => ({
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      user: "System",
      action: `Compliance check — ${h.ticker} ${h.suggestion} position`,
      result: h.risk < 70 ? "APPROVED" : "FLAGGED — High Risk",
    }));

    return { checks: ruleChecks, complianceScore: score, violations: v, auditTrail: audit };
  }, [holdings, totalValue]);

  if (holdings.length === 0) {
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
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{holdings.length}</p>
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
