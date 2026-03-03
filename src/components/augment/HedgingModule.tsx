import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const HedgingModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { hedges, capitalMetrics, totalValue, avgBeta } = useMemo(() => {
    if (analyzed.length === 0) return { hedges: [], capitalMetrics: [], totalValue: 0, avgBeta: 1 };

    const total = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);
    const beta = analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length;
    const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;
    const currency = analyzed[0]?.analysis?.currency || "INR";
    const sym = currency === "INR" ? "₹" : "$";
    const divisor = currency === "INR" ? 100000 : 1000;
    const unit = currency === "INR" ? "L" : "K";

    const hedgeList: { instrument: string; type: string; notional: string; delta: number; purpose: string; urgency: string }[] = [];

    // Index hedge based on dominant market
    const hasIndian = analyzed.some(s => s.ticker.includes(".NS") || s.ticker.includes(".BO"));
    const hasUS = analyzed.some(s => !s.ticker.includes(".NS") && !s.ticker.includes(".BO") && !s.ticker.includes("-USD"));
    const hasCrypto = analyzed.some(s => s.ticker.includes("-USD"));

    if (hasIndian) {
      hedgeList.push({
        instrument: `NIFTY PUT OTM 5%`,
        type: "Index Option",
        notional: `${sym}${(total * 0.07 / divisor).toFixed(1)} ${unit}`,
        delta: -0.35,
        purpose: "Tail risk hedge — Indian equity",
        urgency: avgRisk > 55 ? "High" : "Medium",
      });
    }

    if (hasUS) {
      hedgeList.push({
        instrument: "SPY PUT OTM 5%",
        type: "Index Option",
        notional: `$${(total * 0.05 / 1000).toFixed(1)}K`,
        delta: -0.30,
        purpose: "US equity tail protection",
        urgency: avgRisk > 55 ? "High" : "Medium",
      });
    }

    if (hasCrypto) {
      hedgeList.push({
        instrument: "BTC Perpetual Short",
        type: "Crypto Derivative",
        notional: `$${(total * 0.1 / 1000).toFixed(1)}K`,
        delta: -0.5,
        purpose: "Crypto vol hedge",
        urgency: "High",
      });
    }

    if (beta > 1.1) {
      hedgeList.push({
        instrument: hasIndian ? "NIFTY Futures Short" : "ES Futures Short",
        type: "Index Futures",
        notional: `${sym}${(total * (beta - 1) * 0.5 / divisor).toFixed(1)} ${unit}`,
        delta: -1.0,
        purpose: `Beta reduction (${beta.toFixed(2)} → 1.0)`,
        urgency: beta > 1.3 ? "High" : "Medium",
      });
    }

    const highRisk = analyzed.filter(s => (s.analysis.riskScore || 0) >= 55);
    highRisk.slice(0, 3).forEach(s => {
      const val = (s.analysis.currentPrice || s.buyPrice) * s.quantity;
      hedgeList.push({
        instrument: `${s.ticker.replace(".NS", "").replace(".BO", "")} PUT`,
        type: "Stock Option",
        notional: `${sym}${(val * 0.05 / divisor).toFixed(1)} ${unit}`,
        delta: -0.25,
        purpose: `Single-name protection (risk: ${s.analysis.riskScore})`,
        urgency: (s.analysis.riskScore || 0) >= 70 ? "High" : "Medium",
      });
    });

    // FX hedge if mixed currencies
    const currencies = new Set(analyzed.map(s => s.analysis?.currency || "INR"));
    if (currencies.size > 1) {
      hedgeList.push({
        instrument: "USDINR Forward",
        type: "FX Derivative",
        notional: `${sym}${(total * 0.15 / divisor).toFixed(1)} ${unit}`,
        delta: -0.5,
        purpose: "Currency mismatch hedge",
        urgency: "Medium",
      });
    }

    const hedgeCostPct = beta * 0.6 + (avgRisk / 100) * 0.4;
    const metrics = [
      { metric: "Gross Exposure", value: `${sym}${(total / divisor).toFixed(1)} ${unit}` },
      { metric: "Portfolio Beta", value: beta.toFixed(3) },
      { metric: "Suggested Hedge Ratio", value: `${Math.round(Math.min(50, (beta > 1 ? (beta - 1) * 40 : 0) + avgRisk * 0.2))}%` },
      { metric: "Est. Hedging Cost (ann.)", value: `${hedgeCostPct.toFixed(2)}%` },
      { metric: "Net Beta (post-hedge)", value: `${Math.max(0.2, beta - (beta - 1) * 0.5).toFixed(2)}` },
    ];

    return { hedges: hedgeList, capitalMetrics: metrics, totalValue: total, avgBeta: beta };
  }, [analyzed]);

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze assets to see dynamic hedging strategies.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Portfolio Value</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{(totalValue / (analyzed[0]?.analysis?.currency === "INR" ? 100000 : 1000)).toFixed(1)} {analyzed[0]?.analysis?.currency === "INR" ? "L" : "K"}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Portfolio Beta</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${avgBeta > 1.2 ? "text-warning" : "text-foreground"}`}>{avgBeta.toFixed(3)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Active Hedges</p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">{hedges.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Recommended Hedges</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Instrument", "Type", "Notional", "Delta", "Purpose", "Urgency"].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hedges.map(h => (
                <tr key={h.instrument} className="border-b border-border/50">
                  <td className="px-2 py-2 font-mono text-xs text-foreground">{h.instrument}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{h.type}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{h.notional}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{h.delta}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{h.purpose}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      h.urgency === "High" ? "bg-loss/15 text-loss" : "bg-warning/15 text-warning"
                    }`}>{h.urgency}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Capital Efficiency</h3>
        <div className="space-y-2">
          {capitalMetrics.map(c => (
            <div key={c.metric} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <span className="text-sm text-muted-foreground">{c.metric}</span>
              <span className="font-mono text-sm font-bold text-foreground">{c.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HedgingModule;
