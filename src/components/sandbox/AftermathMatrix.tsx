import { useMemo } from "react";
import { Crosshair } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const AftermathMatrix = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const results = useMemo(() => {
    if (analyzed.length === 0) return null;

    const totalValue = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);

    // For each stock, simulate price impact, liquidity change, and narrative shift
    const stockImpacts = analyzed.map(st => {
      const positionValue = (st.analysis.currentPrice || st.buyPrice) * st.quantity;
      const weight = positionValue / totalValue;
      const marketCap = st.analysis.marketCap || 100000000000; // default 100B INR
      const positionPctOfMCap = (positionValue / marketCap) * 100;

      // Price impact model: sqrt(position % of market cap) * constant
      const priceImpactBps = Math.sqrt(positionPctOfMCap) * 15; // basis points
      const priceImpactPct = priceImpactBps / 100;

      // Liquidity consumption: how much of ADV this represents
      const estimatedADV = marketCap * 0.003; // ~0.3% of market cap trades daily
      const daysToUnwind = positionValue / (estimatedADV * 0.1); // 10% participation rate

      // Narrative shift: if position is large enough to appear in bulk deals
      const narrativeRisk = positionPctOfMCap > 0.1 ? "High" : positionPctOfMCap > 0.01 ? "Medium" : "Low";

      // ETF rebalance effect
      const etfExposure = weight > 0.15 ? "Significant" : weight > 0.08 ? "Moderate" : "Minimal";

      // Competitor reaction probability
      const competitorReaction = priceImpactBps > 5 ? 0.7 : priceImpactBps > 2 ? 0.4 : 0.1;

      // Optimal trade size after aftermath
      const optimalSizePct = Math.min(100, 100 / (1 + priceImpactPct * 10));

      return {
        ticker: st.ticker.replace(".NS", "").replace(".BO", ""),
        positionValue,
        weight: weight * 100,
        priceImpactBps: +priceImpactBps.toFixed(1),
        priceImpactPct: +priceImpactPct.toFixed(3),
        daysToUnwind: +daysToUnwind.toFixed(1),
        narrativeRisk,
        etfExposure,
        competitorReaction: +(competitorReaction * 100).toFixed(0),
        optimalSizePct: +optimalSizePct.toFixed(0),
        slippageCost: +(positionValue * priceImpactPct / 100).toFixed(0),
      };
    });

    // Total aftermath cost
    const totalSlippage = stockImpacts.reduce((s, i) => s + i.slippageCost, 0);
    const avgImpact = stockImpacts.reduce((s, i) => s + i.priceImpactBps, 0) / stockImpacts.length;

    return { stockImpacts, totalSlippage, avgImpact, totalValue };
  }, [analyzed]);

  if (!results) return null;

  const chartData = results.stockImpacts.map(s => ({
    name: s.ticker,
    impact: s.priceImpactBps,
    fill: s.priceImpactBps > 5 ? "hsl(0,62%,50%)" : s.priceImpactBps > 2 ? "hsl(45,90%,50%)" : "hsl(145,70%,45%)",
  }));

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Slippage Cost</p>
          <p className="mt-1 font-mono text-xl font-bold text-loss">₹{results.totalSlippage.toLocaleString("en-IN")}</p>
          <p className="text-[9px] text-muted-foreground">{((results.totalSlippage / results.totalValue) * 100).toFixed(3)}% of portfolio</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Avg Price Impact</p>
          <p className="mt-1 font-mono text-xl font-bold text-foreground">{results.avgImpact.toFixed(1)} bps</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Positions Analyzed</p>
          <p className="mt-1 font-mono text-xl font-bold text-foreground">{results.stockImpacts.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Self-Defeat Risk</p>
          <p className={`mt-1 font-mono text-xl font-bold ${results.avgImpact > 5 ? "text-loss" : results.avgImpact > 2 ? "text-warning" : "text-gain"}`}>
            {results.avgImpact > 5 ? "HIGH" : results.avgImpact > 2 ? "MEDIUM" : "LOW"}
          </p>
        </div>
      </div>

      {/* Impact Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">
          <Crosshair className="inline h-4 w-4 mr-2" />
          Price Impact by Position (bps)
        </h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="name" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <ReferenceLine y={5} stroke="hsl(0,62%,50%)" strokeDasharray="4 4" label={{ value: "High Impact", fill: "hsl(0,62%,50%)", fontSize: 9 }} />
              <Bar dataKey="impact" radius={[4, 4, 0, 0]} name="Impact (bps)">
                {chartData.map((e, i) => <Cell key={i} fill={e.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Aftermath Detail — Pre-Trade Simulation</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Asset", "Weight", "Impact (bps)", "Slippage ₹", "Unwind Days", "Narrative", "Competitor", "Optimal Size"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.stockImpacts.map(s => (
                <tr key={s.ticker} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-2 font-mono font-semibold text-foreground">{s.ticker}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{s.weight.toFixed(1)}%</td>
                  <td className={`px-3 py-2 font-mono font-bold ${s.priceImpactBps > 5 ? "text-loss" : s.priceImpactBps > 2 ? "text-warning" : "text-gain"}`}>{s.priceImpactBps}</td>
                  <td className="px-3 py-2 font-mono text-loss">₹{s.slippageCost.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{s.daysToUnwind}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      s.narrativeRisk === "High" ? "bg-loss/10 text-loss" : s.narrativeRisk === "Medium" ? "bg-warning/10 text-warning" : "bg-gain/10 text-gain"
                    }`}>{s.narrativeRisk}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{s.competitorReaction}%</td>
                  <td className="px-3 py-2 font-mono text-foreground">{s.optimalSizePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Aftermath Matrix eliminates self-defeating predictions by simulating your own market impact before execution.
          Optimal Size shows the recommended position as a % of intended size to minimize reflexivity.
        </p>
      </div>
    </div>
  );
};

export default AftermathMatrix;
