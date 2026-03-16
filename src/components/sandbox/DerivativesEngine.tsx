import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, Cell, PieChart, Pie, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, ScatterChart, Scatter, ZAxis,
} from "recharts";
import {
  Activity, GitBranch, Layers, Radio, Crosshair, Target, BarChart3,
  TrendingUp, TrendingDown, Shield, Zap, RefreshCw, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useDerivativesIntelligence, type DerivativesData } from "@/hooks/useDerivativesIntelligence";
import {
  covarianceMatrix, returns, mean, stddev, zScore,
} from "@/lib/statarb-math";

interface Props {
  stocks: PortfolioStock[];
}

const subTabs = [
  { id: "correlations", label: "Correlations", icon: Activity },
  { id: "pairs", label: "Pair Trades", icon: GitBranch },
  { id: "options", label: "Options Intel", icon: Layers },
  { id: "futures", label: "Futures", icon: TrendingUp },
  { id: "neutrality", label: "Neutrality", icon: Shield },
  { id: "scanner", label: "Scanner", icon: Crosshair },
  { id: "simulation", label: "Simulation", icon: Target },
] as const;

type SubTab = typeof subTabs[number]["id"];

const COLORS = [
  "hsl(142, 71%, 45%)", "hsl(0, 84%, 60%)", "hsl(217, 91%, 60%)",
  "hsl(48, 96%, 53%)", "hsl(280, 68%, 60%)", "hsl(190, 90%, 50%)",
  "hsl(330, 80%, 55%)", "hsl(25, 95%, 53%)",
];

function confidenceBadge(c: number) {
  if (c >= 0.8) return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/20 text-green-400">HIGH</span>;
  if (c >= 0.6) return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/20 text-yellow-400">MED</span>;
  return <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400">LOW</span>;
}

function pctFmt(v: number) { return `${(v * 100).toFixed(1)}%`; }

