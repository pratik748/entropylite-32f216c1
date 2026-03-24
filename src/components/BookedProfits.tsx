import { useState, useEffect } from "react";
import { Trophy, X, TrendingUp, Clock } from "lucide-react";
import { getCurrencySymbol } from "@/lib/currency";

export interface BookedProfit {
  id: string;
  ticker: string;
  buyPrice: number;
  sellPrice: number;
  quantity: number;
  pnlPct: number;
  pnlAbs: number;
  currency: string;
  bookedAt: number;
  reason: string;
  seen: boolean;
}

const STORAGE_KEY = "entropy_booked_profits";

export function loadBookedProfits(): BookedProfit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

export function saveBookedProfits(profits: BookedProfit[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profits));
  } catch { /* ignore */ }
}

export function addBookedProfit(profit: Omit<BookedProfit, "id" | "seen">) {
  const all = loadBookedProfits();
  all.unshift({ ...profit, id: crypto.randomUUID(), seen: false });
  // Keep last 100
  if (all.length > 100) all.length = 100;
  saveBookedProfits(all);
}

export function markAllSeen() {
  const all = loadBookedProfits();
  all.forEach(p => p.seen = true);
  saveBookedProfits(all);
}

const BookedProfits = () => {
  const [profits, setProfits] = useState<BookedProfit[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setProfits(loadBookedProfits());
  }, []);

  const unseen = profits.filter(p => !p.seen);
  const totalBooked = profits.reduce((s, p) => s + p.pnlAbs, 0);
  const totalBookedToday = profits
    .filter(p => Date.now() - p.bookedAt < 86_400_000)
    .reduce((s, p) => s + p.pnlAbs, 0);

  useEffect(() => {
    if (expanded && unseen.length > 0) {
      markAllSeen();
      setProfits(loadBookedProfits());
    }
  }, [expanded, unseen.length]);

  if (profits.length === 0) return null;

  const clearAll = () => {
    saveBookedProfits([]);
    setProfits([]);
  };

  const removeOne = (id: string) => {
    const updated = profits.filter(p => p.id !== id);
    saveBookedProfits(updated);
    setProfits(updated);
  };

  return (
    <div className="border border-gain/30 bg-gain/5 rounded-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gain/10 transition-colors"
      >
        <Trophy className="h-4 w-4 text-gain shrink-0" />
        <span className="font-mono text-[11px] font-bold text-gain tracking-wider">PROFITS BOOKED</span>
        {unseen.length > 0 && (
          <span className="bg-gain text-gain-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
            {unseen.length} NEW
          </span>
        )}
        <span className="ml-auto font-mono text-xs font-bold text-gain tabular-nums">
          +${Math.abs(totalBooked).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </span>
        {totalBookedToday > 0 && (
          <span className="text-[8px] font-mono text-gain/70">
            +${totalBookedToday.toFixed(0)} today
          </span>
        )}
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-gain/20">
          <div className="max-h-48 overflow-auto">
            {profits.map(p => (
              <div
                key={p.id}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/30 font-mono text-[10px] ${!p.seen ? "bg-gain/10" : ""}`}
              >
                <TrendingUp className="h-3 w-3 text-gain shrink-0" />
                <span className="font-bold text-foreground">{p.ticker}</span>
                <span className="text-muted-foreground">
                  {getCurrencySymbol(p.currency)}{p.buyPrice.toFixed(2)} → {getCurrencySymbol(p.currency)}{p.sellPrice.toFixed(2)}
                </span>
                <span className="text-gain font-bold">+{p.pnlPct.toFixed(1)}%</span>
                <span className="text-gain font-semibold">
                  +${p.pnlAbs.toFixed(0)}
                </span>
                <span className="text-[8px] text-muted-foreground/60 flex items-center gap-0.5 ml-auto">
                  <Clock className="h-2 w-2" />
                  {new Date(p.bookedAt).toLocaleDateString()}
                </span>
                <span className="text-[7px] text-muted-foreground/50 uppercase">{p.reason}</span>
                <button onClick={() => removeOne(p.id)} className="p-0.5 hover:text-loss transition-colors">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="px-3 py-1.5 flex justify-between items-center border-t border-gain/20">
            <span className="text-[9px] font-mono text-muted-foreground">{profits.length} total trades booked</span>
            <button onClick={clearAll} className="text-[9px] font-mono text-loss hover:underline">Clear all</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookedProfits;
