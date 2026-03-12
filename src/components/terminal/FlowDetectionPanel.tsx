import { useMemo, useState, useEffect } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import FlowRadarChart from "@/components/charts/FlowRadarChart";
import { Brain, Zap } from "lucide-react";
import { governedInvoke } from "@/lib/apiGovernor";
import { useInstitutionalFlows } from "@/hooks/useInstitutionalFlows";

interface FlowDetectionPanelProps {
  stocks: PortfolioStock[];
}

interface FlowSignal {
  name: string;
  category: string;
  intensity: number;
  direction: "BUY" | "SELL" | "NEUTRAL";
  impact: number;
  reasoning?: string;
}

const FlowDetectionPanel = ({ stocks }: FlowDetectionPanelProps) => {
  const [aiSignals, setAiSignals] = useState<FlowSignal[] | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const tickers = stocks.map(s => s.ticker);
  const { data: instFlows } = useInstitutionalFlows(tickers);

  const analyzed = stocks.filter(s => s.analysis);

  // Static fallback signals
  const staticSignals = useMemo<FlowSignal[]>(() => {
    const avgRisk = analyzed.length > 0
      ? analyzed.reduce((s, st) => s + (st.analysis!.riskLevel === "HIGH" ? 80 : st.analysis!.riskLevel === "MEDIUM" ? 50 : 20), 0) / analyzed.length
      : 30;
    return [
      { name: "ETF Rebalancing", category: "STRUCT", intensity: Math.min(95, 40 + analyzed.length * 8), direction: analyzed.length > 3 ? "BUY" : "NEUTRAL", impact: 65 },
      { name: "Vol Targeting", category: "FLOW", intensity: Math.min(90, avgRisk + 10), direction: avgRisk > 60 ? "SELL" : "NEUTRAL", impact: Math.min(85, avgRisk + 15) },
      { name: "Liquidity Stress", category: "RISK", intensity: Math.min(80, avgRisk * 0.8), direction: avgRisk > 70 ? "SELL" : "NEUTRAL", impact: avgRisk > 50 ? 70 : 35 },
      { name: "CTA Momentum", category: "FLOW", intensity: 55, direction: "BUY", impact: 50 },
      { name: "Gamma Exposure", category: "OPTIONS", intensity: 45, direction: "NEUTRAL", impact: 45 },
      { name: "Dark Pool Activity", category: "STRUCT", intensity: 40 + analyzed.length * 5, direction: analyzed.length > 2 ? "BUY" : "NEUTRAL", impact: 55 },
      { name: "Risk Parity Adj.", category: "FLOW", intensity: Math.min(75, avgRisk * 0.9), direction: avgRisk > 55 ? "SELL" : "NEUTRAL", impact: 60 },
      { name: "Pension Rebalance", category: "STRUCT", intensity: 35, direction: "BUY", impact: 40 },
    ];
  }, [analyzed]);

  // Fetch AI flow intelligence
  useEffect(() => {
    if (analyzed.length === 0) return;
    setAiLoading(true);
    const portfolio = analyzed.map(st => ({
      ticker: st.ticker, beta: st.analysis?.beta || 1,
      riskScore: st.analysis?.riskScore || 40, sector: st.analysis?.sector || "Unknown",
      weight: ((st.analysis?.currentPrice || st.buyPrice) * st.quantity) / 
        analyzed.reduce((s, x) => s + (x.analysis?.currentPrice || x.buyPrice) * x.quantity, 0) * 100,
    }));
    governedInvoke<FlowSignal[]>("flow-intelligence", { body: { portfolio } })
      .then(({ data }) => { if (data && Array.isArray(data)) setAiSignals(data); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [analyzed.map(s => s.ticker).join(",")]);

  const signals = aiSignals || staticSignals;

  const getIntensityColor = (v: number) => {
    if (v >= 70) return "bg-loss/60";
    if (v >= 45) return "bg-warning/50";
    return "bg-primary/30";
  };

  const getDirColor = (d: string) => {
    if (d === "BUY") return "text-gain";
    if (d === "SELL") return "text-loss";
    return "text-muted-foreground";
  };

  const [showRadar, setShowRadar] = useState(true);

  return (
    <div className="flex flex-col h-full font-mono text-[10px]">
      <div className="px-2 py-1 border-b border-border/30 flex items-center justify-between">
        <span className="text-[8px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          {aiSignals && <Brain className="h-2.5 w-2.5 text-gain" />}
          {aiLoading ? "AI Computing..." : aiSignals ? "AI Flow Signals" : "Flow Signals"}
        </span>
        <button onClick={() => setShowRadar(!showRadar)} className="text-[8px] text-primary hover:text-primary/80 transition-colors">
          {showRadar ? "List" : "Radar"}
        </button>
      </div>

      {showRadar && (
        <div className="border-b border-border/30">
          <FlowRadarChart signals={signals} />
          <div className="flex justify-center gap-3 pb-1.5 text-[7px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-primary" /> Intensity</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-loss" /> Impact</span>
          </div>
        </div>
      )}

      <div className="space-y-0.5 flex-1 overflow-auto">
        {signals.map(s => (
          <div key={s.name} className="flex items-center gap-1.5 px-2 py-1 hover:bg-surface-2 transition-colors border-b border-border/20" title={s.reasoning || ""}>
            <span className="text-muted-foreground text-[8px] w-10 flex-shrink-0">{s.category}</span>
            <span className="text-foreground flex-1 truncate">{s.name}</span>
            <span className={`font-semibold w-10 text-right ${getDirColor(s.direction)}`}>{s.direction}</span>
            <div className="w-14 flex items-center gap-1">
              <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getIntensityColor(s.intensity)}`}
                  style={{ width: `${s.intensity}%` }}
                />
              </div>
              <span className="text-muted-foreground tabular-nums w-6 text-right">{s.intensity}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FlowDetectionPanel;
