import { useState } from "react";
import { ChevronUp, ChevronDown, BookOpen } from "lucide-react";
import { useLodgers } from "@/hooks/useLodgers";
import { Badge } from "@/components/ui/badge";

/**
 * Sticky bottom dock — always-visible distilled trade memory on the dashboard.
 * Collapsed: ~32px chip strip. Expanded: ~280px with last 5 lessons + Sharpe30 chip.
 * Mode-agnostic: visible in both intraday and long-horizon modes.
 */
const LodgerLedgerDock = () => {
  const [open, setOpen] = useState(false);
  const lodgers = useLodgers();
  const trades = [...lodgers.trades]
    .sort((a, b) => (b.exit_ts || b.entry_ts) - (a.exit_ts || a.entry_ts))
    .slice(0, 5);

  const winRate =
    lodgers.trades.length > 0
      ? Math.round(
          (lodgers.trades.filter((t) => t.pnl_pct > 0).length /
            lodgers.trades.length) *
            100,
        )
      : 0;

  return (
    <div className="fixed inset-x-0 bottom-7 z-20 border-t border-border bg-surface-1/95 backdrop-blur">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
      >
        <BookOpen className="h-3 w-3 text-primary" />
        <span className="text-foreground font-semibold">Lodger Ledger</span>
        <Badge variant="outline" className="text-[8px] font-mono px-1 py-0 h-3.5">
          {lodgers.trades.length} trades
        </Badge>
        <span className="text-[9px] text-muted-foreground">
          Sharpe<sub>30</sub>{" "}
          <span className="text-foreground">{lodgers.sharpe.toFixed(2)}</span>
        </span>
        <span className="text-[9px] text-muted-foreground">
          Win <span className="text-foreground">{winRate}%</span>
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronUp className="h-3 w-3" />
          )}
        </span>
      </button>
      {open && (
        <div className="max-h-[260px] overflow-auto border-t border-border/60 bg-card">
          {trades.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] font-mono text-muted-foreground">
              No closed lodges yet. Each closed trade collapses into one distilled lesson.
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {trades.map((t) => (
                <div key={t.id} className="px-3 py-1.5">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-mono font-bold text-foreground">
                      {t.ticker}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        t.pnl_pct >= 0 ? "text-gain" : "text-loss"
                      }`}
                    >
                      {t.pnl_pct >= 0 ? "+" : ""}
                      {t.pnl_pct.toFixed(2)}%
                    </span>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {t.actual_hold_min.toFixed(0)}m · {t.regime}
                    </span>
                  </div>
                  {t.lesson ? (
                    <p className="text-[10px] font-mono text-foreground/85 italic leading-snug">
                      "{t.lesson}"
                    </p>
                  ) : (
                    <p className="text-[10px] font-mono text-muted-foreground italic">
                      distilling lesson…
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LodgerLedgerDock;