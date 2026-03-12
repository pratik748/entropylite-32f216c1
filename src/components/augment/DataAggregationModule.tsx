import { useState } from "react";
import { CheckCircle2, Clock, AlertTriangle, XCircle, RefreshCw, Activity, Database, Wifi, Shield } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, PieChart, Pie,
} from "recharts";
import { useDataPipeline } from "@/hooks/useDataPipeline";
import { Button } from "@/components/ui/button";

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const GAIN = "hsl(152,90%,45%)";
const LOSS = "hsl(0,84%,55%)";
const WARN = "hsl(38,92%,55%)";
const INFO = "hsl(217,91%,60%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const statusIcon = (s: string) => {
  if (s === "LIVE") return <CheckCircle2 className="h-3.5 w-3.5 text-gain" />;
  if (s === "DEGRADED") return <AlertTriangle className="h-3.5 w-3.5 text-warning" />;
  if (s === "DOWN") return <XCircle className="h-3.5 w-3.5 text-loss" />;
  return <Clock className="h-3.5 w-3.5 text-info" />;
};

const statusColor = (s: string) => {
  if (s === "LIVE") return GAIN;
  if (s === "DEGRADED") return WARN;
  if (s === "DOWN") return LOSS;
  return INFO;
};

const DataAggregationModule = () => {
  const { data, loading, error, refresh } = useDataPipeline();
  const [view, setView] = useState<"overview" | "detail">("overview");

  // Fallback static data if pipeline hasn't loaded yet
  const sources = data?.sources || [];
  const summary = data?.summary || { total: 0, live: 0, degraded: 0, down: 0, avgLatency: 0, totalRecordsEstimate: 0, overallHealth: 0, avgCredibility: 0 };

  const latencyBarData = sources
    .filter(s => s.latency > 0)
    .sort((a, b) => b.latency - a.latency)
    .map(s => ({
      name: s.source.length > 14 ? s.source.slice(0, 14) + "…" : s.source,
      latency: s.latency,
      fill: s.latency > 3000 ? LOSS : s.latency > 1000 ? WARN : GAIN,
    }));

  const credibilityRadar = sources.map(s => ({
    name: s.source.length > 10 ? s.source.slice(0, 10) + "…" : s.source,
    credibility: s.credibilityScore,
    latencyScore: Math.max(0, 100 - s.latency / 50),
  }));

  const typeDistribution = sources.reduce((acc, s) => {
    acc[s.type] = (acc[s.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const typePieData = Object.entries(typeDistribution).map(([name, value], i) => ({
    name, value,
    fill: ["hsl(0,0%,80%)", "hsl(0,0%,65%)", "hsl(0,0%,50%)", "hsl(0,0%,35%)", "hsl(0,0%,25%)"][i % 5],
  }));

  const recordsBarData = sources.map(s => ({
    name: s.source.length > 12 ? s.source.slice(0, 12) + "…" : s.source,
    records: s.recordsEstimate,
  }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Active Sources", value: `${summary.live}/${summary.total}`, icon: <Wifi className="h-4 w-4 text-gain" /> },
          { label: "System Health", value: `${summary.overallHealth.toFixed(0)}%`, icon: <Activity className="h-4 w-4 text-primary" /> },
          { label: "Avg Latency", value: `${summary.avgLatency}ms`, icon: <RefreshCw className="h-4 w-4 text-muted-foreground" /> },
          { label: "Records/Day", value: `${(summary.totalRecordsEstimate / 1000).toFixed(0)}K+`, icon: <Database className="h-4 w-4 text-info" /> },
          { label: "Credibility", value: `${summary.avgCredibility}%`, icon: <Shield className="h-4 w-4 text-warning" /> },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-1">
              {s.icon}
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className="font-mono text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        ))}
      </div>

      {/* View Toggle + Refresh */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["overview", "detail"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${view === v ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}>
              {v === "overview" ? "Charts" : "Detail Table"}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={refresh} className="h-7 gap-1.5 text-xs text-muted-foreground">
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {view === "overview" ? (
        <>
          {/* Charts Row */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Latency by Source */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Source Latency (ms)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={latencyBarData} layout="vertical" margin={{ left: 100 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} width={95} />
                    <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}ms`, "Latency"]} />
                    <Bar dataKey="latency" radius={[0, 4, 4, 0]}>
                      {latencyBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Credibility Radar */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Source Reliability Radar</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={credibilityRadar} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke={GRID} strokeOpacity={0.6} />
                    <PolarAngleAxis dataKey="name" tick={{ fill: MUTED, fontSize: 8 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="credibility" stroke="hsl(0,0%,75%)" fill="hsl(0,0%,75%)" fillOpacity={0.15} strokeWidth={1.5} />
                    <Radar dataKey="latencyScore" stroke={INFO} fill={INFO} fillOpacity={0.1} strokeWidth={1} strokeDasharray="4 2" />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 text-[9px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: "hsl(0,0%,75%)" }} /> Credibility</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: INFO }} /> Speed Score</span>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* Records by Source */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Estimated Records by Source</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={recordsBarData} margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                    <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: GRID }} interval={0} angle={-25} textAnchor="end" height={50} />
                    <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                    <Tooltip contentStyle={tipStyle} />
                    <Bar dataKey="records" fill="hsl(0,0%,60%)" radius={[4, 4, 0, 0]}>
                      {recordsBarData.map((_, i) => <Cell key={i} fill={`hsl(0,0%,${80 - i * 6}%)`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Source Type Distribution */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Source Type Distribution</h3>
              <div className="h-56 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={typePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3} stroke={GRID}>
                      {typePieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Pie>
                    <Tooltip contentStyle={tipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-1">
                {typePieData.map(d => (
                  <span key={d.name} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-sm" style={{ background: d.fill }} />
                    {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : (
        /* Detail Table */
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Real-Time Data Sources</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Source", "Type", "Status", "Latency", "Credibility", "Records", "Last Check"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.source} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                    <td className="px-3 py-2 font-medium text-foreground">{s.source}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{s.type}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        {statusIcon(s.status)}
                        <span className="font-mono text-xs">{s.status}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: s.latency > 3000 ? LOSS : s.latency > 1000 ? WARN : GAIN }}>
                      {s.latency}ms
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{s.credibilityScore}%</td>
                    <td className="px-3 py-2 font-mono text-xs text-foreground">{s.recordsEstimate.toLocaleString()}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {new Date(s.lastCheck).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pipeline Flow Visualization */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Data Pipeline Flow</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { step: "Ingest", desc: `${summary.total} sources`, color: summary.live > 0 ? GAIN : MUTED },
            { step: "Validate", desc: `${summary.avgCredibility}% credibility`, color: summary.avgCredibility > 80 ? GAIN : WARN },
            { step: "Normalize", desc: "Schema unification", color: GAIN },
            { step: "Cache", desc: `Governor managed`, color: INFO },
            { step: "Route", desc: "Prediction → MIND → Scar", color: GAIN },
          ].map((p, i, arr) => (
            <div key={p.step} className="flex items-center gap-2">
              <div className="min-w-[130px] rounded-lg bg-surface-2 p-3 text-center border border-border/30">
                <div className="h-1 w-full rounded-full mb-2" style={{ background: p.color }} />
                <p className="text-xs font-medium text-foreground">{p.step}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{p.desc}</p>
              </div>
              {i < arr.length - 1 && <span className="text-muted-foreground/30 text-lg">→</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DataAggregationModule;
