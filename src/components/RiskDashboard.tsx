import { useState, useMemo, useEffect } from "react";
import { Shield, AlertTriangle, Zap, Brain } from "lucide-react";
import ClankEngine from "@/components/risk/ClankEngine";
import { useAIProvider } from "@/hooks/useAIProvider";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { governedInvoke } from "@/lib/apiGovernor";

interface RiskDashboardProps {
  stocks: PortfolioStock[];
}

// Static fallback
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
  const staticVars = computeVaRCVaR(stocks);

  const [aiData, setAiData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch AI risk intelligence
  useEffect(() => {
    if (analyzed.length === 0) return;
    setAiLoading(true);
    const portfolio = analyzed.map(st => ({
      ticker: st.ticker, quantity: st.quantity, buyPrice: st.buyPrice,
      currentPrice: st.analysis?.currentPrice || st.buyPrice,
      riskScore: st.analysis?.riskScore || 40, beta: st.analysis?.beta || 1,
      sector: st.analysis?.sector || "Unknown", pe: st.analysis?.pe || 0,
      marketCap: st.analysis?.marketCap || "Unknown",
    }));
    governedInvoke("risk-intelligence", { body: { portfolio } })
      .then(({ data }) => { if (data && !data.error) setAiData(data); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [analyzed.map(s => s.ticker).join(",")]);

  const totalValue = useMemo(() => 
    analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0),
    [analyzed]
  );

  // Use AI data if available, otherwise static
  const vars = aiData ? {
    var95: aiData.var95 || staticVars.var95,
    var99: aiData.var99 || staticVars.var99,
    cvar95: aiData.cvar95 || staticVars.cvar95,
    cvar99: aiData.cvar99 || staticVars.cvar99,
    liquidityVar: aiData.liquidityVar || staticVars.liquidityVar,
  } : staticVars;

  const avgRiskScore = aiData?.portfolioRiskScore ?? (analyzed.length > 0
    ? Math.round(analyzed.reduce((s, st) => s + (st.analysis.riskScore || 0), 0) / analyzed.length)
    : 0);

  // Factor exposure from AI or static
  const factorExposure = useMemo(() => {
    if (aiData?.factorExposure?.length > 0) return aiData.factorExposure;
    if (analyzed.length === 0) return [];
    const avgBeta = analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length;
    const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;
    const largeCap = analyzed.filter(s => s.analysis.marketCap === "Large Cap").length;
    const sizeFactor = (analyzed.length - largeCap) / analyzed.length * 0.8 - 0.2;
    const avgPE = analyzed.reduce((s, st) => s + (st.analysis.pe || 20), 0) / analyzed.length;
    const valueFactor = avgPE < 15 ? 0.4 : avgPE < 25 ? 0.1 : -0.3;
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
  }, [analyzed, aiData]);

  // Stress scenarios from AI or static
  const stressScenarios = useMemo(() => {
    if (aiData?.stressScenarios?.length > 0) return aiData.stressScenarios;
    const avgBeta = analyzed.length > 0 ? analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length : 1;
    return [
      { scenario: "2008 GFC Replay", impact: -(32.5 * avgBeta), recovery: "18 months", pnlLoss: totalValue * 0.325 * avgBeta },
      { scenario: "COVID-19 Crash", impact: -(24.1 * avgBeta), recovery: "5 months", pnlLoss: totalValue * 0.241 * avgBeta },
      { scenario: "Rate Hike +200bps", impact: -(8.2 * avgBeta), recovery: "6 months", pnlLoss: totalValue * 0.082 * avgBeta },
      { scenario: "Crude Oil $120/bbl", impact: -(11.4 * avgBeta * 0.8), recovery: "4 months", pnlLoss: totalValue * 0.114 * avgBeta * 0.8 },
      { scenario: "Forced FII Outflow", impact: -(14.2 * avgBeta), recovery: "8 months", pnlLoss: totalValue * 0.142 * avgBeta },
      { scenario: "Currency Crisis 10%", impact: -(5.8 * avgBeta * 1.2), recovery: "3 months", pnlLoss: totalValue * 0.058 * avgBeta * 1.2 },
    ];
  }, [analyzed, aiData, totalValue]);

  // Risk breakdown radar
  const avgBreakdown = aiData?.riskBreakdown || { volatility: 0, sector: 0, regulatory: 0, financial: 0, macro: 0 };
  if (!aiData) {
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
    avgBreakdown.volatility = Math.round(avgBreakdown.volatility / n);
    avgBreakdown.sector = Math.round(avgBreakdown.sector / n);
    avgBreakdown.regulatory = Math.round(avgBreakdown.regulatory / n);
    avgBreakdown.financial = Math.round(avgBreakdown.financial / n);
    avgBreakdown.macro = Math.round(avgBreakdown.macro / n);
  }

  const radarData = [
    { risk: "Volatility", value: avgBreakdown.volatility },
    { risk: "Sector", value: avgBreakdown.sector },
    { risk: "Regulatory", value: avgBreakdown.regulatory },
    { risk: "Financial", value: avgBreakdown.financial },
    { risk: "Macro", value: avgBreakdown.macro },
  ];

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
  const [riskTab, setRiskTab] = useState<"analytics" | "clank">("analytics");
  const { provider, toggle } = useAIProvider();

  const CORR_LABELS = analyzed.length > 0 
    ? analyzed.map(s => s.ticker.replace(".NS", "").replace(".BO", ""))
    : ["Asset 1", "Asset 2"];

  const corrMatrix = useMemo(() => {
    const betas = analyzed.map(s => s.analysis?.beta || 1);
    const n = betas.length;
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

  const volatilityRegime = aiData?.volatilityRegime;

  return (
    <div className="space-y-4">
      {/* AI indicator */}
      {aiLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Brain className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs text-primary">AI Risk Intelligence computing...</span>
        </div>
      )}
      {aiData && !aiLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-gain/20 bg-gain/5 px-3 py-2">
          <Brain className="h-4 w-4 text-gain" />
          <span className="text-xs text-gain">AI-Driven Risk Analysis</span>
          {volatilityRegime && <span className="ml-auto text-xs font-mono text-foreground">Regime: {volatilityRegime}</span>}
        </div>
      )}

      {/* Risk Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border pb-2">
        {([
          { id: "analytics" as const, label: "Risk Analytics", icon: <Shield className="h-3.5 w-3.5" /> },
          { id: "clank" as const, label: "CLANK Engine", icon: <Zap className="h-3.5 w-3.5" /> },
        ]).map(t => (
          <button
            key={t.id}
            onClick={() => setRiskTab(t.id)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-all ${
              riskTab === t.id
                ? "bg-primary/10 text-primary border border-primary/20"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            }`}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
        {/* Secret AI Provider Toggle */}
        <button
          onClick={toggle}
          className="ml-auto flex items-center gap-1 px-2 py-1 rounded border border-border/40 bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer select-none"
        >
          <span className={`text-[9px] font-mono font-bold ${provider === "cloudflare" ? "text-primary" : "text-muted-foreground/40"}`}>C</span>
          <span className="text-[9px] text-muted-foreground/30">/</span>
          <span className={`text-[9px] font-mono font-bold ${provider === "mistral" ? "text-primary" : "text-muted-foreground/40"}`}>M</span>
        </button>
      </div>

      {riskTab === "clank" && <ClankEngine stocks={stocks} />}

      {riskTab === "analytics" && <>
      {/* VaR Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
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

      {/* AI Insights */}
      {aiData?.topRisks?.length > 0 && (
        <div className="rounded-xl border border-loss/20 bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-loss" /> AI-Identified Top Risks
          </h3>
          <div className="space-y-1.5">
            {aiData.topRisks.map((r: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs text-secondary-foreground">
                <span className="text-loss font-mono">⚠</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {aiData?.hedgingRecommendations?.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-3">AI Hedging Recommendations</h3>
          <div className="space-y-1.5">
            {aiData.hedgingRecommendations.map((r: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-xs text-secondary-foreground">
                <span className="text-primary font-mono">→</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Factor Exposure */}
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
                    {factorExposure.map((f: any, i: number) => (
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
              {factorExposure.map((f: any) => (
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

      {/* Stress Scenarios */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Stress Scenarios</h3>
        <div className="grid gap-3 md:grid-cols-3">
          {stressScenarios.map((s: any) => (
            <div key={s.scenario} className="rounded-lg bg-surface-2 p-4 border border-border/50">
              <p className="text-sm font-medium text-foreground mb-2">{s.scenario}</p>
              <p className="font-mono text-2xl font-bold text-loss">{typeof s.impact === "number" ? s.impact.toFixed(1) : s.impact}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">Recovery: {s.recovery}</p>
              {(s.pnlLoss || totalValue > 0) && (
                <p className="font-mono text-xs text-loss mt-1">
                  P&L: ${(s.pnlLoss || totalValue * Math.abs(s.impact) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} loss
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Correlation Matrix */}
      {corrMatrix.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Correlation by Regime</h3>
            <div className="flex gap-1">
              {(["bull", "bear"] as const).map(r => (
                <button key={r} onClick={() => setSelectedRegime(r)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedRegime === r ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                  }`}>
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
          {aiData?.correlationInsight && (
            <p className="mt-3 text-[11px] text-muted-foreground italic">{aiData.correlationInsight}</p>
          )}
        </div>
      )}

      {aiData?.regimeAnalysis && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-2">AI Regime Analysis</h3>
          <p className="text-xs text-secondary-foreground leading-relaxed">{aiData.regimeAnalysis}</p>
        </div>
      )}
      </>}
    </div>
  );
};

export default RiskDashboard;
