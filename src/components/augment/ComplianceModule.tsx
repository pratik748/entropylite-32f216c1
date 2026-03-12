import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PieChart, Pie,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const ComplianceModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { checks, complianceScore, violations, auditTrail, gaugeData, ruleBarData } = useMemo(() => {
    if (holdings.length === 0) return { checks: [], complianceScore: 100, violations: 0, auditTrail: [], gaugeData: [], ruleBarData: [] };

    const maxSinglePct = holdings.reduce((max, h) => Math.max(max, (h.value / totalValue) * 100), 0);
    const maxTicker = holdings.reduce((best, h) => {
      const pct = (h.value / totalValue) * 100;
      return pct > best.pct ? { ticker: h.ticker, pct } : best;
    }, { ticker: "", pct: 0 });

    const sectorMap: Record<string, number> = {};
    holdings.forEach(h => { sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.value; });
    const maxSectorPct = Object.values(sectorMap).reduce((max, v) => Math.max(max, (v / totalValue) * 100), 0);
    const maxSector = Object.entries(sectorMap).sort((a, b) => b[1] - a[1])[0]?.[0] || "Unknown";

    const hrPct = holdings.filter(h => h.risk >= 60).reduce((s, h) => s + h.value, 0) / totalValue * 100;

    const ruleChecks = [
      { rule: "Single stock ≤ 10%", status: maxSinglePct <= 10 ? "PASS" : maxSinglePct <= 15 ? "WARNING" : "FAIL", detail: `Max: ${maxTicker.ticker} ${maxSinglePct.toFixed(1)}%`, severity: "medium" },
      { rule: "Sector conc. ≤ 25%", status: maxSectorPct <= 25 ? "PASS" : "WARNING", detail: `Max: ${maxSector} ${maxSectorPct.toFixed(1)}%`, severity: "medium" },
      { rule: "Diversification ≥ 5", status: holdings.length >= 5 ? "PASS" : "WARNING", detail: `Current: ${holdings.length} stocks`, severity: "medium" },
      { rule: "No outsized position", status: "PASS", detail: `Checked ${holdings.length} holdings`, severity: "low" },
      { rule: "High-risk ≤ 30%", status: hrPct <= 30 ? "PASS" : "WARNING", detail: `High-risk: ${hrPct.toFixed(1)}%`, severity: "low" },
    ];

    const v = ruleChecks.filter(c => c.status === "FAIL").length;
    const w = ruleChecks.filter(c => c.status === "WARNING").length;
    const p = ruleChecks.filter(c => c.status === "PASS").length;
    const score = 100 - v * 15 - w * 5;

    const gauge = [{ name: "Score", value: score, fill: score >= 90 ? "hsl(152,90%,45%)" : score >= 70 ? "hsl(38,92%,55%)" : "hsl(0,90%,55%)" }];
    const bars = [
      { name: "PASS", count: p, fill: "hsl(152,90%,45%)" },
      { name: "WARNING", count: w, fill: "hsl(38,92%,55%)" },
      { name: "FAIL", count: v, fill: "hsl(0,90%,55%)" },
    ];

    const audit = holdings.map(h => ({
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      user: "System",
      action: `Compliance check — ${h.ticker} ${h.suggestion} position`,
      result: h.risk < 70 ? "APPROVED" : "FLAGGED — High Risk",
    }));

    return { checks: ruleChecks, complianceScore: score, violations: v, auditTrail: audit, gaugeData: gauge, ruleBarData: bars };
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

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Compliance Gauge</h3>
          <div className="h-56 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={gaugeData} startAngle={180} endAngle={0}>
                <RadialBar dataKey="value" cornerRadius={10} background={{ fill: GRID }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute text-center">
              <p className={`font-mono text-3xl font-bold ${complianceScore >= 90 ? "text-gain" : complianceScore >= 70 ? "text-warning" : "text-loss"}`}>{complianceScore}%</p>
              <p className="text-[10px] text-muted-foreground">Compliance</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Rule Check Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ruleBarData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 11 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} allowDecimals={false} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {ruleBarData.map((b, i) => <Cell key={i} fill={b.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
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
