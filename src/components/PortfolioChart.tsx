import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface PortfolioChartProps {
  stocks: PortfolioStock[];
}

const COLORS = [
  "hsl(175, 80%, 50%)",
  "hsl(145, 70%, 50%)",
  "hsl(38, 92%, 55%)",
  "hsl(210, 80%, 60%)",
  "hsl(0, 72%, 55%)",
  "hsl(280, 60%, 55%)",
  "hsl(60, 70%, 50%)",
  "hsl(320, 60%, 55%)",
];

const PortfolioChart = ({ stocks }: PortfolioChartProps) => {
  const data = stocks.map((s) => ({
    name: s.ticker,
    value: (s.analysis?.currentPrice ?? s.buyPrice) * s.quantity,
  }));

  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-slide-up">
      <h3 className="mb-4 text-sm font-semibold text-foreground">Allocation</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              dataKey="value"
              stroke="hsl(220, 18%, 10%)"
              strokeWidth={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "hsl(220, 18%, 10%)",
                border: "1px solid hsl(220, 16%, 18%)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value: number) => [
                `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })} (${((value / total) * 100).toFixed(1)}%)`,
                "Value",
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 justify-center">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {d.name}
          </div>
        ))}
      </div>
    </div>
  );
};

export default PortfolioChart;
