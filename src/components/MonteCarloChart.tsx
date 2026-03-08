import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
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
const NUM_DAYS = 90;
const NUM_SAMPLE_PATHS = 15;

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

// Distinct colors for sample paths (matching reference image style)
const PATH_COLORS = [
  "hsl(30, 90%, 55%)", "hsl(180, 70%, 50%)", "hsl(60, 80%, 50%)", "hsl(320, 70%, 55%)",
  "hsl(145, 70%, 45%)", "hsl(0, 70%, 55%)", "hsl(210, 80%, 55%)", "hsl(270, 60%, 55%)",
  "hsl(90, 70%, 50%)", "hsl(45, 85%, 55%)", "hsl(200, 75%, 50%)", "hsl(340, 65%, 55%)",
  "hsl(120, 60%, 45%)", "hsl(15, 80%, 55%)", "hsl(240, 60%, 60%)",
];

const MonteCarloChart = ({ currentPrice, bullRange, bearRange, ticker, currency }: MonteCarloChartProps) => {
  const { baseCurrency, convertToBase } = useFX();
  const assetCurrency = currency || "USD";
  const sym = getCurrencySymbol(baseCurrency);
  const fmt = (v: number) => formatCompact(v, baseCurrency);

  // Convert price to base currency for display
  const basePrice = convertToBase(currentPrice, assetCurrency);

  const { chartData, stats } = useMemo(() => {
    const upperBound = bullRange[1];
    const lowerBound = bearRange[0];
    const annualVol = Math.max(0.05, (upperBound - lowerBound) / (2 * currentPrice));
    const dailyVol = annualVol / Math.sqrt(252);
    const dailyDrift = 0;

    const dayPrices: number[][] = Array.from({ length: NUM_DAYS + 1 }, () => []);
    const samplePaths: number[][] = [];
    const finalPrices: number[] = [];
    let maxDrawdownCount = 0;
    const allDrawdowns: number[] = [];

    for (let s = 0; s < NUM_SIMULATIONS; s++) {
      let price = currentPrice;
      let peak = price;
      let maxDD = 0;
      const isSample = s < NUM_SAMPLE_PATHS;
      if (isSample) samplePaths.push([currentPrice]);

      dayPrices[0].push(currentPrice);

      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        price = price * Math.exp((dailyDrift - 0.5 * dailyVol * dailyVol) + dailyVol * z);
        price = Math.max(price, 0.01);

        if (isSample) samplePaths[s].push(price);
        if (d % 3 === 0 || d === NUM_DAYS) dayPrices[d].push(price);

        if (price > peak) peak = price;
        const dd = (peak - price) / peak;
        if (dd > maxDD) maxDD = dd;
      }

      finalPrices.push(price);
      allDrawdowns.push(maxDD);
      if (maxDD > 0.2) maxDrawdownCount++;
    }

    // Build chart data
    const data = [];
    for (let d = 0; d <= NUM_DAYS; d++) {
      if (d > 0 && d % 3 !== 0 && d !== NUM_DAYS) continue;
      const prices = dayPrices[d];
      if (prices.length === 0) continue;
      const point: any = {
        day: d,
        p1: percentile(prices, 1),
        p5: percentile(prices, 5),
        p25: percentile(prices, 25),
        p50: percentile(prices, 50),
        p75: percentile(prices, 75),
        p95: percentile(prices, 95),
        p99: percentile(prices, 99),
      };
      // Add all sample paths
      for (let i = 0; i < NUM_SAMPLE_PATHS; i++) {
        point[`s${i}`] = samplePaths[i]?.[d] ?? null;
      }
      data.push(point);
    }

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
    const maxDrawdownProb = (maxDrawdownCount / NUM_SIMULATIONS) * 100;

    // Drawdown stats (matching reference image)
    const bestDrawdown = sortedDrawdowns[0] * currentPrice;
    const worstDrawdown = sortedDrawdowns[sortedDrawdowns.length - 1] * currentPrice;
    const avgDrawdown = (allDrawdowns.reduce((s, d) => s + d, 0) / allDrawdowns.length) * currentPrice;

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
        maxDrawdownProb: maxDrawdownProb.toFixed(1),
        sharpe: stdDev > 0 ? (meanReturn / stdDev).toFixed(2) : "0",
        bestDrawdown,
        worstDrawdown,
        avgDrawdown,
        histogram,
      },
    };
  }, [currentPrice, bullRange, bearRange]);

  const fmtPrice = (v: number) => `${sym}${convertToBase(v, assetCurrency).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

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

      {/* Drawdown Stats (like reference image) */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-surface-2 p-3 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Best Drawdown</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-gain">{fmtPrice(stats.bestDrawdown)}</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Worst Drawdown</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-loss">{fmtPrice(stats.worstDrawdown)}</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3 text-center">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Average Drawdown</p>
          <p className="mt-0.5 font-mono text-sm font-bold text-foreground">{fmtPrice(stats.avgDrawdown)}</p>
        </div>
      </div>

      {/* Fan Chart with many colored paths */}
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 14%)" />
            <XAxis dataKey="day" tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0, 0%, 14%)" }} label={{ value: "Days", position: "insideBottom", offset: -2, fill: "hsl(0, 0%, 45%)", fontSize: 10 }} />
            <YAxis tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 10 }} axisLine={{ stroke: "hsl(0, 0%, 14%)" }} tickFormatter={(v) => fmtPrice(v)} width={60} />
            <Tooltip
              contentStyle={{ background: "hsl(0, 0%, 6%)", border: "1px solid hsl(0, 0%, 14%)", borderRadius: 6, fontSize: 11 }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { p1: "1st %ile", p5: "5th %ile", p25: "25th %ile", p50: "Median", p75: "75th %ile", p95: "95th %ile", p99: "99th %ile" };
                if (name.startsWith("s")) return [fmtPrice(value), `Path ${parseInt(name.slice(1)) + 1}`];
                return [fmtPrice(value), labels[name] || name];
              }}
            />
            <ReferenceLine y={currentPrice} stroke="hsl(210, 100%, 60%)" strokeWidth={2.5} strokeDasharray="none" label={{ value: "Real", fill: "hsl(210, 100%, 60%)", fontSize: 10, position: "right" }} />

            {/* Scenario zone bands */}
            <Area type="monotone" dataKey="p99" stroke="none" fill="hsl(145, 70%, 45%)" fillOpacity={0.04} />
            <Area type="monotone" dataKey="p95" stroke="none" fill="hsl(145, 70%, 45%)" fillOpacity={0.04} />
            <Area type="monotone" dataKey="p75" stroke="none" fill="hsl(0, 0%, 50%)" fillOpacity={0.04} />
            <Area type="monotone" dataKey="p25" stroke="none" fill="hsl(0, 0%, 50%)" fillOpacity={0.04} />
            <Area type="monotone" dataKey="p5" stroke="none" fill="hsl(0, 62%, 50%)" fillOpacity={0.04} />
            <Area type="monotone" dataKey="p1" stroke="none" fill="hsl(0, 62%, 50%)" fillOpacity={0.04} />

            {/* Percentile boundary lines */}
            <Line type="monotone" dataKey="p1" stroke="hsl(0, 62%, 40%)" strokeWidth={0.8} dot={false} strokeDasharray="2 2" />
            <Line type="monotone" dataKey="p5" stroke="hsl(0, 62%, 50%)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            <Line type="monotone" dataKey="p25" stroke="hsl(0, 0%, 35%)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="p50" stroke="hsl(0, 0%, 100%)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p75" stroke="hsl(0, 0%, 35%)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="p95" stroke="hsl(145, 70%, 45%)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            <Line type="monotone" dataKey="p99" stroke="hsl(145, 70%, 35%)" strokeWidth={0.8} dot={false} strokeDasharray="2 2" />

            {/* 15 colored sample paths (like reference image) */}
            {Array.from({ length: NUM_SAMPLE_PATHS }, (_, i) => (
              <Line key={i} type="monotone" dataKey={`s${i}`} stroke={PATH_COLORS[i]} strokeWidth={0.7} dot={false} opacity={0.5} connectNulls />
            ))}
          </AreaChart>
        </ResponsiveContainer>
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
                style={{ height: `${h}%`, backgroundColor: bin.isNeg ? "hsl(0, 62%, 50%)" : "hsl(145, 70%, 45%)", opacity: 0.4 + (bin.pct / maxPct) * 0.6 }}
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
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-primary inline-block" style={{ height: 3 }} /> Real Price</span>
        <span className="flex items-center gap-1"><span className="h-px w-4 bg-loss inline-block" /> Bear (1-5th)</span>
        <span className="flex items-center gap-1"><span className="h-px w-4 bg-foreground inline-block" style={{ height: 2 }} /> Median</span>
        <span className="flex items-center gap-1"><span className="h-px w-4 bg-gain inline-block" /> Bull (95-99th)</span>
        <span className="flex items-center gap-1"><span className="h-px w-4 inline-block" style={{ backgroundColor: PATH_COLORS[0] }} /> Sim Paths</span>
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
