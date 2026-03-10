import { useMemo, useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, BarChart, Bar, Legend } from "recharts";
import { Activity, Lightbulb, Brain } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { governedInvoke } from "@/lib/apiGovernor";

interface Props { stocks: PortfolioStock[]; }

const NUM_PATHS = 10000;
const NUM_DAYS = 252;
const VISIBLE_PATHS = 30; // number of individual paths to render on chart
const SAMPLE_POINTS = 120; // data points per path for smooth rendering

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

// Distinct colors for individual paths
const PATH_COLORS = [
  "hsl(30,90%,55%)",  "hsl(180,70%,50%)", "hsl(120,60%,45%)", "hsl(280,60%,60%)",
  "hsl(200,80%,55%)", "hsl(0,70%,55%)",   "hsl(60,80%,45%)",  "hsl(320,60%,55%)",
  "hsl(160,60%,50%)", "hsl(240,50%,60%)", "hsl(45,90%,50%)",  "hsl(100,50%,50%)",
  "hsl(350,70%,60%)", "hsl(210,70%,50%)", "hsl(90,60%,45%)",  "hsl(270,50%,55%)",
  "hsl(20,80%,50%)",  "hsl(140,60%,45%)", "hsl(300,50%,55%)", "hsl(170,60%,50%)",
  "hsl(50,80%,50%)",  "hsl(230,60%,55%)", "hsl(10,70%,50%)",  "hsl(190,70%,50%)",
  "hsl(110,50%,45%)", "hsl(330,60%,55%)", "hsl(70,70%,45%)",  "hsl(250,50%,55%)",
  "hsl(40,80%,50%)",  "hsl(150,60%,50%)",
];

const scenarioParams: Record<string, { drift: number; volMult: number; jumpProb: number; jumpSize: number; label: string; desc: string }> = {
  base: { drift: 0.0003, volMult: 1, jumpProb: 0, jumpSize: 0, label: "Base Case", desc: "Normal market conditions with current volatility" },
  rate_shock: { drift: -0.0002, volMult: 1.3, jumpProb: 0.01, jumpSize: -0.02, label: "Rate Shock +200bps", desc: "Central banks raise rates aggressively" },
  fx_shock: { drift: -0.0001, volMult: 1.4, jumpProb: 0.008, jumpSize: -0.025, label: "FX Crisis", desc: "Major currency depreciation event" },
  liquidity_freeze: { drift: -0.0005, volMult: 2.0, jumpProb: 0.02, jumpSize: -0.04, label: "Liquidity Freeze", desc: "Market-wide liquidity crunch like 2008" },
  black_swan: { drift: -0.001, volMult: 3.0, jumpProb: 0.03, jumpSize: -0.08, label: "Black Swan", desc: "Unprecedented tail risk event" },
  war: { drift: -0.0008, volMult: 2.5, jumpProb: 0.025, jumpSize: -0.06, label: "Geopolitical War", desc: "Major armed conflict affecting global markets" },
};

type ViewMode = "original" | "resample" | "randomized" | "all";

