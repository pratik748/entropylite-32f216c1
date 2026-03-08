import { useState, useEffect, useCallback, useRef } from "react";
import { Brain, Zap, AlertTriangle, Clock, Target, XCircle, CheckCircle, RefreshCw, Trash2, History, TrendingUp, TrendingDown, Shield, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useMarketRegime, type RegimeType } from "@/hooks/useMarketRegime";
import { usePaperTrading, type PaperTrade } from "@/hooks/usePaperTrading";
import { useStrategyMemory, type GeneratedStrategy, type StrategyMemoryEntry } from "@/hooks/useStrategyMemory";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props { stocks: PortfolioStock[]; }

interface ActiveStrategy extends GeneratedStrategy {
  status: "active" | "adapting" | "deactivated";
  generatedAt: number;
  regimeAtGeneration: string;
}

const regimeColors: Record<RegimeType, string> = {
  "Trending Bull": "text-gain",
  "Trending Bear": "text-loss",
  "High Volatility": "text-warning",
  "Range-Bound": "text-muted-foreground",
  "Crisis": "text-loss",
  "Rotation": "text-info",
};

const regimeIcons: Record<RegimeType, typeof TrendingUp> = {
  "Trending Bull": TrendingUp,
  "Trending Bear": TrendingDown,
  "High Volatility": Activity,
  "Range-Bound": Shield,
  "Crisis": AlertTriangle,
  "Rotation": RefreshCw,
};

