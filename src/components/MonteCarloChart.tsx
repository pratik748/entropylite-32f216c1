import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Dice5, ShieldAlert, TrendingDown, BarChart3 } from "lucide-react";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol, formatCompact } from "@/lib/currency";

interface MonteCarloChartProps {
  currentPrice: number;
  bullRange: [number, number];
  bearRange: [number, number];
  ticker: string;
  currency?: string;
}

const NUM_SIMULATIONS = 10000;
const NUM_DAYS = 252;
const NUM_VISIBLE_PATHS = 40;

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

const PATH_COLORS = [
  "hsl(30,90%,55%)",  "hsl(180,70%,50%)", "hsl(120,60%,45%)", "hsl(280,60%,60%)",
  "hsl(200,80%,55%)", "hsl(0,70%,55%)",   "hsl(60,80%,45%)",  "hsl(320,60%,55%)",
  "hsl(160,60%,50%)", "hsl(240,50%,60%)", "hsl(45,90%,50%)",  "hsl(100,50%,50%)",
  "hsl(350,70%,60%)", "hsl(210,70%,50%)", "hsl(90,60%,45%)",  "hsl(270,50%,55%)",
  "hsl(20,80%,50%)",  "hsl(140,60%,45%)", "hsl(300,50%,55%)", "hsl(170,60%,50%)",
  "hsl(50,80%,50%)",  "hsl(230,60%,55%)", "hsl(10,70%,50%)",  "hsl(190,70%,50%)",
  "hsl(110,50%,45%)", "hsl(330,60%,55%)", "hsl(70,70%,45%)",  "hsl(250,50%,55%)",
  "hsl(40,80%,50%)",  "hsl(150,60%,50%)", "hsl(355,80%,55%)", "hsl(215,75%,55%)",
  "hsl(75,70%,45%)",  "hsl(295,55%,55%)", "hsl(5,75%,50%)",   "hsl(185,65%,50%)",
  "hsl(125,55%,45%)", "hsl(265,50%,55%)", "hsl(35,85%,50%)",  "hsl(155,60%,50%)",
];

type ViewMode = "original" | "resample" | "randomized" | "all";

