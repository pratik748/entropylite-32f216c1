import { useMemo } from "react";
import { Layers } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const PortfolioCommandCenter = ({ stocks }: Props) => {
  const { totalValue, holdings, sym, fmt } = useNormalizedPortfolio(stocks);

  const data = useMemo(() => {
    if (holdings.length === 0) return null;

    const assets = holdings.map(h => {
      const weight = (h.value / totalValue) * 100;
      const risk = h.risk;
      const beta = h.beta;

      // Flow pressure (derived from beta and market cap)
      const flowPressure = Math.min(100, Math.round(beta * 35 + (100 - risk) * 0.4));
      // Reflexivity risk
      const reflexivity = Math.min(100, Math.round(risk * 0.6 + beta * 15));
      // Structural risk
      const structural = Math.round((st.analysis.riskBreakdown?.macroRisk || risk * 0.3) + (st.analysis.riskBreakdown?.regulatoryRisk || risk * 0.2));

      // Worst case loss (2.5 sigma)
      const dailyVol = (risk / 100) * 0.02;
      const worstCase = -(currentValue * dailyVol * 2.5 * Math.sqrt(21)); // 1 month horizon

      return {
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        currentValue,
        weight,
        pnl,
        pnlPct,
        risk,
        beta,
        expectedReturn: pnlPct, // annualize later
        worstCase,
        flowPressure,
        reflexivity,
        structural,
        suggestion: st.analysis.suggestion || "Hold",
      };
    }).sort((a, b) => b.weight - a.weight);

    return { assets, totalValue };
  }, [analyzed]);

  if (!data) return null;

  const totalPnL = data.assets.reduce((s, a) => s + a.pnl, 0);

  // Color scale for heatmap cells
  const heatColor = (value: number, max: number, invert = false) => {
    const pct = Math.min(Math.abs(value) / max, 1);
    if (invert) {
      return value >= 50 ? `rgba(220, 60, 60, ${pct * 0.4})` : `rgba(80, 200, 120, ${pct * 0.3})`;
    }
    return value >= 0 ? `rgba(80, 200, 120, ${pct * 0.4})` : `rgba(220, 60, 60, ${pct * 0.4})`;
  };

  return (
    <div className="space-y-5">
      {/* Portfolio Heatmap */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-5">
          <Layers className="h-5 w-5 text-foreground" />
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Portfolio Heatmap — All Dimensions</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Asset", "Weight", "Value", "P&L", "Return", "Risk", "β", "Worst Case", "Flow", "Reflexivity", "Structural", "Signal"].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.assets.map(a => (
                <tr key={a.ticker} className="border-b border-border/30 hover:bg-surface-2 transition-colors">
                  <td className="px-2 py-2.5 font-mono font-bold text-foreground">{a.ticker}</td>
                  <td className="px-2 py-2.5 font-mono text-foreground">{a.weight.toFixed(1)}%</td>
                  <td className="px-2 py-2.5 font-mono text-muted-foreground">₹{(a.currentValue / 100000).toFixed(1)}L</td>
                  <td className="px-2 py-2.5 font-mono" style={{ backgroundColor: heatColor(a.pnl, Math.abs(totalPnL)) }}>
                    <span className={a.pnl >= 0 ? "text-gain" : "text-loss"}>
                      {a.pnl >= 0 ? "+" : ""}₹{(a.pnl / 1000).toFixed(0)}k
                    </span>
                  </td>
                  <td className="px-2 py-2.5 font-mono" style={{ backgroundColor: heatColor(a.pnlPct, 50) }}>
                    <span className={a.pnlPct >= 0 ? "text-gain" : "text-loss"}>
                      {a.pnlPct >= 0 ? "+" : ""}{a.pnlPct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-2 py-2.5 font-mono" style={{ backgroundColor: heatColor(a.risk, 100, true) }}>
                    <span className={a.risk >= 60 ? "text-loss" : a.risk >= 35 ? "text-warning" : "text-gain"}>{a.risk}</span>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-foreground">{a.beta.toFixed(2)}</td>
                  <td className="px-2 py-2.5 font-mono text-loss">₹{(a.worstCase / 1000).toFixed(0)}k</td>
                  <td className="px-2 py-2.5 font-mono" style={{ backgroundColor: heatColor(a.flowPressure - 50, 50) }}>
                    {a.flowPressure}
                  </td>
                  <td className="px-2 py-2.5 font-mono" style={{ backgroundColor: heatColor(a.reflexivity, 100, true) }}>
                    {a.reflexivity}
                  </td>
                  <td className="px-2 py-2.5 font-mono" style={{ backgroundColor: heatColor(a.structural, 80, true) }}>
                    {a.structural}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      a.suggestion === "Add" ? "bg-gain/15 text-gain" : a.suggestion === "Exit" ? "bg-loss/15 text-loss" : "bg-warning/15 text-warning"
                    }`}>{a.suggestion}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Constellation - visual grid */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Risk Constellation</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {data.assets.map(a => {
            const size = Math.max(80, Math.min(160, a.weight * 8));
            return (
              <div key={a.ticker} className="relative rounded-xl border border-border/50 bg-surface-2 p-4 flex flex-col items-center justify-center transition-all hover:border-foreground/30"
                style={{ minHeight: size }}>
                <div className={`absolute top-2 right-2 h-2 w-2 rounded-full ${a.risk >= 60 ? "bg-loss" : a.risk >= 35 ? "bg-warning" : "bg-gain"}`} />
                <span className="font-mono text-sm font-bold text-foreground">{a.ticker}</span>
                <span className={`font-mono text-lg font-bold mt-1 ${a.pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                  {a.pnlPct >= 0 ? "+" : ""}{a.pnlPct.toFixed(1)}%
                </span>
                <div className="flex gap-2 mt-2 text-[9px] text-muted-foreground">
                  <span>β {a.beta.toFixed(1)}</span>
                  <span>R {a.risk}</span>
                  <span>{a.weight.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Capital Timeline */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Liquidity Radar</h3>
        <div className="space-y-2">
          {data.assets.map(a => {
            const estimatedADV = (a.currentValue / a.weight) * 100 * 0.003;
            const daysToLiquidate = a.currentValue / (estimatedADV * 0.1);
            const liquidityScore = Math.min(100, Math.round(100 / (1 + daysToLiquidate * 0.3)));
            return (
              <div key={a.ticker} className="flex items-center gap-3">
                <span className="font-mono text-xs font-semibold text-foreground w-16">{a.ticker}</span>
                <div className="flex-1 h-3 rounded-full bg-surface-3 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    liquidityScore >= 70 ? "bg-gain" : liquidityScore >= 40 ? "bg-warning" : "bg-loss"
                  }`} style={{ width: `${liquidityScore}%` }} />
                </div>
                <span className="font-mono text-xs text-muted-foreground w-20 text-right">
                  {daysToLiquidate.toFixed(1)}d to exit
                </span>
                <span className={`font-mono text-xs w-8 text-right ${liquidityScore >= 70 ? "text-gain" : liquidityScore >= 40 ? "text-warning" : "text-loss"}`}>
                  {liquidityScore}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PortfolioCommandCenter;
