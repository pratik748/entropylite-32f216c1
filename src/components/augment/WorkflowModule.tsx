import { ArrowRight, CheckCircle2, Clock, AlertTriangle } from "lucide-react";

const WORKFLOW_STAGES = [
  {
    stage: "Research",
    status: "active",
    description: "Fundamental & quantitative analysis, screening, idea generation",
    metrics: [
      { label: "Ideas in Pipeline", value: "24" },
      { label: "Coverage Universe", value: "150 stocks" },
      { label: "Models Updated", value: "Today" },
    ],
  },
  {
    stage: "Portfolio",
    status: "active",
    description: "Construction, allocation, optimization, rebalancing",
    metrics: [
      { label: "Active Positions", value: "42" },
      { label: "Pending Rebalance", value: "3 trades" },
      { label: "Drift", value: "1.8%" },
    ],
  },
  {
    stage: "Trade",
    status: "active",
    description: "Order generation, execution, smart routing",
    metrics: [
      { label: "Orders Today", value: "142" },
      { label: "Fill Rate", value: "94.2%" },
      { label: "Avg Slippage", value: "0.03%" },
    ],
  },
  {
    stage: "Settlement",
    status: "active",
    description: "Clearing, netting, DVP, custodian coordination",
    metrics: [
      { label: "T+1 Pending", value: "8 trades" },
      { label: "Failed Settlements", value: "0" },
      { label: "Netting Efficiency", value: "87%" },
    ],
  },
  {
    stage: "Reporting",
    status: "active",
    description: "NAV calculation, P&L attribution, client reports",
    metrics: [
      { label: "NAV Published", value: "16:15 IST" },
      { label: "Reports Generated", value: "4" },
      { label: "Next Client Report", value: "Mar 1" },
    ],
  },
  {
    stage: "Compliance",
    status: "active",
    description: "Mandate checks, regulatory reporting, audit trails",
    metrics: [
      { label: "Rules Checked", value: "8/8 PASS" },
      { label: "Violations", value: "0" },
      { label: "Regulatory Filings", value: "2 pending" },
    ],
  },
  {
    stage: "Client",
    status: "active",
    description: "Client communication, performance review, mandate updates",
    metrics: [
      { label: "Active Clients", value: "4" },
      { label: "Total AUM", value: "₹48.7 Cr" },
      { label: "Avg Alpha", value: "+1.4%" },
    ],
  },
];

const stageIcon = (status: string) => {
  if (status === "complete") return <CheckCircle2 className="h-6 w-6 text-gain" />;
  if (status === "active") return <Clock className="h-6 w-6 text-foreground" />;
  return <Clock className="h-6 w-6 text-muted-foreground/40" />;
};

const WorkflowModule = () => (
  <div className="space-y-6">
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-2">End-to-End Investment Workflow</h3>
      <p className="text-xs text-muted-foreground mb-6">Research → Portfolio → Trade → Settlement → Reporting → Compliance → Client</p>

      {/* Horizontal pipeline */}
      <div className="flex items-start gap-1 overflow-x-auto pb-4">
        {WORKFLOW_STAGES.map((s, i) => (
          <div key={s.stage} className="flex items-start gap-1">
            <div className="min-w-[180px] rounded-xl bg-surface-2 border border-border/50 p-4">
              <div className="flex items-center gap-2 mb-3">
                {stageIcon(s.status)}
                <span className="text-sm font-bold text-foreground">{s.stage}</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">{s.description}</p>
              <div className="space-y-1.5">
                {s.metrics.map(m => (
                  <div key={m.label} className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{m.label}</span>
                    <span className="font-mono text-[10px] font-bold text-foreground">{m.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {i < WORKFLOW_STAGES.length - 1 && (
              <ArrowRight className="h-5 w-5 text-muted-foreground/30 mt-8 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>

    {/* System health */}
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">System Health & Connectivity</h3>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { system: "Market Data Feed", status: "LIVE", uptime: "99.98%" },
          { system: "OMS Engine", status: "LIVE", uptime: "99.99%" },
          { system: "Risk Engine", status: "LIVE", uptime: "99.97%" },
          { system: "Compliance Engine", status: "LIVE", uptime: "99.99%" },
          { system: "Settlement Gateway", status: "LIVE", uptime: "99.95%" },
          { system: "Reporting Engine", status: "LIVE", uptime: "99.98%" },
          { system: "Client Portal", status: "LIVE", uptime: "99.99%" },
          { system: "Audit Logger", status: "LIVE", uptime: "100%" },
        ].map(s => (
          <div key={s.system} className="rounded-lg bg-surface-2 p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="h-2 w-2 rounded-full bg-gain animate-pulse" />
              <span className="text-xs font-medium text-foreground">{s.system}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{s.status}</span>
              <span className="font-mono">{s.uptime}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default WorkflowModule;
