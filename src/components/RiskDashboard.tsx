import { useState } from "react";
import { Shield, AlertTriangle, XOctagon } from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  LineChart, Line, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface RiskDashboardProps {
  stocks: PortfolioStock[];
}

// --- Helper: generate simulated VaR/CVaR ---
function computeVaRCVaR(stocks: PortfolioStock[]) {
  const analyzed = stocks.filter(s => s.analysis);
  if (analyzed.length === 0) return { var95: 0, var99: 0, cvar95: 0, cvar99: 0, liquidityVar: 0 };
  const totalValue = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);
  const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;
  const dailyVol = (avgRisk / 100) * 0.025;
  return {
    var95: totalValue * dailyVol * 1.645,
    var99: totalValue * dailyVol * 2.326,
    cvar95: totalValue * dailyVol * 2.063,
    cvar99: totalValue * dailyVol * 2.665,
    liquidityVar: totalValue * dailyVol * 1.645 * 1.35,
  };
}

// --- Static data for deep analytics ---
const REGIME_DATA = [
  { regime: "Bull Trend", probability: 0.45, avgReturn: 1.2, volatility: 12, duration: "4-8 months", color: "hsl(145,70%,45%)" },
  { regime: "Bear Trend", probability: 0.15, avgReturn: -2.1, volatility: 28, duration: "2-4 months", color: "hsl(0,62%,50%)" },
  { regime: "High Vol", probability: 0.20, avgReturn: -0.5, volatility: 32, duration: "1-3 months", color: "hsl(45,90%,50%)" },
  { regime: "Low Vol", probability: 0.20, avgReturn: 0.8, volatility: 8, duration: "3-6 months", color: "hsl(0,0%,60%)" },
];

const FACTOR_EXPOSURE = [
  { factor: "Market β", exposure: 0.92, contribution: 68 },
  { factor: "Size (SMB)", exposure: 0.35, contribution: 12 },
  { factor: "Value (HML)", exposure: -0.18, contribution: -5 },
  { factor: "Momentum", exposure: 0.42, contribution: 15 },
  { factor: "Quality", exposure: 0.28, contribution: 8 },
  { factor: "Low Vol", exposure: -0.12, contribution: 2 },
];

const STRESS_SCENARIOS = [
  { scenario: "2008 GFC Replay", impact: -32.5, recovery: "18 months" },
  { scenario: "COVID-19 Crash", impact: -24.1, recovery: "5 months" },
  { scenario: "RBI Rate Hike +150bps", impact: -8.2, recovery: "6 months" },
  { scenario: "Crude Oil $120/bbl", impact: -11.4, recovery: "4 months" },
  { scenario: "FII Outflow ₹50K Cr", impact: -14.2, recovery: "8 months" },
  { scenario: "INR Depreciation 10%", impact: -5.8, recovery: "3 months" },
];

const CORRELATION_REGIMES = {
  bull: [
    [1.00, 0.65, 0.45, 0.72, 0.58],
    [0.65, 1.00, 0.52, 0.48, 0.62],
    [0.45, 0.52, 1.00, 0.38, 0.55],
    [0.72, 0.48, 0.38, 1.00, 0.42],
    [0.58, 0.62, 0.55, 0.42, 1.00],
  ],
  bear: [
    [1.00, 0.85, 0.78, 0.88, 0.82],
    [0.85, 1.00, 0.80, 0.75, 0.84],
    [0.78, 0.80, 1.00, 0.72, 0.79],
    [0.88, 0.75, 0.72, 1.00, 0.76],
    [0.82, 0.84, 0.79, 0.76, 1.00],
  ],
};
const CORR_LABELS = ["Financials", "Tech", "Energy", "Consumer", "Pharma"];

