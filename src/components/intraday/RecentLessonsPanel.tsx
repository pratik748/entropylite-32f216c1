import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import { useLodgers } from "@/hooks/useLodgers";
import PanelWrapper from "@/components/terminal/PanelWrapper";

/**
 * Standalone Recent Lessons surface for the Intraday "Lessons" tab.
 * Shows distilled outcomes from closed lodger trades.
 */
const RecentLessonsPanel = () => {
  const lodgers = useLodgers();

  const lessons = useMemo(
    () =>
      [...lodgers.trades]
        .sort((a, b) => (b.exit_ts || b.entry_ts) - (a.exit_ts || a.entry_ts))
        .slice(0, 50),
    [lodgers.trades],
  );

  return (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <PanelWrapper title="Recent Lessons" icon={<BookOpen className="h-3 w-3" />} noPad>
        <div className="divide-y divide-border/30">
          {lessons.length === 0 ? (
            <div className="px-4 py-12 text-center text-[10px] font-mono text-muted-foreground leading-relaxed">
              No closed lodges yet. Each trade collapses into one distilled lesson.
            </div>
          ) : (
            lessons.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono font-bold text-foreground">{t.ticker}</span>
                  <span
                    className={`text-[11px] font-mono font-bold tabular-nums ${
                      t.pnl_pct >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {t.pnl_pct >= 0 ? "+" : ""}
                    {t.pnl_pct.toFixed(2)}%
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground ml-auto">
                    {t.actual_hold_min.toFixed(0)}m · {t.regime}
                  </span>
                </div>
                {t.lesson ? (
                  <p className="text-[10px] font-mono text-foreground/80 italic leading-relaxed">
                    "{t.lesson}"
                  </p>
                ) : (
                  <p className="text-[10px] font-mono text-muted-foreground italic">distilling lesson…</p>
                )}
              </div>
            ))
          )}
        </div>
      </PanelWrapper>
    </div>
  );
};

export default RecentLessonsPanel;