const DerivativesEngine = ({ stocks }: Props) => {
  const [activeTab, setActiveTab] = useState<SubTab>("correlations");
  const { data, loading, error, analyze } = useDerivativesIntelligence(stocks);
  const analyzed = stocks.filter(s => s.analysis);

  useEffect(() => {
    if (analyzed.length > 0 && !data && !loading) analyze();
  }, [analyzed.length]);

  const assetCount = analyzed.length;
  const optionsCount = data?.options_intel?.length ?? 0;
  const pairsCount = data?.correlations?.pairs?.length ?? 0;
  const oppsCount = data?.opportunities?.length ?? 0;

  // Client-side correlation matrix
  const corrMatrix = useMemo(() => {
    if (analyzed.length < 2) return null;
    // Generate synthetic returns from volatilities for correlation display
    const n = 60;
    const series = analyzed.map((s) => {
      const vol = s.analysis?.riskLevel === "High" ? 0.4 : s.analysis?.riskLevel === "Medium" ? 0.25 : 0.15;
      const mu = 0.05;
      const r: number[] = [];
      for (let i = 0; i < n; i++) {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        r.push(mu / 252 + (vol / Math.sqrt(252)) * z);
      }
      return r;
    });
    const cov = covarianceMatrix(series);
    const stds = series.map(s => stddev(s));
    const corr: number[][] = cov.map((row, i) =>
      row.map((c, j) => {
        const d = stds[i] * stds[j];
        return d > 0 ? c / d : 0;
      })
    );
    return corr;
  }, [analyzed]);

  const renderCorrelations = () => {
    const pairs = data?.correlations?.pairs || [];
    const divergences = data?.correlations?.divergences || [];

    return (
      <div className="space-y-4">
        {/* Client-side correlation heatmap */}
        {corrMatrix && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Correlation Heatmap (Portfolio)</h3>
            <div className="overflow-x-auto">
              <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `80px repeat(${analyzed.length}, 52px)` }}>
                <div />
                {analyzed.map(s => (
                  <div key={s.ticker} className="text-[9px] font-mono text-muted-foreground text-center truncate">{s.ticker.replace(".NS","")}</div>
                ))}
                {corrMatrix.map((row, i) => (
                  <>
                    <div key={`label-${i}`} className="text-[9px] font-mono text-muted-foreground flex items-center truncate">{analyzed[i].ticker.replace(".NS","")}</div>
                    {row.map((c, j) => {
                      const abs = Math.abs(c);
                      const green = c > 0;
                      const bg = i === j ? "hsl(217, 91%, 60%)" :
                        green ? `hsla(142, 71%, 45%, ${abs * 0.8})` : `hsla(0, 84%, 60%, ${abs * 0.8})`;
                      return (
                        <div key={`${i}-${j}`} className="w-[52px] h-8 flex items-center justify-center rounded-sm text-[9px] font-mono text-foreground" style={{ background: bg }}>
                          {c.toFixed(2)}
                        </div>
                      );
                    })}
                  </>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* AI-enriched correlations */}
        {pairs.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Top Correlated Pairs (AI)</h3>
            <div className="space-y-2">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center justify-between glass-subtle rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-foreground">{p.asset_a}</span>
                    <span className="text-[9px] text-muted-foreground">↔</span>
                    <span className="text-xs font-mono font-bold text-foreground">{p.asset_b}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] text-muted-foreground">{p.window}</span>
                    <div className="w-16 bg-muted/30 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{
                        width: `${Math.abs(p.correlation) * 100}%`,
                        background: p.correlation > 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)",
                      }} />
                    </div>
                    <span className={`text-xs font-mono font-bold ${p.correlation > 0 ? "text-green-400" : "text-red-400"}`}>
                      {p.correlation.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divergences */}
        {divergences.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-yellow-400" />
              Divergence Signals
            </h3>
            <div className="space-y-2">
              {divergences.map((d, i) => (
                <div key={i} className="glass-subtle rounded-lg px-3 py-2.5 border border-yellow-500/20">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-bold text-foreground">{d.asset_a} / {d.asset_b}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 font-bold">
                      Δ {d.divergence_magnitude.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex gap-4 text-[9px] text-muted-foreground">
                    <span>Historical: {d.historical_corr.toFixed(2)}</span>
                    <span>Current: {d.current_corr.toFixed(2)}</span>
                    <span className="text-yellow-400">{d.signal.replace(/_/g, " ")}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderPairTrades = () => {
    const trades = data?.pair_trades || [];
    return (
      <div className="space-y-3">
        {trades.map((t, i) => (
          <div key={i} className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
                  <span className="text-sm font-mono font-bold text-green-400">{t.long}</span>
                </div>
                <span className="text-[9px] text-muted-foreground">/</span>
                <div className="flex items-center gap-1.5">
                  <ArrowDownRight className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-sm font-mono font-bold text-red-400">{t.short}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {t.sector_neutral && <span className="text-[8px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">SECTOR NEUTRAL</span>}
                {confidenceBadge(t.reversion_prob)}
              </div>
            </div>

            {/* Z-score gauge */}
            <div className="mb-3">
              <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
                <span>Z-Score</span>
                <span className={`font-bold ${Math.abs(t.z_score) > 2 ? "text-yellow-400" : "text-foreground"}`}>{t.z_score.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-muted/30 rounded-full relative">
                <div className="absolute top-0 left-1/2 w-0.5 h-2 bg-muted-foreground/30" />
                <div
                  className="absolute top-0 h-2 w-3 rounded-full"
                  style={{
                    left: `${Math.max(0, Math.min(100, 50 + t.z_score * 15))}%`,
                    transform: "translateX(-50%)",
                    background: Math.abs(t.z_score) > 2 ? "hsl(48, 96%, 53%)" : "hsl(217, 91%, 60%)",
                  }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground/50 mt-0.5">
                <span>-3σ</span><span>0</span><span>+3σ</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground">Win Rate</div>
                <div className="text-xs font-bold text-foreground">{pctFmt(t.win_rate)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground">Reversion P</div>
                <div className="text-xs font-bold text-foreground">{pctFmt(t.reversion_prob)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground">Exp. Return</div>
                <div className="text-xs font-bold text-green-400">{pctFmt(t.expected_return)}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] text-muted-foreground">Spread μ</div>
                <div className="text-xs font-bold text-foreground">{t.spread_mean.toFixed(3)}</div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{t.reasoning}</p>
          </div>
        ))}
        {trades.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground text-sm">No pair trades detected yet. Run analysis.</div>
        )}
      </div>
    );
  };

  const renderOptionsIntel = () => {
    const options = data?.options_intel || [];
    const chartData = options.map(o => ({
      ticker: o.ticker.replace(".NS", ""),
      iv_rank: o.iv_rank,
      iv_pct: o.iv_percentile,
      hv: (o.historical_vol * 100),
      iv: (o.implied_vol * 100),
    }));

    return (
      <div className="space-y-4">
        {/* IV Rank bars */}
        {chartData.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">IV Rank & Percentile</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(220, 12%, 60%)" }} />
                <YAxis type="category" dataKey="ticker" tick={{ fontSize: 10, fill: "hsl(220, 12%, 80%)" }} width={60} />
                <Tooltip contentStyle={{ background: "hsl(220, 12%, 13%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="iv_rank" name="IV Rank" fill="hsl(280, 68%, 60%)" barSize={10} radius={[0, 4, 4, 0]} />
                <Bar dataKey="iv_pct" name="IV %ile" fill="hsl(217, 91%, 60%)" barSize={10} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* IV vs HV comparison */}
        {chartData.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Implied vs Historical Volatility</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" />
                <XAxis dataKey="ticker" tick={{ fontSize: 10, fill: "hsl(220, 12%, 80%)" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(220, 12%, 60%)" }} />
                <Tooltip contentStyle={{ background: "hsl(220, 12%, 13%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="hv" name="HV %" fill="hsl(142, 71%, 45%)" barSize={14} radius={[4, 4, 0, 0]} />
                <Bar dataKey="iv" name="IV %" fill="hsl(0, 84%, 60%)" barSize={14} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Signal cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {options.map((o, i) => (
            <div key={i} className="glass-panel rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-mono font-bold text-foreground">{o.ticker}</span>
                {confidenceBadge(o.confidence)}
              </div>
              <div className="grid grid-cols-3 gap-2 mb-2 text-center">
                <div>
                  <div className="text-[8px] text-muted-foreground">Skew</div>
                  <div className="text-[11px] font-bold text-foreground">{o.skew?.toFixed(3) ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[8px] text-muted-foreground">Gamma Exp</div>
                  <div className="text-[11px] font-bold text-foreground">{o.gamma_exposure ? `${(o.gamma_exposure / 1e6).toFixed(1)}M` : "—"}</div>
                </div>
                <div>
                  <div className="text-[8px] text-muted-foreground">Signal</div>
                  <div className="text-[11px] font-bold text-primary">{o.signal_type?.replace(/_/g, " ") ?? "—"}</div>
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground">{o.opportunity}</p>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFutures = () => {
    const futures = data?.futures || [];
    const chartData = futures.map(f => ({
      name: `${f.ticker} → ${f.futures_symbol}`,
      basis: f.basis_pct * 100,
      efficiency: f.capital_efficiency_vs_spot,
      carry: f.cost_of_carry * 100,
    }));

    return (
      <div className="space-y-4">
        {chartData.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Capital Efficiency vs Spot</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(220, 12%, 80%)" }} />
                <YAxis tick={{ fontSize: 9, fill: "hsl(220, 12%, 60%)" }} />
                <Tooltip contentStyle={{ background: "hsl(220, 12%, 13%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="efficiency" name="Efficiency (x)" fill="hsl(190, 90%, 50%)" barSize={20} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {futures.map((f, i) => (
          <div key={i} className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-mono font-bold text-foreground">{f.ticker}</span>
                <span className="text-[9px] text-muted-foreground ml-2">→ {f.futures_symbol}</span>
              </div>
              {confidenceBadge(f.confidence)}
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Basis</div>
                <div className="text-xs font-bold text-foreground">{(f.basis_pct * 100).toFixed(2)}%</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Leverage</div>
                <div className="text-xs font-bold text-primary">{f.leverage_ratio}x</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Carry</div>
                <div className="text-xs font-bold text-foreground">{(f.cost_of_carry * 100).toFixed(2)}%</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Margin</div>
                <div className="text-xs font-bold text-foreground">${(f.margin_requirement / 1000).toFixed(0)}K</div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">{f.recommendation}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderNeutrality = () => {
    const n = data?.neutrality;
    if (!n) return <div className="text-center py-8 text-muted-foreground text-sm">Run analysis to view neutrality data.</div>;

    const sectorData = n.sector_tilts?.map(s => ({ ...s, overweight_pct: s.overweight * 100 })) || [];
    const factorData = n.factor_exposures?.map(f => ({ ...f, value: Math.abs(f.loading) * 100 })) || [];

    return (
      <div className="space-y-4">
        {/* Beta gauge */}
        <div className="glass-panel rounded-xl p-4">
          <h3 className="text-sm font-bold text-foreground mb-2">Portfolio Beta Exposure</h3>
          <div className="flex items-center gap-4">
            <div className="text-3xl font-bold text-foreground">{n.beta_exposure?.toFixed(2) ?? "—"}</div>
            <div className="flex-1">
              <div className="h-3 bg-muted/30 rounded-full relative">
                <div className="absolute left-1/2 top-0 w-0.5 h-3 bg-muted-foreground/40" />
                <div
                  className="absolute top-0 h-3 w-4 rounded-full bg-primary"
                  style={{ left: `${Math.min(100, Math.max(0, (n.beta_exposure ?? 1) * 50))}%`, transform: "translateX(-50%)" }}
                />
              </div>
              <div className="flex justify-between text-[8px] text-muted-foreground mt-0.5">
                <span>0</span><span>1.0</span><span>2.0</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sector tilts */}
        {sectorData.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Sector Tilts vs Benchmark</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sectorData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" />
                <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(220, 12%, 60%)" }} />
                <YAxis type="category" dataKey="sector" tick={{ fontSize: 10, fill: "hsl(220, 12%, 80%)" }} width={80} />
                <Tooltip contentStyle={{ background: "hsl(220, 12%, 13%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="overweight_pct" name="Overweight %" barSize={12} radius={[0, 4, 4, 0]}>
                  {sectorData.map((_, idx) => (
                    <Cell key={idx} fill={sectorData[idx].overweight >= 0 ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Hedge suggestions */}
        {n.hedge_suggestions?.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Shield className="h-3.5 w-3.5 text-blue-400" />
              Hedge Suggestions
            </h3>
            <div className="space-y-2">
              {n.hedge_suggestions.map((h, i) => (
                <div key={i} className="glass-subtle rounded-lg px-3 py-2.5 border border-blue-500/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-foreground">{h.action} {h.instrument}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] text-muted-foreground">{h.size}</span>
                      {confidenceBadge(h.confidence)}
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{h.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderScanner = () => {
    const opps = data?.opportunities || [];
    const sorted = [...opps].sort((a, b) => b.confidence - a.confidence);

    return (
      <div className="space-y-3">
        <div className="glass-panel rounded-xl p-3 flex items-center gap-2 text-[10px] text-muted-foreground">
          <Crosshair className="h-3 w-3" />
          {sorted.length} opportunities ranked by confidence · risk-adjusted return · capital efficiency
        </div>
        {sorted.map((o, i) => (
          <div key={i} className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted/50 text-muted-foreground font-mono uppercase">{o.category}</span>
                <span className="text-sm font-bold text-foreground">{o.title}</span>
              </div>
              <div className="flex items-center gap-2">
                {o.urgency === "high" && <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold">URGENT</span>}
                {confidenceBadge(o.confidence)}
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2">
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">R:R</div>
                <div className="text-xs font-bold text-foreground">{o.risk_reward?.toFixed(1)}x</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Exp. Return</div>
                <div className="text-xs font-bold text-green-400">{pctFmt(o.expected_return)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Max Loss</div>
                <div className="text-xs font-bold text-red-400">{pctFmt(o.max_loss)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Capital Eff.</div>
                <div className="text-xs font-bold text-primary">{o.capital_efficiency?.toFixed(1)}x</div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground leading-relaxed">{o.reasoning}</p>
          </div>
        ))}
      </div>
    );
  };

  const renderSimulation = () => {
    const sims = data?.simulations || [];
    const chartData = sims.map(s => ({
      name: s.strategy_name.length > 25 ? s.strategy_name.slice(0, 25) + "…" : s.strategy_name,
      low: s.expected_return_low * 100,
      mid: s.expected_return_mid * 100,
      high: s.expected_return_high * 100,
      win: s.win_probability * 100,
    }));

    return (
      <div className="space-y-4">
        {/* P&L range chart */}
        {chartData.length > 0 && (
          <div className="glass-panel rounded-xl p-4">
            <h3 className="text-sm font-bold text-foreground mb-3">Expected Return Range (%)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 12%, 20%)" />
                <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(220, 12%, 60%)" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "hsl(220, 12%, 80%)" }} width={120} />
                <Tooltip contentStyle={{ background: "hsl(220, 12%, 13%)", border: "1px solid hsl(220, 12%, 20%)", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="low" name="Bear Case" fill="hsl(0, 84%, 60%)" barSize={8} radius={[0, 4, 4, 0]} />
                <Bar dataKey="mid" name="Base Case" fill="hsl(217, 91%, 60%)" barSize={8} radius={[0, 4, 4, 0]} />
                <Bar dataKey="high" name="Bull Case" fill="hsl(142, 71%, 45%)" barSize={8} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Strategy cards */}
        {sims.map((s, i) => (
          <div key={i} className="glass-panel rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-sm font-bold text-foreground">{s.strategy_name}</span>
                <span className="text-[9px] text-muted-foreground ml-2 uppercase">{s.strategy_type?.replace(/_/g, " ")}</span>
              </div>
              {confidenceBadge(s.confidence)}
            </div>
            <div className="grid grid-cols-5 gap-2">
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Win Prob</div>
                <div className="text-xs font-bold text-green-400">{pctFmt(s.win_probability)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Sharpe</div>
                <div className="text-xs font-bold text-foreground">{s.sharpe?.toFixed(2)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Max DD</div>
                <div className="text-xs font-bold text-red-400">{pctFmt(s.max_dd)}</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Capital</div>
                <div className="text-xs font-bold text-foreground">${(s.capital_required / 1000).toFixed(0)}K</div>
              </div>
              <div className="text-center">
                <div className="text-[8px] text-muted-foreground">Horizon</div>
                <div className="text-xs font-bold text-foreground">{s.holding_period_days}d</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <RefreshCw className="h-8 w-8 text-primary animate-spin" />
          <p className="text-sm text-muted-foreground">Running derivatives intelligence analysis…</p>
        </div>
      );
    }

    switch (activeTab) {
      case "correlations": return renderCorrelations();
      case "pairs": return renderPairTrades();
      case "options": return renderOptionsIntel();
      case "futures": return renderFutures();
      case "neutrality": return renderNeutrality();
      case "scanner": return renderScanner();
      case "simulation": return renderSimulation();
    }
  };

  return (
    <div className="space-y-3">
      {/* Sub-tab selector */}
      <div className="glass-panel rounded-xl p-2">
        <div className="flex items-center gap-1 overflow-x-auto">
          {subTabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  active ? "glass-panel glass-glow-primary text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {t.label}
              </button>
            );
          })}
          <div className="flex-1" />
          {data && (
            <span className="text-[9px] font-mono text-muted-foreground mr-2">
              {optionsCount}/{assetCount} assets · {pairsCount} pairs · {oppsCount} opps
            </span>
          )}
          <button
            onClick={() => analyze(true)}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-mono text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            ANALYZE
          </button>
        </div>
      </div>

      {/* Coverage warning */}
      {data && optionsCount < assetCount && (
        <div className="glass-subtle rounded-lg px-3 py-2 border border-yellow-500/20 text-[10px] text-yellow-400 flex items-center gap-2">
          <Zap className="h-3 w-3" />
          AI covered {optionsCount}/{assetCount} assets. Click ANALYZE to refresh for full coverage.
        </div>
      )}

      {/* Content */}
      <div className="animate-fade-in">
        {renderContent()}
      </div>
    </div>
  );
};

export default DerivativesEngine;
