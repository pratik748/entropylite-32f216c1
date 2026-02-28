import { useState } from "react";

const ORDERS = [
  { id: "ORD-28421", ticker: "RELIANCE", side: "BUY", type: "LIMIT", qty: 200, price: 2485, status: "FILLED", time: "09:32:18", venue: "NSE", slippage: "0.02%" },
  { id: "ORD-28422", ticker: "TCS", side: "SELL", type: "MARKET", qty: 50, price: 3820, status: "FILLED", time: "10:15:42", venue: "NSE", slippage: "0.05%" },
  { id: "ORD-28423", ticker: "HDFC BANK", side: "BUY", type: "LIMIT", qty: 150, price: 1665, status: "PARTIAL", time: "11:02:33", venue: "BSE", slippage: "0.01%" },
  { id: "ORD-28424", ticker: "INFY", side: "BUY", type: "ALGO-TWAP", qty: 500, price: 1542, status: "WORKING", time: "11:45:00", venue: "NSE", slippage: "--" },
  { id: "ORD-28425", ticker: "ICICI BANK", side: "SELL", type: "STOP", qty: 100, price: 1180, status: "PENDING", time: "12:00:00", venue: "NSE", slippage: "--" },
  { id: "ORD-28426", ticker: "BAJFINANCE", side: "BUY", type: "LIMIT", qty: 30, price: 7250, status: "REJECTED", time: "09:28:11", venue: "NSE", slippage: "--" },
];

const ANALYTICS = [
  { label: "Orders Today", value: "142" },
  { label: "Fill Rate", value: "94.2%" },
  { label: "Avg Slippage", value: "0.03%" },
  { label: "VWAP vs Benchmark", value: "+0.8bps" },
];

const statusColor: Record<string, string> = {
  FILLED: "text-gain",
  PARTIAL: "text-warning",
  WORKING: "text-info",
  PENDING: "text-muted-foreground",
  REJECTED: "text-loss",
};

const OrderManagementModule = () => (
  <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-4">
      {ANALYTICS.map(a => (
        <div key={a.label} className="rounded-xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground">{a.label}</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{a.value}</p>
        </div>
      ))}
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Order Book — Live</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {["Order ID", "Ticker", "Side", "Type", "Qty", "Price", "Status", "Time", "Venue", "Slippage"].map(h => (
                <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ORDERS.map(o => (
              <tr key={o.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{o.id}</td>
                <td className="px-2 py-2 font-mono text-foreground font-medium">{o.ticker}</td>
                <td className={`px-2 py-2 font-mono text-xs font-bold ${o.side === "BUY" ? "text-gain" : "text-loss"}`}>{o.side}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{o.type}</td>
                <td className="px-2 py-2 font-mono text-foreground">{o.qty}</td>
                <td className="px-2 py-2 font-mono text-foreground">₹{o.price.toLocaleString("en-IN")}</td>
                <td className={`px-2 py-2 font-mono text-xs font-bold ${statusColor[o.status] || ""}`}>{o.status}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{o.time}</td>
                <td className="px-2 py-2 text-xs text-muted-foreground">{o.venue}</td>
                <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{o.slippage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    <div className="rounded-xl border border-border bg-card p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Smart Order Routing</h3>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { venue: "NSE", fillRate: "96.1%", latency: "2.1ms", volume: "₹12.4 Cr" },
          { venue: "BSE", fillRate: "89.3%", latency: "3.8ms", volume: "₹2.1 Cr" },
          { venue: "Dark Pool", fillRate: "78.5%", latency: "5.2ms", volume: "₹0.8 Cr" },
        ].map(v => (
          <div key={v.venue} className="rounded-lg bg-surface-2 p-4">
            <p className="font-mono text-sm font-bold text-foreground">{v.venue}</p>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex justify-between"><span>Fill Rate</span><span className="font-mono text-foreground">{v.fillRate}</span></div>
              <div className="flex justify-between"><span>Latency</span><span className="font-mono text-foreground">{v.latency}</span></div>
              <div className="flex justify-between"><span>Volume</span><span className="font-mono text-foreground">{v.volume}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default OrderManagementModule;
