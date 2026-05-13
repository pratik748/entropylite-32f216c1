import { useMemo, useState } from "react";
import { Plus, Trash2, Download, ChevronDown, ChevronUp } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useFX } from "@/hooks/useFX";
import { getCurrencySymbol } from "@/lib/currency";
import type { PortfolioStock } from "@/components/PortfolioPanel";

interface LogEntry {
  id: string;
  ts: number;
  ticker: string;
  action: "BUY" | "SELL";
  price: number;
  qty: number;
  pnl: number; // realized P&L in base currency, optional manual override else 0
  source: string;
  catalyst: string;
  lesson: string;
}

interface Props {
  stocks: PortfolioStock[];
}

const TradeLogger = ({ stocks }: Props) => {
  const { baseCurrency } = useFX();
  const baseSym = getCurrencySymbol(baseCurrency);
  const [entries, setEntries] = useLocalStorage<LogEntry[]>("entropy-trade-logger", []);
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);

  const tickerOptions = useMemo(() => Array.from(new Set(stocks.map((s) => s.ticker))), [stocks]);

  const [draft, setDraft] = useState<Omit<LogEntry, "id" | "ts">>({
    ticker: "",
    action: "BUY",
    price: 0,
    qty: 0,
    pnl: 0,
    source: "",
    catalyst: "",
    lesson: "",
  });

  const submit = () => {
    if (!draft.ticker.trim()) return;
    const e: LogEntry = {
      id: crypto.randomUUID(),
      ts: Date.now(),
      ...draft,
      ticker: draft.ticker.toUpperCase(),
    };
    setEntries((prev) => [e, ...prev]);
    setDraft({ ticker: "", action: "BUY", price: 0, qty: 0, pnl: 0, source: "", catalyst: "", lesson: "" });
    setAdding(false);
  };

  const remove = (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id));

  const update = (id: string, patch: Partial<LogEntry>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

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
        <div className="flex items-center gap-1">
          <button
            onClick={() => setAdding((a) => !a)}
            title="Log trade"
            className="text-muted-foreground hover:text-foreground p-0.5"
          >
            <Plus className="h-3 w-3" />
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
      </div>

      {open && adding && (
        <div className="border-t border-border/40 px-2 py-2 space-y-1.5 bg-surface-2/40">
          <div className="grid grid-cols-12 gap-1">
            <input
              list="logger-tickers"
              value={draft.ticker}
              onChange={(e) => setDraft({ ...draft, ticker: e.target.value })}
              placeholder="TICKER"
              className="col-span-4 bg-surface-1 border border-border rounded px-1.5 py-1 text-[10px] font-mono uppercase text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
            />
            <datalist id="logger-tickers">
              {tickerOptions.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="col-span-3 flex rounded border border-border overflow-hidden">
              {(["BUY", "SELL"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setDraft({ ...draft, action: a })}
                  className={`flex-1 text-[9px] font-mono py-1 ${
                    draft.action === a
                      ? a === "BUY"
                        ? "bg-gain/15 text-gain"
                        : "bg-loss/15 text-loss"
                      : "bg-surface-1 text-muted-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={draft.price || ""}
              onChange={(e) => setDraft({ ...draft, price: parseFloat(e.target.value) || 0 })}
              placeholder="PX"
              className="col-span-2 bg-surface-1 border border-border rounded px-1.5 py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
            />
            <input
              type="number"
              value={draft.qty || ""}
              onChange={(e) => setDraft({ ...draft, qty: parseFloat(e.target.value) || 0 })}
              placeholder="QTY"
              className="col-span-3 bg-surface-1 border border-border rounded px-1.5 py-1 text-[10px] font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
            />
          </div>
          <input
            value={draft.source}
            onChange={(e) => setDraft({ ...draft, source: e.target.value })}
            placeholder="Source · who/where the call came from"
            className="w-full bg-surface-1 border border-border rounded px-1.5 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
          />
          <input
            value={draft.catalyst}
            onChange={(e) => setDraft({ ...draft, catalyst: e.target.value })}
            placeholder="Catalyst · what triggered the trade"
            className="w-full bg-surface-1 border border-border rounded px-1.5 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
          />
          <input
            value={draft.lesson}
            onChange={(e) => setDraft({ ...draft, lesson: e.target.value })}
            placeholder="Lesson · one liner"
            maxLength={140}
            className="w-full bg-surface-1 border border-border rounded px-1.5 py-1 text-[10px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40"
          />
          <div className="flex items-center justify-end gap-1">
            <button
              onClick={() => setAdding(false)}
              className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!draft.ticker.trim()}
              className="text-[9px] font-mono uppercase tracking-wider bg-foreground text-background px-2 py-1 rounded disabled:opacity-30"
            >
              Log
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="max-h-64 overflow-auto border-t border-border/40">
          {entries.length === 0 ? (
            <div className="px-2 py-4 text-center text-[10px] text-muted-foreground font-mono">
              No entries. Press + to log a trade.
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {entries.map((e) => {
                const d = new Date(e.ts);
                const tStr = d.toLocaleString(undefined, {
                  month: "short",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const pnlPositive = e.pnl >= 0;
                return (
                  <div key={e.id} className="px-2 py-1.5 group/entry hover:bg-surface-2/40">
                    <div className="flex items-center justify-between gap-2 font-mono text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-muted-foreground tabular-nums shrink-0">{tStr}</span>
                        <span className="font-semibold text-foreground truncate">{e.ticker}</span>
                        <span
                          className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${
                            e.action === "BUY" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                          }`}
                        >
                          {e.action}
                        </span>
                        {e.price > 0 && (
                          <span className="text-muted-foreground tabular-nums">
                            @{e.price.toFixed(2)}
                            {e.qty > 0 ? ` × ${e.qty}` : ""}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          value={e.pnl || ""}
                          onChange={(ev) => update(e.id, { pnl: parseFloat(ev.target.value) || 0 })}
                          placeholder="P&L"
                          className={`w-16 bg-transparent border border-transparent hover:border-border focus:border-primary/40 rounded px-1 py-0.5 text-right text-[10px] font-mono tabular-nums focus:outline-none ${
                            e.pnl === 0
                              ? "text-muted-foreground/60"
                              : pnlPositive
                              ? "text-gain"
                              : "text-loss"
                          }`}
                        />
                        <button
                          onClick={() => remove(e.id)}
                          className="opacity-0 group-hover/entry:opacity-100 text-muted-foreground hover:text-loss transition-opacity"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[9px]">
                      <LoggerField label="SRC" value={e.source} onChange={(v) => update(e.id, { source: v })} />
                      <LoggerField label="CAT" value={e.catalyst} onChange={(v) => update(e.id, { catalyst: v })} />
                      <LoggerField label="LSN" value={e.lesson} onChange={(v) => update(e.id, { lesson: v })} maxLength={140} />
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
          <span
            className={`font-semibold tabular-nums ${
              entries.reduce((s, e) => s + e.pnl, 0) >= 0 ? "text-gain" : "text-loss"
            }`}
          >
            {(() => {
              const t = entries.reduce((s, e) => s + e.pnl, 0);
              return `${t >= 0 ? "+" : "-"}${baseSym}${Math.abs(t).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
            })()}
          </span>
        </div>
      )}
    </div>
  );
};

const LoggerField = ({
  label,
  value,
  onChange,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) => (
  <>
    <span className="font-mono uppercase tracking-wider text-muted-foreground/70 pt-0.5">{label}</span>
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      maxLength={maxLength}
      placeholder="—"
      className="bg-transparent border border-transparent hover:border-border focus:border-primary/40 rounded px-1 py-0.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
    />
  </>
);

export default TradeLogger;