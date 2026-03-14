import { useState, useMemo } from "react";
import { Building2, Link2, Users, Briefcase, Handshake, Swords, Package, Scale, TrendingUp, MessageCircle, Loader2, AlertTriangle, BarChart3 } from "lucide-react";
import { getCurrencySymbol } from "@/lib/currency";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useCompanyIntelligence, type CompanyIntelligence as CIData } from "@/hooks/useCompanyIntelligence";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend,
  AreaChart, Area, LineChart, Line, ReferenceLine
} from "recharts";

const COLORS = ["hsl(30,90%,55%)", "hsl(180,70%,50%)", "hsl(120,60%,45%)", "hsl(280,60%,60%)", "hsl(200,80%,55%)", "hsl(0,70%,55%)", "hsl(60,80%,45%)", "hsl(320,60%,55%)"];

const riskColor = (level: string) => {
  if (level === "critical") return "text-loss bg-loss/10 border-loss/20";
  if (level === "high") return "text-loss bg-loss/5 border-loss/10";
  if (level === "medium") return "text-warning bg-warning/10 border-warning/20";
  return "text-gain bg-gain/10 border-gain/20";
};

const signalBar = (value: number, label: string, invert = false) => {
  const color = invert
    ? value > 60 ? "bg-loss" : value > 30 ? "bg-warning" : "bg-gain"
    : value > 60 ? "bg-gain" : value > 30 ? "bg-warning" : "bg-loss";
  return (
    <div key={label} className="flex items-center gap-2">
      <span className="text-[9px] text-muted-foreground w-28 shrink-0 uppercase tracking-wider">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[10px] font-mono text-foreground w-8 text-right">{value}</span>
    </div>
  );
};

interface Props {
  ticker: string;
}

