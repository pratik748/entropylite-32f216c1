import { useMemo } from "react";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const WorkflowModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const workflowStages = useMemo(() => {
    const totalValue = analyzed.reduce((s, st) => s + (st.analysis?.currentPrice || st.buyPrice) * st.quantity, 0);
    const totalPnl = analyzed.reduce((s, st) => s + ((st.analysis?.currentPrice || st.buyPrice) - st.buyPrice) * st.quantity, 0);
    const avgRisk = analyzed.length > 0 ? analyzed.reduce((s, st) => s + (st.analysis?.riskScore || 40), 0) / analyzed.length : 0;

    return [
      {
        stage: "Research",
        status: analyzed.length > 0 ? "complete" : "active",
        description: "AI-powered analysis, news sentiment, risk scoring",
        metrics: [
          { label: "Stocks Analyzed", value: analyzed.length.toString() },
          { label: "Avg Confidence", value: analyzed.length > 0 ? `${(analyzed.reduce((s, st) => s + (st.analysis?.confidence || 0), 0) / analyzed.length).toFixed(0)}%` : "—" },
        ],
      },
      {
        stage: "Portfolio",
        status: analyzed.length > 0 ? "complete" : "pending",
        description: "Construction, allocation, optimization",
        metrics: [
          { label: "Positions", value: analyzed.length.toString() },
          { label: "Total Value", value: `₹${(totalValue / 100000).toFixed(1)}L` },
        ],
      },
      {
        stage: "Trade",
        status: analyzed.length > 0 ? "active" : "pending",
        description: "Order generation, execution",
        metrics: [
          { label: "Suggestions", value: analyzed.filter(s => s.analysis?.suggestion).length.toString() },
          { label: "Actions", value: `${analyzed.filter(s => s.analysis?.suggestion === "Add").length} Add, ${analyzed.filter(s => s.analysis?.suggestion === "Exit").length} Exit` },
        ],
      },
      {
        stage: "Settlement",
        status: "active",
        description: "Clearing, reconciliation",
        metrics: [
          { label: "Status", value: "Real-time" },
        ],
      },
      {
        stage: "Reporting",
        status: analyzed.length > 0 ? "active" : "pending",
        description: "NAV, P&L attribution, client reports",
        metrics: [
          { label: "P&L", value: `${totalPnl >= 0 ? "+" : ""}₹${(totalPnl / 100000).toFixed(1)}L` },
        ],
      },
      {
        stage: "Compliance",
        status: analyzed.length > 0 ? "active" : "pending",
        description: "Mandate checks, regulatory",
        metrics: [
          { label: "Risk Score", value: `${avgRisk.toFixed(0)}/100` },
        ],
      },
      {
        stage: "Client",
        status: analyzed.length > 0 ? "active" : "pending",
        description: "Performance review, reporting",
        metrics: [
          { label: "Holdings", value: analyzed.length.toString() },
        ],
      },
    ];
  }, [analyzed]);

  const stageIcon = (status: string) => {
    if (status === "complete") return <CheckCircle2 className="h-5 w-5 text-gain" />;
    if (status === "active") return <Clock className="h-5 w-5 text-foreground" />;
    return <Clock className="h-5 w-5 text-muted-foreground/40" />;
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-2">End-to-End Investment Workflow</h3>
        <p className="text-xs text-muted-foreground mb-6">Research → Portfolio → Trade → Settlement → Reporting → Compliance → Client</p>

        <div className="flex items-start gap-1 overflow-x-auto pb-4">
          {workflowStages.map((s, i) => (
            <div key={s.stage} className="flex items-start gap-1">
              <div className={`min-w-[160px] rounded-xl p-4 border transition-all ${s.status === "complete" ? "bg-gain/5 border-gain/20" : s.status === "active" ? "bg-surface-2 border-border" : "bg-surface-2 border-border/30"}`}>
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
              {i < workflowStages.length - 1 && (
                <ArrowRight className="h-5 w-5 text-muted-foreground/30 mt-8 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">System Status</h3>
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { system: "Market Data Feed", status: "LIVE" },
            { system: "AI Analysis Engine", status: "LIVE" },
            { system: "Risk Engine", status: "LIVE" },
            { system: "Compliance Engine", status: "LIVE" },
            { system: "News Aggregation", status: "LIVE" },
            { system: "Reporting Engine", status: "LIVE" },
            { system: "Portfolio Optimizer", status: "LIVE" },
            { system: "Audit Logger", status: "LIVE" },
          ].map(s => (
            <div key={s.system} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-gain" />
                </span>
                <span className="text-xs font-medium text-foreground">{s.system}</span>
              </div>
              <span className="font-mono text-[10px] text-gain">{s.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkflowModule;
