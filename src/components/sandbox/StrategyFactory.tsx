import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, Trash2, Brain, Zap, BarChart3, RefreshCw, Play, X, Briefcase, Activity, PieChart } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart as RPieChart, Pie, Legend,
} from "recharts";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import { useStrategyEvolution, type EvolvedStrategy } from "@/hooks/useStrategyEvolution";
import { useAlpacaTrading } from "@/hooks/useAlpacaTrading";
import { toast } from "sonner";

interface Props { stocks: PortfolioStock[]; }

/* ─── Alpaca Equity Curve ─── */
const EquityCurve = ({ history }: { history: any }) => {
  const data = useMemo(() => {
    if (!history?.timestamp?.length) return [];
    return history.timestamp.map((ts: number, i: number) => ({
      time: new Date(ts * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      equity: history.equity[i],
      pnl: history.profit_loss[i],
    }));
  }, [history]);

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-40 text-[10px] text-muted-foreground">No history data yet</div>
  );

  const minE = Math.min(...data.map((d: any) => d.equity)) * 0.999;
  const maxE = Math.max(...data.map((d: any) => d.equity)) * 1.001;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <defs>
          <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
        <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[minE, maxE]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`} width={45} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10 }} formatter={(v: number) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, ""]} />
        <Area type="monotone" dataKey="equity" stroke="hsl(var(--primary))" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/* ─── P&L per Position Bar Chart ─── */
const PositionPnLChart = ({ positions }: { positions: any[] }) => {
  if (positions.length === 0) return null;
  const data = positions.map(p => ({
    symbol: p.symbol,
    pnl: parseFloat(p.unrealized_pl || "0"),
    fill: parseFloat(p.unrealized_pl || "0") >= 0 ? "hsl(var(--gain))" : "hsl(var(--loss))",
  })).sort((a, b) => b.pnl - a.pnl);

  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} horizontal />
        <XAxis dataKey="symbol" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={false} />
        <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={false} tickFormatter={(v: number) => `$${v}`} width={40} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10 }} formatter={(v: number) => [`$${v.toFixed(2)}`, "P&L"]} />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

/* ─── Allocation Pie ─── */
const AllocationPie = ({ positions }: { positions: any[] }) => {
  if (positions.length === 0) return null;
  const COLORS = [
    "hsl(var(--primary))", "hsl(var(--gain))", "hsl(var(--warning))",
    "hsl(var(--loss))", "hsl(var(--accent))", "hsl(210,60%,50%)",
  ];
  const data = positions.map(p => ({
    name: p.symbol,
    value: Math.abs(parseFloat(p.market_value || "0")),
  }));

  return (
    <ResponsiveContainer width="100%" height={130}>
      <RPieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" paddingAngle={2}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Legend wrapperStyle={{ fontSize: 8 }} />
        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10 }} formatter={(v: number) => [`$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, ""]} />
      </RPieChart>
    </ResponsiveContainer>
  );
};

