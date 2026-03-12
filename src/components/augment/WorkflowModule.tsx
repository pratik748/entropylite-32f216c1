import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { ArrowRight, CheckCircle2, Clock } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const WorkflowModule = ({ stocks }: Props) => {
  const { totalValue, totalPnl, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { workflowStages, stageBarData } = useMemo(() => {
    const avgRisk = holdings.length > 0 ? holdings.reduce((s, h) => s + h.risk, 0) / holdings.length : 0;
    const avgConf = holdings.length > 0 ? holdings.reduce((s, h) => s + (h.analysis?.confidence || 0), 0) / holdings.length : 0;
    const hasData = holdings.length > 0;

    const stages = [
      { stage: "Research", status: hasData ? "complete" : "active", description: "AI-powered analysis, news sentiment, risk scoring", completion: hasData ? 100 : 20,
        metrics: [{ label: "Stocks Analyzed", value: holdings.length.toString() }, { label: "Avg Confidence", value: hasData ? `${avgConf.toFixed(0)}%` : "—" }] },
      { stage: "Portfolio", status: hasData ? "complete" : "pending", description: "Construction, allocation, optimization", completion: hasData ? 100 : 0,
        metrics: [{ label: "Positions", value: holdings.length.toString() }, { label: "Total Value", value: fmt(totalValue) }] },
      { stage: "Trade", status: hasData ? "active" : "pending", description: "Order generation, execution", completion: hasData ? 75 : 0,
        metrics: [{ label: "Suggestions", value: holdings.filter(h => h.suggestion).length.toString() }, { label: "Actions", value: `${holdings.filter(h => h.suggestion === "Add").length}A/${holdings.filter(h => h.suggestion === "Exit").length}E` }] },
      { stage: "Settlement", status: "active", description: "Clearing, reconciliation", completion: hasData ? 60 : 0, metrics: [{ label: "Status", value: "Real-time" }] },
      { stage: "Reporting", status: hasData ? "active" : "pending", description: "NAV, P&L attribution", completion: hasData ? 90 : 0,
        metrics: [{ label: "P&L", value: `${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}` }] },
      { stage: "Compliance", status: hasData ? "active" : "pending", description: "Mandate checks, regulatory", completion: hasData ? 85 : 0,
        metrics: [{ label: "Risk", value: `${avgRisk.toFixed(0)}/100` }] },
      { stage: "Client", status: hasData ? "active" : "pending", description: "Performance review", completion: hasData ? 70 : 0,
        metrics: [{ label: "Holdings", value: holdings.length.toString() }] },
    ];

    const bars = stages.map(s => ({
      name: s.stage, completion: s.completion,
      fill: s.completion === 100 ? "hsl(152,90%,45%)" : s.completion >= 70 ? "hsl(210,60%,55%)" : s.completion >= 40 ? "hsl(38,92%,55%)" : "hsl(0,0%,35%)",
    }));

    return { workflowStages: stages, stageBarData: bars };
  }, [holdings, totalValue, totalPnl, fmt]);

  const stageIcon = (status: string) => {
    if (status === "complete") return <CheckCircle2 className="h-5 w-5 text-gain" />;
    if (status === "active") return <Clock className="h-5 w-5 text-foreground" />;
    return <Clock className="h-5 w-5 text-muted-foreground/40" />;
  };

  return (
    <div className="space-y-6">
      {/* Stage Completion Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Workflow Stage Completion</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageBarData} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
              <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Completion"]} />
              <Bar dataKey="completion" radius={[4, 4, 0, 0]}>
                {stageBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

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
              {i < workflowStages.length - 1 && <ArrowRight className="h-5 w-5 text-muted-foreground/30 mt-8 flex-shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">System Status</h3>
        <div className="grid gap-3 md:grid-cols-4">
          {["Market Data Feed", "AI Analysis Engine", "Risk Engine", "Compliance Engine", "News Aggregation", "Reporting Engine", "Portfolio Optimizer", "Audit Logger"].map(sys => (
            <div key={sys} className="rounded-lg bg-surface-2 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-gain" />
                </span>
                <span className="text-xs font-medium text-foreground">{sys}</span>
              </div>
              <span className="font-mono text-[10px] text-gain">LIVE</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkflowModule;
