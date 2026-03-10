import { useMemo, useState, useEffect } from "react";
import { Radio, Brain, DollarSign, Newspaper, Shield } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { governedInvoke } from "@/lib/apiGovernor";

interface Props { stocks: PortfolioStock[]; }

type Layer = "management" | "operational" | "capital_flow" | "narrative" | "structural";

const layers: { id: Layer; label: string; icon: typeof Brain }[] = [
  { id: "management", label: "Management DNA", icon: Brain },
  { id: "capital_flow", label: "Capital Flow", icon: DollarSign },
  { id: "narrative", label: "Narrative & Reflexivity", icon: Newspaper },
  { id: "structural", label: "Structural Risk", icon: Shield },
];

const IntelligenceLayers = ({ stocks }: Props) => {
  const [activeLayer, setActiveLayer] = useState<Layer>("management");
  const analyzed = stocks.filter(s => s.analysis);
  const [aiData, setAiData] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch AI deep intelligence
  useEffect(() => {
    if (analyzed.length === 0) return;
    setAiLoading(true);
    const portfolio = analyzed.map(st => ({
      ticker: st.ticker, pe: st.analysis?.pe || 0, pbv: st.analysis?.pbv || 0,
      dividendYield: st.analysis?.dividendYield || 0, riskScore: st.analysis?.riskScore || 40,
      beta: st.analysis?.beta || 1, sector: st.analysis?.sector || "Unknown",
      marketCap: st.analysis?.marketCap || "Unknown", roe: st.analysis?.roe || 0,
    }));
    governedInvoke("deep-intelligence", { body: { portfolio } })
      .then(({ data }) => { if (data && !data.error) setAiData(data); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [analyzed.map(s => s.ticker).join(",")]);

  // Static fallback intelligence
  const staticIntelligence = useMemo(() => {
    if (analyzed.length === 0) return null;
    const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;

    const managementScores = analyzed.map(st => {
      const pe = st.analysis.pe || 20;
      const divYield = st.analysis.dividendYield || 1;
      const capitalAllocation = Math.min(100, Math.max(0, 100 - pe * 1.5 + divYield * 15));
      const decisionReliability = Math.min(100, Math.max(0, 100 - (st.analysis.riskScore || 40) * 0.8));
      return {
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        capitalAllocation: Math.round(capitalAllocation), decisionReliability: Math.round(decisionReliability),
        ceoScore: Math.round((capitalAllocation + decisionReliability) / 2),
        pe, pbv: st.analysis.pbv || 2, divYield,
      };
    });

    const capitalFlow = analyzed.map(st => {
      const beta = st.analysis.beta || 1;
      const risk = st.analysis.riskScore || 40;
      return {
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        flowPressure: Math.min(100, Math.round(beta * 40 + (100 - risk) * 0.3)),
        gammaExposure: beta > 1.2 ? "Positive" : beta < 0.8 ? "Negative" : "Neutral",
        etfRebalanceRisk: beta > 1.1 ? "High" : "Low",
        indexInclusionProb: Math.round(Math.max(0, (st.analysis.marketCap || 0) / 1e12 * 30)),
      };
    });

    const narrative = analyzed.map(st => {
      const risk = st.analysis.riskScore || 40;
      const crowdedScore = Math.round(risk * 0.6 + (st.analysis.beta || 1) * 20);
      return {
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        sentimentVelocity: Math.min(100, Math.round(50 + (risk - 40) * 0.5)),
        crowdedTradeScore: Math.min(100, crowdedScore),
        reflexivityRisk: crowdedScore > 60 ? "High" : crowdedScore > 35 ? "Medium" : "Low",
        analystConsensus: risk < 40 ? "Buy" : risk < 60 ? "Hold" : "Sell",
      };
    });

    const structural = analyzed.map(st => {
      const risk = st.analysis.riskScore || 40;
      const rb = st.analysis.riskBreakdown || {};
      return {
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        geopolitical: Math.round(rb.macroRisk || risk * 0.3),
        regulatory: Math.round(rb.regulatoryRisk || risk * 0.2),
        techDisruption: Math.round(risk * 0.25),
        supplyChain: Math.round(rb.sectorRisk || risk * 0.15),
        hiddenDrawdownRisk: Math.round(risk * 0.8),
      };
    });

    const radarData = [
      { factor: "Mgmt DNA", value: Math.round(managementScores.reduce((s, m) => s + m.ceoScore, 0) / managementScores.length) },
      { factor: "Flow Pressure", value: Math.round(capitalFlow.reduce((s, c) => s + c.flowPressure, 0) / capitalFlow.length) },
      { factor: "Reflexivity", value: Math.round(narrative.reduce((s, n) => s + n.crowdedTradeScore, 0) / narrative.length) },
      { factor: "Structural", value: Math.round(structural.reduce((s, st) => s + st.hiddenDrawdownRisk, 0) / structural.length) },
      { factor: "Capital Eff.", value: Math.round(100 - avgRisk * 0.6) },
    ];

    return { managementScores, capitalFlow, narrative, structural, radarData };
  }, [analyzed]);

  const intelligence = aiData || staticIntelligence;
  if (!intelligence) return null;

  return (
    <div className="space-y-5">
      {/* AI indicator */}
      {aiLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
          <Brain className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs text-primary">Deep Intelligence AI computing...</span>
        </div>
      )}
      {aiData && !aiLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-gain/20 bg-gain/5 px-3 py-1.5">
          <Brain className="h-3.5 w-3.5 text-gain" />
          <span className="text-[10px] text-gain">AI-Driven Deep Intelligence</span>
        </div>
      )}

      {/* Layer Selector */}
      <div className="flex gap-1.5">
        {layers.map(l => {
          const Icon = l.icon;
          return (
            <button key={l.id} onClick={() => setActiveLayer(l.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                activeLayer === l.id ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"
              }`}>
              <Icon className="h-3.5 w-3.5" />
              {l.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-border bg-card p-5">
          {activeLayer === "management" && (
            <>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">CEO Decision Reliability Score</h3>
              <div className="space-y-2">
                {(intelligence.managementScores || []).map((m: any) => (
                  <div key={m.ticker} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                    <div>
                      <span className="font-mono text-sm font-semibold text-foreground">{m.ticker}</span>
                      {m.insight && <p className="text-[9px] text-muted-foreground mt-0.5">{m.insight}</p>}
                      <div className="flex gap-4 mt-1 text-[10px] text-muted-foreground">
                        <span>PE: {(m.pe || 0).toFixed?.(1) || m.pe}</span>
                        <span>P/BV: {(m.pbv || 0).toFixed?.(1) || m.pbv}</span>
                        <span>Div: {(m.divYield || m.dividendYield || 0).toFixed?.(1) || 0}%</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-lg font-bold ${m.ceoScore >= 60 ? "text-gain" : m.ceoScore >= 40 ? "text-warning" : "text-loss"}`}>
                        {m.ceoScore}
                      </p>
                      <p className="text-[9px] text-muted-foreground">Cap: {m.capitalAllocation} | Rel: {m.decisionReliability}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeLayer === "capital_flow" && (
            <>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Flow Pressure Score</h3>
              <div className="space-y-2">
                {(intelligence.capitalFlow || []).map((c: any) => (
                  <div key={c.ticker} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                    <div>
                      <span className="font-mono text-sm font-semibold text-foreground">{c.ticker}</span>
                      <div className="flex gap-3 mt-1">
                        <span className={`text-[10px] rounded px-1.5 py-0.5 ${c.gammaExposure === "Positive" ? "bg-gain/10 text-gain" : c.gammaExposure === "Negative" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"}`}>
                          γ {c.gammaExposure}
                        </span>
                        <span className={`text-[10px] rounded px-1.5 py-0.5 ${c.etfRebalanceRisk === "High" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"}`}>
                          ETF {c.etfRebalanceRisk}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono text-lg font-bold ${c.flowPressure >= 60 ? "text-gain" : "text-foreground"}`}>{c.flowPressure}</p>
                      <p className="text-[9px] text-muted-foreground">Index: {c.indexInclusionProb}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeLayer === "narrative" && (
            <>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Reflexivity Risk Score</h3>
              <div className="space-y-2">
                {(intelligence.narrative || []).map((n: any) => (
                  <div key={n.ticker} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                    <div>
                      <span className="font-mono text-sm font-semibold text-foreground">{n.ticker}</span>
                      <div className="flex gap-3 mt-1">
                        <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                          n.reflexivityRisk === "High" ? "bg-loss/10 text-loss" : n.reflexivityRisk === "Medium" ? "bg-warning/10 text-warning" : "bg-gain/10 text-gain"
                        }`}>Reflexivity: {n.reflexivityRisk}</span>
                        <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                          n.analystConsensus === "Buy" ? "bg-gain/10 text-gain" : n.analystConsensus === "Sell" ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"
                        }`}>Consensus: {n.analystConsensus}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-lg font-bold text-foreground">{n.crowdedTradeScore}</p>
                      <p className="text-[9px] text-muted-foreground">Sentiment vel: {n.sentimentVelocity}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activeLayer === "structural" && (
            <>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Hidden Drawdown Risk</h3>
              <div className="space-y-2">
                {(intelligence.structural || []).map((s: any) => (
                  <div key={s.ticker} className="rounded-lg bg-surface-2 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{s.ticker}</span>
                      <span className={`font-mono text-lg font-bold ${s.hiddenDrawdownRisk >= 50 ? "text-loss" : s.hiddenDrawdownRisk >= 30 ? "text-warning" : "text-gain"}`}>
                        {s.hiddenDrawdownRisk}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: "Geopolitical", value: s.geopolitical },
                        { label: "Regulatory", value: s.regulatory },
                        { label: "Tech Disruption", value: s.techDisruption },
                        { label: "Supply Chain", value: s.supplyChain },
                      ].map(f => (
                        <div key={f.label}>
                          <p className="text-[8px] text-muted-foreground uppercase">{f.label}</p>
                          <div className="h-1.5 rounded-full bg-surface-3 mt-0.5">
                            <div className={`h-full rounded-full ${f.value >= 50 ? "bg-loss" : f.value >= 30 ? "bg-warning" : "bg-gain"}`} style={{ width: `${f.value}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Radar */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-2">Intelligence Summary</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={intelligence.radarData || []}>
                <PolarGrid stroke="hsl(0,0%,14%)" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: "hsl(0,0%,45%)", fontSize: 9 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(0,0%,30%)", fontSize: 8 }} />
                <Radar dataKey="value" stroke="hsl(0,0%,100%)" fill="hsl(0,0%,100%)" fillOpacity={0.1} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntelligenceLayers;
