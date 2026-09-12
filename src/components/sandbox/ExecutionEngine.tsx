import { useMemo, useState } from "react";
import { Target, Zap, Clock, ShieldCheck } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { calculateAlmgrenChriss } from "@/lib/quant/microstructure";

interface Props { stocks: PortfolioStock[]; }

type AlgoType = "Almgren-Chriss" | "VWAP" | "TWAP" | "POV" | "Adaptive";

const ExecutionEngine = ({ stocks }: Props) => {
  const [algo, setAlgo] = useState<AlgoType>("Almgren-Chriss");
  const [participation, setParticipation] = useState(10);
  const { totalValue, holdings, fmt, sym } = useNormalizedPortfolio(stocks);

  const results = useMemo(() => {
    if (holdings.length === 0) return null;

    const slices = 20;
    const perSlice = totalValue / slices;

    const vwapWeights = Array.from({ length: slices }, (_, i) => {
      const t = i / (slices - 1);
      return 1 + Math.cos((t - 0.5) * Math.PI * 2) * 0.4 + (t < 0.15 ? 0.5 : 0) + (t > 0.85 ? 0.3 : 0);
    });
    const totalWeight = vwapWeights.reduce((s, w) => s + w, 0);

    const avgRisk = holdings.reduce((s, h) => s + h.risk, 0) / (holdings.length || 1);
    const dailyVol = Math.max(0.01, (avgRisk / 100) * 0.018);

    // Almgren-Chriss Optimal Schedule
    const ac = calculateAlmgrenChriss({
      totalShares: totalValue,
      horizonPeriods: 1.0,
      intervals: slices,
      dailyVolatility: dailyVol,
      initialPrice: 100,
      permanentImpactGamma: 2.5e-7,
      temporaryImpactEta: 1.2e-6,
      riskAversionLambda: 1e-4,
    });

    let cumFilled = 0;
    let cumSlippage = 0;
    const executionPath = Array.from({ length: slices }, (_, i) => {
      const t = i / (slices - 1);
      const timeLabel = `${Math.round(9.25 + t * 6.25)}:${Math.round((t * 6.25 % 1) * 60).toString().padStart(2, "0")}`;

      let sliceSize: number;
      switch (algo) {
        case "Almgren-Chriss":
          sliceSize = ac.tradeSizes[i] || perSlice;
          break;
        case "VWAP":
          sliceSize = totalValue * (vwapWeights[i] / totalWeight);
          break;
        case "TWAP":
          sliceSize = perSlice;
          break;
        case "POV":
          sliceSize = (totalValue * (participation / 100) / slices) * vwapWeights[i];
          break;
        case "Adaptive":
          sliceSize = perSlice * (2 - vwapWeights[i] / Math.max(...vwapWeights));
          break;
        default:
          sliceSize = perSlice;
      }

      const impactBps = Math.sqrt(sliceSize / (totalValue * 3)) * dailyVol * 10000 * 0.5;
      const slippage = sliceSize * impactBps / 10000;
      cumFilled += sliceSize;
      cumSlippage += slippage;

      return {
        time: timeLabel,
        filled: Math.round(cumFilled),
        filledPct: +((cumFilled / totalValue) * 100).toFixed(1),
        slippage: Math.round(cumSlippage),
        sliceSize: Math.round(sliceSize),
        impactBps: +impactBps.toFixed(2),
      };
    });

    const totalSlippage = cumSlippage;
    const avgImpact = executionPath.reduce((s, e) => s + e.impactBps, 0) / slices;
    const completionTime = algo === "POV" ? `${(100 / participation * 6.25 / 60).toFixed(1)} hours` : "6.25 hours";

    return { executionPath, totalSlippage, avgImpact, completionTime, totalValue, ac };
  }, [holdings, algo, participation, totalValue]);

  if (!results) return null;

  return (
    <div className="space-y-4 font-mono">
      <div className="rounded border border-border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Execution Routing Engine</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {(["Almgren-Chriss", "VWAP", "TWAP", "POV", "Adaptive"] as AlgoType[]).map(a => (
              <button
                key={a}
                onClick={() => setAlgo(a)}
                className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors border ${
                  algo === a ? "bg-foreground text-background border-foreground font-bold" : "bg-surface-2 text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Expected Slippage</p>
          <p className="mt-1 text-base font-bold text-loss">{fmt(results.totalSlippage)}</p>
          <p className="text-[8px] text-muted-foreground">{((results.totalSlippage / results.totalValue) * 100).toFixed(2)}% of notional</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Mean Price Impact</p>
          <p className="mt-1 text-base font-bold text-foreground">{results.avgImpact.toFixed(2)} bps</p>
          <p className="text-[8px] text-muted-foreground">Transient + permanent</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Execution Horizon</p>
          <p className="mt-1 text-base font-bold text-foreground">{results.completionTime}</p>
          <p className="text-[8px] text-muted-foreground">Full liquidity fill</p>
        </div>
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Active Algorithm</p>
          <p className="mt-1 text-base font-bold text-primary">{algo}</p>
          <p className="text-[8px] text-muted-foreground">{algo === "Almgren-Chriss" ? "Optimal SDE Shortfall" : `${participation}% participation`}</p>
        </div>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
            Execution Fill Trajectory: {algo}
          </h3>
          <span className="text-[9px] text-muted-foreground">20 Slices · Real Microstructure</span>
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={results.executionPath} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v}%`} yAxisId="pct" />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => fmt(v)} yAxisId="slippage" orientation="right" />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 4, fontSize: 10 }} />
              <Line type="monotone" dataKey="filledPct" stroke="hsl(var(--foreground))" strokeWidth={2} dot={false} yAxisId="pct" name="% Filled" />
              <Line type="monotone" dataKey="slippage" stroke="hsl(var(--loss))" strokeWidth={1.5} dot={false} yAxisId="slippage" name="Cum. Slippage" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded border border-border bg-card p-4">
        <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-3">Slice Execution Log</h3>
        <div className="overflow-x-auto max-h-[260px]">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">Slice {sym}</th>
                <th className="px-3 py-2 text-left font-medium">Cumulative {sym}</th>
                <th className="px-3 py-2 text-left font-medium">% Filled</th>
                <th className="px-3 py-2 text-left font-medium">Impact (bps)</th>
                <th className="px-3 py-2 text-left font-medium">Cum. Slippage</th>
              </tr>
            </thead>
            <tbody>
              {results.executionPath.map((e, i) => (
                <tr key={i} className="border-b border-border/40 hover:bg-surface-2 transition-colors">
                  <td className="px-3 py-1.5 text-foreground">{e.time}</td>
                  <td className="px-3 py-1.5 text-foreground font-bold">{fmt(e.sliceSize)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{fmt(e.filled)}</td>
                  <td className="px-3 py-1.5 text-foreground">{e.filledPct}%</td>
                  <td className="px-3 py-1.5 text-loss">{e.impactBps} bps</td>
                  <td className="px-3 py-1.5 text-loss">{fmt(e.slippage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExecutionEngine;
