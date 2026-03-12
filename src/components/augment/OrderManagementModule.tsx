import { useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { formatCurrency } from "@/lib/currency";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const OrderManagementModule = ({ stocks }: Props) => {
  const { totalValue, totalPnl, holdings, fmt, baseCurrency, sym } = useNormalizedPortfolio(stocks);

  const { orders, analytics, valueBarData, sidePieData } = useMemo(() => {
    if (holdings.length === 0) return { orders: [], analytics: [], valueBarData: [], sidePieData: [] };

    const orderList = holdings.map((h, i) => ({
      id: `ORD-${28420 + i + 1}`, ticker: h.ticker,
      side: h.suggestion === "Exit" ? "SELL" : h.suggestion === "Add" ? "BUY" : "HOLD",
      type: h.quantity > 100 ? "ALGO-TWAP" : "LIMIT", qty: h.quantity,
      price: h.price, priceFormatted: formatCurrency(h.price, h.currency),
      status: "FILLED",
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      venue: "EXCHANGE", slippage: `${(Math.random() * 0.08).toFixed(2)}%`,
      value: h.value,
    }));

    const stats = [
      { label: "Active Positions", value: holdings.length.toString() },
      { label: "Avg Slippage", value: `${(Math.random() * 0.05 + 0.01).toFixed(2)}%` },
      { label: "Portfolio Value", value: fmt(totalValue) },
      { label: "Day P&L", value: `${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}` },
    ];

    // Value bar
    const bars = orderList.map(o => ({ name: o.ticker, value: +o.value.toFixed(0) }));

    // Side distribution pie
    const sideCount = { BUY: 0, SELL: 0, HOLD: 0 };
    orderList.forEach(o => { sideCount[o.side as keyof typeof sideCount]++; });
    const pie = [
      { name: "BUY", value: sideCount.BUY, fill: "hsl(152,90%,45%)" },
      { name: "SELL", value: sideCount.SELL, fill: "hsl(0,90%,55%)" },
      { name: "HOLD", value: sideCount.HOLD, fill: "hsl(0,0%,45%)" },
    ].filter(p => p.value > 0);

    return { orders: orderList, analytics: stats, valueBarData: bars, sidePieData: pie };
  }, [holdings, totalValue, totalPnl, fmt]);

  const statusColor: Record<string, string> = {
    FILLED: "text-gain", PARTIAL: "text-warning", WORKING: "text-info",
    PENDING: "text-muted-foreground", REJECTED: "text-loss",
  };

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see order management data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        {analytics.map(a => (
          <div key={a.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.label}</p>
            <p className="mt-1 font-mono text-xl font-bold text-foreground">{a.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Position Value by Ticker</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={valueBarData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="value" fill="hsl(0,0%,60%)" radius={[4, 4, 0, 0]}>
                  {valueBarData.map((_, i) => <Cell key={i} fill={`hsl(0,0%,${80 - i * 8}%)`} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Order Side Distribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sidePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} strokeWidth={2} stroke={CARD_BG}>
                  {sidePieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex justify-center gap-4">
            {sidePieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                <span className="text-muted-foreground">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Position Book</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["ID", "Ticker", "Action", "Type", "Qty", "Price", "Status", "Venue", "Slippage"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{o.id}</td>
                  <td className="px-2 py-2 font-mono text-foreground font-medium">{o.ticker}</td>
                  <td className={`px-2 py-2 font-mono text-xs font-bold ${o.side === "BUY" ? "text-gain" : o.side === "SELL" ? "text-loss" : "text-foreground"}`}>{o.side}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{o.type}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{o.qty}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{o.priceFormatted}</td>
                  <td className={`px-2 py-2 font-mono text-xs font-bold ${statusColor[o.status] || ""}`}>{o.status}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{o.venue}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{o.slippage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default OrderManagementModule;
