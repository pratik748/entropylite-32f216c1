import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ForexEntry {
  currency: string;
  change24h: number;
  isStressed?: boolean;
}

interface Props {
  data: ForexEntry[];
}

const ForexVolChart = ({ data }: Props) => {
  if (data.length === 0) return null;

  const chartData = data.map(f => ({
    name: f.currency,
    change: f.change24h,
    fill: f.change24h >= 0 ? "hsl(var(--gain))" : "hsl(var(--loss))",
    stressed: f.isStressed,
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal={false} />
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v.toFixed(1)}%`} />
          <Tooltip
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
            formatter={(v: number) => [`${v.toFixed(3)}%`, "24h Change"]}
          />
          <Bar dataKey="change" radius={[3, 3, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} fillOpacity={entry.stressed ? 1 : 0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ForexVolChart;
