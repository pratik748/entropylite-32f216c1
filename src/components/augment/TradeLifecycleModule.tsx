import { CheckCircle2, Clock, ArrowRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const LIFECYCLE_STAGES = [
  { stage: "Pre-Trade", status: "complete", checks: ["Compliance ✓", "Margin ✓", "Limit ✓", "Best Execution ✓"] },
  { stage: "Execution", status: "complete", checks: ["Order Placed", "Matched", "Confirmed", "Allocated"] },
  { stage: "Clearing", status: "active", checks: ["Netting Done", "CCP Submitted", "Awaiting Confirmation", "--"] },
  { stage: "Settlement", status: "pending", checks: ["T+1 DVP", "Custodian", "ISIN Transfer", "Cash Transfer"] },
  { stage: "Post-Trade", status: "pending", checks: ["P&L Booked", "NAV Updated", "Client Report", "Audit Trail"] },
];

const TRADE_LOG = [
  { id: "TRD-9841", ticker: "RELIANCE", action: "BUY 200 @ 2,485", preCheck: "PASS", execution: "FILLED", clearing: "NETTED", settlement: "T+1 PENDING", postTrade: "PENDING" },
  { id: "TRD-9840", ticker: "TCS", action: "SELL 50 @ 3,820", preCheck: "PASS", execution: "FILLED", clearing: "CONFIRMED", settlement: "SETTLED", postTrade: "BOOKED" },
  { id: "TRD-9839", ticker: "INFY", action: "BUY 300 @ 1,542", preCheck: "PASS", execution: "PARTIAL", clearing: "PENDING", settlement: "PENDING", postTrade: "PENDING" },
];

// Stacked bar: lifecycle progress per trade
const lifecycleBarData = TRADE_LOG.map(t => {
  const stageValue = (s: string) => {
    if (["PASS", "FILLED", "CONFIRMED", "NETTED", "SETTLED", "BOOKED"].includes(s)) return 100;
    if (["PARTIAL", "T+1 PENDING"].includes(s)) return 50;
    return 10;
  };
  return {
    name: t.ticker,
    "Pre-Trade": stageValue(t.preCheck),
    "Execution": stageValue(t.execution),
    "Clearing": stageValue(t.clearing),
    "Settlement": stageValue(t.settlement),
    "Post-Trade": stageValue(t.postTrade),
  };
});

const stageIcon = (status: string) => {
  if (status === "complete") return <CheckCircle2 className="h-5 w-5 text-gain" />;
  if (status === "active") return <Clock className="h-5 w-5 text-warning animate-pulse" />;
  return <Clock className="h-5 w-5 text-muted-foreground/40" />;
};

const TradeLifecycleModule = () => (
  <div className="space-y-6">
    {/* Stacked Bar Chart */}
    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Lifecycle Progress by Trade</h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={lifecycleBarData} margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} />
            <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={tipStyle} />
            <Legend wrapperStyle={{ fontSize: 9, color: MUTED }} />
            <Bar dataKey="Pre-Trade" stackId="a" fill="hsl(152,90%,45%)" />
            <Bar dataKey="Execution" stackId="a" fill="hsl(210,60%,55%)" />
            <Bar dataKey="Clearing" stackId="a" fill="hsl(38,92%,55%)" />
            <Bar dataKey="Settlement" stackId="a" fill="hsl(0,0%,50%)" />
            <Bar dataKey="Post-Trade" stackId="a" fill="hsl(0,0%,30%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-6">Trade Lifecycle Pipeline</h3>
      <div className="flex items-start gap-2 overflow-x-auto pb-2">
        {LIFECYCLE_STAGES.map((s, i) => (
          <div key={s.stage} className="flex items-start gap-2">
            <div className={`min-w-[160px] rounded-lg p-4 ${s.status === "active" ? "bg-surface-3 border border-border" : "bg-surface-2"}`}>
              <div className="flex items-center gap-2 mb-3">
                {stageIcon(s.status)}
                <span className="text-sm font-semibold text-foreground">{s.stage}</span>
              </div>
              <div className="space-y-1">
                {s.checks.map((c, j) => (
                  <p key={j} className={`text-xs ${s.status === "complete" ? "text-gain" : s.status === "active" && j < 2 ? "text-foreground" : "text-muted-foreground/50"}`}>
                    {c}
                  </p>
                ))}
              </div>
            </div>
            {i < LIFECYCLE_STAGES.length - 1 && (
              <ArrowRight className="h-5 w-5 text-muted-foreground/30 mt-6 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Trade Lifecycle Tracker</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Trade ID", "Ticker", "Action", "Pre-Trade", "Execution", "Clearing", "Settlement", "Post-Trade"].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TRADE_LOG.map(t => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{t.id}</td>
                <td className="px-2 py-2 font-mono text-foreground font-medium">{t.ticker}</td>
                <td className="px-2 py-2 text-xs text-foreground">{t.action}</td>
                <td className="px-2 py-2 font-mono text-xs text-gain">{t.preCheck}</td>
                <td className="px-2 py-2 font-mono text-xs text-foreground">{t.execution}</td>
                <td className="px-2 py-2 font-mono text-xs text-foreground">{t.clearing}</td>
                <td className="px-2 py-2 font-mono text-xs text-warning">{t.settlement}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{t.postTrade}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

export default TradeLifecycleModule;
