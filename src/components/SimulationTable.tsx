import { Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

interface SimulationProps {
  currentPrice: number;
  bullRange: [number, number];
  neutralRange: [number, number];
  bearRange: [number, number];
}

const SimulationTable = ({ currentPrice, bullRange, neutralRange, bearRange }: SimulationProps) => {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;

  const chartData = [
    { name: "Bear Low", value: bearRange[0], color: "hsl(0, 72%, 55%)" },
    { name: "Bear High", value: bearRange[1], color: "hsl(0, 72%, 55%)" },
    { name: "Neutral Low", value: neutralRange[0], color: "hsl(38, 92%, 55%)" },
    { name: "Neutral High", value: neutralRange[1], color: "hsl(38, 92%, 55%)" },
    { name: "Bull Low", value: bullRange[0], color: "hsl(145, 70%, 50%)" },
    { name: "Bull High", value: bullRange[1], color: "hsl(145, 70%, 50%)" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">3-Month Simulation</h2>
      </div>

      <div className="h-48 w-full mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(0, 0%, 14%)" />
            <XAxis
              dataKey="name"
              tick={{ fill: "hsl(0, 0%, 45%)", fontSize: 10 }}
              axisLine={{ stroke: "hsl(0, 0%, 14%)" }}
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
                fontSize: 12,
              }}
              formatter={(value: number) => [fmt(value), "Price"]}
            />
            <ReferenceLine
              y={currentPrice}
              stroke="hsl(0, 0%, 60%)"
              strokeDasharray="4 4"
              label={{ value: "Current", fill: "hsl(0, 0%, 60%)", fontSize: 10, position: "right" }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <ScenarioRow
          label="Bull Case"
          icon={<TrendingUp className="h-4 w-4 text-gain" />}
          range={bullRange}
          currentPrice={currentPrice}
          colorClass="text-gain"
          bgClass="bg-gain/5 border-gain/15"
        />
        <ScenarioRow
          label="Neutral Case"
          icon={<Minus className="h-4 w-4 text-warning" />}
          range={neutralRange}
          currentPrice={currentPrice}
          colorClass="text-warning"
          bgClass="bg-warning/5 border-warning/15"
        />
        <ScenarioRow
          label="Bear Case"
          icon={<TrendingDown className="h-4 w-4 text-loss" />}
          range={bearRange}
          currentPrice={currentPrice}
          colorClass="text-loss"
          bgClass="bg-loss/5 border-loss/15"
        />
      </div>

      <div className="mt-4 rounded-lg bg-surface-2 p-3 text-center">
        <p className="text-xs text-muted-foreground">Current Price</p>
        <p className="font-mono text-lg font-bold text-foreground">{fmt(currentPrice)}</p>
      </div>
    </div>
  );
};

const ScenarioRow = ({
  label,
  icon,
  range,
  currentPrice,
  colorClass,
  bgClass,
}: {
  label: string;
  icon: React.ReactNode;
  range: [number, number];
  currentPrice: number;
  colorClass: string;
  bgClass: string;
}) => {
  const fmt = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const pctLow = (((range[0] - currentPrice) / currentPrice) * 100).toFixed(1);
  const pctHigh = (((range[1] - currentPrice) / currentPrice) * 100).toFixed(1);

  return (
    <div className={`rounded-lg border ${bgClass} p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="text-right">
          <p className={`font-mono text-sm font-semibold ${colorClass}`}>
            {fmt(range[0])} – {fmt(range[1])}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {Number(pctLow) >= 0 ? "+" : ""}{pctLow}% to {Number(pctHigh) >= 0 ? "+" : ""}{pctHigh}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default SimulationTable;
