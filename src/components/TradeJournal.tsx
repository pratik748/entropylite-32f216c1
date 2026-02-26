import { useState } from "react";
import { BookOpen, Plus, Trash2, TrendingUp, TrendingDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/useLocalStorage";

export interface TradeEntry {
  id: string;
  ticker: string;
  type: "BUY" | "SELL";
  price: number;
  quantity: number;
  date: string;
  notes: string;
  fees?: number;
}

const TradeJournal = () => {
  const [trades, setTrades] = useLocalStorage<TradeEntry[]>("entropy-trades", []);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "BUY" | "SELL">("ALL");

  const [form, setForm] = useState({
    ticker: "",
    type: "BUY" as "BUY" | "SELL",
    price: "",
    quantity: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    fees: "",
  });

  const handleAdd = () => {
    if (!form.ticker || !form.price || !form.quantity) return;
    setTrades((prev) => [
      {
        id: crypto.randomUUID(),
        ticker: form.ticker.toUpperCase(),
        type: form.type,
        price: parseFloat(form.price),
        quantity: parseInt(form.quantity),
        date: form.date,
        notes: form.notes,
        fees: form.fees ? parseFloat(form.fees) : undefined,
      },
      ...prev,
    ]);
    setForm({ ticker: "", type: "BUY", price: "", quantity: "", date: new Date().toISOString().split("T")[0], notes: "", fees: "" });
    setShowForm(false);
  };

  const handleRemove = (id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
  };

  const filtered = trades.filter((t) => filter === "ALL" || t.type === filter);

  // Calculate realized P&L per ticker
  const pnlByTicker: Record<string, { bought: number; sold: number; buyQty: number; sellQty: number; fees: number }> = {};
  trades.forEach((t) => {
    if (!pnlByTicker[t.ticker]) pnlByTicker[t.ticker] = { bought: 0, sold: 0, buyQty: 0, sellQty: 0, fees: 0 };
    if (t.type === "BUY") {
      pnlByTicker[t.ticker].bought += t.price * t.quantity;
      pnlByTicker[t.ticker].buyQty += t.quantity;
    } else {
      pnlByTicker[t.ticker].sold += t.price * t.quantity;
      pnlByTicker[t.ticker].sellQty += t.quantity;
    }
    pnlByTicker[t.ticker].fees += t.fees || 0;
  });

  const totalBought = Object.values(pnlByTicker).reduce((s, v) => s + v.bought, 0);
  const totalSold = Object.values(pnlByTicker).reduce((s, v) => s + v.sold, 0);
  const totalFees = Object.values(pnlByTicker).reduce((s, v) => s + v.fees, 0);
  const realizedPnL = totalSold - totalBought * (Object.values(pnlByTicker).reduce((s, v) => s + v.sellQty, 0) / Math.max(Object.values(pnlByTicker).reduce((s, v) => s + v.buyQty, 0), 1)) - totalFees;

  return (
    <div className="space-y-6">
      {/* Summary */}
      {trades.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Total Trades" value={trades.length.toString()} />
          <SummaryCard label="Buy Trades" value={trades.filter((t) => t.type === "BUY").length.toString()} />
          <SummaryCard label="Sell Trades" value={trades.filter((t) => t.type === "SELL").length.toString()} />
          <SummaryCard
            label="Total Fees"
            value={`₹${totalFees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
          />
        </div>
      )}

      {/* Add trade button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Trade Journal</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["ALL", "BUY", "SELL"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === f ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:bg-surface-3"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <Button onClick={() => setShowForm(!showForm)} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Log Trade
          </Button>
        </div>
      </div>

      {/* Add trade form */}
      {showForm && (
        <div className="rounded-xl border border-border bg-card p-5 animate-slide-up">
          <div className="grid gap-3 md:grid-cols-3">
            <Input
              placeholder="Ticker"
              value={form.ticker}
              onChange={(e) => setForm({ ...form, ticker: e.target.value })}
              className="bg-surface-2 border-border font-mono text-sm"
            />
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setForm({ ...form, type: "BUY" })}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.type === "BUY" ? "bg-gain/20 text-gain" : "bg-surface-2 text-muted-foreground"
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setForm({ ...form, type: "SELL" })}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  form.type === "SELL" ? "bg-loss/20 text-loss" : "bg-surface-2 text-muted-foreground"
                }`}
              >
                SELL
              </button>
            </div>
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="bg-surface-2 border-border text-sm"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3 mt-3">
            <Input
              placeholder="Price ₹"
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              className="bg-surface-2 border-border font-mono text-sm"
            />
            <Input
              placeholder="Quantity"
              type="number"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              className="bg-surface-2 border-border font-mono text-sm"
            />
            <Input
              placeholder="Fees ₹ (optional)"
              type="number"
              value={form.fees}
              onChange={(e) => setForm({ ...form, fees: e.target.value })}
              className="bg-surface-2 border-border font-mono text-sm"
            />
          </div>
          <Input
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="bg-surface-2 border-border text-sm mt-3"
          />
          <Button onClick={handleAdd} className="mt-3 w-full" disabled={!form.ticker || !form.price || !form.quantity}>
            Log Trade
          </Button>
        </div>
      )}

      {/* Trade list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No trades logged yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Start logging your buy/sell trades</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Ticker</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Qty</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Value</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Notes</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((trade) => (
                <tr key={trade.id} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{trade.date}</td>
                  <td className="px-4 py-3 font-mono text-sm font-semibold text-foreground">{trade.ticker}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
                      trade.type === "BUY" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                    }`}>
                      {trade.type === "BUY" ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {trade.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm">₹{trade.price.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{trade.quantity}</td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold">
                    ₹{(trade.price * trade.quantity).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[150px] truncate">{trade.notes}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRemove(trade.id)} className="rounded p-1 hover:bg-loss/10 hover:text-loss transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const SummaryCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="mt-1 font-mono text-xl font-bold text-foreground">{value}</p>
  </div>
);

export default TradeJournal;
