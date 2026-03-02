import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart, BarChart, Bar } from "recharts";
import { Activity } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const NUM_PATHS = 10000;
const NUM_DAYS = 252; // 1 year

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

const MonteCarloEngine = ({ stocks }: Props) => {
  const [scenario, setScenario] = useState<"base" | "rate_shock" | "fx_shock" | "liquidity_freeze" | "black_swan" | "war">("base");
  const analyzed = stocks.filter(s => s.analysis);

  const totalValue = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);
  const avgRisk = analyzed.length > 0 ? analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length : 40;
  const avgBeta = analyzed.length > 0 ? analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length : 1;

  const scenarioParams: Record<string, { drift: number; volMult: number; jumpProb: number; jumpSize: number; label: string }> = {
    base: { drift: 0.0003, volMult: 1, jumpProb: 0, jumpSize: 0, label: "Base Case" },
    rate_shock: { drift: -0.0002, volMult: 1.3, jumpProb: 0.01, jumpSize: -0.02, label: "Interest Rate +200bps" },
    fx_shock: { drift: -0.0001, volMult: 1.4, jumpProb: 0.008, jumpSize: -0.025, label: "FX Shock (INR -15%)" },
    liquidity_freeze: { drift: -0.0005, volMult: 2.0, jumpProb: 0.02, jumpSize: -0.04, label: "Liquidity Freeze" },
    black_swan: { drift: -0.001, volMult: 3.0, jumpProb: 0.03, jumpSize: -0.08, label: "Black Swan Event" },
    war: { drift: -0.0008, volMult: 2.5, jumpProb: 0.025, jumpSize: -0.06, label: "Geopolitical War" },
  };

  const params = scenarioParams[scenario];
  const dailyVol = (avgRisk / 100) * 0.018 * params.volMult;

  const results = useMemo(() => {
    const finalValues: number[] = [];
    const pathSamples: number[][] = [];
    const sampleEvery = Math.floor(NUM_DAYS / 60); // 60 data points for chart

    for (let p = 0; p < NUM_PATHS; p++) {
      let value = totalValue;
      const path: number[] = p < 8 ? [value] : [];

      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        let jump = 0;
        if (Math.random() < params.jumpProb) {
          jump = params.jumpSize * (0.5 + Math.random());
        }
        value = value * Math.exp(params.drift - 0.5 * dailyVol * dailyVol + dailyVol * z + jump);
        value = Math.max(value, 0.01);
        if (p < 8 && d % sampleEvery === 0) path.push(value);
      }

      finalValues.push(value);
      if (p < 8) pathSamples.push(path);
    }

    // Compute statistics
    const sortedFinals = [...finalValues].sort((a, b) => a - b);
    const mean = finalValues.reduce((s, v) => s + v, 0) / finalValues.length;
    const var95 = percentile(sortedFinals, 5);
    const var99 = percentile(sortedFinals, 1);
    const cvar95Vals = sortedFinals.filter(v => v <= var95);
    const cvar95 = cvar95Vals.length > 0 ? cvar95Vals.reduce((s, v) => s + v, 0) / cvar95Vals.length : var95;
    const cvar99Vals = sortedFinals.filter(v => v <= var99);
    const cvar99 = cvar99Vals.length > 0 ? cvar99Vals.reduce((s, v) => s + v, 0) / cvar99Vals.length : var99;

    const profitProb = finalValues.filter(v => v > totalValue).length / finalValues.length;
    const ruinThreshold = totalValue * 0.5;
    const ruinProb = finalValues.filter(v => v < ruinThreshold).length / finalValues.length;

    // Max drawdown from sample paths
    let worstDD = 0;
    for (const path of pathSamples) {
      let peak = path[0];
      for (const v of path) {
        if (v > peak) peak = v;
        const dd = (v - peak) / peak;
        if (dd < worstDD) worstDD = dd;
      }
    }

    // Distribution histogram
    const minFinal = sortedFinals[0];
    const maxFinal = sortedFinals[sortedFinals.length - 1];
    const bucketCount = 40;
    const bucketSize = (maxFinal - minFinal) / bucketCount;
    const histogram = Array.from({ length: bucketCount }, (_, i) => {
      const lo = minFinal + i * bucketSize;
      const hi = lo + bucketSize;
      const count = finalValues.filter(v => v >= lo && v < hi).length;
      return { value: (lo + hi) / 2, count, pct: (count / NUM_PATHS) * 100 };
    });

    // Chart data from percentile bands
    const chartSteps = pathSamples[0]?.length || 0;
    const chartData = Array.from({ length: chartSteps }, (_, step) => {
      const vals = pathSamples.map(p => p[step] || 0);
      return {
        day: Math.round((step / chartSteps) * NUM_DAYS),
        p5: percentile(vals, 10),
        p25: percentile(vals, 25),
        p50: percentile(vals, 50),
        p75: percentile(vals, 75),
        p95: percentile(vals, 90),
      };
    });

    // Time to recovery estimate
    let recoveryDays = NUM_DAYS;
    if (worstDD < 0) {
      recoveryDays = Math.round(Math.abs(worstDD) * NUM_DAYS * 2);
    }

    return {
      mean, var95, var99, cvar95, cvar99, profitProb, ruinProb, worstDD, recoveryDays,
      median: percentile(sortedFinals, 50),
      p5: percentile(sortedFinals, 5),
      p95: percentile(sortedFinals, 95),
      chartData, histogram,
    };
  }, [analyzed, scenario, totalValue, dailyVol, params]);

  const fmt = (v: number) => `₹${(v / 100000).toFixed(1)}L`;
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="space-y-5">
      {/* Scenario Selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-foreground" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">Scenario</span>
          <span className="font-mono text-[10px] text-muted-foreground">{NUM_PATHS.toLocaleString()} paths · {NUM_DAYS} days</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(scenarioParams).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setScenario(key as any)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                scenario === key
                  ? "bg-foreground text-background"
                  : "bg-surface-2 text-muted-foreground hover:text-foreground"
              }`}
            >
              {val.label}
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Portfolio Value" value={fmt(totalValue)} color="text-foreground" />
        <StatCard label="Median Final" value={fmt(results.median)} color={results.median >= totalValue ? "text-gain" : "text-loss"} />
        <StatCard label="VaR (95%)" value={fmt(totalValue - results.var95)} color="text-loss" sub="Tail loss" />
        <StatCard label="CVaR (95%)" value={fmt(totalValue - results.cvar95)} color="text-loss" sub="Expected shortfall" />
        <StatCard label="Profit Prob" value={fmtPct(results.profitProb)} color={results.profitProb > 0.5 ? "text-gain" : "text-loss"} />
        <StatCard label="Ruin Prob" value={fmtPct(results.ruinProb)} color={results.ruinProb < 0.05 ? "text-gain" : "text-loss"} sub=">50% loss" />
        <StatCard label="Max Drawdown" value={`${(results.worstDD * 100).toFixed(1)}%`} color="text-loss" />
        <StatCard label="Recovery" value={`~${results.recoveryDays}d`} color="text-foreground" />
      </div>

      {/* Confidence Band Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Portfolio Value Projection — {params.label}</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={results.chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="day" tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} label={{ value: "Days", position: "insideBottom", offset: -2, fill: "hsl(0,0%,45%)", fontSize: 10 }} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} width={55} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} formatter={(v: number) => [`₹${(v / 100000).toFixed(2)}L`, ""]} />
              <ReferenceLine y={totalValue} stroke="hsl(0,0%,40%)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="p5" stackId="band" fill="none" stroke="hsl(0, 62%, 50%)" strokeWidth={1} strokeDasharray="3 3" />
              <Area type="monotone" dataKey="p25" stackId="band2" fill="none" stroke="hsl(0,0%,35%)" strokeWidth={1} />
              <Line type="monotone" dataKey="p50" stroke="hsl(0,0%,100%)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="p75" stackId="band3" fill="none" stroke="hsl(0,0%,35%)" strokeWidth={1} />
              <Area type="monotone" dataKey="p95" stackId="band4" fill="none" stroke="hsl(145, 70%, 45%)" strokeWidth={1} strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-px w-4 bg-loss inline-block" /> 5th %ile</span>
          <span className="flex items-center gap-1"><span className="h-px w-4 bg-foreground inline-block" /> Median</span>
          <span className="flex items-center gap-1"><span className="h-px w-4 bg-gain inline-block" /> 95th %ile</span>
        </div>
      </div>

      {/* Distribution */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Final Value Distribution ({NUM_PATHS.toLocaleString()} paths)</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={results.histogram} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,14%)" />
              <XAxis dataKey="value" tick={{ fill: "hsl(0,0%,45%)", fontSize: 9 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `₹${(v / 100000).toFixed(0)}L`} />
              <YAxis tick={{ fill: "hsl(0,0%,45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0,0%,14%)" }} tickFormatter={v => `${v.toFixed(1)}%`} />
              <Tooltip contentStyle={{ background: "hsl(0,0%,6%)", border: "1px solid hsl(0,0%,14%)", borderRadius: 6, fontSize: 11 }} />
              <ReferenceLine x={totalValue} stroke="hsl(0,0%,60%)" strokeDasharray="4 4" />
              <Bar dataKey="pct" radius={[2, 2, 0, 0]} fill="hsl(0,0%,70%)" fillOpacity={0.6} name="Probability %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string }) => (
  <div className="rounded-xl border border-border bg-card p-3">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-0.5 font-mono text-base font-bold ${color}`}>{value}</p>
    {sub && <p className="text-[8px] text-muted-foreground">{sub}</p>}
  </div>
);

export default MonteCarloEngine;
