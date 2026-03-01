import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const HedgingModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { hedges, capitalMetrics, totalValue, avgBeta } = useMemo(() => {
    if (analyzed.length === 0) return { hedges: [], capitalMetrics: [], totalValue: 0, avgBeta: 1 };

    const total = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);
    const beta = analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length;

    // Generate hedging suggestions based on portfolio
    const hedgeList = [
      { instrument: `NIFTY PUT ${Math.round(total * 0.9 / 50).toFixed(0)}00`, type: "Index Option", notional: `₹${(total * 0.07 / 100000).toFixed(1)} L`, delta: -0.35, purpose: "Tail risk" },
    ];

    if (beta > 1.1) {
      hedgeList.push({ instrument: "NIFTY Futures Short", type: "Index Futures", notional: `₹${(total * 0.1 / 100000).toFixed(1)} L`, delta: -1.0, purpose: "Beta reduction" });
    }

    const highRisk = analyzed.filter(s => (s.analysis.riskScore || 0) >= 60);
    if (highRisk.length > 0) {
      hedgeList.push({ instrument: `${highRisk[0].ticker.replace(".NS", "")} PUT`, type: "Stock Option", notional: `₹${((highRisk[0].analysis.currentPrice || highRisk[0].buyPrice) * highRisk[0].quantity * 0.05 / 100000).toFixed(1)} L`, delta: -0.25, purpose: "Stock protection" });
    }

    const metrics = [
      { metric: "Gross Exposure", value: `₹${(total / 100000).toFixed(1)} L` },
      { metric: "Portfolio Beta", value: beta.toFixed(2) },
      { metric: "Suggested Hedge Ratio", value: `${(beta > 1 ? (beta - 1) * 50 + 10 : 10).toFixed(0)}%` },
      { metric: "Est. Hedging Cost (ann.)", value: `${(beta * 0.8).toFixed(1)}%` },
    ];

    return { hedges: hedgeList, capitalMetrics: metrics, totalValue: total, avgBeta: beta };
  }, [analyzed]);

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see hedging strategy suggestions.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio Value</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">₹{(totalValue / 100000).toFixed(1)} L</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio Beta</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${avgBeta > 1.2 ? "text-warning" : "text-foreground"}`}>{avgBeta.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Suggested Hedges</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{hedges.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Recommended Hedges</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Instrument", "Type", "Notional", "Delta", "Purpose"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
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