const MonteCarloChart = ({ currentPrice, bullRange, bearRange, ticker, currency }: MonteCarloChartProps) => {
  const { baseCurrency, convertToBase } = useFX();
  const [viewMode, setViewMode] = useState<ViewMode>("original");
  const assetCurrency = currency || "USD";
  const sym = getCurrencySymbol(baseCurrency);
  const fmtPrice = (v: number) => `${sym}${convertToBase(v, assetCurrency).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

  const { chartData, stats } = useMemo(() => {
    const upperBound = bullRange[1];
    const lowerBound = bearRange[0];
    const annualVol = Math.max(0.05, (upperBound - lowerBound) / (2 * currentPrice));
    const dailyVol = annualVol / Math.sqrt(252);
    const dailyDrift = 0.0002;

    const sampleEvery = Math.max(1, Math.floor(NUM_DAYS / 120));
    const stepsCount = Math.ceil(NUM_DAYS / sampleEvery) + 1;

    const originalPaths: number[][] = [];
    const resamplePaths: number[][] = [];
    const randomPaths: number[][] = [];
    const finalPrices: number[] = [];
    const allDrawdowns: number[] = [];

    // Original simulation paths
    for (let s = 0; s < NUM_SIMULATIONS; s++) {
      let price = currentPrice;
      let peak = price, maxDD = 0;
      const storePath = s < NUM_VISIBLE_PATHS;
      const path: number[] = storePath ? [price] : [];

      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        price = price * Math.exp((dailyDrift - 0.5 * dailyVol * dailyVol) + dailyVol * z);
        price = Math.max(price, 0.01);
        if (price > peak) peak = price;
        const dd = (peak - price) / peak;
        if (dd > maxDD) maxDD = dd;
        if (storePath && d % sampleEvery === 0) path.push(price);
      }
      finalPrices.push(price);
      allDrawdowns.push(maxDD);
      if (storePath) originalPaths.push(path);
    }

    // Resample paths (slightly different params)
    for (let i = 0; i < NUM_VISIBLE_PATHS; i++) {
      let price = currentPrice;
      const path: number[] = [price];
      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        price = price * Math.exp((dailyDrift * 1.1 - 0.5 * (dailyVol * 0.95) ** 2) + dailyVol * 0.95 * z);
        price = Math.max(price, 0.01);
        if (d % sampleEvery === 0) path.push(price);
      }
      resamplePaths.push(path);
    }

    // Randomized paths (higher vol)
    for (let i = 0; i < NUM_VISIBLE_PATHS; i++) {
      let price = currentPrice;
      const path: number[] = [price];
      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        price = price * Math.exp((dailyDrift * 0.5 - 0.5 * (dailyVol * 1.3) ** 2) + dailyVol * 1.3 * z);
        price = Math.max(price, 0.01);
        if (d % sampleEvery === 0) path.push(price);
      }
      randomPaths.push(path);
    }

    // "Real" path — deterministic drift
    const realPath: number[] = [currentPrice];
    let rp = currentPrice;
    for (let d = 1; d <= NUM_DAYS; d++) {
      rp *= Math.exp(dailyDrift);
      if (d % sampleEvery === 0) realPath.push(rp);
    }

    // Build chart data
    const data = Array.from({ length: stepsCount }, (_, step) => {
      const point: Record<string, number> = { day: Math.round((step / (stepsCount - 1)) * NUM_DAYS) };
      point.real = realPath[step] ?? realPath[realPath.length - 1];
      for (let i = 0; i < NUM_VISIBLE_PATHS; i++) {
        point[`o${i}`] = originalPaths[i]?.[step] ?? 0;
        point[`r${i}`] = resamplePaths[i]?.[step] ?? 0;
        point[`x${i}`] = randomPaths[i]?.[step] ?? 0;
      }
      return point;
    });

    // Stats
    const returns = finalPrices.map(p => (p - currentPrice) / currentPrice);
    const sortedReturns = [...returns].sort((a, b) => a - b);
    const sortedDrawdowns = [...allDrawdowns].sort((a, b) => a - b);

    const var95 = percentile(sortedReturns, 5);
    const var99 = percentile(sortedReturns, 1);
    const cvar95Returns = sortedReturns.filter(r => r <= var95);
    const cvar95 = cvar95Returns.length > 0 ? cvar95Returns.reduce((s, r) => s + r, 0) / cvar95Returns.length : var95;
    const cvar99Returns = sortedReturns.filter(r => r <= var99);
    const cvar99 = cvar99Returns.length > 0 ? cvar99Returns.reduce((s, r) => s + r, 0) / cvar99Returns.length : var99;

    const profitProb = (returns.filter(r => r > 0).length / returns.length) * 100;
    const medianReturn = percentile(returns, 50) * 100;
    const meanReturn = (returns.reduce((s, r) => s + r, 0) / returns.length) * 100;
    const stdDev = Math.sqrt(returns.reduce((s, r) => s + (r - meanReturn / 100) ** 2, 0) / returns.length) * 100;
    const medianFinal = percentile(finalPrices, 50);
    const maxDrawdownCount = allDrawdowns.filter(d => d > 0.2).length;

    const calcDD = (paths: number[][]) => {
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

    const origDD = calcDD(originalPaths);
    const resDD = calcDD(resamplePaths);

    const histBins = 30;
    const minR = sortedReturns[0] * 100;
    const maxR = sortedReturns[sortedReturns.length - 1] * 100;
    const binWidth = (maxR - minR) / histBins;
    const histogram = Array.from({ length: histBins }, (_, i) => {
      const binStart = minR + i * binWidth;
      const binEnd = binStart + binWidth;
      const count = returns.filter(r => r * 100 >= binStart && r * 100 < binEnd).length;
      return { bin: binStart + binWidth / 2, count, pct: (count / NUM_SIMULATIONS) * 100, isNeg: binStart + binWidth / 2 < 0 };
    });

    return {
      chartData: data,
      stats: {
        profitProb: profitProb.toFixed(0),
        medianFinal,
        medianReturn: medianReturn.toFixed(1),
        meanReturn: meanReturn.toFixed(1),
        stdDev: stdDev.toFixed(1),
        var95: (var95 * 100).toFixed(1),
        var99: (var99 * 100).toFixed(1),
        cvar95: (cvar95 * 100).toFixed(1),
        cvar99: (cvar99 * 100).toFixed(1),
        maxDrawdownProb: ((maxDrawdownCount / NUM_SIMULATIONS) * 100).toFixed(1),
        sharpe: stdDev > 0 ? (meanReturn / stdDev).toFixed(2) : "0",
        origDD, resDD, histogram,
      },
    };
  }, [currentPrice, bullRange, bearRange]);

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
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dice5 className="h-5 w-5 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">Monte Carlo Engine</h2>
          <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {NUM_SIMULATIONS.toLocaleString()} paths · {NUM_DAYS}d · GBM
          </span>
        </div>
      </div>

      {/* Key Stats Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <StatCard label="Profit Prob." value={`${stats.profitProb}%`} color={Number(stats.profitProb) >= 50 ? "text-gain" : "text-loss"} />
        <StatCard label="Median Target" value={fmtPrice(stats.medianFinal)} />
        <StatCard label="Expected" value={`${Number(stats.medianReturn) >= 0 ? "+" : ""}${stats.medianReturn}%`} color={Number(stats.medianReturn) >= 0 ? "text-gain" : "text-loss"} />
        <StatCard label="Volatility" value={`${stats.stdDev}%`} color="text-warning" />
        <StatCard label="Sharpe" value={stats.sharpe} color={Number(stats.sharpe) > 0.5 ? "text-gain" : "text-loss"} />
        <StatCard label=">20% DD" value={`${stats.maxDrawdownProb}%`} color="text-loss" />
      </div>

      {/* Risk Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-lg bg-loss/5 border border-loss/10 p-3">
          <div className="flex items-center gap-1.5 mb-1"><ShieldAlert className="h-3 w-3 text-loss" /><p className="text-[9px] uppercase tracking-wider text-loss font-bold">VaR 95%</p></div>
          <p className="font-mono text-sm font-bold text-loss">{stats.var95}%</p>
          <p className="text-[8px] text-muted-foreground">Max loss 95% confidence</p>
        </div>
        <div className="rounded-lg bg-loss/5 border border-loss/10 p-3">
          <div className="flex items-center gap-1.5 mb-1"><ShieldAlert className="h-3 w-3 text-loss" /><p className="text-[9px] uppercase tracking-wider text-loss font-bold">VaR 99%</p></div>
          <p className="font-mono text-sm font-bold text-loss">{stats.var99}%</p>
          <p className="text-[8px] text-muted-foreground">Max loss 99% confidence</p>
        </div>
        <div className="rounded-lg bg-warning/5 border border-warning/10 p-3">
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown className="h-3 w-3 text-warning" /><p className="text-[9px] uppercase tracking-wider text-warning font-bold">CVaR 95%</p></div>
          <p className="font-mono text-sm font-bold text-warning">{stats.cvar95}%</p>
          <p className="text-[8px] text-muted-foreground">Expected shortfall</p>
        </div>
        <div className="rounded-lg bg-warning/5 border border-warning/10 p-3">
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown className="h-3 w-3 text-warning" /><p className="text-[9px] uppercase tracking-wider text-warning font-bold">CVaR 99%</p></div>
          <p className="font-mono text-sm font-bold text-warning">{stats.cvar99}%</p>
          <p className="text-[8px] text-muted-foreground">Tail risk measure</p>
        </div>
      </div>

      {/* View mode tabs */}
      <div className="flex items-center justify-center gap-1">
        {(["original", "resample", "randomized", "all"] as ViewMode[]).map(m => (
          <button key={m} onClick={() => setViewMode(m)}
            className={`rounded-md px-4 py-1.5 text-[11px] font-medium border transition-all ${viewMode === m ? "bg-foreground text-background border-foreground" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}>
            {m === "all" ? `1-${NUM_VISIBLE_PATHS}` : m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      {/* Spaghetti Chart */}
      <div className="h-[420px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 15, left: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.4} />
            <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => fmtPrice(v)} width={70} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 10 }}
              formatter={(value: number, name: string) => {
                if (name === "real") return [fmtPrice(value), "Real"];
                return [fmtPrice(value), `Path ${parseInt(name.slice(1)) + 1}`];
              }}
            />

            {/* Individual simulation paths — the spaghetti */}
            {visiblePrefixes.flatMap(prefix =>
              Array.from({ length: NUM_VISIBLE_PATHS }, (_, i) => (
                <Line key={`${prefix}${i}`} type="monotone" dataKey={`${prefix}${i}`}
                  stroke={PATH_COLORS[i % PATH_COLORS.length]} strokeWidth={0.8}
                  dot={false} strokeOpacity={0.55} isAnimationActive={false} />
              ))
            )}

            {/* Bold "Real" path on top */}
            <Line type="monotone" dataKey="real" stroke="hsl(220, 90%, 56%)" strokeWidth={3}
              dot={false} isAnimationActive={false} name="Real" />

            <ReferenceLine y={currentPrice} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeOpacity={0.4} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Drawdown stats — like reference image */}
      <div className="border-t border-border pt-3">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-2">Original Simulation</p>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Best Drawdown:</span><span className="text-foreground">{fmtPrice(stats.origDD.best)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Worst Drawdown:</span><span className="text-loss">{fmtPrice(stats.origDD.worst)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Average Drawdown:</span><span className="text-foreground">{fmtPrice(stats.origDD.avg)}</span></div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-bold text-foreground uppercase tracking-wider mb-2">Resample Simulation</p>
            <div className="space-y-1 font-mono text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">Best Drawdown:</span><span className="text-foreground">{fmtPrice(stats.resDD.best)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Worst Drawdown:</span><span className="text-loss">{fmtPrice(stats.resDD.worst)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Average Drawdown:</span><span className="text-foreground">{fmtPrice(stats.resDD.avg)}</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* Return Distribution Histogram */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Return Distribution</span>
        </div>
        <div className="h-20 flex items-end gap-[1px]">
          {stats.histogram.map((bin, i) => {
            const maxPct = Math.max(...stats.histogram.map(b => b.pct));
            const h = maxPct > 0 ? (bin.pct / maxPct) * 100 : 0;
            return (
              <div key={i} className="flex-1 rounded-t-sm transition-all"
                style={{ height: `${h}%`, backgroundColor: bin.isNeg ? "hsl(var(--loss))" : "hsl(var(--gain))", opacity: 0.4 + (bin.pct / maxPct) * 0.6 }}
                title={`${bin.bin.toFixed(1)}%: ${bin.count} paths (${bin.pct.toFixed(1)}%)`} />
            );
          })}
        </div>
        <div className="flex justify-between text-[8px] text-muted-foreground font-mono mt-1">
          <span>{stats.histogram[0]?.bin.toFixed(0)}%</span>
          <span>0%</span>
          <span>{stats.histogram[stats.histogram.length - 1]?.bin.toFixed(0)}%</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="inline-block h-[3px] w-4 rounded" style={{ backgroundColor: "hsl(220, 90%, 56%)" }} /> Real</span>
        {PATH_COLORS.slice(0, 10).map((c, i) => (
          <span key={i} className="flex items-center gap-1"><span className="inline-block h-[2px] w-3 rounded" style={{ backgroundColor: c }} /> {i + 1}</span>
        ))}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="rounded-lg bg-surface-2 p-2.5 text-center">
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`mt-0.5 font-mono text-sm font-bold ${color || "text-foreground"}`}>{value}</p>
  </div>
);

export default MonteCarloChart;
