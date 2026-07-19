import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props {
  stocks: PortfolioStock[];
}

const PnLWaterfall = ({ stocks }: Props) => {
  // Shared valuation spine — P&L figures here match the blotter exactly.
  const { sym, holdings } = useNormalizedPortfolio(stocks);

  const priced = holdings.filter(h => h.priceBasis === "live");
  if (priced.length === 0) return null;

  const data = priced.map(h => ({
    name: h.ticker,
    pnl: Math.round(h.pnl),
    fill: h.pnl >= 0 ? "hsl(var(--gain))" : "hsl(var(--loss))",
  })).sort((a, b) => b.pnl - a.pnl);

  const totalPnl = data.reduce((s, d) => s + d.pnl, 0);
  data.push({ name: "TOTAL", pnl: totalPnl, fill: totalPnl >= 0 ? "hsl(var(--primary))" : "hsl(var(--loss))" });

  return (
    <div className="rounded-xl border border-border bg-card p-5 animate-slide-up">
      <h3 className="mb-4 text-sm font-semibold text-foreground uppercase tracking-wider">P&L Contribution</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} horizontal />
            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${sym}${v}`} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
              formatter={(v: number) => [`${sym}${v.toLocaleString()}`, "P&L"]}
            />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} fillOpacity={entry.name === "TOTAL" ? 1 : 0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default PnLWaterfall;