/* ─── Main Component ─── */
const StrategyFactory = ({ stocks }: Props) => {
  const { allStrategies, generation, loading, evolve, clearStrategies } = useStrategyEvolution(stocks, 0);
  const alpaca = useAlpacaTrading();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [historyPeriod, setHistoryPeriod] = useState("1W");

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
    if (!strat.instruments?.length) { toast.error("No instruments specified"); return; }
    setSubmitting(strat.id);
    try {
      const symbol = strat.instruments[0].replace(/[^A-Z]/g, "");
      const qty = Math.max(1, Math.round((strat.position_size_pct || 5) / 5));
      await alpaca.submitOrder({ symbol, qty, side: "buy", type: "market", time_in_force: "day" });
      toast.success(`Paper trade submitted: BUY ${qty} ${symbol}`);
    } catch (e: any) { toast.error(`Alpaca error: ${e.message}`); }
    finally { setSubmitting(null); }
  };

  const equity = alpaca.account ? parseFloat(alpaca.account.equity) : 0;
  const buyingPower = alpaca.account ? parseFloat(alpaca.account.buying_power) : 0;
  const cash = alpaca.account ? parseFloat(alpaca.account.cash) : 0;
  const longMV = alpaca.account ? parseFloat(alpaca.account.long_market_value) : 0;

  const totalPnl = alpaca.positions.reduce((s, p) => s + parseFloat(p.unrealized_pl || "0"), 0);
  const totalPnlPct = equity > 0 ? (totalPnl / (equity - totalPnl)) * 100 : 0;
  const winCount = alpaca.positions.filter(p => parseFloat(p.unrealized_pl || "0") > 0).length;
  const loseCount = alpaca.positions.filter(p => parseFloat(p.unrealized_pl || "0") < 0).length;
  const winRate = alpaca.positions.length > 0 ? ((winCount / alpaca.positions.length) * 100).toFixed(0) : "—";

  return (
    <div className="space-y-4">
      {/* ═══ ALPACA PAPER TRADING DASHBOARD ═══ */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gain/10">
            <Briefcase className="h-4 w-4 text-gain" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-foreground tracking-wide">ALPACA PAPER TRADING</h3>
            <p className="text-[10px] text-muted-foreground font-mono">
              {alpaca.account ? `${alpaca.account.status?.toUpperCase()} · LIVE` : alpaca.error ? "DISCONNECTED" : "CONNECTING..."}
            </p>
          </div>
          {alpaca.positions.length > 0 && (
            <button onClick={() => { if (confirm("Close all positions?")) alpaca.closeAll(); }}
              className="flex items-center gap-1 rounded-lg bg-loss/10 border border-loss/20 px-3 py-1.5 text-[10px] font-medium text-loss hover:bg-loss/20 transition-colors">
              <X className="h-3 w-3" /> Close All
            </button>
          )}
        </div>

        {alpaca.error && (
          <div className="rounded-lg border border-loss/20 bg-loss/5 px-3 py-2 mb-3">
            <p className="text-[10px] text-loss font-mono">{alpaca.error}</p>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[
            { label: "Equity", value: `$${equity.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-foreground" },
            { label: "Buying Power", value: `$${buyingPower.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, color: "text-gain" },
            { label: "Total P&L", value: `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`, color: totalPnl >= 0 ? "text-gain" : "text-loss" },
            { label: "P&L %", value: `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%`, color: totalPnlPct >= 0 ? "text-gain" : "text-loss" },
          ].map(m => (
            <div key={m.label} className="rounded-lg border border-border/50 bg-muted/30 p-2.5 text-center">
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
              <p className={`font-mono text-base font-bold ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[
            { label: "Cash", value: `$${cash.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
            { label: "Long Value", value: `$${longMV.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
            { label: "Positions", value: `${alpaca.positions.length}` },
            { label: "Win Rate", value: `${winRate}%`, sub: `${winCount}W / ${loseCount}L` },
          ].map(m => (
            <div key={m.label} className="rounded-lg border border-border/50 bg-muted/20 p-2 text-center">
              <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
              <p className="font-mono text-sm font-bold text-foreground">{m.value}</p>
              {m.sub && <p className="text-[8px] text-muted-foreground">{m.sub}</p>}
            </div>
          ))}
        </div>

        {/* Equity Curve */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Equity Curve</span>
            </div>
            <div className="flex gap-1">
              {["1D", "1W", "1M", "3M"].map(p => (
                <button key={p} onClick={() => { setHistoryPeriod(p); alpaca.fetchHistory(p, p === "1D" ? "5Min" : p === "1W" ? "15Min" : "1H"); }}
                  className={`rounded px-2 py-0.5 text-[8px] font-mono transition-colors ${historyPeriod === p ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <EquityCurve history={alpaca.portfolioHistory} />
        </div>

        {/* Position Charts Row */}
        {alpaca.positions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="h-3.5 w-3.5 text-gain" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">P&L by Position</span>
              </div>
              <PositionPnLChart positions={alpaca.positions} />
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <PieChart className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Allocation</span>
              </div>
              <AllocationPie positions={alpaca.positions} />
            </div>
          </div>
        )}

        {/* Positions Table */}
        {alpaca.positions.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-border/50">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                  {["Symbol", "Qty", "Entry", "Current", "Mkt Value", "P&L", "P&L %", "Today", ""].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alpaca.positions.map(p => {
                  const pl = parseFloat(p.unrealized_pl || "0");
                  const plPct = parseFloat(p.unrealized_plpc || "0") * 100;
                  const today = parseFloat(p.change_today || "0") * 100;
                  return (
                    <tr key={p.symbol} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-2 py-2 font-mono font-semibold text-foreground">{p.symbol}</td>
                      <td className="px-2 py-2 font-mono">{p.qty}</td>
                      <td className="px-2 py-2 font-mono">${parseFloat(p.avg_entry_price).toFixed(2)}</td>
                      <td className="px-2 py-2 font-mono">${parseFloat(p.current_price).toFixed(2)}</td>
                      <td className="px-2 py-2 font-mono">${parseFloat(p.market_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                      <td className={`px-2 py-2 font-mono font-semibold ${pl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pl >= 0 ? "+" : ""}${pl.toFixed(2)}
                      </td>
                      <td className={`px-2 py-2 font-mono ${plPct >= 0 ? "text-gain" : "text-loss"}`}>
                        {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%
                      </td>
                      <td className={`px-2 py-2 font-mono ${today >= 0 ? "text-gain" : "text-loss"}`}>
                        {today >= 0 ? "+" : ""}{today.toFixed(2)}%
                      </td>
                      <td className="px-2 py-2">
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

        {/* Recent Orders */}
        {alpaca.orders.length > 0 && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-border/50">
            <div className="px-3 py-2 border-b border-border/30 bg-muted/20">
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Recent Orders</span>
            </div>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b border-border/30 text-muted-foreground">
                  {["Symbol", "Side", "Qty", "Type", "Status", "Fill Price", "Time"].map(h => (
                    <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {alpaca.orders.slice(0, 10).map(o => (
                  <tr key={o.id} className="border-b border-border/10 hover:bg-muted/10">
                    <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{o.symbol}</td>
                    <td className={`px-2 py-1.5 font-mono font-semibold ${o.side === "buy" ? "text-gain" : "text-loss"}`}>{o.side.toUpperCase()}</td>
                    <td className="px-2 py-1.5 font-mono">{o.qty}</td>
                    <td className="px-2 py-1.5 font-mono">{o.type}</td>
                    <td className="px-2 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-medium ${
                        o.status === "filled" ? "bg-gain/15 text-gain" :
                        o.status === "canceled" ? "bg-loss/15 text-loss" :
                        "bg-warning/15 text-warning"
                      }`}>{o.status}</span>
                    </td>
                    <td className="px-2 py-1.5 font-mono">{o.filled_avg_price ? `$${parseFloat(o.filled_avg_price).toFixed(2)}` : "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{new Date(o.submitted_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ STRATEGY EVOLUTION MACHINE ═══ */}
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
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Evolve
            </button>
            <button onClick={clearStrategies}
              className="flex items-center gap-1 rounded-lg bg-loss/10 border border-loss/20 px-3 py-1.5 text-[10px] font-medium text-loss hover:bg-loss/20 transition-colors">
              <Trash2 className="h-3 w-3" /> Clear
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

      {/* Strategy Cards */}
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
            const primarySymbol = strat.instruments?.[0]?.replace(/[^A-Z]/g, "") || "";
            const hasPosition = alpaca.positions.some(p => p.symbol === primarySymbol);

            return (
              <div key={strat.id || i} className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${typeColors[strat.type] || typeColors.hybrid}`}>{strat.type}</span>
                      <span className="text-[9px] text-muted-foreground font-mono">{strat.regime_fit}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-foreground">{strat.name}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasPosition ? (
                      <span className="rounded-lg bg-gain/10 border border-gain/20 px-2.5 py-1.5 text-[9px] font-medium text-gain">✓ Active</span>
                    ) : (
                      <button onClick={() => handlePaperTrade(strat)} disabled={isSubmitting || !alpaca.account}
                        className="flex items-center gap-1 rounded-lg bg-gain/10 border border-gain/20 px-2.5 py-1.5 text-[9px] font-medium text-gain hover:bg-gain/20 disabled:opacity-40 transition-colors">
                        <Play className="h-3 w-3" /> {isSubmitting ? "Sending..." : "Paper Trade"}
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
                  <div><span className="text-muted-foreground">Max DD</span><p className="font-mono text-loss">{strat.estimated_max_dd_pct?.toFixed(1)}%</p></div>
                  <div><span className="text-muted-foreground">Stop</span><p className="font-mono">{strat.stop_loss_pct}%</p></div>
                  <div><span className="text-muted-foreground">Confidence</span><p className="font-mono">{strat.confidence}%</p></div>
                </div>

                <div className="text-[9px] text-muted-foreground mb-1"><span className="font-medium text-foreground">Entry:</span> {strat.entry_rule}</div>
                <div className="text-[9px] text-muted-foreground mb-2"><span className="font-medium text-foreground">Exit:</span> {strat.exit_rule}</div>

                {strat.edge_explanation && (
                  <p className="text-[9px] text-muted-foreground/80 italic border-t border-border/50 pt-1.5">{strat.edge_explanation}</p>
                )}

                {strat.instruments?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {strat.instruments.map(inst => (
                      <span key={inst} className="rounded bg-muted px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">{inst}</span>
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
