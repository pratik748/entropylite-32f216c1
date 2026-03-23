import { useMemo } from "react";
import {
  Flame, TrendingUp, TrendingDown, Shield, AlertTriangle, Zap,
  BarChart3, Activity, RefreshCw, Trash2, Target, Layers,
  ArrowUpRight, ArrowDownRight, Repeat, Eye, Scale, RotateCcw,
  Gauge, Brain, Percent, Crosshair,
} from "lucide-react";
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOutcomeGradient, type IntelligenceSignal } from "@/hooks/useOutcomeGradient";
import ProfitHeatmap3D from "./ProfitHeatmap3D";

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
    intelligenceSignals, advancedMetrics,
    computeAndApplyGradient, clearAll, totalTrades, generation,
  } = useOutcomeGradient();

  const heatmapData = useMemo(() =>
    profitField.slice(0, 20).map(a => ({
      asset: a.asset,
      score: parseFloat(a.weightedProfitScore.toFixed(2)),
      winRate: parseFloat(a.winRate.toFixed(0)),
      fill: a.isBlacklisted
        ? "hsl(220, 12%, 40%)"
        : a.isHotZone
          ? "hsl(142, 71%, 45%)"
          : a.weightedProfitScore > 0
            ? "hsl(217, 91%, 60%)"
            : "hsl(0, 84%, 60%)",
    })),
  [profitField]);

  const featureData = gradient.featureWeights.map(f => ({
    name: f.feature.charAt(0).toUpperCase() + f.feature.slice(1),
    weight: parseFloat(f.weight.toFixed(3)),
    delta: parseFloat(f.delta.toFixed(4)),
    fill: f.delta > 0 ? "hsl(142, 71%, 45%)" : f.delta < 0 ? "hsl(0, 84%, 60%)" : "hsl(217, 91%, 60%)",
  }));

  // Radar data for feature importance
  const radarData = advancedMetrics.featureImportance.map(f => ({
    feature: f.feature,
    importance: parseFloat(f.importance.toFixed(1)),
    correlation: parseFloat((Math.abs(f.correlation) * 100).toFixed(1)),
  }));

  // Regime alpha scatter
  const regimeScatter = Object.entries(advancedMetrics.regimeAlpha).map(([regime, alpha]) => ({
    regime,
    alpha: parseFloat(alpha.toFixed(2)),
    trades: entries.filter(e => e.features.regime === regime).length,
  }));

  const isEmpty = totalTrades === 0;

  const metricColor = (val: number, thresh = 0) => val > thresh ? "text-gain" : val < -thresh ? "text-loss" : "text-foreground";

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
                GEN {generation} · {totalTrades} TRADES · {profitField.filter(a => a.isHotZone).length} HOT ZONES · SHARPE {advancedMetrics.sharpeRatio.toFixed(2)}
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
          {/* ─── ADVANCED METRICS STRIP ─── */}
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-9 gap-2">
            {[
              { label: "Sharpe", value: advancedMetrics.sharpeRatio.toFixed(2), color: metricColor(advancedMetrics.sharpeRatio, 0.5), icon: Gauge },
              { label: "Sortino", value: advancedMetrics.sortinoRatio.toFixed(2), color: metricColor(advancedMetrics.sortinoRatio, 0.5), icon: Shield },
              { label: "Kelly %", value: `${(advancedMetrics.kellyFraction * 100).toFixed(1)}%`, color: metricColor(advancedMetrics.kellyFraction), icon: Target },
              { label: "Expectancy", value: `${advancedMetrics.expectancy >= 0 ? "+" : ""}${advancedMetrics.expectancy.toFixed(2)}%`, color: metricColor(advancedMetrics.expectancy), icon: TrendingUp },
              { label: "Profit Factor", value: advancedMetrics.profitFactor === Infinity ? "∞" : advancedMetrics.profitFactor.toFixed(2), color: metricColor(advancedMetrics.profitFactor - 1), icon: BarChart3 },
              { label: "Payoff Ratio", value: advancedMetrics.payoffRatio === Infinity ? "∞" : advancedMetrics.payoffRatio.toFixed(2), color: metricColor(advancedMetrics.payoffRatio - 1), icon: Scale },
              { label: "Tail Ratio", value: advancedMetrics.tailRatio.toFixed(2), color: metricColor(advancedMetrics.tailRatio - 1), icon: Activity },
              { label: "Entropy", value: advancedMetrics.profitEntropy.toFixed(2), color: "text-primary", icon: Brain },
              { label: "MOM Decay", value: advancedMetrics.momentumDecay.toFixed(3), color: metricColor(advancedMetrics.momentumDecay), icon: Crosshair },
            ].map(m => {
              const Icon = m.icon;
              return (
                <div key={m.label} className="rounded-lg border border-border/50 bg-muted/10 p-2 text-center group hover:bg-muted/20 transition-colors">
                  <div className="flex items-center justify-center gap-1 mb-0.5">
                    <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                    <p className="text-[7px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                  </div>
                  <p className={`font-mono text-sm font-bold ${m.color}`}>{m.value}</p>
                </div>
              );
            })}
          </div>

          {/* Win/Loss Streaks + Safety Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              { label: "Avg Win", value: `+${advancedMetrics.avgWin.toFixed(2)}%`, color: "text-gain" },
              { label: "Avg Loss", value: `${advancedMetrics.avgLoss.toFixed(2)}%`, color: "text-loss" },
              { label: "Max Win Streak", value: advancedMetrics.maxConsecutiveWins.toString(), color: "text-gain" },
              { label: "Max Loss Streak", value: advancedMetrics.maxConsecutiveLosses.toString(), color: "text-loss" },
              { label: "Learning Rate α", value: safetyStatus.learningRate.toFixed(3), color: "text-primary" },
              { label: "Decay Factor", value: safetyStatus.decayFactor.toFixed(2), color: "text-muted-foreground" },
              { label: "5-Trade PnL", value: `${safetyStatus.rollingPnl5 >= 0 ? "+" : ""}${safetyStatus.rollingPnl5.toFixed(2)}%`, color: metricColor(safetyStatus.rollingPnl5) },
              { label: "System", value: safetyStatus.rollbackTriggered ? "ROLLBACK" : "ACTIVE", color: safetyStatus.rollbackTriggered ? "text-loss" : "text-gain" },
            ].map(m => (
              <div key={m.label} className="rounded-lg border border-border/40 bg-muted/5 p-2 text-center">
                <p className="text-[7px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
                <p className={`font-mono text-xs font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* Rollback + Blacklist Warnings */}
          {safetyStatus.rollbackTriggered && (
            <div className="rounded-xl border border-loss/20 bg-loss/5 p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-loss flex-shrink-0" />
              <p className="text-xs text-loss">
                <strong>ROLLBACK TRIGGERED:</strong> 5-trade rolling PnL below -8%. All biases decaying toward neutral.
              </p>
            </div>
          )}

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

          {/* ─── 3D PROFIT HEATMAP ─── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                3D Profit Field — Momentum × Volatility × PnL
              </span>
            </div>
            <ProfitHeatmap3D data={advancedMetrics.heatmapGrid} />
          </div>

          {/* ─── INTELLIGENCE SIGNALS ─── */}
          {intelligenceSignals.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">
                  Live Intelligence — {intelligenceSignals.length} Actionable Signals
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {intelligenceSignals.map(sig => {
                  const cfg = signalConfig[sig.type];
                  const Icon = cfg.icon;
                  return (
                    <div
                      key={sig.id}
                      className={`rounded-lg border ${urgencyBorder[sig.urgency]} bg-muted/10 p-3 transition-colors hover:bg-muted/20`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted/30 flex-shrink-0 mt-0.5">
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

          {/* ─── FEATURE IMPORTANCE + REGIME ALPHA ROW ─── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Feature Importance Radar */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Brain className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Feature Importance</span>
              </div>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid stroke="hsl(220, 12%, 25%)" strokeOpacity={0.5} />
                    <PolarAngleAxis dataKey="feature" tick={{ fill: "hsl(220, 12%, 60%)", fontSize: 9 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="importance" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.2} strokeWidth={2} />
                    <Radar dataKey="correlation" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.1} strokeWidth={1.5} strokeDasharray="4 2" />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">Need more data</p>
              )}
              <div className="flex justify-center gap-4 mt-1">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-primary rounded" />
                  <span className="text-[8px] text-muted-foreground">Importance</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-0.5 bg-gain rounded" style={{ borderStyle: "dashed" }} />
                  <span className="text-[8px] text-muted-foreground">|Correlation|</span>
                </div>
              </div>
            </div>

            {/* Regime Alpha */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Crosshair className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Regime Alpha</span>
              </div>
              {regimeScatter.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={regimeScatter} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" strokeOpacity={0.3} />
                    <XAxis dataKey="regime" tick={{ fill: "hsl(220, 12%, 60%)", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(220, 12%, 60%)", fontSize: 8 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(222, 20%, 10%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 10 }} />
                    <Bar dataKey="alpha" radius={[3, 3, 0, 0]}>
                      {regimeScatter.map((d, i) => (
                        <Cell key={i} fill={d.alpha > 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)"} fillOpacity={0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">Need 3+ trades</p>
              )}
            </div>

            {/* Gradient Direction */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Gradient Vector</span>
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
                        style={{ width: `${Math.min(100, (f.weight / 3) * 100)}%`, backgroundColor: f.fill }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {allocationHistory.length > 1 && (
                <div className="mt-4">
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Weight Evolution</p>
                  <ResponsiveContainer width="100%" height={80}>
                    <AreaChart data={allocationHistory} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                      <XAxis dataKey="gen" tick={{ fill: "hsl(220, 12%, 60%)", fontSize: 7 }} axisLine={false} tickLine={false} />
                      <Area type="monotone" dataKey="momentum" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="sentiment" stroke="hsl(142, 71%, 45%)" fill="hsl(142, 71%, 45%)" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                      <Area type="monotone" dataKey="vol" stroke="hsl(38, 92%, 50%)" fill="hsl(38, 92%, 50%)" fillOpacity={0.1} strokeWidth={1.5} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* ─── PROFIT FIELD BAR + DESIRABLE ZONES ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Profit Field */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Profit Field — Top Assets</span>
              </div>
              {heatmapData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={heatmapData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" strokeOpacity={0.3} />
                    <XAxis dataKey="asset" tick={{ fill: "hsl(220, 12%, 60%)", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "hsl(220, 12%, 60%)", fontSize: 9 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(222, 20%, 10%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 10 }} />
                    <Bar dataKey="score" radius={[3, 3, 0, 0]}>
                      {heatmapData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">Insufficient data</p>
              )}
            </div>

            {/* Desirable Zones */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Target className="h-3.5 w-3.5 text-gain" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Desirable Zones</span>
              </div>
              {desirableZones.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No zones detected yet (need 5+ trades)</p>
              ) : (
                <div className="space-y-2 max-h-[180px] overflow-y-auto">
                  {desirableZones.map(zone => (
                    <div key={zone.id} className="rounded-lg border border-gain/20 bg-gain/5 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex flex-wrap gap-1">
                          {zone.assets.slice(0, 5).map(a => (
                            <span key={a} className="font-mono text-[10px] font-bold text-gain">{a}</span>
                          ))}
                        </div>
                        <span className="text-[9px] font-mono text-muted-foreground uppercase">{zone.regime}</span>
                      </div>
                      <div className="flex gap-3 text-[9px] font-mono text-muted-foreground">
                        <span>Avg: <strong className="text-gain">+{zone.avgPnlPct.toFixed(1)}%</strong></span>
                        <span>N: {zone.tradeCount}</span>
                        <span>MOM: {zone.featureSignature.momentum.toFixed(0)}</span>
                        <span>SENT: {zone.featureSignature.sentiment.toFixed(0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ─── SHADOW EVOLUTION ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Shadow Evolution</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3 text-center">
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">Active (Neutral)</p>
                  <p className={`font-mono text-xl font-bold ${metricColor(shadowComparison.activePnlRolling)}`}>
                    {shadowComparison.activePnlRolling >= 0 ? "+" : ""}{shadowComparison.activePnlRolling.toFixed(2)}%
                  </p>
                </div>
                <div className={`rounded-lg border p-3 text-center ${shadowComparison.promoted ? "border-gain/30 bg-gain/5" : "border-border/50 bg-muted/10"}`}>
                  <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1">
                    Evolved {shadowComparison.promoted && <span className="text-gain ml-1">★</span>}
                  </p>
                  <p className={`font-mono text-xl font-bold ${metricColor(shadowComparison.evolvedPnlRolling)}`}>
                    {shadowComparison.evolvedPnlRolling >= 0 ? "+" : ""}{shadowComparison.evolvedPnlRolling.toFixed(2)}%
                  </p>
                </div>
              </div>
            </div>

            {/* Combination Matrix */}
            {combinationScores.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Pair Synergy</span>
                </div>
                <div className="overflow-x-auto max-h-[140px]">
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
                      {combinationScores.slice(0, 6).map(p => (
                        <tr key={p.pair} className="border-b border-border/30">
                          <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{p.pair}</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${metricColor(p.synergyScore)}`}>{p.synergyScore.toFixed(2)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${metricColor(p.jointWinRate - 50)}`}>{p.jointWinRate.toFixed(0)}%</td>
                          <td className={`px-2 py-1.5 text-right font-mono ${metricColor(p.jointAvgPnl)}`}>{p.jointAvgPnl >= 0 ? "+" : ""}{p.jointAvgPnl.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* ─── ASSET BIAS TABLE ─── */}
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-3">
              <TrendingUp className="h-3.5 w-3.5 text-gain" />
              <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Asset Bias Matrix</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Asset</th>
                    <th className="px-2 py-2 text-right font-medium">Score</th>
                    <th className="px-2 py-2 text-right font-medium">Win%</th>
                    <th className="px-2 py-2 text-right font-medium">Bias</th>
                    <th className="px-2 py-2 text-right font-medium">Alloc</th>
                    <th className="px-2 py-2 text-center font-medium">Trend</th>
                    <th className="px-2 py-2 text-center font-medium">Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {profitField.slice(0, 12).map(a => (
                    <tr key={a.asset} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="px-2 py-1.5 font-mono font-semibold text-foreground">{a.asset}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${metricColor(a.weightedProfitScore)}`}>{a.weightedProfitScore.toFixed(2)}</td>
                      <td className={`px-2 py-1.5 text-right font-mono ${metricColor(a.winRate - 50)}`}>{a.winRate.toFixed(0)}%</td>
                      <td className="px-2 py-1.5 text-right font-mono text-foreground">{(gradient.assetBiases[a.asset] || 1.0).toFixed(3)}×</td>
                      <td className="px-2 py-1.5 text-right font-mono text-foreground">{(gradient.allocationScales[a.asset] || 1.0).toFixed(3)}×</td>
                      <td className="px-2 py-1.5 text-center">
                        {a.recentTrend === "rising" && <TrendingUp className="h-3 w-3 text-gain inline" />}
                        {a.recentTrend === "falling" && <TrendingDown className="h-3 w-3 text-loss inline" />}
                        {a.recentTrend === "stable" && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-1.5 text-center">
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