const StrategyLab = ({ stocks }: Props) => {
  const { holdings, fmt } = useNormalizedPortfolio(stocks);
  const regime = useMarketRegime(15000);
  const { trades, openTrade, deactivateStrategy, getTradesForStrategy } = usePaperTrading();
  const { memory, logStrategy, getRelevantMemories, getWinRate, clearMemory } = useStrategyMemory();

  const [activeStrategies, setActiveStrategies] = useState<ActiveStrategy[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRegime, setLastRegime] = useState<string>("");
  const [showMemory, setShowMemory] = useState(false);
  const generatingRef = useRef(false);

  // Generate strategies when regime changes
  const generateStrategies = useCallback(async () => {
    if (!regime || generatingRef.current) return;
    generatingRef.current = true;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("strategy-generate", {
        body: {
          regime: regime.regime,
          vix: regime.vix,
          moodScore: regime.moodScore,
          sectors: regime.sectors,
          holdings: holdings.map(h => ({ ticker: h.ticker, pnlPct: h.pnlPct, beta: h.beta })),
          keyEvents: regime.keyEvents,
          outlook: regime.outlook,
        },
      });

      if (error) throw error;
      if (!data?.strategies) throw new Error("No strategies returned");

      const newStrategies: ActiveStrategy[] = data.strategies.map((s: any) => ({
        ...s,
        id: crypto.randomUUID(),
        status: "active" as const,
        generatedAt: Date.now(),
        regimeAtGeneration: regime.regime,
      }));

      // Deactivate old strategies and log them to memory
      activeStrategies.forEach(old => {
        const stratTrades = getTradesForStrategy(old.id);
        const totalPnl = stratTrades.reduce((s, t) => s + t.pnlPct, 0);
        deactivateStrategy(old.id);
        logStrategy({
          id: crypto.randomUUID(),
          strategy: old,
          regime: old.regimeAtGeneration,
          entryTime: old.generatedAt,
          exitTime: Date.now(),
          pnlPct: totalPnl,
          outcome: totalPnl > 1 ? "win" : totalPnl < -1 ? "loss" : "neutral",
          conditions: { vix: regime.vix, moodScore: regime.moodScore, topSector: regime.sectors[0]?.name || "" },
        });
      });

      setActiveStrategies(newStrategies);

      // Auto-open paper trades for strategies with specific instruments
      newStrategies.forEach(s => {
        if (s.instruments.length > 0) {
          const ticker = s.instruments[0];
          // Use a holding price if available, otherwise skip
          const holding = holdings.find(h => h.ticker.toUpperCase() === ticker.toUpperCase());
          if (holding) {
            openTrade({
              strategyId: s.id,
              ticker: holding.ticker,
              entryPrice: holding.currentPrice,
              positionSizePct: s.position_size_pct,
              stopLossPct: s.stop_loss_pct,
              takeProfitPct: s.take_profit_pct,
            });
          }
        }
      });

      toast.success(`${newStrategies.length} strategies generated for ${regime.regime} regime`);
    } catch (err: any) {
      console.error("Strategy generation error:", err);
      toast.error(err.message || "Failed to generate strategies");
    } finally {
      setLoading(false);
      generatingRef.current = false;
    }
  }, [regime, holdings, activeStrategies, deactivateStrategy, getTradesForStrategy, logStrategy, openTrade]);

  // Trigger generation on regime change
  useEffect(() => {
    if (!regime) return;
    if (regime.regime !== lastRegime) {
      setLastRegime(regime.regime);
      if (lastRegime !== "") {
        // Regime changed — adapt or regenerate
        setActiveStrategies(prev => prev.map(s =>
          s.regimeAtGeneration !== regime.regime ? { ...s, status: "adapting" as const } : s
        ));
      }
    }
  }, [regime, lastRegime]);

  // Auto-deactivate strategies that have been adapting for too long
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStrategies(prev => prev.map(s => {
        if (s.status === "adapting" && Date.now() - s.generatedAt > 120000) {
          deactivateStrategy(s.id);
          return { ...s, status: "deactivated" as const };
        }
        return s;
      }));
    }, 30000);
    return () => clearInterval(timer);
  }, [deactivateStrategy]);

  const relevantMemories = regime ? getRelevantMemories(regime.regime, regime.vix) : [];

  const RegimeIcon = regime ? regimeIcons[regime.regime] : Activity;

  return (
    <div className="space-y-4">
      {/* Panel A: Market Situational Map */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-foreground" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Market Situational Map</h3>
            {regime && (
              <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                LIVE · {new Date(regime.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={generateStrategies} disabled={loading || !regime} className="h-7 gap-1 text-xs">
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Generating…" : "Generate Strategies"}
          </Button>
        </div>

        {regime ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Regime */}
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Regime</p>
              <div className="flex items-center gap-1.5">
                <RegimeIcon className={`h-4 w-4 ${regimeColors[regime.regime]}`} />
                <span className={`font-mono text-sm font-bold ${regimeColors[regime.regime]}`}>{regime.regime}</span>
              </div>
            </div>
            {/* VIX */}
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">VIX</p>
              <span className={`font-mono text-sm font-bold ${regime.vix > 25 ? "text-loss" : regime.vix < 18 ? "text-gain" : "text-foreground"}`}>
                {regime.vix.toFixed(1)}
              </span>
            </div>
            {/* Mood */}
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Mood Score</p>
              <span className={`font-mono text-sm font-bold ${regime.moodScore > 0 ? "text-gain" : "text-loss"}`}>
                {regime.moodScore > 0 ? "+" : ""}{regime.moodScore}
              </span>
            </div>
            {/* Conditions */}
            <div className="rounded-lg bg-surface-2 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Conditions</p>
              <div className="flex flex-wrap gap-1">
                {regime.conditions.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground">Normal</span>
                ) : regime.conditions.map(c => (
                  <span key={c.id} className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${
                    c.severity === "high" ? "bg-loss/15 text-loss" : c.severity === "medium" ? "bg-warning/15 text-warning" : "bg-surface-3 text-muted-foreground"
                  }`}>{c.label}</span>
                ))}
              </div>
            </div>
            {/* Sector Heatmap */}
            <div className="col-span-2 sm:col-span-4 rounded-lg bg-surface-2 p-3">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2">Sector Performance</p>
              <div className="flex flex-wrap gap-1.5">
                {regime.sectors.slice(0, 10).map(s => (
                  <span key={s.name} className={`rounded px-2 py-1 text-[10px] font-mono ${
                    s.changePct > 0.5 ? "bg-gain/10 text-gain" : s.changePct < -0.5 ? "bg-loss/10 text-loss" : "bg-surface-3 text-muted-foreground"
                  }`}>
                    {s.name} {s.changePct > 0 ? "+" : ""}{s.changePct.toFixed(1)}%
                  </span>
                ))}
              </div>
            </div>
            {/* Key Events */}
            {regime.keyEvents.length > 0 && (
              <div className="col-span-2 sm:col-span-4 rounded-lg bg-surface-2 p-3">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Key Events</p>
                <div className="space-y-1">
                  {regime.keyEvents.slice(0, 3).map((e, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
                      <Zap className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-muted-foreground/30 animate-spin mb-2" />
            <p className="text-sm text-muted-foreground">Loading market data…</p>
          </div>
        )}
      </div>

      {/* Panel B: Active Strategies */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-foreground" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">AI-Generated Strategies</h3>
            <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {activeStrategies.filter(s => s.status === "active").length} active
            </span>
          </div>
          <button onClick={() => setShowMemory(!showMemory)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
            <History className="h-3 w-3" />
            Memory ({memory.length}) · {getWinRate()}% win
          </button>
        </div>

        {activeStrategies.length === 0 && !loading ? (
          <div className="py-12 text-center">
            <Brain className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">No strategies active.</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">
              Click "Generate Strategies" to create adaptive strategies for the current {regime?.regime || "market"} regime.
            </p>
            {relevantMemories.length > 0 && (
              <p className="text-[11px] text-info mt-2">
                💡 {relevantMemories.length} past strategies found for similar conditions
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {activeStrategies.map(strategy => {
              const stratTrades = getTradesForStrategy(strategy.id);
              const totalPnl = stratTrades.reduce((s, t) => s + t.pnlPct, 0);
              const worstDrawdown = stratTrades.length > 0
                ? Math.min(...stratTrades.map(t => t.maxDrawdownPct))
                : 0;

              return (
                <div key={strategy.id} className={`rounded-lg border p-4 transition-all ${
                  strategy.status === "active" ? "border-gain/30 bg-gain/5" :
                  strategy.status === "adapting" ? "border-warning/30 bg-warning/5" :
                  "border-border/30 bg-surface-2 opacity-60"
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{strategy.name}</span>
                        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{strategy.type}</span>
                        <StatusBadge status={strategy.status} />
                        <span className="rounded bg-info/10 px-1.5 py-0.5 text-[9px] font-mono text-info">
                          {strategy.confidence}% conf
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">{strategy.rationale}</p>
                    </div>
                    {strategy.status !== "deactivated" && (
                      <button onClick={() => {
                        deactivateStrategy(strategy.id);
                        setActiveStrategies(prev => prev.map(s =>
                          s.id === strategy.id ? { ...s, status: "deactivated" as const } : s
                        ));
                      }} className="p-1 text-muted-foreground hover:text-loss transition-colors">
                        <XCircle className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  {/* Rules */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 mb-3">
                    <div className="rounded bg-surface-2 p-2">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Entry</p>
                      <p className="text-[11px] text-foreground">{strategy.entry_rule}</p>
                    </div>
                    <div className="rounded bg-surface-2 p-2">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Exit</p>
                      <p className="text-[11px] text-foreground">{strategy.exit_rule}</p>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <MetricCell label="SL" value={`${strategy.stop_loss_pct}%`} good={false} />
                    <MetricCell label="TP" value={`+${strategy.take_profit_pct}%`} good={true} />
                    <MetricCell label="Size" value={`${strategy.position_size_pct}%`} good={strategy.position_size_pct <= 20} />
                    <MetricCell label="Paper PnL" value={`${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}%`} good={totalPnl >= 0} />
                    <MetricCell label="Drawdown" value={`${worstDrawdown.toFixed(1)}%`} good={worstDrawdown > -3} />
                    <MetricCell label="Instruments" value={strategy.instruments.slice(0, 2).join(", ") || "—"} good={true} />
                  </div>

                  {/* Paper trades */}
                  {stratTrades.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-border/30">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Paper Trades</p>
                      <div className="flex flex-wrap gap-2">
                        {stratTrades.map(t => (
                          <span key={t.id} className={`rounded px-2 py-1 text-[10px] font-mono ${
                            t.status === "active" ? "bg-gain/10 text-gain" :
                            t.status === "sl-hit" ? "bg-loss/10 text-loss" :
                            t.status === "tp-hit" ? "bg-gain/10 text-gain" :
                            "bg-surface-3 text-muted-foreground"
                          }`}>
                            {t.ticker} {t.pnlPct >= 0 ? "+" : ""}{t.pnlPct.toFixed(2)}%
                            {t.status === "sl-hit" && " ⛔"}
                            {t.status === "tp-hit" && " ✅"}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel C: Strategy Memory */}
      {showMemory && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-foreground" />
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Strategy Memory</h3>
              <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                {memory.length} entries · {getWinRate()}% win rate
              </span>
            </div>
            {memory.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearMemory} className="h-7 gap-1 text-xs text-muted-foreground">
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>

          {memory.length === 0 ? (
            <div className="py-8 text-center">
              <History className="h-6 w-6 mx-auto text-muted-foreground/20 mb-2" />
              <p className="text-sm text-muted-foreground">No strategy history yet.</p>
              <p className="text-[11px] text-muted-foreground/60">Strategies will be logged here when regimes change.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {memory.slice(0, 20).map(entry => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {entry.outcome === "win" ? <CheckCircle className="h-3 w-3 text-gain" /> :
                       entry.outcome === "loss" ? <XCircle className="h-3 w-3 text-loss" /> :
                       <Clock className="h-3 w-3 text-muted-foreground" />}
                      <span className="text-xs font-semibold text-foreground">{entry.strategy.name}</span>
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground">{entry.regime}</span>
                      <span className={`text-[10px] font-mono ${entry.pnlPct >= 0 ? "text-gain" : "text-loss"}`}>
                        {entry.pnlPct >= 0 ? "+" : ""}{entry.pnlPct.toFixed(2)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      VIX: {entry.conditions.vix.toFixed(1)} · Mood: {entry.conditions.moodScore} · {entry.conditions.topSector}
                    </p>
                  </div>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(entry.exitTime).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = {
    active: { bg: "bg-gain/15 text-gain", label: "ACTIVE" },
    adapting: { bg: "bg-warning/15 text-warning", label: "ADAPTING" },
    deactivated: { bg: "bg-surface-3 text-muted-foreground", label: "DEACTIVATED" },
  }[status] || { bg: "bg-surface-3 text-muted-foreground", label: status.toUpperCase() };

  return <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${config.bg}`}>{config.label}</span>;
};

const MetricCell = ({ label, value, good }: { label: string; value: string; good: boolean }) => (
  <div>
    <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`font-mono text-xs font-bold ${good ? "text-gain" : "text-loss"}`}>{value}</p>
  </div>
);

export default StrategyLab;
