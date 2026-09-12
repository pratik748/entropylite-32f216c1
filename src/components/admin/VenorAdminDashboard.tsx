import React, { useEffect, useState, useMemo } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Zap,
  TrendingUp,
  Shield,
  Activity,
  Cpu,
  Flame,
  Globe,
  Crosshair,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Sliders,
  Terminal,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";
import { venorEngine, type SimulationState, type SimPosition, type SimTrade } from "@/lib/venor/simulation-engine";

export default function VenorAdminDashboard() {
  const [simState, setSimState] = useState<SimulationState>(() => venorEngine.getState());
  const [shockQuery, setShockQuery] = useState("Strait of Hormuz commercial tanker blockade & military escalation");
  const [customSpeed, setCustomSpeed] = useState(250);
  const [selectedStrategyTab, setSelectedStrategyTab] = useState<string>("all");

  useEffect(() => {
    const unsubscribe = venorEngine.subscribe((state) => {
      setSimState({ ...state });
    });
    return () => unsubscribe();
  }, []);

  const fmtUsd = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

  const fmtBps = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)} bps`;

  const totalAlpha = simState.realizedPnL + simState.unrealizedPnL;
  const totalReturnPct = ((simState.equity - simState.initialCapital) / simState.initialCapital) * 100;

  const MACRO_PRESETS = [
    "Strait of Hormuz commercial tanker blockade & military escalation",
    "Federal Reserve unexpected 50bps emergency rate cut & liquidity injection",
    "Taiwan Strait semiconductor supply chain disruption & export embargo",
    "Middle East energy infrastructure cyber attack & crude spike",
    "Global quantitative systemic de-leveraging & sovereign bond shock",
  ];

  return (
    <div className="space-y-4 font-mono text-foreground">
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* TOP INSTITUTIONAL HEADER & LIVE STATUS BAR */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 border border-primary/20 text-primary">
                <Cpu className="h-3.5 w-3.5" />
              </span>
              <h1 className="text-sm font-bold uppercase tracking-wider text-foreground">
                VENOR Autonomous Simulation Engine
              </h1>
              <span className="rounded bg-surface-2 border border-border px-2 py-0.5 text-[10px] font-bold text-primary">
                ADMIN OBSERVABILITY
              </span>
              <span className="flex items-center gap-1.5 rounded border border-border/80 bg-surface-2 px-2 py-0.5 text-[10px] text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${simState.isRunning ? "bg-gain animate-pulse" : "bg-warning"}`} />
                {simState.isRunning ? "LIVE MULTI-ASSET STREAM" : "SIMULATION PAUSED"}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Continuous strategy generation, execution shortfall minimization (Almgren-Chriss SDE), & Bayesian hyperparameter evolution.
            </p>
          </div>

          {/* Interactive Control Deck */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => (simState.isRunning ? venorEngine.pause() : venorEngine.start())}
              className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-bold transition-colors border ${
                simState.isRunning
                  ? "bg-loss/15 text-loss border-loss/30 hover:bg-loss/25"
                  : "bg-gain/15 text-gain border-gain/30 hover:bg-gain/25"
              }`}
            >
              {simState.isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {simState.isRunning ? "PAUSE SIM" : "RUN SIMULATION"}
            </button>

            <button
              onClick={() => venorEngine.tick()}
              disabled={simState.isRunning}
              className="flex items-center gap-1 rounded border border-border bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-3 transition-colors disabled:opacity-40"
              title="Execute 1 discrete market tick"
            >
              <FastForward className="h-3.5 w-3.5" />
              1 Tick
            </button>

            <button
              onClick={() => venorEngine.runBayesianOptimizationStep()}
              className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
              title="Force Bayesian parameter evolution step"
            >
              <Zap className="h-3.5 w-3.5" />
              Evolve Gen
            </button>

            {/* Speed Presets */}
            <div className="flex items-center rounded border border-border bg-surface-2 p-0.5">
              {[
                { label: "50ms", val: 50 },
                { label: "250ms", val: 250 },
                { label: "500ms", val: 500 },
                { label: "1s", val: 1000 },
              ].map((s) => (
                <button
                  key={s.val}
                  onClick={() => {
                    setCustomSpeed(s.val);
                    venorEngine.setSpeed(s.val);
                  }}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    simState.speedMs === s.val
                      ? "bg-foreground text-background font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => venorEngine.reset()}
              className="flex items-center gap-1 rounded border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-loss hover:border-loss/40 transition-colors"
              title="Reset simulation and capital"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* METRICS TELEMETRY STRIP */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Portfolio Capital</p>
          <p className="mt-1 text-base font-bold text-foreground">{fmtUsd(simState.equity)}</p>
          <p className="text-[9px] text-muted-foreground">
            Cash: {fmtUsd(simState.cash)}
          </p>
        </div>

        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Cumulative Alpha</p>
          <p className={`mt-1 text-base font-bold ${totalAlpha >= 0 ? "text-gain" : "text-loss"}`}>
            {totalAlpha >= 0 ? "+" : ""}{fmtUsd(totalAlpha)}
          </p>
          <p className="text-[9px] text-muted-foreground">
            {totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}% net notional
          </p>
        </div>

        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Sharpe / Sortino</p>
          <p className="mt-1 text-base font-bold text-primary">
            {simState.sharpeRatio.toFixed(2)} / {simState.sortinoRatio.toFixed(2)}
          </p>
          <p className="text-[9px] text-muted-foreground">Annualized (252d SDE)</p>
        </div>

        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Win Rate & Factor</p>
          <p className="mt-1 text-base font-bold text-foreground">
            {simState.winRatePct.toFixed(1)}%
          </p>
          <p className="text-[9px] text-muted-foreground">
            {simState.totalTradesCount} closed trades
          </p>
        </div>

        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Max Drawdown</p>
          <p className="mt-1 text-base font-bold text-loss">
            -{simState.maxDrawdownPct.toFixed(2)}%
          </p>
          <p className="text-[9px] text-muted-foreground">
            Current: -{simState.currentDrawdownPct.toFixed(2)}%
          </p>
        </div>

        <div className="rounded border border-border bg-card p-3">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Bayesian Generation</p>
          <p className="mt-1 text-base font-bold text-primary">
            Gen {simState.currentGeneration}
          </p>
          <p className="text-[9px] text-muted-foreground">
            Champion: Gen {simState.bestGeneration}
          </p>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* GEOPOLITICAL & MACRO SHOCK INJECTION CONTROLLER */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-3.5 shadow-soft">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                SVAR Macro Shock & Geopolitical Injection Engine
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Inject deterministic exogenous shocks into Structural VAR tensors (W, W², W³) to test reflexive resilience.
              </p>
            </div>
          </div>

          <div className="flex flex-1 max-w-2xl items-center gap-2 w-full">
            <select
              value={shockQuery}
              onChange={(e) => setShockQuery(e.target.value)}
              className="flex-1 rounded border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary"
            >
              {MACRO_PRESETS.map((p, i) => (
                <option key={i} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <button
              onClick={() => venorEngine.injectMacroShock(shockQuery)}
              className="flex items-center gap-1 rounded bg-foreground text-background px-3 py-1.5 text-xs font-bold hover:bg-foreground/90 transition-colors shrink-0"
            >
              <Flame className="h-3.5 w-3.5 text-loss" />
              Inject Impulse
            </button>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* PNL EQUITY CURVE & PERFORMANCE ATTRIBUTION */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Continuous Equity Curve Chart (2 cols) */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Real-Time Equity Growth vs Benchmark ($10,000,000 Initial Capital)
              </h3>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Tick Interval: {simState.speedMs}ms · {simState.equityCurve.length} observations
            </span>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={simState.equityCurve} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis
                  domain={["dataMin - 25000", "dataMax + 25000"]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                  axisLine={{ stroke: "hsl(var(--border))" }}
                  tickFormatter={(v) => `$${(v / 1000000).toFixed(2)}M`}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 11,
                    fontFamily: "monospace",
                  }}
                  formatter={(val: any) => [fmtUsd(Number(val)), ""]}
                />
                <ReferenceLine y={simState.initialCapital} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" label={{ value: "Base Capital", fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                <Area type="monotone" dataKey="equity" stroke="hsl(var(--foreground))" strokeWidth={2} fill="url(#equityGrad)" name="VENOR Portfolio Equity" />
                <Area type="monotone" dataKey="benchmark" stroke="hsl(var(--muted-foreground))" strokeWidth={1.2} strokeDasharray="3 3" fill="none" name="Synthetic Market Benchmark" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/50 pt-2">
            <span>Peak Equity: <strong className="text-foreground">{fmtUsd(simState.peakEquity)}</strong></span>
            <span>Total Microstructure Slippage: <strong className="text-loss">{fmtUsd(simState.totalSlippageDollars)}</strong></span>
            <span>Total Volume Traded: <strong className="text-foreground">{fmtUsd(simState.totalVolumeTraded)}</strong></span>
          </div>
        </div>

        {/* Strategy Fleet Allocation & Performance (1 col) */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sliders className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Strategy Fleet Fleet
                </h3>
              </div>
              <span className="text-[10px] text-primary font-bold">5 Active Models</span>
            </div>

            <div className="space-y-2.5">
              {simState.fleet.map((st) => (
                <div key={st.id} className="rounded border border-border/70 bg-surface-2 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => venorEngine.toggleStrategy(st.id)}
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${
                          st.active ? "bg-gain ring-2 ring-gain/20" : "bg-muted-foreground/40"
                        }`}
                        title={st.active ? "Click to disable" : "Click to enable"}
                      />
                      <span className="text-[11px] font-bold text-foreground">{st.name}</span>
                    </div>
                    <span className="text-[9px] bg-card border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                      v{st.generationVersion}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1 text-[9px] text-center bg-card p-1.5 rounded border border-border/50">
                    <div>
                      <p className="text-[7px] text-muted-foreground uppercase">Weight</p>
                      <p className="font-bold text-foreground">{st.allocationPct}%</p>
                    </div>
                    <div>
                      <p className="text-[7px] text-muted-foreground uppercase">Win Rate</p>
                      <p className="font-bold text-foreground">{st.winRatePct}%</p>
                    </div>
                    <div>
                      <p className="text-[7px] text-muted-foreground uppercase">Alpha</p>
                      <p className={`font-bold ${st.realizedAlphaBps >= 0 ? "text-gain" : "text-loss"}`}>
                        {fmtBps(st.realizedAlphaBps)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[7px] text-muted-foreground uppercase">Open</p>
                      <p className="font-bold text-primary">{st.openPositionsCount}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded border border-primary/20 bg-primary/5 p-2 text-[10px] text-muted-foreground">
            <p className="font-bold text-foreground mb-0.5 flex items-center gap-1">
              <Shield className="h-3 w-3 text-primary" />
              Almgren-Chriss Shortfall Routing
            </p>
            Zero market orders. Every execution is resolved via closed-form SDE trajectory minimizing temporary (<span className="text-foreground">η</span>) and permanent (<span className="text-foreground">γ</span>) impact.
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* BAYESIAN HYPERPARAMETER EVOLUTION & GENERATION LINEAGE */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Bayesian Self-Improvement & Hyperparameter Adaptation Lineage
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Continuous Thompson sampling & posterior parameter tuning optimizing out-of-sample forward Sharpe and convexity.
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2 py-0.5 rounded font-bold">
            Epoch Window: Every 12 Trades
          </span>
        </div>

        {/* Current Hyperparameters Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4 bg-surface-2 p-3 rounded-lg border border-border/70">
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">OU Entry Z-Score (Z_entry)</p>
            <p className="text-xs font-bold text-foreground">{simState.hyperparameters.ouEntryZScore.toFixed(3)}σ</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">OU Exit Z-Score (Z_exit)</p>
            <p className="text-xs font-bold text-foreground">{simState.hyperparameters.ouExitZScore.toFixed(3)}σ</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">OU Max Half-Life (τ_max)</p>
            <p className="text-xs font-bold text-foreground">{simState.hyperparameters.ouMaxHalfLifeDays.toFixed(1)} days</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Transfer Entropy Cutoff</p>
            <p className="text-xs font-bold text-foreground">{simState.hyperparameters.transferEntropyMinBits.toFixed(3)} bits</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">EVT Convexity Ratio</p>
            <p className="text-xs font-bold text-foreground">{simState.hyperparameters.evtMinConvexityRatio.toFixed(2)}:1</p>
          </div>
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wider text-muted-foreground">AC Risk Aversion (λ)</p>
            <p className="text-xs font-bold text-foreground">{simState.hyperparameters.acRiskAversionLambda.toExponential(2)}</p>
          </div>
        </div>

        {/* Generation History Table */}
        <div className="overflow-x-auto max-h-56">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-1.5 text-left font-medium">Gen</th>
                <th className="px-3 py-1.5 text-left font-medium">Timestamp</th>
                <th className="px-3 py-1.5 text-left font-medium">Forward Sharpe</th>
                <th className="px-3 py-1.5 text-left font-medium">Sortino</th>
                <th className="px-3 py-1.5 text-left font-medium">Win Rate</th>
                <th className="px-3 py-1.5 text-left font-medium">Profit Factor</th>
                <th className="px-3 py-1.5 text-left font-medium">Fitness Score</th>
                <th className="px-3 py-1.5 text-left font-medium">Mutation Rationale</th>
                <th className="px-3 py-1.5 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {simState.generationHistory.map((g) => (
                <tr
                  key={g.generation}
                  className={`border-b border-border/40 hover:bg-surface-2 transition-colors ${
                    g.isNewBest ? "bg-primary/5 font-semibold" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 text-foreground font-bold">Gen {g.generation}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{new Date(g.timestamp).toLocaleTimeString()}</td>
                  <td className="px-3 py-1.5 text-foreground">{g.sharpeRatio.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{g.sortinoRatio.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-foreground">{g.winRatePct}%</td>
                  <td className="px-3 py-1.5 text-foreground">{g.profitFactor.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-primary font-bold">{g.fitnessScore.toFixed(2)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground max-w-xs truncate">{g.mutationSummary}</td>
                  <td className="px-3 py-1.5">
                    {g.isNewBest ? (
                      <span className="rounded bg-gain/15 border border-gain/30 text-gain px-1.5 py-0.5 text-[9px] font-bold">
                        ★ CHAMPION PRIOR
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[9px]">Explored</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* ACTIVE POSITIONS & LIVE CONTINUOUS ORDER BLOTTER */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Open Positions */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Crosshair className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Active Open Quantitative Positions ({simState.activePositions.length})
              </h3>
            </div>
            <span className="text-[10px] text-muted-foreground">Mark-to-Market Real-Time</span>
          </div>

          <div className="overflow-x-auto max-h-64">
            {simState.activePositions.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No active positions. Quantitative scanners are continuously hunting candidate pairs...
              </div>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-1.5 text-left font-medium">Asset</th>
                    <th className="px-2 py-1.5 text-left font-medium">Strategy</th>
                    <th className="px-2 py-1.5 text-left font-medium">Side</th>
                    <th className="px-2 py-1.5 text-left font-medium">Shares</th>
                    <th className="px-2 py-1.5 text-left font-medium">Entry</th>
                    <th className="px-2 py-1.5 text-left font-medium">Current</th>
                    <th className="px-2 py-1.5 text-left font-medium">Unrealized PnL</th>
                    <th className="px-2 py-1.5 text-left font-medium">AC Slip</th>
                  </tr>
                </thead>
                <tbody>
                  {simState.activePositions.map((pos) => (
                    <tr key={pos.id} className="border-b border-border/40 hover:bg-surface-2 transition-colors">
                      <td className="px-2 py-1.5 text-foreground font-bold">
                        {pos.ticker}
                        {pos.secondaryTicker && <span className="text-muted-foreground">/{pos.secondaryTicker}</span>}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground text-[10px]">{pos.strategy.replace(/_/g, " ")}</td>
                      <td className="px-2 py-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          pos.side.includes("LONG") ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"
                        }`}>
                          {pos.side}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-foreground">{pos.shares.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">${pos.entryPrice.toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-foreground font-medium">${pos.currentPrice.toFixed(2)}</td>
                      <td className={`px-2 py-1.5 font-bold ${pos.unrealizedPnL >= 0 ? "text-gain" : "text-loss"}`}>
                        {pos.unrealizedPnL >= 0 ? "+" : ""}${Math.round(pos.unrealizedPnL).toLocaleString()} ({pos.unrealizedPnLPct.toFixed(1)}%)
                      </td>
                      <td className="px-2 py-1.5 text-loss">{pos.executionSlippageBps} bps</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Live Continuous Execution & Event Log */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                Continuous Microstructure Execution Blotter
              </h3>
            </div>
            <span className="text-[10px] text-muted-foreground">Deterministic Stream</span>
          </div>

          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {simState.executionLog.map((log) => (
              <div
                key={log.id}
                className={`flex items-start gap-2 text-[10.5px] p-1.5 rounded border transition-colors ${
                  log.type === "FILL"
                    ? "bg-gain/5 border-gain/20 text-gain"
                    : log.type === "EVOLUTION"
                    ? "bg-primary/5 border-primary/20 text-primary font-bold"
                    : log.type === "SHOCK"
                    ? "bg-loss/5 border-loss/20 text-loss font-bold"
                    : "bg-surface-2 border-border/60 text-muted-foreground"
                }`}
              >
                <span className="text-muted-foreground shrink-0 text-[9px] mt-0.5">{log.time}</span>
                <span className="leading-tight break-all">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
