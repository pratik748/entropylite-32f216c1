import { useMemo } from "react";
import { Activity, Target, Newspaper, BookOpen, Gauge, Zap } from "lucide-react";
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
    <div className="border border-border bg-card rounded-sm">
      <div className="px-2.5 py-1 border-b border-border/40 flex items-center gap-1.5">
        <Gauge className="h-3 w-3 text-primary" />
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
          Session · Intraday
        </span>
        <Badge variant="outline" className="ml-auto h-3.5 px-1 text-[8px] font-mono">
          {today.trades.length} trades today
        </Badge>
      </div>
      <div className="grid grid-cols-4 divide-x divide-border/40">
        <div className="px-2.5 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Session P&L</div>
          <div
            className={`text-sm font-mono font-bold tabular-nums ${
              today.totalPnL > 0 ? "text-gain" : today.totalPnL < 0 ? "text-loss" : "text-foreground"
            }`}
          >
            {today.totalPnL > 0 ? "+" : ""}
            {today.totalPnL.toFixed(2)}%
          </div>
        </div>
        <div className="px-2.5 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Win Rate</div>
          <div className="text-sm font-mono font-bold tabular-nums text-foreground">
            {today.trades.length > 0
              ? `${Math.round((today.wins / today.trades.length) * 100)}%`
              : "—"}
          </div>
        </div>
        <div className="px-2.5 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Avg Hold</div>
          <div className="text-sm font-mono font-bold tabular-nums text-foreground">
            {today.avgHold > 0 ? `${today.avgHold.toFixed(0)}m` : "—"}
          </div>
        </div>
        <div className="px-2.5 py-1.5">
          <div className="text-[8px] font-mono uppercase tracking-wider text-muted-foreground">Sharpe<sub>30</sub></div>
          <div className="text-sm font-mono font-bold tabular-nums text-foreground">
            {lodgers.sharpe.toFixed(2)}
          </div>
        </div>
      </div>
    </div>
  );

  const RecentLessons = (
    <PanelWrapper title="Recent Lessons" icon={<BookOpen className="h-3 w-3" />} noPad>
      <div className="divide-y divide-border/30">
        {recentLessons.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] font-mono text-muted-foreground">
            No closed lodges yet. Each trade collapses into one distilled lesson.
          </div>
        ) : (
          recentLessons.map((t) => (
            <div key={t.id} className="px-2.5 py-1.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono font-bold text-foreground">{t.ticker}</span>
                <span
                  className={`text-[10px] font-mono font-bold tabular-nums ${
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
                <p className="text-[10px] font-mono text-foreground/85 italic leading-snug line-clamp-2">
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
      <div className="p-1.5 space-y-1.5 pb-24">
        {SessionStrip}
        <div className="border border-border bg-card rounded-sm p-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="h-3 w-3 text-primary" />
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Quick Lookup
            </span>
          </div>
          <StockInput onAnalyze={onAnalyze} isLoading={isLoading} />
        </div>
        <DesirableAssets stocks={stocks} onAddToPortfolio={onAnalyze} />
        <PanelWrapper title="Live Catalysts" icon={<Newspaper className="h-3 w-3" />} noPad>
          <LiveNewsFeed compact />
        </PanelWrapper>
        {RecentLessons}
      </div>
    );
  }

  // Desktop: dedicated 3-column layout focused on intraday flow
  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-border/40">{SessionStrip}</div>
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Quick Lookup + Recent Lessons */}
        <ResizablePanel defaultSize={26} minSize={18} maxSize={36}>
          <div className="h-full flex flex-col">
            <div className="border-b border-border bg-card p-2 shrink-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="h-3 w-3 text-primary" />
                <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  Quick Lookup
                </span>
              </div>
              <StockInput onAnalyze={onAnalyze} isLoading={isLoading} />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">{RecentLessons}</div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Center: Intraday Desirable Picks (already mode-aware) */}
        <ResizablePanel defaultSize={50} minSize={30}>
          <div className="h-full overflow-auto p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <Target className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Intraday Picks · ≤6h horizon
              </span>
            </div>
            <DesirableAssets stocks={stocks} onAddToPortfolio={onAnalyze} />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right: Live Catalysts */}
        <ResizablePanel defaultSize={24} minSize={16} maxSize={36}>
          <PanelWrapper title="Live Catalysts" icon={<Activity className="h-3 w-3" />} noPad>
            <LiveNewsFeed compact />
          </PanelWrapper>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default IntradayDashboard;
