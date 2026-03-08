import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";

interface Props {
  stocks: PortfolioStock[];
}

const PnLWaterfall = ({ stocks }: Props) => {
  const { baseCurrency, convertToBase } = useFX();
  const sym = getCurrencySymbol(baseCurrency);

  const analyzed = stocks.filter(s => s.analysis);
  if (analyzed.length === 0) return null;

  const data = analyzed.map(s => {
    const ccy = s.analysis!.currency || "USD";
    const pnl = convertToBase((s.analysis!.currentPrice - s.buyPrice) * s.quantity, ccy);
    return {
      name: s.ticker.replace(".NS", "").replace(".BO", ""),
      pnl: Math.round(pnl),
      fill: pnl >= 0 ? "hsl(var(--gain))" : "hsl(var(--loss))",
    };
  }).sort((a, b) => b.pnl - a.pnl);

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