const MonteCarloEngine = ({ stocks }: Props) => {
  const [scenario, setScenario] = useState<string>("base");
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const { totalValue, holdings, sym, fmt, baseCurrency } = useNormalizedPortfolio(stocks);
  const [aiCalibration, setAiCalibration] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const avgRisk = holdings.length > 0 ? holdings.reduce((s, h) => s + h.risk, 0) / holdings.length : 40;
  const avgBeta = holdings.length > 0 ? holdings.reduce((s, h) => s + h.beta, 0) / holdings.length : 1;

  // Fetch AI calibration
  useEffect(() => {
    if (holdings.length === 0) return;
    setAiLoading(true);
    const portfolio = holdings.map(h => ({ ticker: h.ticker, risk: h.risk, beta: h.beta, value: h.value }));
    governedInvoke("monte-carlo-intelligence", { body: { portfolio, totalValue, avgRisk, avgBeta, scenario } })
      .then(({ data }) => { if (data && !data.error) setAiCalibration(data); })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [holdings.map(h => h.ticker).join(","), scenario]);

  // Use AI-calibrated params if available, otherwise static
  const activeScenarioParams = aiCalibration?.scenarios || scenarioParams;
  const params = activeScenarioParams[scenario] || scenarioParams[scenario];
  const dailyVol = (avgRisk / 100) * 0.018 * params.volMult;

  const results = useMemo(() => {
    const finalValues: number[] = [];
    const sampleEvery = Math.max(1, Math.floor(NUM_DAYS / SAMPLE_POINTS));
    const stepsCount = Math.ceil(NUM_DAYS / sampleEvery) + 1;

    // Store individual paths for rendering
    const originalPaths: number[][] = [];
    const resamplePaths: number[][] = [];
    const randomPaths: number[][] = [];

    // Generate original paths
    for (let p = 0; p < NUM_PATHS; p++) {
      let value = totalValue;
      const storePath = p < VISIBLE_PATHS;
      const path: number[] = storePath ? [value] : [];
      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        let jump = 0;
        if (Math.random() < params.jumpProb) jump = params.jumpSize * (0.5 + Math.random());
        value = value * Math.exp(params.drift - 0.5 * dailyVol * dailyVol + dailyVol * z + jump);
        value = Math.max(value, 0.01);
        if (storePath && d % sampleEvery === 0) path.push(value);
      }
      finalValues.push(value);
      if (storePath) originalPaths.push(path);
    }

    // Generate resample paths (slightly different drift)
    for (let p = 0; p < VISIBLE_PATHS; p++) {
      let value = totalValue;
      const path: number[] = [value];
      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        let jump = 0;
        if (Math.random() < params.jumpProb * 0.8) jump = params.jumpSize * (0.3 + Math.random() * 0.7);
        value = value * Math.exp(params.drift * 1.1 - 0.5 * dailyVol * dailyVol + dailyVol * 0.95 * z + jump);
        value = Math.max(value, 0.01);
        if (d % sampleEvery === 0) path.push(value);
      }
      resamplePaths.push(path);
    }

    // Generate randomized paths (higher vol)
    for (let p = 0; p < VISIBLE_PATHS; p++) {
      let value = totalValue;
      const path: number[] = [value];
      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        value = value * Math.exp(params.drift * 0.5 - 0.5 * (dailyVol * 1.3) ** 2 + dailyVol * 1.3 * z);
        value = Math.max(value, 0.01);
        if (d % sampleEvery === 0) path.push(value);
      }
      randomPaths.push(path);
    }

    // "Real" path — the median trajectory
    const realPath: number[] = [totalValue];
    let realValue = totalValue;
    for (let d = 1; d <= NUM_DAYS; d++) {
      realValue = realValue * Math.exp(params.drift);
      if (d % sampleEvery === 0) realPath.push(realValue);
    }

    // Build chart data — each step has all path values
    const chartData = Array.from({ length: stepsCount }, (_, step) => {
      const point: Record<string, number> = { day: Math.round((step / (stepsCount - 1)) * NUM_DAYS) };
      point.real = realPath[step] ?? realPath[realPath.length - 1];
      for (let i = 0; i < VISIBLE_PATHS; i++) {
        point[`o${i}`] = originalPaths[i]?.[step] ?? 0;
        point[`r${i}`] = resamplePaths[i]?.[step] ?? 0;
        point[`x${i}`] = randomPaths[i]?.[step] ?? 0;
      }
      return point;
    });

    // Drawdown calculations
    const calcDrawdowns = (paths: number[][]) => {
      let best = Infinity, worst = 0, total = 0;
      for (const path of paths) {
        let peak = path[0], maxDD = 0;
        for (const v of path) {
          if (v > peak) peak = v;
          const dd = peak - v;
          if (dd > maxDD) maxDD = dd;
        }
        if (maxDD < best) best = maxDD;
        if (maxDD > worst) worst = maxDD;
        total += maxDD;
      }
      return { best, worst, avg: paths.length > 0 ? total / paths.length : 0 };
    };

    const origDD = calcDrawdowns(originalPaths);
    const resDD = calcDrawdowns(resamplePaths);

    const sortedFinals = [...finalValues].sort((a, b) => a - b);
    const mean = finalValues.reduce((s, v) => s + v, 0) / finalValues.length;
    const var95 = percentile(sortedFinals, 5);
    const var99 = percentile(sortedFinals, 1);
    const cvar95Vals = sortedFinals.filter(v => v <= var95);
    const cvar95 = cvar95Vals.length > 0 ? cvar95Vals.reduce((s, v) => s + v, 0) / cvar95Vals.length : var95;
    const profitProb = finalValues.filter(v => v > totalValue).length / finalValues.length;
    const ruinThreshold = totalValue * 0.5;
    const ruinProb = finalValues.filter(v => v < ruinThreshold).length / finalValues.length;

    let worstDD = 0;
    for (const path of originalPaths) {
      let peak = path[0];
      for (const v of path) {
        if (v > peak) peak = v;
        const dd = (v - peak) / peak;
        if (dd < worstDD) worstDD = dd;
      }
    }

    const minFinal = sortedFinals[0];
    const maxFinal = sortedFinals[sortedFinals.length - 1];
    const bucketCount = 40;
    const bucketSize = (maxFinal - minFinal) / bucketCount;
    const histogram = Array.from({ length: bucketCount }, (_, i) => {
      const lo = minFinal + i * bucketSize;
      const hi = lo + bucketSize;
      return { value: (lo + hi) / 2, count: finalValues.filter(v => v >= lo && v < hi).length, pct: (finalValues.filter(v => v >= lo && v < hi).length / NUM_PATHS) * 100 };
    });

    let recoveryDays = NUM_DAYS;
    if (worstDD < 0) recoveryDays = Math.round(Math.abs(worstDD) * NUM_DAYS * 2);

    return { mean, var95, var99, cvar95, profitProb, ruinProb, worstDD, recoveryDays, median: percentile(sortedFinals, 50), p5: percentile(sortedFinals, 5), p95: percentile(sortedFinals, 95), chartData, histogram, origDD, resDD };
  }, [holdings, scenario, totalValue, dailyVol, params]);

  const suggestions = useMemo(() => {
    // Use AI suggestions if available
    if (aiCalibration?.suggestions?.length > 0) return aiCalibration.suggestions;

    const actions: { label: string; type: "protect" | "opportunity" | "wait"; detail: string }[] = [];
    const lossAt95 = totalValue - results.var95;
    const lossPct = totalValue > 0 ? (lossAt95 / totalValue) * 100 : 0;

    if (scenario === "base") {
      if (results.profitProb > 0.6) actions.push({ label: "Hold current positions", type: "wait", detail: `${(results.profitProb * 100).toFixed(0)}% probability of profit.` });
      if (avgBeta > 1.3) actions.push({ label: "Reduce beta exposure", type: "protect", detail: `Portfolio beta ${avgBeta.toFixed(2)} is elevated.` });
      if (lossPct > 15) actions.push({ label: "Add tail risk hedges", type: "protect", detail: `VaR(95%) loss of ${fmt(lossAt95)} is significant.` });
    } else if (scenario === "rate_shock") {
      actions.push({ label: "Rotate out of growth stocks", type: "protect", detail: "High-duration growth stocks lose most in rate shocks." });
    } else if (scenario === "liquidity_freeze") {
      actions.push({ label: "Move to large-cap liquid names", type: "protect", detail: "Small/mid-cap stocks suffer most." });
    } else if (scenario === "black_swan") {
      actions.push({ label: "Activate full hedging protocol", type: "protect", detail: `Ruin probability ${(results.ruinProb * 100).toFixed(1)}%.` });
    }
    if (results.ruinProb > 0.1) {
      actions.push({ label: "CRITICAL: Position sizing too aggressive", type: "protect", detail: `${(results.ruinProb * 100).toFixed(1)}% ruin probability exceeds institutional limits.` });
    }
    return actions;
  }, [scenario, results, avgBeta, totalValue, fmt, aiCalibration]);

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  // Determine which path keys to show based on viewMode
  const getVisiblePrefixes = (): string[] => {
    switch (viewMode) {
      case "original": return ["o"];
      case "resample": return ["r"];
      case "randomized": return ["x"];
      case "all": return ["o", "r", "x"];
    }
  };

  const visiblePrefixes = getVisiblePrefixes();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-foreground" />
          <span className="text-xs font-bold text-foreground uppercase tracking-wider">Scenario</span>
          <span className="font-mono text-[10px] text-muted-foreground">{NUM_PATHS.toLocaleString()} paths · {NUM_DAYS} days</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(scenarioParams).map(([key, val]) => (
            <button key={key} onClick={() => setScenario(key)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${scenario === key ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}>
              {val.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">{params.desc}</p>
      </div>

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

      {suggestions.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-card p-5">
          <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" /> Recommended Actions — {params.label}
          </h3>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div key={i} className={`rounded-lg border p-3 ${s.type === "protect" ? "border-loss/20 bg-loss/5" : s.type === "opportunity" ? "border-gain/20 bg-gain/5" : "border-border bg-surface-2"}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase ${s.type === "protect" ? "bg-loss/20 text-loss" : s.type === "opportunity" ? "bg-gain/20 text-gain" : "bg-surface-3 text-muted-foreground"}`}>{s.type}</span>
                  <span className="text-sm font-semibold text-foreground">{s.label}</span>
                </div>
                <p className="text-[11px] text-secondary-foreground leading-relaxed">{s.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Spaghetti Chart */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-3">Simulation Paths — {params.label}</h3>

        {/* View mode tabs */}
        <div className="flex items-center justify-center gap-1 mb-4">
          {(["original", "resample", "randomized", "all"] as ViewMode[]).map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`rounded-md px-4 py-1.5 text-[11px] font-medium border transition-all ${viewMode === m ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}>
              {m === "all" ? `1-${VISIBLE_PATHS}` : m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={results.chartData} margin={{ top: 10, right: 15, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => fmt(v)} width={70} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 10 }} formatter={(v: number) => [fmt(v), ""]} />

              {/* Individual simulation paths */}
              {visiblePrefixes.flatMap(prefix =>
                Array.from({ length: VISIBLE_PATHS }, (_, i) => (
                  <Line key={`${prefix}${i}`} type="monotone" dataKey={`${prefix}${i}`}
                    stroke={PATH_COLORS[i % PATH_COLORS.length]} strokeWidth={0.8}
                    dot={false} strokeOpacity={0.5} isAnimationActive={false} />
                ))
              )}

              {/* Bold "Real" (median) path on top */}
              <Line type="monotone" dataKey="real" stroke="hsl(220, 90%, 56%)" strokeWidth={3}
                dot={false} isAnimationActive={false} name="Real" />

              {/* Starting value reference */}
              <ReferenceLine y={totalValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeOpacity={0.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Drawdown stats table — like the reference image */}
        <div className="mt-4 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-2">Original Simulation</p>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Best Drawdown:</span><span className="text-foreground">{fmt(results.origDD.best)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Worst Drawdown:</span><span className="text-loss">{fmt(results.origDD.worst)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Average Drawdown:</span><span className="text-foreground">{fmt(results.origDD.avg)}</span></div>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-2">Resample Simulation</p>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Best Drawdown:</span><span className="text-foreground">{fmt(results.resDD.best)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Worst Drawdown:</span><span className="text-loss">{fmt(results.resDD.worst)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Average Drawdown:</span><span className="text-foreground">{fmt(results.resDD.avg)}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Final Value Distribution ({NUM_PATHS.toLocaleString()} paths)</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={results.histogram} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
              <XAxis dataKey="value" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => fmt(v)} />
              <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v.toFixed(1)}%`} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 11 }} />
              <ReferenceLine x={totalValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
              <Bar dataKey="pct" radius={[2, 2, 0, 0]} fill="hsl(var(--primary))" fillOpacity={0.6} name="Probability %" />
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
