import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import type { ReportBlock, Insight, MetricValue } from "@/lib/analytics/types";
import { Loader2, AlertTriangle, Eye, Info, FileText, Database } from "lucide-react";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };
const PIE_COLORS = ["hsl(0,0%,90%)", "hsl(0,0%,75%)", "hsl(0,0%,60%)", "hsl(0,0%,48%)", "hsl(0,0%,36%)", "hsl(0,0%,25%)"];

const SOURCE_LABELS: Record<string, string> = {
  "historical-prices": "Daily price history (Yahoo/AV pipeline)",
  "portfolio-state": "Portfolio holdings & cost basis",
  "benchmark-prices": "Benchmark index series",
  "covariance-estimate": "Realized covariance estimate",
  "derived": "Derived from cited metrics",
};

function formatMetric(m: MetricValue, format: "currency" | "percent" | "ratio" | "number", fmt: (v: number) => string): string {
  switch (format) {
    case "currency": return fmt(m.value);
    case "percent": return `${(m.value * 100).toFixed(2)}%`;
    case "ratio": return m.value === Infinity ? "∞" : m.value.toFixed(2);
    default: return m.value.toFixed(2);
  }
}

const confColor = (c: string) =>
  c === "high" ? "text-gain" : c === "medium" ? "text-warning" : "text-loss";

const severityStyle: Record<Insight["severity"], { border: string; icon: typeof Info }> = {
  action: { border: "border-loss/40 bg-loss/5", icon: AlertTriangle },
  watch: { border: "border-warning/40 bg-warning/5", icon: Eye },
  info: { border: "border-border bg-surface-2/50", icon: Info },
};

const InsightCard = ({ insight }: { insight: Insight }) => {
  const s = severityStyle[insight.severity];
  const Icon = s.icon;
  return (
    <div className={`rounded-lg border p-3 ${s.border}`}>
      <div className="flex items-start gap-2">
        <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">{insight.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{insight.statement}</p>
          {insight.recommendation && (
            <p className="text-xs text-foreground/80 mt-1">→ {insight.recommendation}</p>
          )}
          <p className="text-[9px] font-mono text-muted-foreground/60 mt-1.5">
            {SOURCE_LABELS[insight.provenance.source] ?? insight.provenance.source} · {insight.provenance.calculation}
            {insight.provenance.sampleSize > 0 ? ` · n=${insight.provenance.sampleSize}` : ""} ·{" "}
            <span className={confColor(insight.provenance.confidence)}>confidence: {insight.provenance.confidence}</span>
          </p>
        </div>
      </div>
    </div>
  );
};

const BlockRenderer = ({ block, fmt }: { block: ReportBlock; fmt: (v: number) => string }) => {
  switch (block.kind) {
    case "text":
      return <p className="text-sm text-muted-foreground leading-relaxed">{block.text}</p>;
    case "insight":
      return <InsightCard insight={block.insight} />;
    case "kpi": {
      const m = block.metric;
      return (
        <div className="rounded-lg border border-border bg-surface-2/40 p-3" title={`${m.provenance.calculation} · n=${m.provenance.sampleSize}${m.provenance.assumptions ? ` · ${m.provenance.assumptions.join("; ")}` : ""}`}>
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{block.label}</p>
          <p className="mt-0.5 font-mono text-base font-bold text-foreground">{formatMetric(m, block.format, fmt)}</p>
          <p className="text-[8px] font-mono text-muted-foreground/60 truncate">{m.provenance.calculation}</p>
          <p className={`text-[8px] font-mono ${confColor(m.provenance.confidence)}`}>n={m.provenance.sampleSize} · {m.provenance.confidence}</p>
        </div>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {block.columns.map(c => (
                  <th key={c} className="px-2 py-2 text-left font-medium text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  {row.map((cell, j) => {
                    const str = String(cell);
                    const neg = /^[−-]/.test(str) && j > 0;
                    const pos = /^\+/.test(str);
                    return (
                      <td key={j} className={`px-2 py-1.5 font-mono ${j === 0 ? "text-foreground font-medium" : neg ? "text-loss" : pos ? "text-gain" : "text-muted-foreground"}`}>
                        {str}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
};

const ClientReportingModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);
  const ia = useInstitutionalAnalytics(stocks);

  const { pieData, returnBarData } = useMemo(() => {
    const pie = holdings.map(h => ({
      name: h.ticker, value: totalValue > 0 ? +((h.value / totalValue) * 100).toFixed(1) : 0,
    }));
    const bars = holdings.map(h => ({
      name: h.ticker, return: +h.pnlPct.toFixed(1),
      fill: h.pnlPct >= 0 ? "hsl(152,90%,45%)" : "hsl(0,90%,55%)",
    }));
    return { pieData: pie, returnBarData: bars };
  }, [holdings, totalValue]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to generate the institutional report.</p>
      </div>
    );
  }

  if (!ia.ready && ia.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Computing the institutional report from real history…</p>
      </div>
    );
  }

  const report = ia.report;

  return (
    <div className="space-y-6">
      {/* Report header */}
      <div className="rounded-xl border border-border bg-card p-5 flex items-start justify-between">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> {report?.title ?? "Portfolio Intelligence Report"}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">
            As of {new Date(report?.asOf ?? Date.now()).toLocaleString()} · base currency {report?.baseCurrency}
            {" "}· {ia.snapshot.lookbackDays} trading days of history
            {ia.benchmarkReady ? ` · benchmark ${ia.benchmarkTicker}` : ""}
          </p>
        </div>
        {report && (
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1 justify-end">
              <Database className="h-3 w-3" /> Data Sources
            </p>
            {report.sources.map(s => (
              <p key={s} className="text-[9px] font-mono text-muted-foreground/70">{SOURCE_LABELS[s] ?? s}</p>
            ))}
          </div>
        )}
      </div>

      {/* Allocation snapshot charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Portfolio Allocation</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={42} strokeWidth={2} stroke={CARD_BG}>
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Weight"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Per-Position Returns</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={returnBarData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Return"]} />
                <Bar dataKey="return" radius={[4, 4, 0, 0]}>
                  {returnBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Report sections */}
      {!report ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            The report is generated only from computed analytics — it becomes available once
            ≥30 days of real price history load for the holdings.
          </p>
        </div>
      ) : (
        report.sections.map(section => (
          <div key={section.id} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{section.title}</h3>
              <p className="text-[10px] text-muted-foreground/70 italic mt-0.5">{section.answers}</p>
            </div>
            <div className="space-y-3">
              {(() => {
                // Group consecutive KPI blocks into a grid; render others in flow
                const out: JSX.Element[] = [];
                let kpiRun: ReportBlock[] = [];
                const flush = (key: string) => {
                  if (kpiRun.length > 0) {
                    out.push(
                      <div key={key} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {kpiRun.map((b, i) => <BlockRenderer key={i} block={b} fmt={fmt} />)}
                      </div>,
                    );
                    kpiRun = [];
                  }
                };
                section.blocks.forEach((b, i) => {
                  if (b.kind === "kpi") {
                    kpiRun.push(b);
                  } else {
                    flush(`kpis-${i}`);
                    out.push(<BlockRenderer key={i} block={b} fmt={fmt} />);
                  }
                });
                flush("kpis-end");
                return out;
              })()}
            </div>
          </div>
        ))
      )}
    </div>
  );
};

export default ClientReportingModule;
