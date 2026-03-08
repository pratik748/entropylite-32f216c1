import { Target, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from "recharts";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol, formatCurrency } from "@/lib/currency";

interface SimulationProps {
  currentPrice: number;
  bullRange: [number, number];
  neutralRange: [number, number];
  bearRange: [number, number];
  currency?: string;
}

const SimulationTable = ({ currentPrice, bullRange, neutralRange, bearRange, currency }: SimulationProps) => {
  const { baseCurrency, convertToBase } = useFX();
  const sym = getCurrencySymbol(baseCurrency);

  // Convert prices to base currency
  const srcCcy = currency || "USD";
  const cp = convertToBase(currentPrice, srcCcy);
  const bull: [number, number] = [convertToBase(bullRange[0], srcCcy), convertToBase(bullRange[1], srcCcy)];
  const neutral: [number, number] = [convertToBase(neutralRange[0], srcCcy), convertToBase(neutralRange[1], srcCcy)];
  const bear: [number, number] = [convertToBase(bearRange[0], srcCcy), convertToBase(bearRange[1], srcCcy)];

  const fmt = (n: number) => formatCurrency(n, baseCurrency);

  const chartData = [
    { name: "Bear Low", value: bear[0], color: "hsl(0, 72%, 55%)" },
    { name: "Bear High", value: bear[1], color: "hsl(0, 72%, 55%)" },
    { name: "Neutral Low", value: neutral[0], color: "hsl(38, 92%, 55%)" },
    { name: "Neutral High", value: neutral[1], color: "hsl(38, 92%, 55%)" },
    { name: "Bull Low", value: bull[0], color: "hsl(145, 70%, 50%)" },
    { name: "Bull High", value: bull[1], color: "hsl(145, 70%, 50%)" },
  ];

  const fmtAxis = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${sym}${(v / 1e6).toFixed(1)}M`;
    if (abs >= 1e3) return `${sym}${(v / 1e3).toFixed(0)}k`;
    return `${sym}${v.toFixed(0)}`;
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 animate-slide-up">
      <div className="mb-5 flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground">3-Month Simulation</h2>
      </div>

      <div className="h-48 w-full mb-5">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={fmtAxis} width={55} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }} formatter={(value: number) => [fmt(value), "Price"]} />
            <ReferenceLine y={cp} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Current", fill: "hsl(var(--muted-foreground))", fontSize: 10, position: "right" }} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} fillOpacity={0.8} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3">
        <ScenarioRow label="Bull Case" icon={<TrendingUp className="h-4 w-4 text-gain" />} range={bull} currentPrice={cp} colorClass="text-gain" bgClass="bg-gain/5 border-gain/15" fmt={fmt} />
        <ScenarioRow label="Neutral Case" icon={<Minus className="h-4 w-4 text-warning" />} range={neutral} currentPrice={cp} colorClass="text-warning" bgClass="bg-warning/5 border-warning/15" fmt={fmt} />
        <ScenarioRow label="Bear Case" icon={<TrendingDown className="h-4 w-4 text-loss" />} range={bear} currentPrice={cp} colorClass="text-loss" bgClass="bg-loss/5 border-loss/15" fmt={fmt} />
      </div>

      <div className="mt-4 rounded-lg bg-surface-2 p-3 text-center">
        <p className="text-xs text-muted-foreground">Current Price</p>
        <p className="font-mono text-lg font-bold text-foreground">{fmt(cp)}</p>
      </div>
    </div>
  );
};

const ScenarioRow = ({ label, icon, range, currentPrice, colorClass, bgClass, fmt }: {
  label: string; icon: React.ReactNode; range: [number, number]; currentPrice: number; colorClass: string; bgClass: string; fmt: (n: number) => string;
}) => {
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
