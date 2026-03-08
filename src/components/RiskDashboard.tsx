import { useState, useMemo } from "react";
import { Shield, AlertTriangle, Zap } from "lucide-react";
import ClankEngine from "@/components/risk/ClankEngine";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface RiskDashboardProps {
  stocks: PortfolioStock[];
}

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

const RiskDashboard = ({ stocks }: RiskDashboardProps) => {
  const analyzed = stocks.filter((s) => s.analysis);
  const vars = computeVaRCVaR(stocks);

  const totalValue = useMemo(() => 
    analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0),
    [analyzed]
  );

  // Compute real factor exposure from portfolio
  const factorExposure = useMemo(() => {
    if (analyzed.length === 0) return [];
    const avgBeta = analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length;
    const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;
    
    // Derive size factor from market cap distribution
    const largeCap = analyzed.filter(s => s.analysis.marketCap === "Large Cap").length;
    const sizeFactor = (analyzed.length - largeCap) / analyzed.length * 0.8 - 0.2;
    
    // Value factor from PE
    const avgPE = analyzed.reduce((s, st) => s + (st.analysis.pe || 20), 0) / analyzed.length;
    const valueFactor = avgPE < 15 ? 0.4 : avgPE < 25 ? 0.1 : -0.3;
    
    // Momentum from actual returns
    const returns = analyzed.map(s => ((s.analysis.currentPrice || s.buyPrice) - s.buyPrice) / s.buyPrice);
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const momentumFactor = avgReturn > 0.1 ? 0.5 : avgReturn > 0 ? 0.2 : -0.3;

    return [
      { factor: "Market β", exposure: +avgBeta.toFixed(2), contribution: Math.round(avgBeta * 65) },
      { factor: "Size (SMB)", exposure: +sizeFactor.toFixed(2), contribution: Math.round(sizeFactor * 20) },
      { factor: "Value (HML)", exposure: +valueFactor.toFixed(2), contribution: Math.round(valueFactor * 15) },
      { factor: "Momentum", exposure: +momentumFactor.toFixed(2), contribution: Math.round(momentumFactor * 18) },
      { factor: "Quality", exposure: +(1 - avgRisk / 100).toFixed(2), contribution: Math.round((1 - avgRisk / 100) * 12) },
      { factor: "Low Vol", exposure: +(avgRisk < 40 ? 0.3 : -0.2).toFixed(2), contribution: Math.round(avgRisk < 40 ? 5 : -3) },
    ];
  }, [analyzed]);

  // Real stress scenarios based on portfolio beta
  const stressScenarios = useMemo(() => {
    const avgBeta = analyzed.length > 0 ? analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length : 1;
    return [
      { scenario: "2008 GFC Replay", impact: -(32.5 * avgBeta), recovery: "18 months" },
      { scenario: "COVID-19 Crash", impact: -(24.1 * avgBeta), recovery: "5 months" },
      { scenario: "Rate Hike +200bps", impact: -(8.2 * avgBeta), recovery: "6 months" },
      { scenario: "Crude Oil $120/bbl", impact: -(11.4 * avgBeta * 0.8), recovery: "4 months" },
      { scenario: "Forced FII Outflow", impact: -(14.2 * avgBeta), recovery: "8 months" },
      { scenario: "Currency Crisis 10%", impact: -(5.8 * avgBeta * 1.2), recovery: "3 months" },
    ];
  }, [analyzed]);

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

  const stockRiskData = analyzed.map((s) => ({
    name: s.ticker.replace(".NS", "").replace(".BO", ""),
    risk: s.analysis.riskScore || 0,
    fill: (s.analysis.riskScore || 0) >= 60 ? "hsl(0, 84%, 55%)" : (s.analysis.riskScore || 0) >= 35 ? "hsl(38, 92%, 55%)" : "hsl(152, 82%, 42%)",
  }));

  const sectorMap: Record<string, number> = {};
  analyzed.forEach((s) => {
    const sector = s.analysis.sector || s.ticker.replace(".NS", "").replace(".BO", "");
    const value = (s.analysis.currentPrice || s.buyPrice) * s.quantity;
    sectorMap[sector] = (sectorMap[sector] || 0) + value;
  });
  const concentrationData = Object.entries(sectorMap)
    .map(([name, value]) => ({ name, pct: totalValue > 0 ? (value / totalValue) * 100 : 0, value }))
    .sort((a, b) => b.pct - a.pct);

  const hhi = concentrationData.reduce((sum, c) => sum + (c.pct / 100) ** 2, 0);
  const hhiPct = Math.round(hhi * 10000);
  const concentrationLevel = hhiPct > 5000 ? "High" : hhiPct > 2500 ? "Medium" : "Low";

  const [selectedRegime, setSelectedRegime] = useState<"bull" | "bear">("bull");

  const CORR_LABELS = analyzed.length > 0 
    ? analyzed.slice(0, 5).map(s => s.ticker.replace(".NS", "").replace(".BO", ""))
    : ["Asset 1", "Asset 2", "Asset 3", "Asset 4", "Asset 5"];

  // Generate correlation from actual beta values
  const corrMatrix = useMemo(() => {
    const betas = analyzed.slice(0, 5).map(s => s.analysis?.beta || 1);
    const n = Math.min(betas.length, 5);
    const matrix: number[][] = [];
    for (let i = 0; i < n; i++) {
      matrix[i] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) { matrix[i][j] = 1; continue; }
        const baseCorr = 0.3 + Math.min(betas[i], betas[j]) * 0.2;
        const bearCorr = Math.min(0.95, baseCorr + 0.3);
        matrix[i][j] = selectedRegime === "bull" ? +baseCorr.toFixed(2) : +bearCorr.toFixed(2);
      }
    }
    return matrix;
  }, [analyzed, selectedRegime]);

  const corrColor = (v: number) => {
    if (v >= 0.8) return "bg-loss/40 text-loss";
    if (v >= 0.6) return "bg-warning/20 text-warning";
    return "bg-gain/10 text-foreground";
  };

  return (
    <div className="space-y-5">
      {/* VaR Stats */}
      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: "VaR (95%)", value: vars.var95 },
          { label: "VaR (99%)", value: vars.var99 },
          { label: "CVaR (95%)", value: vars.cvar95 },
          { label: "CVaR (99%)", value: vars.cvar99 },
          { label: "Liquidity VaR", value: vars.liquidityVar },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-lg font-bold text-loss">
              {s.value > 0 ? `$${s.value.toLocaleString("en-US", { maximumFractionDigits: 0 })}` : "—"}
            </p>
            <p className="text-[9px] text-muted-foreground">1-day parametric</p>
          </div>
        ))}
      </div>

      {/* Portfolio Risk + Concentration */}
      <div className="grid gap-3 md:grid-cols-3">
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
          <p className="text-xs text-muted-foreground">Assets Analyzed</p>
          <p className="mt-1 font-mono text-3xl font-bold text-foreground">{analyzed.length}</p>
        </div>
      </div>

      {/* Radar + Per-Stock Risk */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Risk Breakdown</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(220, 12%, 13%)" />
                <PolarAngleAxis dataKey="risk" tick={{ fill: "hsl(210, 8%, 45%)", fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(210, 8%, 45%)", fontSize: 10 }} />
                <Radar dataKey="value" stroke="hsl(210, 100%, 60%)" fill="hsl(210, 100%, 60%)" fillOpacity={0.1} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Risk by Asset</h3>
          <div className="h-72">
            {stockRiskData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stockRiskData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 13%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(210, 8%, 45%)", fontSize: 11 }} axisLine={{ stroke: "hsl(220, 12%, 13%)" }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "hsl(210, 8%, 45%)", fontSize: 11 }} axisLine={{ stroke: "hsl(220, 12%, 13%)" }} />
                  <Tooltip contentStyle={{ background: "hsl(220, 14%, 7%)", border: "1px solid hsl(220, 12%, 13%)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="risk" radius={[4, 4, 0, 0]}>
                    {stockRiskData.map((entry, i) => <Cell key={i} fill={entry.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Analyze assets to see risk</div>
            )}
          </div>
        </div>
      </div>

      {/* Factor Exposure — computed from real portfolio */}
      {factorExposure.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Factor Exposure</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={factorExposure} layout="vertical" margin={{ left: 80 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,12%,13%)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "hsl(210,8%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(220,12%,13%)" }} />
                  <YAxis dataKey="factor" type="category" tick={{ fill: "hsl(210,8%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(220,12%,13%)" }} width={75} />
                  <Tooltip contentStyle={{ background: "hsl(220,14%,7%)", border: "1px solid hsl(220,12%,13%)", borderRadius: 8, fontSize: 11 }} />
                  <Bar dataKey="exposure" radius={[0, 4, 4, 0]}>
                    {factorExposure.map((f, i) => (
                      <Cell key={i} fill={f.exposure >= 0 ? "hsl(210,100%,60%)" : "hsl(0,84%,55%)"} fillOpacity={0.8} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Factor Risk Contribution</h3>
            <div className="space-y-2">
              {factorExposure.map(f => (
                <div key={f.factor} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">{f.factor}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className={`h-full rounded-full ${f.contribution >= 0 ? "bg-primary" : "bg-loss"}`} style={{ width: `${Math.min(Math.abs(f.contribution), 100)}%` }} />
                  </div>
                  <span className={`font-mono text-xs w-10 text-right ${f.contribution >= 0 ? "text-foreground" : "text-loss"}`}>{f.contribution}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stress Scenarios — scaled by portfolio beta */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Stress Scenarios</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {stressScenarios.map(s => (
            <div key={s.scenario} className="rounded-lg bg-surface-2 p-4 border border-border/50">
              <p className="text-sm font-medium text-foreground mb-2">{s.scenario}</p>
              <p className="font-mono text-2xl font-bold text-loss">{s.impact.toFixed(1)}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">Recovery: {s.recovery}</p>
              {totalValue > 0 && (
                <p className="font-mono text-xs text-loss mt-1">
                  P&L: ${(totalValue * Math.abs(s.impact) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} loss
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Dynamic Correlation Matrix */}
      {corrMatrix.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Correlation by Regime</h3>
            <div className="flex gap-1">
              {(["bull", "bear"] as const).map(r => (
                <button
                  key={r}
                  onClick={() => setSelectedRegime(r)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedRegime === r ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r === "bull" ? "Bull" : "Bear"}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-muted-foreground"></th>
                  {CORR_LABELS.slice(0, corrMatrix.length).map(l => <th key={l} className="px-2 py-1 text-center font-mono text-muted-foreground">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {CORR_LABELS.slice(0, corrMatrix.length).map((label, i) => (
                  <tr key={label}>
                    <td className="px-2 py-1 font-mono text-muted-foreground">{label}</td>
                    {corrMatrix[i]?.map((v, j) => (
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
            Bear markets increase correlations, reducing diversification benefits.
          </p>
        </div>
      )}

      {/* Concentration */}
      {concentrationData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Portfolio Concentration</h3>
          <div className="space-y-2">
            {concentrationData.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-foreground w-24 truncate">{c.name}</span>
                <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${c.pct}%` }} />
                </div>
                <span className="font-mono text-xs text-muted-foreground w-14 text-right">{c.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key Risks */}
      {analyzed.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">All Key Risks</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {analyzed.flatMap((s) =>
              (s.analysis.keyRisks || []).map((risk: string, i: number) => (
                <div key={`${s.ticker}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface-2 p-3 text-sm">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-warning" />
                  <div>
                    <span className="font-mono text-xs text-foreground">{s.ticker.replace(".NS", "").replace(".BO", "")}</span>
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

export default RiskDashboard;
