import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const OrderManagementModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { orders, analytics } = useMemo(() => {
    if (analyzed.length === 0) return { orders: [], analytics: [] };

    const orderList = analyzed.map((s, i) => {
      const price = s.analysis.currentPrice || s.buyPrice;
      const pnl = (price - s.buyPrice) * s.quantity;
      const suggestion = s.analysis.suggestion || "Hold";
      return {
        id: `ORD-${28420 + i + 1}`,
        ticker: s.ticker.replace(".NS", "").replace(".BO", ""),
        side: suggestion === "Exit" ? "SELL" : suggestion === "Add" ? "BUY" : "HOLD",
        type: s.quantity > 100 ? "ALGO-TWAP" : "LIMIT",
        qty: s.quantity,
        price,
        status: "FILLED",
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        venue: "NSE",
        slippage: `${(Math.random() * 0.08).toFixed(2)}%`,
      };
    });

    const stats = [
      { label: "Active Positions", value: analyzed.length.toString() },
      { label: "Avg Slippage", value: `${(Math.random() * 0.05 + 0.01).toFixed(2)}%` },
      { label: "Portfolio Value", value: `₹${(analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0) / 100000).toFixed(1)} L` },
      { label: "Day P&L", value: (() => {
        const pnl = analyzed.reduce((s, st) => s + ((st.analysis.currentPrice || st.buyPrice) - st.buyPrice) * st.quantity, 0);
        return `${pnl >= 0 ? "+" : ""}₹${(pnl / 100000).toFixed(1)} L`;
      })() },
    ];

    return { orders: orderList, analytics: stats };
  }, [analyzed]);

  const statusColor: Record<string, string> = {
    FILLED: "text-gain", PARTIAL: "text-warning", WORKING: "text-info",
    PENDING: "text-muted-foreground", REJECTED: "text-loss",
  };

  if (analyzed.length === 0) {
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
                  <td className="px-2 py-2 font-mono text-foreground">₹{o.price.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
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
