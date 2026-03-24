import { useMemo, lazy, Suspense } from "react";
import {
  Flame, TrendingUp, TrendingDown, Shield, AlertTriangle, Zap,
  BarChart3, Activity, RefreshCw, Trash2, Target, Layers,
  ArrowUpRight, ArrowDownRight, Repeat, Eye, Scale, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOutcomeGradient, type IntelligenceSignal } from "@/hooks/useOutcomeGradient";

const ProfitSurface3D = lazy(() => import("./ProfitSurface3D"));

const signalConfig: Record<IntelligenceSignal["type"], { icon: typeof Flame; color: string; label: string; bg: string }> = {
  invest: { icon: ArrowUpRight, color: "text-gain", label: "INVEST", bg: "bg-gain/10 border-gain/30" },
  hedge: { icon: Shield, color: "text-warning", label: "HEDGE", bg: "bg-warning/10 border-warning/30" },
  pair: { icon: Repeat, color: "text-primary", label: "PAIR", bg: "bg-primary/10 border-primary/30" },
  avoid: { icon: ArrowDownRight, color: "text-loss", label: "AVOID", bg: "bg-loss/10 border-loss/30" },
  scale_up: { icon: Scale, color: "text-gain", label: "SCALE↑", bg: "bg-gain/10 border-gain/30" },
  rotate: { icon: RotateCcw, color: "text-primary", label: "ROTATE", bg: "bg-primary/10 border-primary/30" },
};

