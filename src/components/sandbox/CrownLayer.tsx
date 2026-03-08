import { useMemo } from "react";
import { TrendingUp, Zap } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

interface Opportunity {
  type: string;
  signal: string;
  asset: string;
  action: string;
  expectedEdge: string;
  confidence: number;
  urgency: "High" | "Medium" | "Low";
  riskReward: string;
}

const CrownLayer = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const opportunities = useMemo((): Opportunity[] => {
    if (analyzed.length === 0) return [];

    const opps: Opportunity[] = [];

    analyzed.forEach(st => {
      const risk = st.analysis.riskScore || 40;
      const beta = st.analysis.beta || 1;
      const pnlPct = ((st.analysis.currentPrice - st.buyPrice) / st.buyPrice) * 100;
      const ticker = st.ticker.replace(".NS", "").replace(".BO", "");

      // Crowded trade detection → short squeeze capture
      if (risk > 55 && beta > 1.2) {
        opps.push({
          type: "Crowded Trade",
          signal: `High risk (${risk}) + high beta (${beta.toFixed(1)}) = crowded positioning`,
          asset: ticker,
          action: "Monitor for short squeeze — prepare long call options",
          expectedEdge: `+${(beta * 3).toFixed(0)}% if squeeze triggers`,
          confidence: Math.min(85, Math.round(60 + risk * 0.3)),
          urgency: risk > 70 ? "High" : "Medium",
          riskReward: `1:${(beta * 2.5).toFixed(1)}`,
        });
      }

      // Forced seller detection → liquidity harvesting
      if (pnlPct < -15) {
        opps.push({
          type: "Forced Seller",
          signal: `${ticker} down ${pnlPct.toFixed(1)}% — institutional stop-loss triggers likely`,
          asset: ticker,
          action: "Place limit buy orders 2-3% below current for liquidity harvest",
          expectedEdge: `+5-8% mean reversion over 30 days`,
          confidence: Math.min(75, Math.round(50 + Math.abs(pnlPct) * 0.5)),
          urgency: pnlPct < -25 ? "High" : "Medium",
          riskReward: "1:2.5",
        });
      }

      // Volatility spike → options positioning
      if (risk > 50) {
        const impliedVol = risk * 0.4;
        const premiumEst = (st.analysis.currentPrice * st.quantity * 0.02) / 1000;
        opps.push({
          type: "Vol Spike",
          signal: `Implied vol elevated (~${impliedVol.toFixed(0)}%) on ${ticker}`,
          asset: ticker,
          action: "Sell iron condor or put credit spread for premium collection",
          expectedEdge: `~${premiumEst.toFixed(0)}k premium`,
          confidence: Math.round(55 + (risk - 50) * 0.5),
          urgency: "Medium",
          riskReward: "1:1.5",
        });
      }

      // Positive momentum → trend capture
      if (pnlPct > 10 && risk < 45) {
        opps.push({
          type: "Momentum",
          signal: `${ticker} up ${pnlPct.toFixed(1)}% with low risk (${risk}) — trend intact`,
          asset: ticker,
          action: "Add on dips, trail stop at -8%",
          expectedEdge: `+${(pnlPct * 0.4).toFixed(0)}% continuation probability`,
          confidence: Math.min(80, Math.round(60 + pnlPct * 0.3)),
          urgency: "Low",
          riskReward: `1:${(pnlPct / 8).toFixed(1)}`,
        });
      }
    });

    return opps.sort((a, b) => b.confidence - a.confidence);
  }, [analyzed]);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card py-16 text-center">
        <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
        <p className="text-sm text-muted-foreground">No actionable opportunities detected. Analyze more stocks to find edges.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="h-5 w-5 text-foreground" />
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Risk → Profit Conversion Engine</h3>
          <span className="rounded bg-gain/20 px-2 py-0.5 font-mono text-[10px] text-gain">{opportunities.length} signals</span>
        </div>

        <div className="space-y-3">
          {opportunities.map((opp, i) => (
            <div key={i} className={`rounded-lg border p-4 transition-all ${
              opp.urgency === "High" ? "border-loss/30 bg-loss/5" : "border-border/50 bg-surface-2"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                    opp.type === "Crowded Trade" ? "bg-loss/15 text-loss" :
                    opp.type === "Forced Seller" ? "bg-warning/15 text-warning" :
                    opp.type === "Vol Spike" ? "bg-info/15 text-info" :
                    "bg-gain/15 text-gain"
                  }`}>{opp.type}</span>
                  <span className="font-mono text-sm font-bold text-foreground">{opp.asset}</span>
                  <span className={`text-[10px] font-mono ${
                    opp.urgency === "High" ? "text-loss" : opp.urgency === "Medium" ? "text-warning" : "text-muted-foreground"
                  }`}>⚡ {opp.urgency}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">R:R {opp.riskReward}</span>
                  <span className={`font-mono text-sm font-bold ${opp.confidence >= 70 ? "text-gain" : "text-foreground"}`}>{opp.confidence}%</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">{opp.signal}</p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                <p className="text-xs text-foreground font-medium">→ {opp.action}</p>
                <span className="font-mono text-xs text-gain">{opp.expectedEdge}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CrownLayer;
