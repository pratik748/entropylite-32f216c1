import { CheckCircle2, Clock } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const DATA_FEEDS = [
  { source: "Yahoo Finance", type: "Market Data", status: "LIVE", latency: 120, records: 15420, lastUpdate: "Just now" },
  { source: "newsdata.io", type: "News", status: "LIVE", latency: 350, records: 2841, lastUpdate: "2s ago" },
  { source: "RBI DBIE", type: "Economic", status: "LIVE", latency: 1200, records: 892, lastUpdate: "5m ago" },
  { source: "SEBI EDIFAR", type: "Regulatory", status: "LIVE", latency: 2100, records: 445, lastUpdate: "15m ago" },
  { source: "Alpha Vantage", type: "Fundamentals", status: "LIVE", latency: 280, records: 8210, lastUpdate: "1m ago" },
  { source: "FRED", type: "Global Macro", status: "LIVE", latency: 450, records: 3120, lastUpdate: "1h ago" },
  { source: "NSE Bhav Copy", type: "EOD Data", status: "SCHEDULED", latency: 0, records: 2000, lastUpdate: "16:00 IST" },
  { source: "Satellite/Alt Data", type: "Alternative", status: "BETA", latency: 5400, records: 124, lastUpdate: "6h ago" },
];

const CLEANING_PIPELINE = [
  { step: "Ingest", records: "42,152", errors: 0, status: "✓" },
  { step: "Dedup", records: "41,890", errors: 262, status: "✓" },
  { step: "Normalize", records: "41,890", errors: 0, status: "✓" },
  { step: "Validate", records: "41,842", errors: 48, status: "✓" },
  { step: "Enrich", records: "41,842", errors: 0, status: "✓" },
  { step: "Store", records: "41,842", errors: 0, status: "✓" },
];

const statusIcon = (s: string) => {
  if (s === "LIVE") return <CheckCircle2 className="h-3.5 w-3.5 text-gain" />;
  if (s === "SCHEDULED") return <Clock className="h-3.5 w-3.5 text-warning" />;
  return <Clock className="h-3.5 w-3.5 text-info" />;
};

const recordsBarData = DATA_FEEDS.map(f => ({
  name: f.source.length > 12 ? f.source.slice(0, 12) + "…" : f.source,
  records: f.records,
}));

const latencyBarData = DATA_FEEDS.filter(f => f.latency > 0).map(f => ({
  name: f.source.length > 12 ? f.source.slice(0, 12) + "…" : f.source,
  latency: f.latency,
  fill: f.latency > 1000 ? "hsl(0,90%,55%)" : f.latency > 400 ? "hsl(38,92%,55%)" : "hsl(152,90%,45%)",
}));

const DataAggregationModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-4">
      {[
        { label: "Active Feeds", value: "8" },
        { label: "Records/Day", value: "42K+" },
        { label: "Avg Latency", value: "1.2s" },
        { label: "Data Quality", value: "99.3%" },
      ].map(s => (
        <div key={s.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">{s.label}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{s.value}</p>
        </div>
      ))}
    </div>

    {/* Charts */}
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Records by Source</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={recordsBarData} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: GRID }} interval={0} angle={-25} textAnchor="end" height={50} />
              <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="records" fill="hsl(0,0%,60%)" radius={[4, 4, 0, 0]}>
                {recordsBarData.map((_, i) => <Cell key={i} fill={`hsl(0,0%,${80 - i * 7}%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Latency by Source (ms)</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={latencyBarData} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
              <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} width={85} />
              <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}ms`, "Latency"]} />
              <Bar dataKey="latency" radius={[0, 4, 4, 0]}>
                {latencyBarData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Real-Time Data Feeds</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Source", "Type", "Status", "Latency", "Records", "Last Update"].map(h => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DATA_FEEDS.map(f => (
              <tr key={f.source} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium text-foreground">{f.source}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{f.type}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-1.5">{statusIcon(f.status)}<span className="font-mono text-xs">{f.status}</span></div></td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{f.latency > 0 ? `${f.latency}ms` : "--"}</td>
                <td className="px-3 py-2 font-mono text-xs text-foreground">{f.records.toLocaleString()}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{f.lastUpdate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Data Cleaning Pipeline</h3>
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {CLEANING_PIPELINE.map((p, i) => (
          <div key={p.step} className="flex items-center gap-2">
            <div className="min-w-[120px] rounded-lg bg-surface-2 p-3 text-center">
              <p className="text-xs font-medium text-foreground">{p.step}</p>
              <p className="font-mono text-sm font-bold text-foreground mt-1">{p.records}</p>
              {p.errors > 0 && <p className="text-[10px] text-loss">{p.errors} removed</p>}
            </div>
            {i < CLEANING_PIPELINE.length - 1 && <span className="text-muted-foreground/30">→</span>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DataAggregationModule;
