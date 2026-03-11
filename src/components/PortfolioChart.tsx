import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";

interface PortfolioChartProps {
  stocks: PortfolioStock[];
}

const COLORS = [
  "hsl(0, 0%, 92%)",
  "hsl(0, 0%, 68%)",
  "hsl(0, 0%, 48%)",
  "hsl(0, 0%, 32%)",
  "hsl(0, 0%, 22%)",
  "hsl(0, 0%, 78%)",
  "hsl(0, 0%, 58%)",
  "hsl(0, 0%, 38%)",
];

const PortfolioChart = ({ stocks }: PortfolioChartProps) => {
  const { baseCurrency } = useFX();
  const sym = getCurrencySymbol(baseCurrency);

  const data = stocks
    .map((s) => ({
      name: s.ticker.replace(".NS", "").replace(".BO", ""),
      value: (s.analysis?.currentPrice ?? s.buyPrice) * s.quantity,
    }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) return null;

  return (
    <div className="rounded-sm border border-border bg-card p-3 sm:p-4 animate-slide-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          Allocation
        </h3>
        <span className="font-mono text-[9px] text-muted-foreground/60">
          {data.length} assets
        </span>
      </div>

      {/* Chart + Legend side by side on desktop */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Donut */}
        <div className="h-40 w-40 sm:h-44 sm:w-44 flex-shrink-0 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={65}
                dataKey="value"
                stroke="hsl(0, 0%, 3%)"
                strokeWidth={1}
                paddingAngle={1}
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(0, 0%, 5%)",
                  border: "1px solid hsl(0, 0%, 14%)",
                  borderRadius: 2,
                  fontSize: 10,
                  fontFamily: "JetBrains Mono, monospace",
                  padding: "6px 10px",
                }}
                itemStyle={{ color: "hsl(0, 0%, 85%)" }}
                formatter={(value: number) => [
                  `${sym}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })} · ${((value / total) * 100).toFixed(1)}%`,
                  "",
                ]}
                separator=""
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-[9px] text-muted-foreground/50 uppercase">Total</span>
            <span className="font-mono text-xs font-semibold text-foreground">
              {sym}{total >= 1e6 ? `${(total / 1e6).toFixed(1)}M` : total >= 1e3 ? `${(total / 1e3).toFixed(0)}K` : total.toFixed(0)}
            </span>
          </div>
        </div>

        {/* Breakdown table */}
        <div className="flex-1 w-full min-w-0">
          <div className="space-y-0.5">
            {data.map((d, i) => {
              const pct = ((d.value / total) * 100).toFixed(1);
              return (
                <div
                  key={d.name}
                  className="flex items-center gap-2 px-2 py-1 hover:bg-surface-2 transition-colors group"
                >
                  <span
                    className="h-2 w-2 flex-shrink-0"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="font-mono text-[10px] text-foreground font-medium flex-shrink-0 w-12 truncate">
                    {d.name}
                  </span>
                  {/* Weight bar */}
                  <div className="flex-1 h-1 bg-surface-3 rounded-none overflow-hidden min-w-[40px]">
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                        opacity: 0.7,
                      }}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-muted-foreground tabular-nums w-10 text-right flex-shrink-0">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PortfolioChart;
