import { useMemo } from "react";
import {
  Flame, TrendingUp, TrendingDown, Shield, AlertTriangle, Zap,
  BarChart3, Activity, RefreshCw, Trash2, Target, Layers,
  ArrowUpRight, ArrowDownRight, Repeat, Eye, Scale, RotateCcw,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOutcomeGradient, type IntelligenceSignal } from "@/hooks/useOutcomeGradient";

const signalConfig: Record<IntelligenceSignal["type"], { icon: typeof Flame; color: string; label: string }> = {
  invest: { icon: ArrowUpRight, color: "text-gain", label: "INVEST" },
  hedge: { icon: Shield, color: "text-warning", label: "HEDGE" },
  pair: { icon: Repeat, color: "text-primary", label: "PAIR TRADE" },
  avoid: { icon: ArrowDownRight, color: "text-loss", label: "AVOID" },
  scale_up: { icon: Scale, color: "text-gain", label: "SCALE UP" },
  rotate: { icon: RotateCcw, color: "text-primary", label: "ROTATE" },
};

const urgencyBorder: Record<string, string> = {
  high: "border-gain/40",
  medium: "border-primary/30",
  low: "border-border/50",
};

const OutcomeGradientDashboard = () => {
  const {
    entries, profitField, desirableZones, combinationScores,
    gradient, safetyStatus, shadowComparison, allocationHistory,
    intelligenceSignals,
    computeAndApplyGradient, clearAll, totalTrades, generation,
  } = useOutcomeGradient();

  // ─── Profit Field Heatmap Data ───────────────────
  const heatmapData = useMemo(() =>
    profitField.slice(0, 20).map(a => ({
      asset: a.asset,
      score: parseFloat(a.weightedProfitScore.toFixed(2)),
      winRate: parseFloat(a.winRate.toFixed(0)),
      fill: a.isBlacklisted
        ? "hsl(var(--muted-foreground))"
        : a.isHotZone
          ? "hsl(var(--gain))"
          : a.weightedProfitScore > 0
            ? "hsl(var(--primary))"
            : "hsl(var(--loss))",
    })),
  [profitField]);

  // ─── Feature Weight Bars ─────────────────────────
  const featureData = gradient.featureWeights.map(f => ({
    name: f.feature.charAt(0).toUpperCase() + f.feature.slice(1),
    weight: parseFloat(f.weight.toFixed(3)),
    delta: parseFloat(f.delta.toFixed(4)),
    fill: f.delta > 0 ? "hsl(var(--gain))" : f.delta < 0 ? "hsl(var(--loss))" : "hsl(var(--primary))",
  }));

  const isEmpty = totalTrades === 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Flame className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-wide">OUTCOME-DRIVEN GRADIENT SYSTEM</h3>
              <p className="text-[10px] text-muted-foreground font-mono">
                GEN {generation} · {totalTrades} TRADES INGESTED · {profitField.filter(a => a.isHotZone).length} HOT ZONES
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={computeAndApplyGradient} className="h-7 gap-1 text-[10px]" disabled={totalTrades < 5}>
              <RefreshCw className="h-3 w-3" /> Update Gradient
            </Button>
            <Button size="sm" variant="ghost" onClick={clearAll} className="h-7 gap-1 text-[10px] text-muted-foreground hover:text-loss">
              <Trash2 className="h-3 w-3" /> Reset
            </Button>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-border bg-card py-16 text-center">
          <Flame className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Trade Data Yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Cross a trade from Dashboard or log a trade in Trade Journal.
            ODGS will immediately emit invest/hedge/correlation signals.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-3 font-mono">
            First signal appears after 1 trade · Full gradient after 5+ trades
          </p>
        </div>
      ) : (
        <>
          {/* Safety Status Bar */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            {[
              { label: "Learning Rate α", value: safetyStatus.learningRate.toFixed(3), color: "text-primary" },
              { label: "Max Alloc Cap", value: `${safetyStatus.maxAllocCap}%`, color: "text-foreground" },
              { label: "Decay Factor", value: safetyStatus.decayFactor.toFixed(2), color: "text-muted-foreground" },
              { label: "Hot Zones", value: safetyStatus.diversificationCount.toString(), color: safetyStatus.diversificationCount >= 5 ? "text-gain" : "text-warning" },
              { label: "5-Trade PnL", value: `${safetyStatus.rollingPnl5 >= 0 ? "+" : ""}${safetyStatus.rollingPnl5.toFixed(2)}%`, color: safetyStatus.rollingPnl5 >= 0 ? "text-gain" : "text-loss" },
              { label: "Status", value: safetyStatus.rollbackTriggered ? "ROLLBACK" : "ACTIVE", color: safetyStatus.rollbackTriggered ? "text-loss" : "text-gain" },
            ].map(m => (
              <div key={m.label} className="rounded-lg border border-border/50 bg-muted/20 p-2.5 text-center">
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                <p className={`font-mono text-sm font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Rollback Warning */}
          {safetyStatus.rollbackTriggered && (
            <div className="rounded-xl border border-loss/20 bg-loss/5 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-loss flex-shrink-0" />
              <p className="text-xs text-loss">
                <strong>ROLLBACK TRIGGERED:</strong> 5-trade rolling PnL below {-8}%. All biases decaying toward neutral.
              </p>
            </div>
          )}

          {/* Blacklisted Assets */}
          {safetyStatus.blacklistedAssets.length > 0 && (
            <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Shield className="h-3.5 w-3.5 text-warning" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Blacklisted (DD &gt; 15%)</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {safetyStatus.blacklistedAssets.map(a => (
                  <Badge key={a} variant="outline" className="text-[9px] font-mono text-loss border-loss/30">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* ─── INTELLIGENCE SIGNALS ─── */}
          {intelligenceSignals.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                  Live Intelligence — {intelligenceSignals.length} Actionable Signals
                </span>
              </div>
              <div className="space-y-2">
                {intelligenceSignals.map(sig => {
                  const cfg = signalConfig[sig.type];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={sig.id}
                      className={`rounded-lg border ${urgencyBorder[sig.urgency]} bg-muted/10 p-3 transition-colors hover:bg-muted/20`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-md bg-muted/30 flex-shrink-0 mt-0.5`}>
                          <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 font-mono ${cfg.color} border-current/30`}>
                              {cfg.label}
                            </Badge>
                            <Badge variant="outline" className={`text-[8px] px-1.5 py-0 font-mono ${
                              sig.urgency === "high" ? "text-gain border-gain/30" :
                              sig.urgency === "medium" ? "text-primary border-primary/30" :
                              "text-muted-foreground border-border"
                            }`}>
                              {sig.urgency.toUpperCase()}
                            </Badge>
                            <span className="text-[9px] font-mono text-muted-foreground ml-auto">
                              {sig.confidence}% conf
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-foreground mb-1">{sig.title}</p>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">{sig.reasoning}</p>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {sig.assets.map(a => (
                              <span key={a} className="text-[9px] font-mono font-bold text-foreground bg-muted/40 px-1.5 py-0.5 rounded">
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
            </div>
          )}

          {/* Profit Field Heatmap */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Profit Field — Top 20 Assets by Weighted Score</span>
            </div>
            {heatmapData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={heatmapData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.3} />
                  <XAxis dataKey="asset" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 10 }}
                    formatter={(v: number, name: string) => [v.toFixed(2), name === "score" ? "Weighted Score" : "Win Rate %"]}
                  />
                  <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                    {heatmapData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Insufficient data</p>
            )}
          </div>

          {/* Desirable Zones + Feature Weights Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Desirable Zones */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Target className="h-3.5 w-3.5 text-gain" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Desirable Zones</span>
              </div>
              {desirableZones.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No zones detected yet</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {desirableZones.map(zone => (
                    <div key={zone.id} className="rounded-lg border border-gain/20 bg-gain/5 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex flex-wrap gap-1">
                          {zone.assets.slice(0, 5).map(a => (
                            <span key={a} className="font-mono text-[10px] font-bold text-gain">{a}</span>
                          ))}
                          {zone.assets.length > 5 && <span className="text-[9px] text-muted-foreground">+{zone.assets.length - 5}</span>}
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">{zone.regime}</span>
                      </div>
                      <div className="flex gap-3 text-[9px] font-mono text-muted-foreground">
                        <span>Avg PnL: <strong className="text-gain">+{zone.avgPnlPct.toFixed(1)}%</strong></span>
                        <span>Trades: {zone.tradeCount}</span>
                        <span>MOM: {zone.featureSignature.momentum.toFixed(0)}</span>
                        <span>SENT: {zone.featureSignature.sentiment.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Gradient Direction — Feature Weights */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
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
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (f.weight / 3) * 100)}%`,
                          backgroundColor: f.fill,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Allocation Shift Timeline */}
              {allocationHistory.length > 1 && (
                <div className="mt-4">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Weight Evolution</p>
                  <ResponsiveContainer width="100%" height={100}>
                    <AreaChart data={allocationHistory} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <XAxis dataKey="gen" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="momentum" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="sentiment" stroke="hsl(var(--gain))" fill="hsl(var(--gain))" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="vol" stroke="hsl(var(--warning))" fill="hsl(var(--warning))" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 9 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Shadow Evolution */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Shadow Evolution — Active vs Biased</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border/50 bg-muted/10 p-3 text-center">
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">Active (Neutral)</p>
                <p className={`font-mono text-xl font-bold ${shadowComparison.activePnlRolling >= 0 ? "text-gain" : "text-loss"}`}>
                  {shadowComparison.activePnlRolling >= 0 ? "+" : ""}{shadowComparison.activePnlRolling.toFixed(2)}%
                </p>
                <p className="text-[9px] text-muted-foreground mt-1">Rolling avg PnL</p>
              </div>
              <div className={`rounded-lg border p-3 text-center ${shadowComparison.promoted ? "border-gain/30 bg-gain/5" : "border-border/50 bg-muted/10"}`}>
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">
                  Evolved (ODGS) {shadowComparison.promoted && <span className="text-gain ml-1">★ PROMOTED</span>}
                </p>
                <p className={`font-mono text-xl font-bold ${shadowComparison.evolvedPnlRolling >= 0 ? "text-gain" : "text-loss"}`}>
                  {shadowComparison.evolvedPnlRolling >= 0 ? "+" : ""}{shadowComparison.evolvedPnlRolling.toFixed(2)}%
                </p>
                <p className="text-[9px] text-muted-foreground mt-1">Bias-weighted avg PnL</p>
              </div>
            </div>
          </div>

          {/* Combination Matrix */}
          {combinationScores.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Zap className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Asset Pair Synergy</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="px-2 py-2 text-left font-medium">Pair</th>
                      <th className="px-2 py-2 text-right font-medium">Synergy</th>
                      <th className="px-2 py-2 text-right font-medium">Win Rate</th>
                      <th className="px-2 py-2 text-right font-medium">Avg PnL</th>
                      <th className="px-2 py-2 text-right font-medium">Trades</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinationScores.slice(0, 10).map(p => (
                      <tr key={p.pair} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="px-2 py-2 font-mono font-semibold text-foreground">{p.pair}</td>
                        <td className={`px-2 py-2 text-right font-mono ${p.synergyScore > 0 ? "text-gain" : "text-loss"}`}>
                          {p.synergyScore.toFixed(2)}
                        </td>
                        <td className={`px-2 py-2 text-right font-mono ${p.jointWinRate > 50 ? "text-gain" : "text-loss"}`}>
                          {p.jointWinRate.toFixed(0)}%
                        </td>
                        <td className={`px-2 py-2 text-right font-mono ${p.jointAvgPnl > 0 ? "text-gain" : "text-loss"}`}>
                          {p.jointAvgPnl >= 0 ? "+" : ""}{p.jointAvgPnl.toFixed(2)}%
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-muted-foreground">{p.tradeCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Asset Bias Table */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp className="h-3.5 w-3.5 text-gain" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Current Asset Biases</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Asset</th>
                    <th className="px-2 py-2 text-right font-medium">Profit Score</th>
                    <th className="px-2 py-2 text-right font-medium">Win Rate</th>
                    <th className="px-2 py-2 text-right font-medium">Selection Bias</th>
                    <th className="px-2 py-2 text-right font-medium">Alloc Scale</th>
                    <th className="px-2 py-2 text-center font-medium">Trend</th>
                    <th className="px-2 py-2 text-center font-medium">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {profitField.slice(0, 15).map(a => (
                    <tr key={a.asset} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-2 py-2 font-mono font-semibold text-foreground">{a.asset}</td>
                      <td className={`px-2 py-2 text-right font-mono ${a.weightedProfitScore > 0 ? "text-gain" : "text-loss"}`}>
                        {a.weightedProfitScore.toFixed(2)}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono ${a.winRate > 50 ? "text-gain" : "text-loss"}`}>
                        {a.winRate.toFixed(0)}%
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-foreground">
                        {(gradient.assetBiases[a.asset] || 1.0).toFixed(3)}×
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-foreground">
                        {(gradient.allocationScales[a.asset] || 1.0).toFixed(3)}×
                      </td>
                      <td className="px-2 py-2 text-center">
                        {a.recentTrend === "rising" && <TrendingUp className="h-3 w-3 text-gain inline" />}
                        {a.recentTrend === "falling" && <TrendingDown className="h-3 w-3 text-loss inline" />}
                        {a.recentTrend === "stable" && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        {a.isBlacklisted ? (
                          <Badge variant="destructive" className="text-[8px] px-1.5 py-0">BLOCKED</Badge>
                        ) : a.isHotZone ? (
                          <Badge className="text-[8px] px-1.5 py-0 bg-gain/20 text-gain border-gain/30">HOT</Badge>
                        ) : (
                          <span className="text-muted-foreground text-[9px]">—</span>
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
