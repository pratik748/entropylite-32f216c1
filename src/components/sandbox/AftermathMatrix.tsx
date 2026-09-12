import { useMemo, useState } from "react";
import { Crosshair, Shield, Activity, Zap, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine, LineChart, Line } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { calculateAlmgrenChriss } from "@/lib/quant/microstructure";

interface Props { stocks: PortfolioStock[]; }

const AftermathMatrix = ({ stocks }: Props) => {
  const { totalValue, holdings, sym, fmt } = useNormalizedPortfolio(stocks);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  const results = useMemo(() => {
    if (holdings.length === 0) return null;

    const stockImpacts = holdings.map(h => {
      const weight = totalValue > 0 ? h.value / totalValue : 0;
      const shares = Math.max(1, Math.round(h.quantity || (h.value / (h.price || 100))));
      const price = h.price || 100;
      const dailyVol = Math.max(0.01, (h.risk / 100) * 0.025);

      // Microstructure: Almgren-Chriss (2000) Optimal Liquidation Modeling
      const ac = calculateAlmgrenChriss({
        totalShares: shares,
        horizonPeriods: 1.0, // 1 trading day
        intervals: 10,
        dailyVolatility: dailyVol,
        initialPrice: price,
        permanentImpactGamma: 2.5e-7,
        temporaryImpactEta: 1.2e-6,
        riskAversionLambda: 1e-4,
      });

      const slippageCost = Math.round(ac.expectedCost);
      const priceImpactBps = Number(((ac.expectedCost / (h.value || 1)) * 10000).toFixed(1));
      const priceImpactPct = priceImpactBps / 100;
      const daysToUnwind = Number((ac.halfLifePeriods * 0.2).toFixed(1));
      const narrativeRisk = priceImpactBps > 15 ? "High" : priceImpactBps > 5 ? "Medium" : "Low";
      const competitorReaction = Math.min(95, Math.round(priceImpactBps * 4));
      const optimalSizePct = Math.max(10, Math.min(100, Math.round(100 / (1 + (priceImpactBps / 100) * 8))));

      return {
        ticker: h.ticker,
        positionValue: h.value,
        shares,
        weight: weight * 100,
        priceImpactBps,
        priceImpactPct,
        daysToUnwind,
        narrativeRisk,
        competitorReaction,
        optimalSizePct,
        slippageCost,
        trajectory: ac,
      };
    });

    const totalSlippage = stockImpacts.reduce((s, i) => s + i.slippageCost, 0);
    const avgImpact = stockImpacts.reduce((s, i) => s + i.priceImpactBps, 0) / (stockImpacts.length || 1);

    return { stockImpacts, totalSlippage, avgImpact, totalValue };
  }, [holdings, totalValue]);

  if (!results) return null;

  const currentSelection = results.stockImpacts.find(s => s.ticker === selectedTicker) || results.stockImpacts[0];

  const chartData = results.stockImpacts.map(s => ({
    name: s.ticker,
    impact: s.priceImpactBps,
    fill: s.priceImpactBps > 15 ? "hsl(var(--loss))" : s.priceImpactBps > 5 ? "hsl(var(--warning))" : "hsl(var(--gain))",
  }));

  // Almgren-Chriss Liquidation Curve for Selected Ticker
  const trajectoryData = currentSelection?.trajectory?.timeSteps?.map((t, idx) => ({
    step: `Slice ${idx}`,
    optimalRemaining: Math.round(currentSelection.trajectory.holdingsRemaining[idx] || 0),
    linearTWAP: Math.round(currentSelection.shares * (1 - idx / (currentSelection.trajectory.timeSteps.length - 1))),
    tradeSize: Math.round(currentSelection.trajectory.tradeSizes[idx - 1] || 0),
  })) || [];

  return (
    <div className="space-y-4 font-mono">
      {/* Top Metric Strip */}
      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Execution Shortfall</p>
          <p className="mt-1 text-lg font-bold text-loss">{fmt(results.totalSlippage)}</p>
          <p className="text-[9px] text-muted-foreground">{((results.totalSlippage / results.totalValue) * 100).toFixed(3)}% of portfolio</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mean Price Impact</p>
          <p className="mt-1 text-lg font-bold text-foreground">{results.avgImpact.toFixed(1)} bps</p>
          <p className="text-[9px] text-muted-foreground">Almgren-Chriss model</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Positions Modeled</p>
          <p className="mt-1 text-lg font-bold text-foreground">{results.stockImpacts.length}</p>
          <p className="text-[9px] text-muted-foreground">Microstructure calibrated</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Adverse Selection Risk</p>
          <p className={`mt-1 text-lg font-bold ${results.avgImpact > 15 ? "text-loss" : results.avgImpact > 5 ? "text-warning" : "text-gain"}`}>
            {results.avgImpact > 15 ? "HIGH" : results.avgImpact > 5 ? "MEDIUM" : "LOW"}
          </p>
          <p className="text-[9px] text-muted-foreground">Kyle lambda threshold</p>
        </div>
      </div>

      {/* Grid: Bar Chart & Optimal Trajectory Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Crosshair className="h-3.5 w-3.5 text-primary" />
              Microstructure Price Impact (bps)
            </h3>
            <span className="text-[9px] text-muted-foreground">Permanent + Temporary</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 10 }} />
                <ReferenceLine y={10} stroke="hsl(var(--loss))" strokeDasharray="3 3" label={{ value: "High Slippage", fill: "hsl(var(--loss))", fontSize: 8 }} />
                <Bar dataKey="impact" radius={[2, 2, 0, 0]} name="Impact (bps)">
                  {chartData.map((e, i) => <Cell key={i} fill={e.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Almgren-Chriss Trajectory */}
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              Optimal Trajectory ({currentSelection?.ticker || "Asset"})
            </h3>
            <div className="flex gap-1">
              {results.stockImpacts.slice(0, 5).map(s => (
                <button
                  key={s.ticker}
                  onClick={() => setSelectedTicker(s.ticker)}
                  className={`px-1.5 py-0.5 rounded text-[9px] border transition-colors ${
                    (currentSelection?.ticker === s.ticker)
                      ? "bg-foreground text-background border-foreground font-bold"
                      : "bg-surface-2 text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {s.ticker}
                </button>
              ))}
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="step" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 10 }} />
                <Line type="monotone" dataKey="optimalRemaining" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Optimal AC Path" />
                <Line type="monotone" dataKey="linearTWAP" stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeWidth={1} dot={false} name="Linear TWAP" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Table Detail */}
      <div className="rounded border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Almgren-Chriss Liquidity & Impact Schedule
          </h3>
          <span className="text-[9px] text-muted-foreground">Closed-Form SDE Optimization</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Asset</th>
                <th className="px-3 py-2 text-left font-medium">Weight</th>
                <th className="px-3 py-2 text-left font-medium">Impact (bps)</th>
                <th className="px-3 py-2 text-left font-medium">Expected Cost</th>
                <th className="px-3 py-2 text-left font-medium">Half-Life</th>
                <th className="px-3 py-2 text-left font-medium">Adverse Selection</th>
                <th className="px-3 py-2 text-left font-medium">Predatory Risk</th>
                <th className="px-3 py-2 text-left font-medium">Optimal Size</th>
              </tr>
            </thead>
            <tbody>
              {results.stockImpacts.map(s => (
                <tr
                  key={s.ticker}
                  onClick={() => setSelectedTicker(s.ticker)}
                  className={`border-b border-border/50 transition-colors cursor-pointer ${
                    currentSelection?.ticker === s.ticker ? "bg-surface-3" : "hover:bg-surface-2"
                  }`}
                >
                  <td className="px-3 py-2 font-bold text-foreground">{s.ticker}</td>
                  <td className="px-3 py-2 text-muted-foreground">{s.weight.toFixed(1)}%</td>
                  <td className={`px-3 py-2 font-bold ${s.priceImpactBps > 15 ? "text-loss" : s.priceImpactBps > 5 ? "text-warning" : "text-gain"}`}>
                    {s.priceImpactBps} bps
                  </td>
                  <td className="px-3 py-2 text-loss">{fmt(s.slippageCost)}</td>
                  <td className="px-3 py-2 text-foreground">{s.daysToUnwind}d</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                      s.narrativeRisk === "High" ? "bg-loss/15 text-loss border border-loss/20" :
                      s.narrativeRisk === "Medium" ? "bg-warning/15 text-warning border border-warning/20" :
                      "bg-gain/15 text-gain border border-gain/20"
                    }`}>
                      {s.narrativeRisk}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.competitorReaction}%</td>
                  <td className="px-3 py-2 text-foreground font-bold">{s.optimalSizePct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AftermathMatrix;
