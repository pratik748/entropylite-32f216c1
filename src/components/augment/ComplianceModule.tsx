import { Shield, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

const CHECKS = [
  { rule: "Single stock exposure ≤ 10%", status: "PASS", detail: "Max: RELIANCE 8.2%", severity: "low" },
  { rule: "Sector concentration ≤ 25%", status: "PASS", detail: "Max: Financials 22.1%", severity: "low" },
  { rule: "Cash minimum ≥ 2%", status: "PASS", detail: "Current: 3.0%", severity: "low" },
  { rule: "Derivative exposure ≤ 15%", status: "WARNING", detail: "Current: 13.8%", severity: "medium" },
  { rule: "Counterparty limit ≤ ₹10 Cr", status: "PASS", detail: "Max: HDFC ₹8.2 Cr", severity: "low" },
  { rule: "Daily turnover ≤ 5%", status: "PASS", detail: "Today: 2.1%", severity: "low" },
  { rule: "Insider trading blackout", status: "PASS", detail: "No restricted trades", severity: "low" },
  { rule: "SEBI position limits", status: "PASS", detail: "Within limits", severity: "low" },
];

const AUDIT_TRAIL = [
  { time: "14:32:18", user: "System", action: "Pre-trade compliance check — RELIANCE BUY 200", result: "APPROVED" },
  { time: "14:32:17", user: "System", action: "Margin adequacy verified", result: "PASS" },
  { time: "13:45:22", user: "Risk Officer", action: "Manual override — increased sector limit to 25%", result: "APPROVED" },
  { time: "11:02:33", user: "System", action: "Pre-trade check — HDFC BANK BUY 150", result: "APPROVED" },
  { time: "09:28:11", user: "System", action: "Pre-trade check — BAJFINANCE BUY 30", result: "REJECTED — margin insufficient" },
  { time: "09:15:00", user: "System", action: "Daily mandate compliance scan", result: "8/8 PASS" },
];

const REGULATORY = [
  { report: "SEBI — Large Holding Disclosure", due: "2026-03-15", status: "PENDING", frequency: "Quarterly" },
  { report: "RBI — FPI Flow Report", due: "2026-03-01", status: "SUBMITTED", frequency: "Monthly" },
  { report: "NSE — Position Limit Report", due: "2026-02-28", status: "SUBMITTED", frequency: "Daily" },
  { report: "AMFI — NAV Declaration", due: "2026-02-28", status: "SUBMITTED", frequency: "Daily" },
];

const ComplianceModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Compliance Score</p>
        <p className="mt-1 font-mono text-3xl font-bold text-gain">98.5%</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Violations (30d)</p>
        <p className="mt-1 font-mono text-3xl font-bold text-foreground">0</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">Warnings Active</p>
        <p className="mt-1 font-mono text-3xl font-bold text-warning">1</p>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Mandate & Rule Checks</h3>
      <div className="space-y-2">
        {CHECKS.map(c => (
          <div key={c.rule} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
            <div className="flex items-center gap-2">
              {c.status === "PASS" ? <CheckCircle2 className="h-4 w-4 text-gain" /> : <AlertTriangle className="h-4 w-4 text-warning" />}
              <div>
                <p className="text-sm text-foreground">{c.rule}</p>
                <p className="text-[10px] text-muted-foreground">{c.detail}</p>
              </div>
            </div>
            <span className={`font-mono text-xs font-bold ${c.status === "PASS" ? "text-gain" : "text-warning"}`}>{c.status}</span>
          </div>
        ))}
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Audit Trail</h3>
        <div className="space-y-2 max-h-[350px] overflow-y-auto">
          {AUDIT_TRAIL.map((a, i) => (
            <div key={i} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-muted-foreground">{a.time}</span>
                <span className={`font-mono text-[10px] font-bold ${a.result.includes("REJECTED") ? "text-loss" : "text-gain"}`}>{a.result}</span>
              </div>
              <p className="text-xs text-foreground">{a.action}</p>
              <p className="text-[10px] text-muted-foreground">by {a.user}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Regulatory Reporting</h3>
        <div className="space-y-2">
          {REGULATORY.map(r => (
            <div key={r.report} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <div>
                <p className="text-sm text-foreground">{r.report}</p>
                <p className="text-[10px] text-muted-foreground">Due: {r.due} · {r.frequency}</p>
              </div>
              <span className={`font-mono text-xs font-bold ${r.status === "SUBMITTED" ? "text-gain" : "text-warning"}`}>{r.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export default ComplianceModule;