export default function CompanyIntelligence({ ticker }: Props) {
  const { data, loading, error } = useCompanyIntelligence(ticker);

  if (loading) {
    return (
      <div className="rounded-sm border border-border bg-card p-6 flex items-center justify-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-xs text-muted-foreground font-mono">Loading corporate intelligence for {ticker}...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-sm border border-border bg-card p-4 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <span className="text-xs text-muted-foreground">{error || "No intelligence available"}</span>
      </div>
    );
  }

  const tabs = [
    { id: "core", label: "Core", icon: <Building2 className="h-3 w-3" /> },
    { id: "signals", label: "Signals", icon: <BarChart3 className="h-3 w-3" /> },
    { id: "supply", label: "Supply Chain", icon: <Link2 className="h-3 w-3" /> },
    { id: "ownership", label: "Ownership", icon: <Users className="h-3 w-3" /> },
    { id: "leadership", label: "Leadership", icon: <Briefcase className="h-3 w-3" /> },
    { id: "partners", label: "Partnerships", icon: <Handshake className="h-3 w-3" /> },
    { id: "compete", label: "Competitive", icon: <Swords className="h-3 w-3" /> },
    { id: "products", label: "Products", icon: <Package className="h-3 w-3" /> },
    { id: "regulatory", label: "Regulatory", icon: <Scale className="h-3 w-3" /> },
    { id: "insider", label: "Insider", icon: <TrendingUp className="h-3 w-3" /> },
    { id: "narrative", label: "Narrative", icon: <MessageCircle className="h-3 w-3" /> },
  ];

  // Prepare radar data for signals
  const radarData = data.signals ? [
    { metric: "Moat", value: data.signals.competitiveMoat, fullMark: 100 },
    { metric: "Ownership", value: data.signals.ownershipStability, fullMark: 100 },
    { metric: "Insider Conf.", value: data.signals.insiderConfidence, fullMark: 100 },
    { metric: "Narrative", value: data.signals.narrativeMomentum, fullMark: 100 },
    { metric: "Supply Risk", value: 100 - data.signals.supplyChainRisk, fullMark: 100 },
    { metric: "Reg. Safety", value: 100 - data.signals.regulatoryRisk, fullMark: 100 },
  ] : [];

  // Compute composite score
  const compositeScore = data.signals
    ? Math.round(
        (data.signals.competitiveMoat + data.signals.ownershipStability + data.signals.insiderConfidence +
         data.signals.narrativeMomentum + (100 - data.signals.supplyChainRisk) + (100 - data.signals.regulatoryRisk)) / 6
      )
    : 0;

  // Product revenue pie data
  const productPieData = data.products?.filter(p => p.revenueContribution > 0).map(p => ({
    name: p.name,
    value: p.revenueContribution,
  })) || [];

  // Insider activity summary for chart
  const insiderSummary = data.insiderActivity?.reduce((acc, a) => {
    if (a.action === "buy") acc.buys += a.shares || 0;
    else if (a.action === "sell") acc.sells += a.shares || 0;
    else acc.grants += a.shares || 0;
    return acc;
  }, { buys: 0, sells: 0, grants: 0 }) || { buys: 0, sells: 0, grants: 0 };

  const insiderBarData = [
    { action: "Buys", shares: insiderSummary.buys, fill: "hsl(120,60%,45%)" },
    { action: "Sells", shares: insiderSummary.sells, fill: "hsl(0,70%,55%)" },
    { action: "Grants", shares: insiderSummary.grants, fill: "hsl(200,80%,55%)" },
  ];

  return (
    <div className="rounded-sm border border-border bg-card">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {data.companyName || ticker} — Intelligence Dossier
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {data.sector} · {data.industry} · {data.headquarters} · Est. {data.founded}
            <span className="ml-2 text-primary/60">• Cached 24h</span>
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {/* Composite score badge */}
          {data.signals && (
            <div className={`rounded-full w-9 h-9 flex items-center justify-center border-2 text-xs font-bold font-mono ${
              compositeScore >= 70 ? "border-gain text-gain" : compositeScore >= 45 ? "border-warning text-warning" : "border-loss text-loss"
            }`}>
              {compositeScore}
            </div>
          )}
          <Badge variant="outline" className="text-[9px]">{data.marketCap}</Badge>
          <Badge variant="outline" className="text-[9px]">{data.employees} employees</Badge>
        </div>
      </div>

      {/* Signal Summary Bar */}
      <div className="border-b border-border px-4 py-2 space-y-1">
        {data.signals && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            {signalBar(data.signals.competitiveMoat, "Competitive Moat")}
            {signalBar(data.signals.ownershipStability, "Ownership Stability")}
            {signalBar(data.signals.insiderConfidence, "Insider Confidence")}
            {signalBar(data.signals.narrativeMomentum, "Narrative Momentum")}
            {signalBar(data.signals.supplyChainRisk, "Supply Chain Risk", true)}
            {signalBar(data.signals.regulatoryRisk, "Regulatory Risk", true)}
          </div>
        )}
      </div>

      <Tabs defaultValue="core">
        <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 h-auto overflow-x-auto scrollbar-hide">
          {tabs.map(t => (
            <TabsTrigger key={t.id} value={t.id}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 py-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider gap-1 shrink-0">
              {t.icon} {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="p-4">
          {/* CORE */}
          <TabsContent value="core" className="mt-0 space-y-4">
            <p className="text-xs text-secondary-foreground leading-relaxed">{data.overview}</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {data.revenueSegments?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Revenue by Segment</p>
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.revenueSegments} layout="vertical">
                        <CartesianGrid strokeDasharray="2 2" stroke="hsl(220,12%,20%)" strokeOpacity={0.3} />
                        <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `${v}%`} />
                        <YAxis dataKey="segment" type="category" tick={{ fontSize: 8, fill: "hsl(220,10%,55%)" }} width={80} />
                        <Tooltip contentStyle={{ background: "hsl(220,12%,13%)", border: "1px solid hsl(220,12%,20%)", fontSize: 10 }} />
                        <Bar dataKey="percentage" radius={[0, 3, 3, 0]}>
                          {data.revenueSegments.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
              {data.geographicRevenue?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Geographic Distribution</p>
                  <div className="h-44 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data.geographicRevenue} dataKey="percentage" nameKey="region" cx="50%" cy="50%" outerRadius={60} label={({ region, percentage }) => `${region} ${percentage}%`}>
                          {data.geographicRevenue.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* SIGNALS RADAR */}
          <TabsContent value="signals" className="mt-0 space-y-4">
            {data.signals && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Intelligence Radar</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                        <PolarGrid stroke="hsl(220,12%,25%)" />
                        <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "hsl(220,10%,60%)" }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 8, fill: "hsl(220,10%,45%)" }} />
                        <Radar name="Score" dataKey="value" stroke="hsl(30,90%,55%)" fill="hsl(30,90%,55%)" fillOpacity={0.25} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Signal Breakdown</p>
                  <div className="space-y-2">
                    {signalBar(data.signals.competitiveMoat, "Competitive Moat")}
                    {signalBar(data.signals.ownershipStability, "Ownership Stability")}
                    {signalBar(data.signals.insiderConfidence, "Insider Confidence")}
                    {signalBar(data.signals.narrativeMomentum, "Narrative Momentum")}
                    {signalBar(data.signals.supplyChainRisk, "Supply Chain Risk", true)}
                    {signalBar(data.signals.regulatoryRisk, "Regulatory Risk", true)}
                  </div>
                  <div className="mt-4 p-3 rounded border border-border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-foreground uppercase">Composite Intelligence Score</span>
                      <span className={`text-lg font-mono font-bold ${
                        compositeScore >= 70 ? "text-gain" : compositeScore >= 45 ? "text-warning" : "text-loss"
                      }`}>{compositeScore}/100</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {compositeScore >= 70 ? "Strong fundamentals with favorable signal alignment" :
                       compositeScore >= 45 ? "Mixed signals — monitor for regime shifts" :
                       "Elevated risk profile — defensive posture recommended"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* SUPPLY CHAIN */}
          <TabsContent value="supply" className="mt-0 space-y-4">
            {data.supplyChain && (
              <>
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Key Suppliers</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {data.supplyChain.suppliers?.map((s, i) => (
                      <div key={i} className={`rounded border p-2 ${riskColor(s.riskLevel)}`}>
                        <p className="text-xs font-bold">{s.name}</p>
                        <p className="text-[9px] opacity-80">{s.role}</p>
                        <Badge variant="outline" className="text-[8px] mt-1">{s.riskLevel} risk</Badge>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Supply chain risk distribution chart */}
                {data.supplyChain.suppliers?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-foreground uppercase mb-2">Supplier Risk Distribution</p>
                    <div className="h-32">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={(() => {
                          const counts = { low: 0, medium: 0, high: 0, critical: 0 };
                          data.supplyChain.suppliers.forEach(s => { counts[s.riskLevel as keyof typeof counts] = (counts[s.riskLevel as keyof typeof counts] || 0) + 1; });
                          return [
                            { level: "Low", count: counts.low, fill: "hsl(120,60%,45%)" },
                            { level: "Medium", count: counts.medium, fill: "hsl(45,90%,50%)" },
                            { level: "High", count: counts.high, fill: "hsl(15,80%,50%)" },
                            { level: "Critical", count: counts.critical, fill: "hsl(0,70%,50%)" },
                          ];
                        })()}>
                          <XAxis dataKey="level" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} />
                          <YAxis tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} allowDecimals={false} />
                          <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                            {[0, 1, 2, 3].map(i => <Cell key={i} fill={["hsl(120,60%,45%)", "hsl(45,90%,50%)", "hsl(15,80%,50%)", "hsl(0,70%,50%)"][i]} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Manufacturing Footprint</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.supplyChain.manufacturers?.map((m, i) => (
                      <div key={i} className="rounded border border-border p-2">
                        <p className="text-xs font-bold text-foreground">{m.name}</p>
                        <p className="text-[9px] text-muted-foreground">{m.location} · <Badge variant="outline" className="text-[8px]">{m.type}</Badge></p>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Distribution Network</p>
                  <div className="flex flex-wrap gap-2">
                    {data.supplyChain.distributors?.map((d, i) => (
                      <Badge key={i} variant="secondary" className="text-[9px]">{d.name} — {d.region}</Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* OWNERSHIP */}
          <TabsContent value="ownership" className="mt-0 space-y-4">
            {data.ownership && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-bold text-foreground uppercase mb-2">Ownership Breakdown</p>
                    <div className="h-44 flex items-center justify-center">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={[
                            { name: "Institutional", value: data.ownership.institutionalPct },
                            { name: "Insider", value: data.ownership.insiderPct },
                            { name: "Retail", value: data.ownership.retailPct },
                          ]} dataKey="value" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${name} ${value}%`}>
                            <Cell fill="hsl(200,80%,55%)" />
                            <Cell fill="hsl(30,90%,55%)" />
                            <Cell fill="hsl(280,60%,60%)" />
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 9 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-foreground uppercase mb-2">Top Holders</p>
                    {/* Holders bar chart */}
                    {data.ownership.topHolders?.length > 0 && (
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data.ownership.topHolders.slice(0, 6)} layout="vertical">
                            <CartesianGrid strokeDasharray="2 2" stroke="hsl(220,12%,20%)" strokeOpacity={0.3} />
                            <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `${v}%`} />
                            <YAxis dataKey="name" type="category" tick={{ fontSize: 7, fill: "hsl(220,10%,55%)" }} width={90} />
                            <Tooltip contentStyle={{ background: "hsl(220,12%,13%)", border: "1px solid hsl(220,12%,20%)", fontSize: 10 }} />
                            <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                              {data.ownership.topHolders.slice(0, 6).map((h, i) => (
                                <Cell key={i} fill={h.trend === "accumulating" ? "hsl(120,60%,45%)" : h.trend === "distributing" ? "hsl(0,70%,55%)" : "hsl(200,80%,55%)"} fillOpacity={0.8} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Holder Details</p>
                  <div className="space-y-1.5">
                    {data.ownership.topHolders?.map((h, i) => (
                      <div key={i} className="flex items-center justify-between border-b border-border/50 pb-1">
                        <div>
                          <span className="text-xs font-medium text-foreground">{h.name}</span>
                          <Badge variant="outline" className="text-[8px] ml-2">{h.type}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-foreground">{h.pct}%</span>
                          <span className={`text-[9px] font-mono ${h.trend === "accumulating" ? "text-gain" : h.trend === "distributing" ? "text-loss" : "text-muted-foreground"}`}>
                            {h.trend === "accumulating" ? "↑" : h.trend === "distributing" ? "↓" : "→"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          {/* LEADERSHIP */}
          <TabsContent value="leadership" className="mt-0 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {data.leadership?.map((exec, i) => (
                <div key={i} className="rounded border border-border p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-foreground">{exec.name}</p>
                      <p className="text-[10px] text-primary">{exec.role} · Since {exec.since}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-secondary-foreground">{exec.background}</p>
                  <p className="text-[9px] text-muted-foreground">Education: {exec.educationBackground}</p>
                  {exec.previousCompanies?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[8px] text-muted-foreground uppercase">Prev:</span>
                      {exec.previousCompanies.map((c, j) => <Badge key={j} variant="outline" className="text-[8px]">{c}</Badge>)}
                    </div>
                  )}
                  {exec.boardMemberships?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      <span className="text-[8px] text-muted-foreground uppercase">Boards:</span>
                      {exec.boardMemberships.map((b, j) => <Badge key={j} variant="secondary" className="text-[8px]">{b}</Badge>)}
                    </div>
                  )}
                  <p className="text-[9px] text-muted-foreground italic">Style: {exec.leadershipStyle}</p>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* PARTNERSHIPS */}
          <TabsContent value="partners" className="mt-0 space-y-3">
            <div className="space-y-2">
              {data.partnerships?.map((p, i) => (
                <div key={i} className="rounded border border-border p-3 flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">{p.partner}</span>
                      <Badge variant="outline" className="text-[8px]">{p.type}</Badge>
                    </div>
                    <p className="text-[10px] text-secondary-foreground">{p.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[9px] text-muted-foreground">Revenue Impact</p>
                    <Badge className={`text-[8px] ${p.revenueImpact === "high" ? "bg-gain/20 text-gain" : p.revenueImpact === "medium" ? "bg-warning/20 text-warning" : "bg-muted text-muted-foreground"}`}>{p.revenueImpact}</Badge>
                    <p className="text-[9px] text-muted-foreground mt-1">Expiry Risk</p>
                    <Badge className={`text-[8px] ${riskColor(p.expirationRisk)}`}>{p.expirationRisk}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>

          {/* COMPETITIVE */}
          <TabsContent value="compete" className="mt-0 space-y-4">
            {data.competitors?.length > 0 && (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.competitors}>
                      <CartesianGrid strokeDasharray="2 2" stroke="hsl(220,12%,20%)" strokeOpacity={0.3} />
                      <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `${v}%`} />
                      <Tooltip contentStyle={{ background: "hsl(220,12%,13%)", border: "1px solid hsl(220,12%,20%)", fontSize: 10 }} />
                      <Bar dataKey="marketShare" radius={[3, 3, 0, 0]}>
                        {data.competitors.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {data.competitors.map((c, i) => (
                    <div key={i} className="flex items-center justify-between border-b border-border/50 pb-1.5">
                      <div>
                        <span className="text-xs font-bold text-foreground">{c.name}</span>
                        <span className="text-[9px] text-muted-foreground ml-2">{c.ticker}</span>
                        <Badge variant="outline" className={`text-[8px] ml-2 ${c.threat === "direct" ? "border-loss/30 text-loss" : c.threat === "emerging" ? "border-warning/30 text-warning" : "border-muted"}`}>{c.threat}</Badge>
                      </div>
                      <span className="text-[10px] font-mono text-foreground">{c.marketShare}% share</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          {/* PRODUCTS */}
          <TabsContent value="products" className="mt-0 space-y-4">
            {productPieData.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold text-foreground uppercase mb-2">Product Revenue Mix</p>
                  <div className="h-48 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={productPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}
                          label={({ name, value }) => `${name} ${value}%`}>
                          {productPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(220,12%,13%)", border: "1px solid hsl(220,12%,20%)", fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {data.products?.map((p, i) => (
                    <div key={i} className="rounded border border-border p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">{p.name}</span>
                        <Badge className={`text-[8px] ${p.lifecycle === "growth" ? "bg-gain/20 text-gain" : p.lifecycle === "mature" ? "bg-primary/20 text-primary" : p.lifecycle === "launch" ? "bg-warning/20 text-warning" : "bg-loss/20 text-loss"}`}>{p.lifecycle}</Badge>
                      </div>
                      <p className="text-[10px] text-secondary-foreground">{p.description}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] text-muted-foreground">Revenue:</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${p.revenueContribution}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-foreground">{p.revenueContribution}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {productPieData.length === 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.products?.map((p, i) => (
                  <div key={i} className="rounded border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground">{p.name}</span>
                      <Badge className={`text-[8px] ${p.lifecycle === "growth" ? "bg-gain/20 text-gain" : p.lifecycle === "mature" ? "bg-primary/20 text-primary" : p.lifecycle === "launch" ? "bg-warning/20 text-warning" : "bg-loss/20 text-loss"}`}>{p.lifecycle}</Badge>
                    </div>
                    <p className="text-[10px] text-secondary-foreground">{p.description}</p>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* REGULATORY */}
          <TabsContent value="regulatory" className="mt-0 space-y-2">
            {data.regulatoryExposure?.map((r, i) => (
              <div key={i} className={`rounded border p-3 ${riskColor(r.severity)}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{r.issue}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-[8px]">{r.region}</Badge>
                    <Badge variant="outline" className="text-[8px]">{r.status}</Badge>
                  </div>
                </div>
                <Badge className={`text-[8px] ${riskColor(r.severity)}`}>{r.severity} severity</Badge>
              </div>
            ))}
          </TabsContent>

          {/* INSIDER */}
          <TabsContent value="insider" className="mt-0 space-y-4">
            {/* Insider buy/sell summary chart */}
            {(insiderSummary.buys > 0 || insiderSummary.sells > 0 || insiderSummary.grants > 0) && (
              <div>
                <p className="text-[10px] font-bold text-foreground uppercase mb-2">Insider Activity Summary</p>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={insiderBarData}>
                      <CartesianGrid strokeDasharray="2 2" stroke="hsl(220,12%,20%)" strokeOpacity={0.3} />
                      <XAxis dataKey="action" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} />
                      <YAxis tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : `${v}`} />
                      <Tooltip contentStyle={{ background: "hsl(220,12%,13%)", border: "1px solid hsl(220,12%,20%)", fontSize: 10 }} formatter={(v: number) => v.toLocaleString()} />
                      <Bar dataKey="shares" radius={[3, 3, 0, 0]}>
                        {insiderBarData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-1 text-left text-muted-foreground">Name</th>
                    <th className="px-2 py-1 text-left text-muted-foreground">Role</th>
                    <th className="px-2 py-1 text-center text-muted-foreground">Action</th>
                    <th className="px-2 py-1 text-right text-muted-foreground">Shares</th>
                    <th className="px-2 py-1 text-right text-muted-foreground">Date</th>
                    <th className="px-2 py-1 text-center text-muted-foreground">Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {data.insiderActivity?.map((a, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-2 py-1 text-foreground">{a.name}</td>
                      <td className="px-2 py-1 text-muted-foreground">{a.role}</td>
                      <td className="px-2 py-1 text-center">
                        <Badge className={`text-[8px] ${a.action === "buy" ? "bg-gain/20 text-gain" : a.action === "sell" ? "bg-loss/20 text-loss" : "bg-muted text-muted-foreground"}`}>{a.action}</Badge>
                      </td>
                      <td className="px-2 py-1 text-right text-foreground">{a.shares?.toLocaleString()}</td>
                      <td className="px-2 py-1 text-right text-muted-foreground">{a.date}</td>
                      <td className="px-2 py-1 text-center">
                        <span className={`text-[9px] ${a.signal === "bullish" ? "text-gain" : a.signal === "bearish" ? "text-loss" : "text-muted-foreground"}`}>
                          {a.signal === "bullish" ? "▲" : a.signal === "bearish" ? "▼" : "●"} {a.signal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* NARRATIVE */}
          <TabsContent value="narrative" className="mt-0 space-y-4">
            {data.narrative && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded border border-border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">News Sentiment</p>
                    <p className={`font-mono text-lg font-bold ${data.narrative.newsSentiment > 0 ? "text-gain" : data.narrative.newsSentiment < 0 ? "text-loss" : "text-foreground"}`}>
                      {data.narrative.newsSentiment > 0 ? "+" : ""}{data.narrative.newsSentiment}
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Social Sentiment</p>
                    <p className={`font-mono text-lg font-bold ${data.narrative.socialSentiment > 0 ? "text-gain" : data.narrative.socialSentiment < 0 ? "text-loss" : "text-foreground"}`}>
                      {data.narrative.socialSentiment > 0 ? "+" : ""}{data.narrative.socialSentiment}
                    </p>
                  </div>
                  <div className="rounded border border-border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Analyst Consensus</p>
                    <Badge className={`text-[9px] ${data.narrative.analystConsensus?.includes("buy") ? "bg-gain/20 text-gain" : data.narrative.analystConsensus?.includes("sell") ? "bg-loss/20 text-loss" : "bg-muted"}`}>
                      {data.narrative.analystConsensus?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <div className="rounded border border-border p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Earnings Tone</p>
                    <Badge className={`text-[9px] ${data.narrative.earningsTone === "positive" ? "bg-gain/20 text-gain" : data.narrative.earningsTone === "negative" ? "bg-loss/20 text-loss" : "bg-muted"}`}>
                      {data.narrative.earningsTone}
                    </Badge>
                  </div>
                </div>
                {data.narrative.analystTargets && (
                  <div>
                    <p className="text-[10px] font-bold text-foreground uppercase mb-2">Analyst Price Target Range</p>
                    <div className="h-20">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { label: "Low", value: data.narrative.analystTargets.low, fill: "hsl(0,70%,55%)" },
                          { label: "Median", value: data.narrative.analystTargets.median, fill: "hsl(30,90%,55%)" },
                          { label: "High", value: data.narrative.analystTargets.high, fill: "hsl(120,60%,45%)" },
                        ]} layout="vertical">
                          <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} tickFormatter={v => `${getCurrencySymbol(data.narrative?.currency)}${v}`} />
                          <YAxis dataKey="label" type="category" tick={{ fontSize: 9, fill: "hsl(220,10%,55%)" }} width={50} />
                          <Tooltip contentStyle={{ background: "hsl(220,12%,13%)", border: "1px solid hsl(220,12%,20%)", fontSize: 10 }} formatter={(v: number) => `${getCurrencySymbol(data.narrative?.currency)}${v}`} />
                          <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                            <Cell fill="hsl(0,70%,55%)" />
                            <Cell fill="hsl(30,90%,55%)" />
                            <Cell fill="hsl(120,60%,45%)" />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
                {data.narrative.narrativeShifts?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold text-foreground uppercase mb-2">Narrative Shifts Detected</p>
                    <div className="space-y-1">
                      {data.narrative.narrativeShifts.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-secondary-foreground">
                          <span className="text-primary mt-0.5">▸</span> {s}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