const RiskDashboard = ({ stocks }: RiskDashboardProps) => {
  const analyzed = stocks.filter((s) => s.analysis);
  const vars = computeVaRCVaR(stocks);

  // Aggregate risk breakdown
  const avgBreakdown = { volatility: 0, sector: 0, regulatory: 0, financial: 0, macro: 0 };
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
  const n = Math.max(analyzed.length, 1);
  const radarData = [
    { risk: "Volatility", value: Math.round(avgBreakdown.volatility / n) },
    { risk: "Sector", value: Math.round(avgBreakdown.sector / n) },
    { risk: "Regulatory", value: Math.round(avgBreakdown.regulatory / n) },
    { risk: "Financial", value: Math.round(avgBreakdown.financial / n) },
    { risk: "Macro", value: Math.round(avgBreakdown.macro / n) },
  ];

  const avgRiskScore = analyzed.length > 0
    ? Math.round(analyzed.reduce((s, st) => s + (st.analysis.riskScore || 0), 0) / n)
    : 0;

  // Per-stock risk
  const stockRiskData = analyzed.map((s) => ({
    name: s.ticker.replace(".NS", "").replace(".BO", ""),
    risk: s.analysis.riskScore || 0,
    fill: (s.analysis.riskScore || 0) >= 60 ? "hsl(0, 62%, 50%)" : (s.analysis.riskScore || 0) >= 35 ? "hsl(45, 90%, 50%)" : "hsl(145, 70%, 45%)",
  }));

  // Concentration
  const sectorMap: Record<string, number> = {};
  analyzed.forEach((s) => {
    const sector = s.ticker.replace(".NS", "").replace(".BO", "");
    const value = (s.analysis.currentPrice || s.buyPrice) * s.quantity;
    sectorMap[sector] = (sectorMap[sector] || 0) + value;
  });
  const totalValue = Object.values(sectorMap).reduce((s, v) => s + v, 0);
  const concentrationData = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, pct: totalValue > 0 ? (value / totalValue) * 100 : 0, value }))
    .sort((a, b) => b.pct - a.pct);

  const hhi = concentrationData.reduce((sum, c) => sum + (c.pct / 100) ** 2, 0);
  const hhiPct = Math.round(hhi * 10000);
  const concentrationLevel = hhiPct > 5000 ? "High" : hhiPct > 2500 ? "Medium" : "Low";

  const [selectedRegime, setSelectedRegime] = useState<"bull" | "bear">("bull");

  const corrColor = (v: number) => {
    if (v >= 0.8) return "bg-loss/40 text-loss";
    if (v >= 0.6) return "bg-warning/20 text-warning";
    return "bg-gain/10 text-foreground";
  };

  return (
    <div className="space-y-6">
      {/* VaR / CVaR Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "VaR (95%)", value: vars.var95, color: "text-loss" },
          { label: "VaR (99%)", value: vars.var99, color: "text-loss" },
          { label: "CVaR (95%)", value: vars.cvar95, color: "text-loss" },
          { label: "CVaR (99%)", value: vars.cvar99, color: "text-loss" },
          { label: "Liquidity VaR", value: vars.liquidityVar, color: "text-loss" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className={`mt-1 font-mono text-lg font-bold ${s.color}`}>
              ₹{s.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-muted-foreground">1-day parametric</p>
          </div>
        ))}
      </div>

      {/* Portfolio Risk + Concentration */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Portfolio Risk Score</p>
          <p className={`mt-1 font-mono text-3xl font-bold ${avgRiskScore >= 60 ? "text-loss" : avgRiskScore >= 35 ? "text-warning" : "text-gain"}`}>
            {avgRiskScore}/100
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Concentration (HHI)</p>
          <p className={`mt-1 font-mono text-xl font-bold ${concentrationLevel === "High" ? "text-loss" : concentrationLevel === "Medium" ? "text-warning" : "text-gain"}`}>
            {concentrationLevel} <span className="text-sm text-muted-foreground">({hhiPct})</span>
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">Stocks Analyzed</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{analyzed.length}</p>
        </div>
      </div>

      {/* Radar + Per-Stock Risk */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Risk Breakdown (Avg)</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(0, 0%, 14%)" />
                <PolarAngleAxis dataKey="risk" tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 10 }} />
                <Radar dataKey="value" stroke="hsl(0, 0%, 100%)" fill="hsl(0, 0%, 100%)" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Risk by Stock</h3>
          <div className="h-72">
            {stockRiskData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockRiskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 14%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }} axisLine={{ stroke: "hsl(0, 0%, 14%)" }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 11 }} axisLine={{ stroke: "hsl(0, 0%, 14%)" }} />
                  <Tooltip contentStyle={{ background: "hsl(0, 0%, 6%)", border: "1px solid hsl(0, 0%, 14%)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="risk" radius={[4, 4, 0, 0]}>
                    {stockRiskData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Analyze stocks to see risk</div>
            )}
          </div>
        </div>
      </div>

      {/* Regime Clustering */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Market Regime Clustering</h3>
        <div className="grid gap-3 md:grid-cols-4">
          {REGIME_DATA.map(r => (
            <div key={r.regime} className="rounded-lg bg-surface-2 p-4 border border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: r.color }} />
                <span className="text-sm font-semibold text-foreground">{r.regime}</span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Probability</span><span className="font-mono text-foreground">{(r.probability * 100).toFixed(0)}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Avg Monthly Return</span><span className={`font-mono ${r.avgReturn >= 0 ? "text-gain" : "text-loss"}`}>{r.avgReturn > 0 ? "+" : ""}{r.avgReturn}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Annualized Vol</span><span className="font-mono text-foreground">{r.volatility}%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span className="font-mono text-foreground">{r.duration}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Factor Exposure */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Factor Exposure</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={FACTOR_EXPOSURE} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
                <YAxis dataKey="factor" type="category" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} width={75} />
                <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="exposure" radius={[0, 4, 4, 0]}>
                  {FACTOR_EXPOSURE.map((f, i) => (
                    <Cell key={i} fill={f.exposure >= 0 ? "hsl(0,0%,100%)" : "hsl(0,62%,50%)"} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Factor Risk Contribution (%)</h3>
          <div className="space-y-2">
            {FACTOR_EXPOSURE.map(f => (
              <div key={f.factor} className="flex items-center gap-3">
                <span className="w-20 text-sm text-muted-foreground">{f.factor}</span>
                <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
                  <div className={`h-full rounded-full ${f.contribution >= 0 ? "bg-foreground" : "bg-loss"}`} style={{ width: `${Math.abs(f.contribution)}%` }} />
                </div>
                <span className={`font-mono text-xs w-10 text-right ${f.contribution >= 0 ? "text-foreground" : "text-loss"}`}>{f.contribution}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stress Scenarios */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-base font-semibold text-foreground mb-4">Stress Scenarios</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {STRESS_SCENARIOS.map(s => (
            <div key={s.scenario} className="rounded-lg bg-surface-2 p-4 border border-border/50">
              <p className="text-sm font-medium text-foreground mb-2">{s.scenario}</p>
              <p className="font-mono text-2xl font-bold text-loss">{s.impact}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">Est. recovery: {s.recovery}</p>
              <p className="font-mono text-xs text-loss mt-1">
                P&L: ₹{((totalValue || 100000) * Math.abs(s.impact) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })} loss
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Correlation Breakdown by Regime */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">Correlation Breakdown by Regime</h3>
          <div className="flex gap-1">
            {(["bull", "bear"] as const).map(r => (
              <button
                key={r}
                onClick={() => setSelectedRegime(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedRegime === r ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                }`}
              >
                {r === "bull" ? "Bull Market" : "Bear Market"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-muted-foreground"></th>
                {CORR_LABELS.map(l => <th key={l} className="px-2 py-1 text-center font-mono text-muted-foreground">{l}</th>)}
              </tr>
            </thead>
            <tbody>
              {CORR_LABELS.map((label, i) => (
                <tr key={label}>
                  <td className="px-2 py-1 font-mono text-muted-foreground">{label}</td>
                  {CORRELATION_REGIMES[selectedRegime][i].map((v, j) => (
                    <td key={j} className="px-2 py-1 text-center">
                      <span className={`inline-block rounded px-2 py-0.5 font-mono font-bold ${i === j ? "bg-surface-3 text-foreground" : corrColor(v)}`}>
                        {v.toFixed(2)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Note: In bear markets, correlations increase significantly (correlation breakdown), reducing diversification benefits.
        </p>
      </div>

      {/* Concentration table */}
      {concentrationData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Portfolio Concentration</h3>
          <div className="space-y-2">
            {concentrationData.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-foreground w-24">{c.name}</span>
                <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-foreground transition-all duration-500" style={{ width: `${c.pct}%` }} />
                </div>
                <span className="font-mono text-sm text-muted-foreground w-16 text-right">{c.pct.toFixed(1)}%</span>
                <span className="font-mono text-xs text-muted-foreground w-24 text-right">
                  ₹{c.value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key risks aggregated */}
      {analyzed.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">All Key Risks</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {analyzed.flatMap((s) =>
              (s.analysis.keyRisks || []).map((risk: string, i: number) => (
                <div key={`${s.ticker}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
                  <div>
                    <span className="font-mono text-xs text-foreground">{s.ticker.replace(".NS", "")}</span>
                    <p className="text-muted-foreground">{risk}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Need React import for useState
import React from "react";

export default RiskDashboard;
