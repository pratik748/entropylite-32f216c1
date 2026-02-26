import { Shield, AlertTriangle, XOctagon } from "lucide-react";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface RiskDashboardProps {
  stocks: PortfolioStock[];
}

const RiskDashboard = ({ stocks }: RiskDashboardProps) => {
  const analyzed = stocks.filter((s) => s.analysis);

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No analyzed stocks</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Analyze stocks in the Dashboard to see risk metrics</p>
      </div>
    );
  }

  // Aggregate risk breakdown
  const avgBreakdown = {
    volatility: 0,
    sector: 0,
    regulatory: 0,
    financial: 0,
    macro: 0,
  };
  analyzed.forEach((s) => {
    const rb = s.analysis.riskBreakdown;
    if (rb) {
      avgBreakdown.volatility += rb.volatilityRisk || 0;
      avgBreakdown.sector += rb.sectorRisk || 0;
      avgBreakdown.regulatory += rb.regulatoryRisk || 0;
      avgBreakdown.financial += rb.financialRisk || 0;
      avgBreakdown.macro += rb.macroRisk || 0;
    }
  });
  const n = analyzed.length;
  const radarData = [
    { risk: "Volatility", value: Math.round(avgBreakdown.volatility / n) },
    { risk: "Sector", value: Math.round(avgBreakdown.sector / n) },
    { risk: "Regulatory", value: Math.round(avgBreakdown.regulatory / n) },
    { risk: "Financial", value: Math.round(avgBreakdown.financial / n) },
    { risk: "Macro", value: Math.round(avgBreakdown.macro / n) },
  ];

  const avgRiskScore = Math.round(
    analyzed.reduce((s, st) => s + (st.analysis.riskScore || 0), 0) / n
  );

  // Sector exposure
  const sectorMap: Record<string, number> = {};
  analyzed.forEach((s) => {
    const sector = s.ticker.replace(".NS", "").replace(".BO", "");
    const value = (s.analysis.currentPrice || s.buyPrice) * s.quantity;
    sectorMap[sector] = (sectorMap[sector] || 0) + value;
  });
  const totalValue = Object.values(sectorMap).reduce((s, v) => s + v, 0);
  const concentrationData = Object.entries(sectorMap)
    .map(([name, value]) => ({
      name,
      pct: totalValue > 0 ? (value / totalValue) * 100 : 0,
      value,
    }))
    .sort((a, b) => b.pct - a.pct);

  // Concentration risk: HHI
  const hhi = concentrationData.reduce((sum, c) => sum + (c.pct / 100) ** 2, 0);
  const hhiPct = Math.round(hhi * 10000);
  const concentrationLevel = hhiPct > 5000 ? "High" : hhiPct > 2500 ? "Medium" : "Low";
  const concConfig = {
    High: { color: "text-loss", icon: XOctagon },
    Medium: { color: "text-warning", icon: AlertTriangle },
    Low: { color: "text-gain", icon: Shield },
  };
  const ConcIcon = concConfig[concentrationLevel].icon;

  // Per-stock risk
  const stockRiskData = analyzed.map((s) => ({
    name: s.ticker.replace(".NS", "").replace(".BO", ""),
    risk: s.analysis.riskScore || 0,
    fill:
      (s.analysis.riskScore || 0) >= 60
        ? "hsl(0, 72%, 55%)"
        : (s.analysis.riskScore || 0) >= 35
        ? "hsl(38, 92%, 55%)"
        : "hsl(145, 70%, 50%)",
  }));

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Portfolio Risk Score</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${
            avgRiskScore >= 60 ? "text-loss" : avgRiskScore >= 35 ? "text-warning" : "text-gain"
          }`}>
            {avgRiskScore}/100
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Concentration (HHI)</p>
          <div className="mt-1 flex items-center gap-2">
            <ConcIcon className={`h-5 w-5 ${concConfig[concentrationLevel].color}`} />
            <span className={`font-mono text-xl font-bold ${concConfig[concentrationLevel].color}`}>
              {concentrationLevel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">HHI: {hhiPct}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Stocks Analyzed</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{analyzed.length}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar chart */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Risk Breakdown (Avg)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(220, 16%, 18%)" />
                <PolarAngleAxis
                  dataKey="risk"
                  tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 10 }}
                />
                <Radar
                  dataKey="value"
                  stroke="hsl(175, 80%, 50%)"
                  fill="hsl(175, 80%, 50%)"
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Per-stock risk */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Risk by Stock</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockRiskData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 16%, 18%)" />
                <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} axisLine={{ stroke: "hsl(220, 16%, 18%)" }} />
                <YAxis domain={[0, 100]} tick={{ fill: "hsl(215, 15%, 50%)", fontSize: 11 }} axisLine={{ stroke: "hsl(220, 16%, 18%)" }} />
                <Tooltip
                  contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 16%, 18%)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [`${v}/100`, "Risk Score"]}
                />
                <Bar dataKey="risk" radius={[4, 4, 0, 0]}>
                  {stockRiskData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} fillOpacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Concentration table */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Portfolio Concentration</h3>
        <div className="space-y-2">
          {concentrationData.map((c) => (
            <div key={c.name} className="flex items-center gap-3">
              <span className="font-mono text-sm font-semibold text-foreground w-24">{c.name}</span>
              <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${c.pct}%` }}
                />
              </div>
              <span className="font-mono text-sm text-muted-foreground w-16 text-right">{c.pct.toFixed(1)}%</span>
              <span className="font-mono text-xs text-muted-foreground w-24 text-right">
                ₹{c.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Key risks aggregated */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">All Key Risks</h3>
        <div className="grid gap-2 md:grid-cols-2">
          {analyzed.flatMap((s) =>
            (s.analysis.keyRisks || []).map((risk: string, i: number) => (
              <div key={`${s.ticker}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
                <div>
                  <span className="font-mono text-xs text-primary">{s.ticker.replace(".NS", "")}</span>
                  <p className="text-secondary-foreground">{risk}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskDashboard;
