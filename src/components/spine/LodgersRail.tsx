import { memo } from "react";
import { Activity } from "lucide-react";
import { useLodgers } from "@/hooks/useLodgers";

/**
 * Lodgers Rail — the persistent visual spine of the system.
 * Always-on 72px left column showing live trade memory, holding-time
 * distribution, Sharpe evolution and the latest distilled lesson.
 * Reads from the lodger_trades audit table; updates in realtime.
 */
const LodgersRail = () => {
  const { trades, winRate, avgHoldMin, sharpeSeries, lastLesson, cumulativePnL, loaded } = useLodgers();

  const tape = trades.slice(0, 14);

  // Holding-time histogram (5 buckets, log-ish)
  const buckets = [0, 0, 0, 0, 0];
  trades.forEach(t => {
    const m = t.actual_hold_min || 0;
    const idx = m < 15 ? 0 : m < 60 ? 1 : m < 240 ? 2 : m < 1440 ? 3 : 4;
    buckets[idx]++;
  });
  const maxB = Math.max(1, ...buckets);

  // Sharpe sparkline geometry
  const w = 56, h = 22;
  const sMin = sharpeSeries.length ? Math.min(...sharpeSeries) : 0;
  const sMax = sharpeSeries.length ? Math.max(...sharpeSeries) : 1;
  const sRange = sMax - sMin || 1;
  const path = sharpeSeries.length > 1
    ? sharpeSeries.map((v, i) => {
        const x = (i / (sharpeSeries.length - 1)) * w;
        const y = h - ((v - sMin) / sRange) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : "";

  return (
    <aside
      className="hidden md:flex w-[72px] shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground select-none"
      aria-label="Lodgers audit spine"
    >
      {/* Header — vertical label */}
      <div className="border-b border-border px-2 py-2 flex items-center justify-between">
        <Activity className="h-3 w-3 text-primary" />
        <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground">L-{trades.length}</span>
      </div>

      {/* Vitals block */}
      <div className="border-b border-border px-2 py-2 space-y-1.5">
        <div>
          <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">WIN</div>
          <div className={`font-mono text-[12px] font-semibold tabular-nums ${winRate >= 55 ? "text-gain" : winRate >= 40 ? "text-foreground" : "text-loss"}`}>
            {loaded ? `${winRate}%` : "—"}
          </div>
        </div>
        <div>
          <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">HOLD</div>
          <div className="font-mono text-[10px] font-medium tabular-nums text-foreground">
            {avgHoldMin >= 1440 ? `${(avgHoldMin/1440).toFixed(1)}d` : avgHoldMin >= 60 ? `${(avgHoldMin/60).toFixed(1)}h` : `${avgHoldMin}m`}
          </div>
        </div>
        <div>
          <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground">PnL</div>
          <div className={`font-mono text-[10px] font-semibold tabular-nums ${cumulativePnL > 0 ? "text-gain" : cumulativePnL < 0 ? "text-loss" : "text-foreground"}`}>
            {cumulativePnL >= 0 ? "+" : ""}{cumulativePnL.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Sharpe sparkline */}
      <div className="border-b border-border px-2 py-2">
        <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">SHARPE</div>
        {sharpeSeries.length > 1 ? (
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[22px]">
            <path d={path} stroke="hsl(var(--primary))" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <div className="h-[22px] flex items-center font-mono text-[8px] text-muted-foreground/60">—</div>
        )}
      </div>

      {/* Holding-time distribution */}
      <div className="border-b border-border px-2 py-2">
        <div className="font-mono text-[7px] uppercase tracking-wider text-muted-foreground mb-1">DIST</div>
        <div className="flex items-end gap-[2px] h-6">
          {buckets.map((b, i) => (
            <div key={i} className="flex-1 bg-surface-3 relative" style={{ height: "100%" }}>
              <div
                className="absolute bottom-0 left-0 right-0 bg-primary/70"
                style={{ height: `${(b / maxB) * 100}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between font-mono text-[6px] text-muted-foreground/60 mt-0.5">
          <span>m</span><span>h</span><span>d</span>
        </div>
      </div>

      {/* Live tape */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
        <div className="px-1 py-1 space-y-px">
          {tape.length === 0 && (
            <div className="px-1 py-2 font-mono text-[8px] text-muted-foreground/50 leading-tight">
              No closed trades. Audit trail empty.
            </div>
          )}
          {tape.map(t => {
            const pos = t.pnl_pct > 0;
            return (
              <div
                key={t.id}
                className="px-1 py-1 border-l-2 hover:bg-surface-2 transition-colors"
                style={{ borderColor: `hsl(var(--${pos ? "gain" : "loss"}))` }}
                title={`${t.ticker} · ${t.pnl_pct.toFixed(2)}% · ${t.regime}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[8px] font-semibold text-foreground truncate">{t.ticker.replace(/\.(NS|BO)$/, "")}</span>
                </div>
                <div className={`font-mono text-[8px] tabular-nums ${pos ? "text-gain" : "text-loss"}`}>
                  {pos ? "+" : ""}{t.pnl_pct.toFixed(1)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Distilled lesson */}
      {lastLesson && (
        <div className="border-t border-border px-2 py-1.5 bg-surface-2">
          <div className="font-mono text-[7px] uppercase tracking-wider text-primary mb-0.5">LESSON</div>
          <div className="font-mono text-[8px] leading-tight text-foreground/80 line-clamp-3">{lastLesson}</div>
        </div>
      )}
    </aside>
  );
};

export default memo(LodgersRail);
