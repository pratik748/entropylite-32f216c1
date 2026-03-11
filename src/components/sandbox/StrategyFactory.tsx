import { useState } from "react";
import { TrendingUp, TrendingDown, Trash2, Brain, Zap, BarChart3, RefreshCw, Play, X, DollarSign, Briefcase } from "lucide-react";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import { useStrategyEvolution, type EvolvedStrategy } from "@/hooks/useStrategyEvolution";
import { useAlpacaTrading } from "@/hooks/useAlpacaTrading";
import { toast } from "sonner";

interface Props { stocks: PortfolioStock[]; }

const StrategyFactory = ({ stocks }: Props) => {
  const { allStrategies, generation, loading, latestResult, evolve, clearStrategies } = useStrategyEvolution(stocks, 0);
  const alpaca = useAlpacaTrading();
  const [submitting, setSubmitting] = useState<string | null>(null);

  const typeColors: Record<string, string> = {
    momentum: "bg-primary/15 text-primary",
    mean_reversion: "bg-gain/15 text-gain",
    volatility: "bg-warning/15 text-warning",
    carry: "bg-accent/15 text-accent-foreground",
    event_driven: "bg-loss/15 text-loss",
    statistical: "bg-secondary/15 text-secondary-foreground",
    hybrid: "bg-muted text-muted-foreground",
  };

  const handlePaperTrade = async (strat: EvolvedStrategy) => {
    if (!strat.instruments?.length) {
      toast.error("No instruments specified for this strategy");
      return;
    }
    setSubmitting(strat.id);
    try {
      const symbol = strat.instruments[0].replace(/[^A-Z]/g, "");
      const qty = Math.max(1, Math.round((strat.position_size_pct || 5) / 5));
      await alpaca.submitOrder({
        symbol,
        qty,
        side: "buy",
        type: "market",
        time_in_force: "day",
      });
      toast.success(`Paper trade submitted: BUY ${qty} ${symbol}`);
    } catch (e: any) {
      toast.error(`Alpaca error: ${e.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  const equity = alpaca.account ? parseFloat(alpaca.account.equity) : 0;
  const buyingPower = alpaca.account ? parseFloat(alpaca.account.buying_power) : 0;

  return (
    <div className="space-y-4">
      {/* Alpaca Account Panel */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gain/10">
            <Briefcase className="h-4 w-4 text-gain" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground tracking-wide">ALPACA PAPER TRADING</h3>
            <p className="text-[10px] text-muted-foreground font-mono">
              {alpaca.account ? `${alpaca.account.status?.toUpperCase()} · LIVE` : alpaca.error ? "DISCONNECTED" : "CONNECTING..."}
            </p>
          </div>
          {alpaca.positions.length > 0 && (
            <button onClick={() => { if (confirm("Close all positions?")) alpaca.closeAll(); }}
              className="ml-auto flex items-center gap-1 rounded-lg bg-loss/10 border border-loss/20 px-3 py-1.5 text-[10px] font-medium text-loss hover:bg-loss/20 transition-colors">
              <X className="h-3 w-3" /> Close All
            </button>
          )}
        </div>

        {alpaca.error && (
          <div className="rounded-lg border border-loss/20 bg-loss/5 px-3 py-2 mb-3">
            <p className="text-[10px] text-loss font-mono">{alpaca.error}</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-center">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Equity</p>
            <p className="font-mono text-lg font-bold text-foreground">${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-center">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Buying Power</p>
            <p className="font-mono text-lg font-bold text-gain">${buyingPower.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-center">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Positions</p>
            <p className="font-mono text-lg font-bold text-foreground">{alpaca.positions.length}</p>
          </div>
        </div>

        {/* Open positions */}
        {alpaca.positions.length > 0 && (
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {["Symbol", "Qty", "Entry", "Current", "P&L", "P&L %", ""].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alpaca.positions.map(p => {
                  const pl = parseFloat(p.unrealized_pl || "0");
                  const plPct = parseFloat(p.unrealized_plpc || "0") * 100;
                  return (
                    <tr key={p.symbol} className="border-b border-border/30">
                      <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{p.symbol}</td>
                      <td className="px-2 py-1.5 font-mono">{p.qty}</td>
                      <td className="px-2 py-1.5 font-mono">${parseFloat(p.avg_entry_price).toFixed(2)}</td>
                      <td className="px-2 py-1.5 font-mono">${parseFloat(p.current_price).toFixed(2)}</td>
                      <td className={`px-2 py-1.5 font-mono font-semibold ${pl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                      </td>
                      <td className={`px-2 py-1.5 font-mono ${plPct >= 0 ? "text-gain" : "text-loss"}`}>
                        {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
                      </td>
                      <td className="px-2 py-1.5">
                        <button onClick={() => alpaca.closePosition(p.symbol)}
                          className="rounded bg-loss/10 px-1.5 py-0.5 text-[9px] text-loss hover:bg-loss/20 transition-colors">
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Strategy Evolution Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-wide">STRATEGY EVOLUTION MACHINE</h3>
              <p className="text-[10px] text-muted-foreground font-mono">
                GEN {generation} · {allStrategies.length} SURVIVORS · AI CLOUDFLARE
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => evolve()} disabled={loading}
              className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 text-[10px] font-medium text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Evolve
            </button>
            <button onClick={clearStrategies}
              className="flex items-center gap-1 rounded-lg bg-loss/10 border border-loss/20 px-3 py-1.5 text-[10px] font-medium text-loss hover:bg-loss/20 transition-colors">
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 mb-3">
            <Brain className="h-3.5 w-3.5 text-primary animate-pulse" />
            <span className="text-[10px] text-primary font-mono">AI generating & testing strategy candidates...</span>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Generation", value: generation, color: "text-foreground" },
            { label: "Survivors", value: allStrategies.length, color: "text-gain" },
            { label: "Avg Sharpe", value: allStrategies.length > 0 ? (allStrategies.reduce((s, st) => s + st.estimated_sharpe, 0) / allStrategies.length).toFixed(2) : "—", color: "text-primary" },
            { label: "Best Sharpe", value: allStrategies.length > 0 ? Math.max(...allStrategies.map(s => s.estimated_sharpe)).toFixed(2) : "—", color: "text-gain" },
          ].map(m => (
            <div key={m.label} className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-center">
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
              <p className={`font-mono text-lg font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Strategy cards */}
      {allStrategies.length === 0 ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Zap className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">No Strategies Yet</h3>
          <p className="text-[10px] text-muted-foreground max-w-sm mx-auto">
            The evolution machine will autonomously generate, test, and rank strategies every 2 minutes.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {allStrategies.slice(0, 10).map((strat, i) => {
            const isSubmitting = submitting === strat.id;
            // Check if there's already a position for this strategy's primary instrument
            const primarySymbol = strat.instruments?.[0]?.replace(/[^A-Z]/g, "") || "";
            const hasPosition = alpaca.positions.some(p => p.symbol === primarySymbol);

            return (
              <div key={strat.id || i} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${typeColors[strat.type] || typeColors.hybrid}`}>
                        {strat.type}
                      </span>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {strat.regime_fit}
                      </span>
                    </div>
                    <h4 className="text-sm font-semibold text-foreground">{strat.name}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Paper Trade button */}
                    {hasPosition ? (
                      <span className="rounded-lg bg-gain/10 border border-gain/20 px-2.5 py-1.5 text-[9px] font-medium text-gain">
                        ✓ Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handlePaperTrade(strat)}
                        disabled={isSubmitting || !alpaca.account}
                        className="flex items-center gap-1 rounded-lg bg-gain/10 border border-gain/20 px-2.5 py-1.5 text-[9px] font-medium text-gain hover:bg-gain/20 disabled:opacity-40 transition-colors"
                      >
                        <Play className="h-3 w-3" />
                        {isSubmitting ? "Sending..." : "Paper Trade"}
                      </button>
                    )}
                    <div className="text-right">
                      <p className="text-[8px] uppercase text-muted-foreground">Sharpe</p>
                      <p className={`font-mono text-lg font-bold ${strat.estimated_sharpe >= 1.5 ? "text-gain" : strat.estimated_sharpe >= 1 ? "text-foreground" : "text-warning"}`}>
                        {strat.estimated_sharpe?.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2 text-[9px]">
                  <div>
                    <span className="text-muted-foreground">Max DD</span>
                    <p className="font-mono text-loss">{strat.estimated_max_dd_pct?.toFixed(1)}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Stop</span>
                    <p className="font-mono">{strat.stop_loss_pct}%</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Confidence</span>
                    <p className="font-mono">{strat.confidence}%</p>
                  </div>
                </div>

                <div className="text-[9px] text-muted-foreground mb-1">
                  <span className="font-medium text-foreground">Entry:</span> {strat.entry_rule}
                </div>
                <div className="text-[9px] text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">Exit:</span> {strat.exit_rule}
                </div>

                {strat.edge_explanation && (
                  <p className="text-[9px] text-muted-foreground/80 italic border-t border-border/50 pt-1.5">
                    {strat.edge_explanation}
                  </p>
                )}

                {strat.instruments?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {strat.instruments.map(inst => (
                      <span key={inst} className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">
                        {inst}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StrategyFactory;
