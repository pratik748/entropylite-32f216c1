import { useMemo } from "react";
import { Activity, Target, BookOpen, Gauge, Zap } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import StockInput from "@/components/StockInput";
import LiveNewsFeed from "@/components/LiveNewsFeed";
import DesirableAssets from "@/components/DesirableAssets";
import { useLodgers } from "@/hooks/useLodgers";
import PanelWrapper from "@/components/terminal/PanelWrapper";
import { Badge } from "@/components/ui/badge";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

interface Props {
  stocks: PortfolioStock[];
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
  isMobile: boolean;
}

/**
 * Intraday Dashboard — same-session money surface.
 * No long-horizon blotter, no full-position deep analysis sprawl.
 * Surfaces: Session P&L strip, Intraday Picks, Live Catalysts, Recent Lessons.
 */
const IntradayDashboard = ({ stocks, onAnalyze, isLoading, isMobile }: Props) => {
  const lodgers = useLodgers();

  // Session-only metrics from today's closed lodger trades
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const todayTrades = lodgers.trades.filter(
      (t) => (t.exit_ts || t.entry_ts || 0) >= startMs,
    );
    const wins = todayTrades.filter((t) => t.pnl_pct > 0).length;
    const losses = todayTrades.filter((t) => t.pnl_pct < 0).length;
    const totalPnL = todayTrades.reduce((s, t) => s + t.pnl_pct, 0);
    const avgHold =
      todayTrades.length > 0
        ? todayTrades.reduce((s, t) => s + t.actual_hold_min, 0) / todayTrades.length
        : 0;
    return { trades: todayTrades, wins, losses, totalPnL, avgHold };
  }, [lodgers.trades]);

  const recentLessons = useMemo(
    () =>
      [...lodgers.trades]
        .sort((a, b) => (b.exit_ts || b.entry_ts) - (a.exit_ts || a.entry_ts))
        .slice(0, 6),
    [lodgers.trades],
  );

  const SessionStrip = (
    <div className="rounded-md border border-border bg-card">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40">
        <Gauge className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          Session
        </span>
        <Badge variant="outline" className="ml-auto h-5 px-2 text-[9px] font-mono">
          {today.trades.length} {today.trades.length === 1 ? "trade" : "trades"} today
        </Badge>
      </div>
      <div className="grid grid-cols-4">
        {[
          {
            label: "Session P&L",
            value: `${today.totalPnL > 0 ? "+" : ""}${today.totalPnL.toFixed(2)}%`,
            cls:
              today.totalPnL > 0
                ? "text-gain"
                : today.totalPnL < 0
                  ? "text-loss"
                  : "text-foreground",
          },
          {
            label: "Win Rate",
            value:
              today.trades.length > 0
                ? `${Math.round((today.wins / today.trades.length) * 100)}%`
                : "—",
            cls: "text-foreground",
          },
          {
            label: "Avg Hold",
            value: today.avgHold > 0 ? `${today.avgHold.toFixed(0)}m` : "—",
            cls: "text-foreground",
          },
          {
            label: "Sharpe₃₀",
            value: lodgers.sharpe.toFixed(2),
            cls: "text-foreground",
          },
        ].map((m, i) => (
          <div
            key={m.label}
            className={`px-4 py-3 ${i > 0 ? "border-l border-border/40" : ""}`}
          >
            <div className="text-[9px] font-mono uppercase tracking-[0.16em] text-muted-foreground mb-1">
              {m.label}
            </div>
            <div className={`text-base font-mono font-semibold tabular-nums ${m.cls}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const RecentLessons = (
    <PanelWrapper title="Recent Lessons" icon={<BookOpen className="h-3 w-3" />} noPad>
      <div className="divide-y divide-border/30">
        {recentLessons.length === 0 ? (
          <div className="px-4 py-8 text-center text-[10px] font-mono text-muted-foreground leading-relaxed">
            No closed lodges yet. Each trade collapses into one distilled lesson.
          </div>
        ) : (
          recentLessons.map((t) => (
            <div key={t.id} className="px-3 py-2.5">
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
                <p className="text-[10px] font-mono text-foreground/80 italic leading-relaxed line-clamp-2">
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
  );

  if (isMobile) {
    return (
      <div className="p-3 space-y-3 pb-24">
        {SessionStrip}
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Quick Lookup
            </span>
          </div>
          <StockInput onAnalyze={onAnalyze} isLoading={isLoading} />
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Intraday Picks · ≤6h
            </span>
          </div>
          <DesirableAssets stocks={stocks} onAddToPortfolio={onAnalyze} />
        </div>
        <PanelWrapper title="Live Catalysts" icon={<Activity className="h-3 w-3" />} noPad>
          <LiveNewsFeed compact />
        </PanelWrapper>
        {RecentLessons}
      </div>
    );
  }

  // Desktop: dedicated 3-column layout focused on intraday flow
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="px-4 pt-4 pb-3">{SessionStrip}</div>
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 px-4 pb-4 gap-3">
        {/* Left column: Quick Lookup (top) + Recent Lessons (bottom) — separated */}
        <ResizablePanel defaultSize={26} minSize={20} maxSize={34}>
          <div className="h-full flex flex-col gap-3">
            <div className="rounded-md border border-border bg-card p-3 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  Quick Lookup
                </span>
              </div>
              <StockInput onAnalyze={onAnalyze} isLoading={isLoading} />
            </div>
            <div className="flex-1 min-h-0 rounded-md border border-border bg-card overflow-hidden">
              <div className="h-full overflow-auto">{RecentLessons}</div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-transparent" />

        {/* Center: Intraday Picks — its own card with breathing room */}
        <ResizablePanel defaultSize={50} minSize={32}>
          <div className="h-full rounded-md border border-border bg-card overflow-hidden flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 shrink-0">
              <Target className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
                Intraday Picks
              </span>
              <span className="text-[9px] font-mono text-muted-foreground/70 ml-auto">
                ≤6h horizon
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-4">
              <DesirableAssets stocks={stocks} onAddToPortfolio={onAnalyze} />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-transparent" />

        {/* Right: Live Catalysts — isolated card */}
        <ResizablePanel defaultSize={24} minSize={18} maxSize={36}>
          <div className="h-full rounded-md border border-border bg-card overflow-hidden">
            <PanelWrapper title="Live Catalysts" icon={<Activity className="h-3 w-3" />} noPad>
              <LiveNewsFeed compact />
            </PanelWrapper>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default IntradayDashboard;
