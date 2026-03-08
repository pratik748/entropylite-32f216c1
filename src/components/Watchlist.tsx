import { useState } from "react";
import { Eye, Bell, BellOff, Trash2, Plus, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";

export interface WatchlistItem {
  id: string;
  ticker: string;
  addedAt: number;
  alertAbove?: number;
  alertBelow?: number;
  lastPrice?: number;
  lastChecked?: number;
}

const Watchlist = () => {
  const [items, setItems] = useLocalStorage<WatchlistItem[]>("entropy-watchlist", []);
  const [newTicker, setNewTicker] = useState("");
  const [alertAbove, setAlertAbove] = useState("");
  const [alertBelow, setAlertBelow] = useState("");
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newTicker.trim()) return;
    const ticker = newTicker.toUpperCase();
    if (items.find((i) => i.ticker === ticker)) {
      toast({ title: "Already in watchlist", variant: "destructive" });
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        ticker,
        addedAt: Date.now(),
        alertAbove: alertAbove ? parseFloat(alertAbove) : undefined,
        alertBelow: alertBelow ? parseFloat(alertBelow) : undefined,
      },
    ]);
    setNewTicker("");
    setAlertAbove("");
    setAlertBelow("");
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleRefreshPrice = async (item: WatchlistItem) => {
    setRefreshing(item.id);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-stock", {
        body: { ticker: item.ticker, buyPrice: 1, quantity: 1 },
      });
      if (error) throw error;

      const price = data.currentPrice;
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, lastPrice: price, lastChecked: Date.now() } : i
        )
      );

      // Check alerts
      if (item.alertAbove && price >= item.alertAbove) {
        toast({ title: `${item.ticker} above ₹${item.alertAbove}!`, description: `Current: ₹${price}` });
      }
      if (item.alertBelow && price <= item.alertBelow) {
        toast({ title: `${item.ticker} below ₹${item.alertBelow}!`, description: `Current: ₹${price}`, variant: "destructive" });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(null);
    }
  };

  const toggleAlert = (id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? { ...i, alertAbove: i.alertAbove ? undefined : 0, alertBelow: i.alertBelow ? undefined : 0 }
          : i
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Add to watchlist */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold text-foreground">Add to Watchlist</h2>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Input
            placeholder="Ticker e.g. TCS.NS"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            className="bg-surface-2 border-border font-mono text-sm w-40"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            placeholder="Alert above ₹"
            type="number"
            value={alertAbove}
            onChange={(e) => setAlertAbove(e.target.value)}
            className="bg-surface-2 border-border font-mono text-sm w-32"
          />
          <Input
            placeholder="Alert below ₹"
            type="number"
            value={alertBelow}
            onChange={(e) => setAlertBelow(e.target.value)}
            className="bg-surface-2 border-border font-mono text-sm w-32"
          />
          <Button onClick={handleAdd} size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        </div>
      </div>

      {/* Watchlist items */}
      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Eye className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No stocks in watchlist</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Add tickers to track without buying</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-base font-semibold text-foreground mb-4">Watching {items.length} stocks</h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-border/50 bg-surface-2 p-4 transition-colors hover:bg-surface-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{item.ticker}</span>
                    {item.lastPrice && (
                      <span className="font-mono text-sm text-muted-foreground">
                        ₹{item.lastPrice.toLocaleString("en-IN")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {item.alertAbove ? (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-gain" /> Above ₹{item.alertAbove}
                      </span>
                    ) : null}
                    {item.alertBelow ? (
                      <span className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3 text-loss" /> Below ₹{item.alertBelow}
                      </span>
                    ) : null}
                    {item.lastChecked && (
                      <span>
                        Checked {new Date(item.lastChecked).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRefreshPrice(item)}
                    disabled={refreshing === item.id}
                    className="h-8 text-xs"
                  >
                    {refreshing === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Refresh"
                    )}
                  </Button>
                  <button
                    onClick={() => handleRemove(item.id)}
                    className="rounded p-1.5 hover:bg-loss/10 hover:text-loss transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Watchlist;
