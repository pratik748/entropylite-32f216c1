import { useState } from "react";
import { Trash2, Download, ChevronDown, ChevronUp, RefreshCw, Loader2 } from "lucide-react";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import { useTradeLogger } from "@/hooks/useTradeLogger";

const TradeLogger = () => {
  const { baseCurrency } = useFX();
  const baseSym = getCurrencySymbol(baseCurrency);
  const { entries, updateEntry, removeEntry, regenerateLesson } = useTradeLogger();
  const [open, setOpen] = useState(true);

  const exportCSV = () => {
    if (entries.length === 0) return;
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["time_iso", "ticker", "action", "price", "qty", "pnl", "source", "catalyst", "lesson"].join(","),
      ...entries.map((e) =>
        [new Date(e.ts).toISOString(), e.ticker, e.action, e.price, e.qty, e.pnl, esc(e.source), esc(e.catalyst), esc(e.lesson)].join(","),
      ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const total = entries.reduce((s, e) => s + (e.pnl || 0), 0);

  return (
    <div className="border-t border-border bg-surface-1">
      <div className="px-2 py-1.5 flex items-center justify-between">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <span>Logger</span>
          <span className="text-muted-foreground/60">({entries.length})</span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
        </button>
        <button
          onClick={exportCSV}
          disabled={entries.length === 0}
          title="Export CSV"
          className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5"
        >
          <Download className="h-3 w-3" />
        </button>
      </div>

      {open && (
        <div className="max-h-64 overflow-auto border-t border-border/40">
          {entries.length === 0 ? (
            <div className="px-2 py-4 text-center text-[10px] text-muted-foreground font-mono">
              No trades yet. Logged automatically as you trade.
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {entries.map((e) => {
                const d = new Date(e.ts);
                const tStr = d.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
                const pnlPositive = (e.pnl || 0) >= 0;
                return (
                  <div key={e.id} className="px-2 py-1.5 group/entry hover:bg-surface-2/40">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-muted-foreground tabular-nums shrink-0">{tStr}</span>
                        <span className="font-semibold text-foreground truncate">{e.ticker}</span>
                        <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${e.action === "BUY" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"}`}>
                          {e.action}
                        </span>
                        {e.price > 0 && (
                          <span className="text-muted-foreground tabular-nums truncate">
                            @{e.price.toFixed(2)}{e.qty > 0 ? ` × ${e.qty}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          value={e.pnl || ""}
                          onChange={(ev) => updateEntry(e.id, { pnl: parseFloat(ev.target.value) || 0 })}
                          placeholder="P&L"
                          className={`w-16 bg-transparent border border-transparent hover:border-border focus:border-primary/40 rounded px-1 py-0.5 text-right text-[10px] font-mono tabular-nums focus:outline-none ${
                            (e.pnl || 0) === 0 ? "text-muted-foreground/60" : pnlPositive ? "text-gain" : "text-loss"
                          }`}
                        />
                        <button
                          onClick={() => removeEntry(e.id)}
                          className="opacity-0 group-hover/entry:opacity-100 text-muted-foreground hover:text-loss transition-opacity"
                          title="Remove"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    {(e.source || e.catalyst) && (
                      <div className="mt-0.5 text-[9px] font-mono text-muted-foreground/70 truncate">
                        {e.source ? <span>SRC {e.source}</span> : null}
                        {e.source && e.catalyst ? <span className="px-1">·</span> : null}
                        {e.catalyst ? <span>CAT {e.catalyst}</span> : null}
                      </div>
                    )}
                    <div className="mt-1 flex items-start gap-1.5 text-[10px]">
                      <span className="font-mono uppercase tracking-wider text-muted-foreground/70 pt-0.5 shrink-0">LSN</span>
                      {e.lessonLoading ? (
                        <span className="flex items-center gap-1 text-muted-foreground/60 italic">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> generating…
                        </span>
                      ) : (
                        <span className="text-foreground/90 italic flex-1">{e.lesson || "—"}</span>
                      )}
                      <button
                        onClick={() => regenerateLesson(e.id)}
                        title="Regenerate lesson"
                        className="opacity-0 group-hover/entry:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                        disabled={e.lessonLoading}
                      >
                        <RefreshCw className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {entries.length > 0 && (
        <div className="border-t border-border/40 px-2 py-1 flex items-center justify-between font-mono text-[9px]">
          <span className="text-muted-foreground uppercase tracking-wider">Realized</span>
          <span className={`font-semibold tabular-nums ${total >= 0 ? "text-gain" : "text-loss"}`}>
            {`${total >= 0 ? "+" : "-"}${baseSym}${Math.abs(total).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          </span>
        </div>
      )}
    </div>
  );
};

export default TradeLogger;