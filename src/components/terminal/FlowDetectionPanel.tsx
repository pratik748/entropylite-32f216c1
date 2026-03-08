import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface FlowDetectionPanelProps {
  stocks: PortfolioStock[];
}

interface FlowSignal {
  name: string;
  category: string;
  intensity: number; // 0–100
  direction: "BUY" | "SELL" | "NEUTRAL";
  impact: number; // 0–100
}

const FlowDetectionPanel = ({ stocks }: FlowDetectionPanelProps) => {
  const signals = useMemo<FlowSignal[]>(() => {
    const analyzed = stocks.filter(s => s.analysis);
    const avgRisk = analyzed.length > 0
      ? analyzed.reduce((s, st) => s + (st.analysis!.riskLevel === "HIGH" ? 80 : st.analysis!.riskLevel === "MEDIUM" ? 50 : 20), 0) / analyzed.length
      : 30;

    return [
      { name: "ETF Rebalancing", category: "STRUCT", intensity: Math.min(95, 40 + analyzed.length * 8), direction: analyzed.length > 3 ? "BUY" : "NEUTRAL", impact: 65 },
      { name: "Vol Targeting", category: "FLOW", intensity: Math.min(90, avgRisk + 10), direction: avgRisk > 60 ? "SELL" : "NEUTRAL", impact: Math.min(85, avgRisk + 15) },
      { name: "Liquidity Stress", category: "RISK", intensity: Math.min(80, avgRisk * 0.8), direction: avgRisk > 70 ? "SELL" : "NEUTRAL", impact: avgRisk > 50 ? 70 : 35 },
      { name: "CTA Momentum", category: "FLOW", intensity: 55 + Math.floor(Math.random() * 20), direction: "BUY", impact: 50 },
      { name: "Gamma Exposure", category: "OPTIONS", intensity: 35 + Math.floor(Math.random() * 30), direction: "NEUTRAL", impact: 45 },
      { name: "Dark Pool Activity", category: "STRUCT", intensity: 40 + Math.floor(analyzed.length * 5), direction: analyzed.length > 2 ? "BUY" : "NEUTRAL", impact: 55 },
      { name: "Risk Parity Adj.", category: "FLOW", intensity: Math.min(75, avgRisk * 0.9), direction: avgRisk > 55 ? "SELL" : "NEUTRAL", impact: 60 },
      { name: "Pension Rebalance", category: "STRUCT", intensity: 30 + Math.floor(Math.random() * 15), direction: "BUY", impact: 40 },
    ];
  }, [stocks]);

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

  return (
    <div className="flex flex-col h-full font-mono text-[10px]">
      <div className="space-y-0.5 flex-1 overflow-auto">
        {signals.map(s => (
          <div key={s.name} className="flex items-center gap-1.5 px-2 py-1 hover:bg-surface-2 transition-colors border-b border-border/20">
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
