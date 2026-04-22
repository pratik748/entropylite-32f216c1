import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import type { LodgerTrade } from "@/lib/lodgers-math";

interface Props {
  trades: LodgerTrade[];
}

const LodgerLedger = ({ trades }: Props) => {
  const sorted = [...trades].sort((a, b) => (b.exit_ts || b.entry_ts) - (a.exit_ts || a.entry_ts));
  if (sorted.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border bg-card/50 p-4 text-center">
        <BookOpen className="h-4 w-4 text-muted-foreground mx-auto mb-1" />
        <p className="text-[10px] font-mono text-muted-foreground">No closed lodges yet. Each closed trade collapses into one distilled lesson.</p>
      </div>
    );
  }
  return (
    <ScrollArea className="h-[420px] rounded-sm border border-border bg-card">
      <div className="divide-y divide-border/60">
        {sorted.map((t) => (
          <div key={t.id} className="px-3 py-2">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-foreground">{t.ticker}</span>
                <Badge variant="outline" className="text-[8px] font-mono uppercase">{t.side}</Badge>
                <span className="text-[9px] font-mono text-muted-foreground">{t.regime}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-mono font-bold ${t.pnl_pct >= 0 ? "text-gain" : "text-loss"}`}>
                  {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct.toFixed(2)}%
                </span>
                <span className="text-[9px] font-mono text-muted-foreground">{t.actual_hold_min.toFixed(0)}m</span>
              </div>
            </div>
            {t.lesson ? (
              <p className="text-[10px] font-mono text-foreground/90 italic leading-snug">"{t.lesson}"</p>
            ) : (
              <p className="text-[10px] font-mono text-muted-foreground italic animate-pulse">distilling lesson…</p>
            )}
            {(t.tags?.length || t.pattern_id) && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                {t.tags?.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-[8px] font-mono px-1 py-0 h-4">{tag}</Badge>
                ))}
                {t.pattern_id && (
                  <span className="text-[8px] font-mono text-muted-foreground/60">#{t.pattern_id}</span>
                )}
              </div>
            )}
            <div className="mt-1 grid grid-cols-4 gap-2 text-[8px] font-mono text-muted-foreground">
              <span>Δ exp <span className={t.divergence_pct >= 0 ? "text-gain" : "text-loss"}>{t.divergence_pct >= 0 ? "+" : ""}{t.divergence_pct.toFixed(2)}%</span></span>
              <span>Sharpe <span className="text-foreground">{t.realized_sharpe.toFixed(2)}</span></span>
              <span>Slip <span className="text-foreground">{t.slippage_bps.toFixed(1)}bp</span></span>
              <span>Lat <span className="text-foreground">{t.exec_latency_ms.toFixed(0)}ms</span></span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
};

export default LodgerLedger;