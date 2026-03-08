import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

type AlgoType = "VWAP" | "TWAP" | "POV" | "Adaptive";

const ExecutionEngine = ({ stocks }: Props) => {
  const [algo, setAlgo] = useState<AlgoType>("VWAP");
  const [participation, setParticipation] = useState(10);
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);

  const results = useMemo(() => {
    if (holdings.length === 0) return null;

    // Simulate execution across time slices
    const slices = 20;
    const perSlice = totalValue / slices;

    // VWAP volume curve (U-shaped typical market)
    const vwapWeights = Array.from({ length: slices }, (_, i) => {
      const t = i / (slices - 1);
      return 1 + Math.cos((t - 0.5) * Math.PI * 2) * 0.4 + (t < 0.15 ? 0.5 : 0) + (t > 0.85 ? 0.3 : 0);
    });
    const totalWeight = vwapWeights.reduce((s, w) => s + w, 0);

    const avgBeta = analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length;
    const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;
    const dailyVol = (avgRisk / 100) * 0.018;

    let cumFilled = 0;
    let cumSlippage = 0;
    const executionPath = Array.from({ length: slices }, (_, i) => {
      const t = i / (slices - 1);
      const timeLabel = `${Math.round(9.25 + t * 6.25)}:${Math.round((t * 6.25 % 1) * 60).toString().padStart(2, "0")}`;

      let sliceSize: number;
      switch (algo) {
        case "VWAP": sliceSize = totalValue * (vwapWeights[i] / totalWeight); break;
        case "TWAP": sliceSize = perSlice; break;
        case "POV": sliceSize = totalValue * (participation / 100) / slices * (1 + Math.random() * 0.3); break;
        case "Adaptive": sliceSize = perSlice * (1 + (Math.random() - 0.5) * 0.5); break;
        default: sliceSize = perSlice;
      }

      // Impact model: sqrt(sliceSize / ADV) * sigma
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

    return { executionPath, totalSlippage, avgImpact, completionTime, totalValue };
  }, [analyzed, algo, participation]);

  if (!results) return null;

  return (
    <div className="space-y-5">
      {/* Algo Selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold text-foreground uppercase tracking-wider">Execution Algorithm</span>
          </div>
          <div className="flex gap-1.5">
            {(["VWAP", "TWAP", "POV", "Adaptive"] as AlgoType[]).map(a => (
              <button
                key={a}
                onClick={() => setAlgo(a)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-mono font-medium transition-all ${
                  algo === a ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Total Slippage</p>
          <p className="mt-1 font-mono text-lg font-bold text-loss">₹{results.totalSlippage.toLocaleString("en-IN")}</p>
          <p className="text-[9px] text-muted-foreground">{((results.totalSlippage / results.totalValue) * 100).toFixed(2)}%</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Avg Impact</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{results.avgImpact.toFixed(2)} bps</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Completion</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{results.completionTime}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Algorithm</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">{algo}</p>
          <p className="text-[9px] text-muted-foreground">{participation}% participation</p>
        </div>
      </div>

      {/* Execution Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Execution Progress — {algo}</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={results.executionPath} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="time" tick={{ fill: "hsl(0,0%,45%)", fontSize: 9 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v}%`} yAxisId="pct" />
              <YAxis tick={{ fill: "hsl(0,0%,35%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} yAxisId="slippage" orientation="right" />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <Line type="monotone" dataKey="filledPct" stroke="hsl(0,0%,100%)" strokeWidth={2} dot={false} yAxisId="pct" name="% Filled" />
              <Line type="monotone" dataKey="slippage" stroke="hsl(0,62%,50%)" strokeWidth={1.5} dot={false} yAxisId="slippage" name="Cum. Slippage ₹" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Slice Detail */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Slice Execution Detail</h3>
        <div className="overflow-x-auto max-h-[300px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                {["Time", "Slice ₹", "Cumulative ₹", "% Filled", "Impact (bps)", "Cum. Slippage ₹"].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {results.executionPath.map((e, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="px-3 py-1.5 font-mono text-foreground">{e.time}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">₹{e.sliceSize.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-1.5 font-mono text-foreground">₹{e.filled.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-1.5 font-mono text-foreground">{e.filledPct}%</td>
                  <td className={`px-3 py-1.5 font-mono ${e.impactBps > 3 ? "text-loss" : "text-muted-foreground"}`}>{e.impactBps}</td>
                  <td className="px-3 py-1.5 font-mono text-loss">₹{e.slippage.toLocaleString("en-IN")}</td>
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
