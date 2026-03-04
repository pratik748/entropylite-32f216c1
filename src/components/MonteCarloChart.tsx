import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Dice5 } from "lucide-react";

interface MonteCarloChartProps {
  currentPrice: number;
  bullRange: [number, number];
  bearRange: [number, number];
  ticker: string;
}

const NUM_SIMULATIONS = 50;
const NUM_DAYS = 90;

const MonteCarloChart = ({ currentPrice, bullRange, bearRange, ticker }: MonteCarloChartProps) => {
  const simulations = useMemo(() => {
    const upperBound = bullRange[1];
    const lowerBound = bearRange[0];
    const annualVol = (upperBound - lowerBound) / (2 * currentPrice);
    const dailyVol = annualVol / Math.sqrt(252) * Math.sqrt(252 / NUM_DAYS);
    const dailyDrift = 0;

    const paths: number[][] = [];
    for (let s = 0; s < NUM_SIMULATIONS; s++) {
      const path = [currentPrice];
      for (let d = 1; d <= NUM_DAYS; d++) {
        const z = gaussianRandom();
        const prevPrice = path[d - 1];
        const newPrice = prevPrice * Math.exp(dailyDrift - 0.5 * dailyVol * dailyVol + dailyVol * z);
        path.push(Math.max(newPrice, 0.01));
      }
      paths.push(path);
    }
    return paths;
  }, [currentPrice, bullRange, bearRange]);

  const chartData = useMemo(() => {
    const data = [];
    for (let d = 0; d <= NUM_DAYS; d++) {
      const row: any = { day: d };
      const prices = simulations.map(p => p[d]);
      row.p5 = percentile(prices, 5);
      row.p25 = percentile(prices, 25);
      row.p50 = percentile(prices, 50);
      row.p75 = percentile(prices, 75);
      row.p95 = percentile(prices, 95);
      // Add 5 sample paths
      for (let s = 0; s < Math.min(5, simulations.length); s++) {
        row[`s${s}`] = simulations[s][d];
      }
      data.push(row);
    }
    return data;
  }, [simulations]);

  const finalPrices = simulations.map(p => p[NUM_DAYS]);
  const profitProb = (finalPrices.filter(p => p > currentPrice).length / finalPrices.length * 100).toFixed(0);
  const medianFinal = percentile(finalPrices, 50);
  const expectedReturn = ((medianFinal - currentPrice) / currentPrice * 100).toFixed(1);

  return (
    <div className="glass-card rounded-2xl p-6 animate-slide-up">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dice5 className="h-5 w-5 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">Monte Carlo Simulation</h2>
          <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {NUM_SIMULATIONS} paths · {NUM_DAYS}d
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-surface-2 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Profit Probability</p>
          <p className={`mt-1 font-mono text-lg font-bold ${Number(profitProb) >= 50 ? "text-gain" : "text-loss"}`}>{profitProb}%</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Median Target</p>
          <p className="mt-1 font-mono text-lg font-bold text-foreground">₹{medianFinal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="rounded-lg bg-surface-2 p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Expected Return</p>
          <p className={`mt-1 font-mono text-lg font-bold ${Number(expectedReturn) >= 0 ? "text-gain" : "text-loss"}`}>{Number(expectedReturn) >= 0 ? "+" : ""}{expectedReturn}%</p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 14%)" />
            <XAxis
              dataKey="day"
              tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 10 }}
              axisLine={{ stroke: "hsl(0, 0%, 14%)" }}
              label={{ value: "Days", position: "insideBottom", offset: -2, fill: "hsl(0, 0%, 45%)", fontSize: 10 }}
            />
            <YAxis
              tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 10 }}
              axisLine={{ stroke: "hsl(0, 0%, 14%)" }}
              tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(0, 0%, 6%)",
                border: "1px solid hsl(0, 0%, 14%)",
                borderRadius: 6,
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = { p5: "5th %ile", p25: "25th %ile", p50: "Median", p75: "75th %ile", p95: "95th %ile" };
                return [`₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`, labels[name] || name];
              }}
            />
            <ReferenceLine y={currentPrice} stroke="hsl(0, 0%, 40%)" strokeDasharray="4 4" />
            {/* Confidence bands */}
            <Line type="monotone" dataKey="p5" stroke="hsl(0, 62%, 50%)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            <Line type="monotone" dataKey="p25" stroke="hsl(0, 0%, 35%)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="p50" stroke="hsl(0, 0%, 100%)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="p75" stroke="hsl(0, 0%, 35%)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="p95" stroke="hsl(145, 70%, 45%)" strokeWidth={1} dot={false} strokeDasharray="3 3" />
            {/* Sample paths */}
            {[0, 1, 2, 3, 4].map(i => (
              <Line key={i} type="monotone" dataKey={`s${i}`} stroke={`hsl(0, 0%, ${20 + i * 5}%)`} strokeWidth={0.5} dot={false} opacity={0.4} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="h-px w-4 bg-loss inline-block" /> 5th %ile</span>
        <span className="flex items-center gap-1"><span className="h-px w-4 bg-foreground inline-block" /> Median</span>
        <span className="flex items-center gap-1"><span className="h-px w-4 bg-gain inline-block" /> 95th %ile</span>
      </div>
    </div>
  );
};

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

export default MonteCarloChart;
