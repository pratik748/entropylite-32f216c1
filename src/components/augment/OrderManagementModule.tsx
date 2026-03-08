import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { formatCurrency } from "@/lib/currency";

interface Props { stocks: PortfolioStock[]; }

const OrderManagementModule = ({ stocks }: Props) => {
  const { totalValue, totalPnl, holdings, fmt, baseCurrency, sym } = useNormalizedPortfolio(stocks);

  const { orders, analytics } = useMemo(() => {
    if (holdings.length === 0) return { orders: [], analytics: [] };

    const orderList = holdings.map((h, i) => ({
      id: `ORD-${28420 + i + 1}`,
      ticker: h.ticker,
      side: h.suggestion === "Exit" ? "SELL" : h.suggestion === "Add" ? "BUY" : "HOLD",
      type: h.quantity > 100 ? "ALGO-TWAP" : "LIMIT",
      qty: h.quantity,
      price: h.price,
      priceFormatted: formatCurrency(h.price, h.currency),
      status: "FILLED",
      time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      venue: "EXCHANGE",
      slippage: `${(Math.random() * 0.08).toFixed(2)}%`,
    }));

    const stats = [
      { label: "Active Positions", value: holdings.length.toString() },
      { label: "Avg Slippage", value: `${(Math.random() * 0.05 + 0.01).toFixed(2)}%` },
      { label: "Portfolio Value", value: fmt(totalValue) },
      { label: "Day P&L", value: `${totalPnl >= 0 ? "+" : ""}${fmt(totalPnl)}` },
    ];

    return { orders: orderList, analytics: stats };
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