const OutcomeGradientDashboard = () => {
  const {
    entries, profitField, desirableZones, combinationScores,
    gradient, safetyStatus, shadowComparison, allocationHistory,
    intelligenceSignals,
    computeAndApplyGradient, clearAll, totalTrades, generation,
  } = useOutcomeGradient();

  // ─── 3D Surface data from entries ───────────────────
  const surfaceData = useMemo(() =>
    entries.slice(0, 100).map(e => ({
      momentum: e.features.momentum,
      vol: e.features.vol,
      pnl: e.pnlPct,
    })),
  [entries]);

  // ─── Profit scatter for 2D bubble chart ─────────────
  const scatterData = useMemo(() =>
    profitField.slice(0, 20).map(a => {
      const entry = entries.find(e => e.asset === a.asset);
      return {
        x: entry?.features.momentum ?? 0,
        y: entry?.features.vol ?? 20,
        z: Math.max(5, Math.abs(a.weightedProfitScore) * 15),
        asset: a.asset,
        pnl: a.avgPnlPct,
        winRate: a.winRate,
        fill: a.isBlacklisted ? "hsl(0,0%,40%)" : a.isHotZone ? "hsl(142,71%,45%)" : a.weightedProfitScore > 0 ? "hsl(217,91%,60%)" : "hsl(0,84%,60%)",
      };
    }),
  [profitField, entries]);

  // ─── Heatmap data ───────────────────────────────────
  const heatmapData = useMemo(() =>
    profitField.slice(0, 15).map(a => ({
      asset: a.asset,
      score: parseFloat(a.weightedProfitScore.toFixed(2)),
      winRate: parseFloat(a.winRate.toFixed(0)),
      fill: a.isBlacklisted ? "hsl(0,0%,40%)" : a.isHotZone ? "hsl(142,71%,45%)" : a.weightedProfitScore > 0 ? "hsl(217,91%,60%)" : "hsl(0,84%,60%)",
    })),
  [profitField]);

  const featureData = gradient.featureWeights.map(f => ({
    name: f.feature.charAt(0).toUpperCase() + f.feature.slice(1),
    weight: parseFloat(f.weight.toFixed(3)),
    delta: parseFloat(f.delta.toFixed(4)),
    fill: f.delta > 0 ? "hsl(142,71%,45%)" : f.delta < 0 ? "hsl(0,84%,60%)" : "hsl(217,91%,60%)",
  }));

  const isEmpty = totalTrades === 0 && intelligenceSignals.length === 0;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Flame className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-wide">PROFIT GRADIENT ENGINE</h3>
              <p className="text-[9px] text-muted-foreground font-mono">
                GEN {generation} · {totalTrades} TRADES · {profitField.filter(a => a.isHotZone).length} HOT ZONES · {intelligenceSignals.length} SIGNALS
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" onClick={computeAndApplyGradient} className="h-7 gap-1 text-[10px]">
              <RefreshCw className="h-3 w-3" /> Evolve
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 text-[10px] text-muted-foreground">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-border bg-card py-14 text-center">
          <Flame className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
          <h3 className="text-base font-semibold text-foreground mb-1">No Trade Data</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Cross a trade from Dashboard to start the learning engine.
          </p>
        </div>
      ) : (
        <>
          {/* ─── INTELLIGENCE SIGNALS (always first, most important) ─── */}
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Eye className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                Live Intelligence — {intelligenceSignals.length} Signals
              </span>
            </div>
            {intelligenceSignals.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {intelligenceSignals.map(sig => {
                  const cfg = signalConfig[sig.type];
                  const Icon = cfg.icon;
                  return (
                    <div key={sig.id} className={`rounded-lg border p-3 ${cfg.bg} transition-colors`}>
                      <div className="flex items-start gap-2">
                        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 font-mono ${cfg.color}`}>
                              {cfg.label}
                            </Badge>
                            <span className={`text-[8px] font-mono px-1 py-0 rounded ${
                              sig.urgency === "high" ? "bg-gain/20 text-gain" : "text-muted-foreground"
                            }`}>
                              {sig.urgency.toUpperCase()}
                            </span>
                            <span className="text-[8px] font-mono text-muted-foreground ml-auto">
                              {sig.confidence}%
                            </span>
                          </div>
                          <p className="text-[11px] font-semibold text-foreground leading-tight mb-1">{sig.title}</p>
                          <p className="text-[9px] text-muted-foreground leading-relaxed">{sig.reasoning}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sig.assets.map(a => (
                              <span key={a} className="text-[9px] font-mono font-bold text-foreground bg-background/60 px-1.5 py-0.5 rounded">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Cross trades to generate signals</p>
            )}
          </div>

          {/* ─── 3D PROFIT SURFACE + Safety Row ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* 3D Surface */}
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4 relative">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Profit Surface — Momentum × Vol × PnL</span>
              </div>
              <Suspense fallback={<div className="w-full h-[280px] flex items-center justify-center text-xs text-muted-foreground">Loading 3D...</div>}>
                <ProfitSurface3D data={surfaceData} />
              </Suspense>
            </div>

            {/* Bubble Scatter: Momentum vs Vol, sized by profit */}
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-gain" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Asset Positioning — Feature Space</span>
              </div>
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,20%)" strokeOpacity={0.4} />
                    <XAxis type="number" dataKey="x" name="Momentum" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "Momentum", position: "bottom", fontSize: 9, fill: "#94a3b8" }} />
                    <YAxis type="number" dataKey="y" name="Volatility" tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={false} tickLine={false} label={{ value: "Vol", angle: -90, position: "left", fontSize: 9, fill: "#94a3b8" }} />
                    <ZAxis type="number" dataKey="z" range={[30, 300]} />
                    <Tooltip
                      contentStyle={{ background: "hsl(220,13%,10%)", border: "1px solid hsl(220,13%,20%)", borderRadius: 8, fontSize: 10 }}
                      formatter={(v: number, name: string) => [v.toFixed(1), name]}
                      labelFormatter={() => ""}
                      content={({ payload }) => {
                        if (!payload?.[0]) return null;
                        const d = payload[0].payload;
                        return (
                          <div className="bg-card border border-border rounded-lg p-2 text-[10px] shadow-lg">
                            <p className="font-mono font-bold text-foreground">{d.asset}</p>
                            <p className="text-muted-foreground">PnL: <span className={d.pnl >= 0 ? "text-gain" : "text-loss"}>{d.pnl >= 0 ? "+" : ""}{d.pnl.toFixed(1)}%</span></p>
                            <p className="text-muted-foreground">Win: {d.winRate.toFixed(0)}%</p>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatterData}>
                      {scatterData.map((d, i) => (
                        <Cell key={i} fill={d.fill} fillOpacity={0.8} stroke={d.fill} strokeWidth={1} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">Awaiting data</div>
              )}
            </div>
          </div>

          {/* Safety Status Compact */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
            {[
              { label: "α Rate", value: safetyStatus.learningRate.toFixed(3), color: "text-primary" },
              { label: "Max Cap", value: `${safetyStatus.maxAllocCap}%`, color: "text-foreground" },
              { label: "Decay", value: safetyStatus.decayFactor.toFixed(2), color: "text-muted-foreground" },
              { label: "Hot Zones", value: String(safetyStatus.diversificationCount), color: safetyStatus.diversificationCount >= 5 ? "text-gain" : "text-warning" },
              { label: "5-Trade", value: `${safetyStatus.rollingPnl5 >= 0 ? "+" : ""}${safetyStatus.rollingPnl5.toFixed(1)}%`, color: safetyStatus.rollingPnl5 >= 0 ? "text-gain" : "text-loss" },
              { label: "Status", value: safetyStatus.rollbackTriggered ? "HALT" : "LIVE", color: safetyStatus.rollbackTriggered ? "text-loss" : "text-gain" },
            ].map(m => (
              <div key={m.label} className="rounded-lg border border-border/40 bg-muted/10 p-2 text-center">
                <p className="text-[7px] uppercase tracking-widest text-muted-foreground">{m.label}</p>
                <p className={`font-mono text-xs font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Rollback + Blacklist */}
          {safetyStatus.rollbackTriggered && (
            <div className="rounded-lg border border-loss/20 bg-loss/5 p-2.5 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-loss flex-shrink-0" />
              <p className="text-[10px] text-loss"><strong>ROLLBACK:</strong> 5-trade PnL below -8%. Biases decaying to neutral.</p>
            </div>
          )}
          {safetyStatus.blacklistedAssets.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/10 p-2.5 flex items-center gap-2 flex-wrap">
              <Shield className="h-3 w-3 text-warning flex-shrink-0" />
              <span className="text-[9px] font-semibold text-foreground uppercase">Blocked:</span>
              {safetyStatus.blacklistedAssets.map(a => (
                <Badge key={a} variant="outline" className="text-[8px] font-mono text-loss border-loss/30">{a}</Badge>
              ))}
            </div>
          )}

          {/* Profit Field Bar + Gradient Direction */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Profit Field</span>
              </div>
              {heatmapData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={heatmapData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220,13%,20%)" strokeOpacity={0.3} />
                    <XAxis dataKey="asset" tick={{ fill: "#94a3b8", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(220,13%,10%)", border: "1px solid hsl(220,13%,20%)", borderRadius: 8, fontSize: 10 }} />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {heatmapData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Awaiting data</p>
              )}
            </div>

            {/* Gradient Direction */}
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Gradient Direction</span>
              </div>
              <div className="space-y-3">
                {featureData.map(f => (
                  <div key={f.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground">{f.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">{f.weight.toFixed(3)}</span>
                        {f.delta !== 0 && (
                          <span className={`flex items-center gap-0.5 text-[9px] font-mono ${f.delta > 0 ? "text-gain" : "text-loss"}`}>
                            {f.delta > 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                            {f.delta > 0 ? "+" : ""}{f.delta.toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="h-2 rounded-full bg-muted/30 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (f.weight / 3) * 100)}%`, backgroundColor: f.fill }} />
                    </div>
                  </div>
                ))}
              </div>

              {allocationHistory.length > 1 && (
                <div className="mt-3">
                  <p className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Weight Evolution</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={allocationHistory} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                      <XAxis dataKey="gen" tick={{ fill: "#94a3b8", fontSize: 7 }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="momentum" stroke="hsl(217,91%,60%)" fill="hsl(217,91%,60%)" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="sentiment" stroke="hsl(142,71%,45%)" fill="hsl(142,71%,45%)" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="vol" stroke="hsl(38,92%,50%)" fill="hsl(38,92%,50%)" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Shadow Evolution + Desirable Zones */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Shadow Evolution</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-center">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">Active</p>
                  <p className={`font-mono text-lg font-bold ${shadowComparison.activePnlRolling >= 0 ? "text-gain" : "text-loss"}`}>
                    {shadowComparison.activePnlRolling >= 0 ? "+" : ""}{shadowComparison.activePnlRolling.toFixed(2)}%
                  </p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${shadowComparison.promoted ? "border-gain/30 bg-gain/5" : "border-border/40 bg-muted/10"}`}>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">
                    ODGS {shadowComparison.promoted && <span className="text-gain">★</span>}
                  </p>
                  <p className={`font-mono text-lg font-bold ${shadowComparison.evolvedPnlRolling >= 0 ? "text-gain" : "text-loss"}`}>
                    {shadowComparison.evolvedPnlRolling >= 0 ? "+" : ""}{shadowComparison.evolvedPnlRolling.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-gain" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Desirable Zones</span>
              </div>
              {desirableZones.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Need 5+ trades to detect zones</p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {desirableZones.map(zone => (
                    <div key={zone.id} className="rounded-lg border border-gain/20 bg-gain/5 p-2.5">
                      <div className="flex items-center justify-between mb-0.5">
                        <div className="flex flex-wrap gap-1">
                          {zone.assets.slice(0, 4).map(a => (
                            <span key={a} className="font-mono text-[10px] font-bold text-gain">{a}</span>
                          ))}
                        </div>
                        <span className="text-[8px] font-mono text-muted-foreground uppercase">{zone.regime}</span>
                      </div>
                      <div className="flex gap-2 text-[8px] font-mono text-muted-foreground">
                        <span>PnL: <strong className="text-gain">+{zone.avgPnlPct.toFixed(1)}%</strong></span>
                        <span>N={zone.tradeCount}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Combination Matrix + Asset Bias Table */}
          {combinationScores.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Asset Pair Synergy</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-2 py-1.5 text-left font-medium">Pair</th>
                      <th className="px-2 py-1.5 text-right font-medium">Synergy</th>
                      <th className="px-2 py-1.5 text-right font-medium">Win%</th>
                      <th className="px-2 py-1.5 text-right font-medium">PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinationScores.slice(0, 8).map(p => (
                      <tr key={p.pair} className="border-b border-border/20 hover:bg-muted/10">
                        <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{p.pair}</td>
                        <td className={`px-2 py-1.5 text-right font-mono ${p.synergyScore > 0 ? "text-gain" : "text-loss"}`}>{p.synergyScore.toFixed(2)}</td>
                        <td className={`px-2 py-1.5 text-right font-mono ${p.jointWinRate > 50 ? "text-gain" : "text-loss"}`}>{p.jointWinRate.toFixed(0)}%</td>
                        <td className={`px-2 py-1.5 text-right font-mono ${p.jointAvgPnl > 0 ? "text-gain" : "text-loss"}`}>{p.jointAvgPnl >= 0 ? "+" : ""}{p.jointAvgPnl.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Asset Bias Table */}
          <div className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="h-3.5 w-3.5 text-gain" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Asset Biases</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-1.5 text-left font-medium">Asset</th>
                    <th className="px-2 py-1.5 text-right font-medium">Score</th>
                    <th className="px-2 py-1.5 text-right font-medium">Win%</th>
                    <th className="px-2 py-1.5 text-right font-medium">Bias</th>
                    <th className="px-2 py-1.5 text-center font-medium">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {profitField.slice(0, 12).map(a => (
                    <tr key={a.asset} className="border-b border-border/20 hover:bg-muted/10">
                      <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{a.asset}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${a.weightedProfitScore > 0 ? "text-gain" : "text-loss"}`}>{a.weightedProfitScore.toFixed(2)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${a.winRate > 50 ? "text-gain" : "text-loss"}`}>{a.winRate.toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right font-mono text-foreground">{(gradient.assetBiases[a.asset] || 1.0).toFixed(2)}×</td>
                      <td className="px-2 py-1.5 text-center">
                        {a.isBlacklisted ? (
                          <Badge variant="destructive" className="text-[7px] px-1 py-0">BLOCK</Badge>
                        ) : a.isHotZone ? (
                          <Badge className="text-[7px] px-1 py-0 bg-gain/20 text-gain border-gain/30">HOT</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default OutcomeGradientDashboard;
