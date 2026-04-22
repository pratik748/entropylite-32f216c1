import { useMemo } from "react";
import { Gauge, Zap } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import StockInput from "@/components/StockInput";
import { useLodgers } from "@/hooks/useLodgers";
import { Badge } from "@/components/ui/badge";

interface Props {
  stocks: PortfolioStock[];
  onAnalyze: (ticker: string, buyPrice: number, quantity: number) => void;
  isLoading: boolean;
  isMobile: boolean;
}

/**
 * Intraday Dashboard — same-session money cockpit.
 * Slim by design: only Session P&L strip + Quick Lookup.
 * Picks → "Desirable" tab. Catalysts → "Catalysts" tab. Lessons → "Lessons" tab.
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

  const QuickLookup = (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          Quick Lookup
        </span>
        <span className="ml-auto text-[9px] font-mono text-muted-foreground/70">
          Picks · Catalysts · Lessons live in their own tabs
        </span>
      </div>
      <StockInput onAnalyze={onAnalyze} isLoading={isLoading} />
    </div>
  );

  if (isMobile) {
    return (
      <div className="p-3 space-y-3 pb-24">
        {SessionStrip}
        {QuickLookup}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-auto">
      <div className="px-4 pt-4 pb-3 space-y-3">
        {SessionStrip}
        {QuickLookup}
      </div>
    </div>
  );
};

export default IntradayDashboard;
