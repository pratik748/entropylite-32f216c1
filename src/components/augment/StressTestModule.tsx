import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import { MethodologyTooltip } from "@/components/quant/MethodologyTooltip";
import { Loader2, AlertTriangle, History, Activity } from "lucide-react";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const StressTestModule = ({ stocks }: Props) => {
  const { holdings, totalValue, fmt } = useNormalizedPortfolio(stocks);
  const ia = useInstitutionalAnalytics(stocks);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to run stress tests on your actual portfolio.</p>
      </div>
    );
  }

  if (!ia.ready && ia.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading price history to estimate real betas…</p>
      </div>
    );
  }

  if (ia.stresses.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">
          No stress results: betas could not be estimated from available history.
          Scenario impacts are only shown when they can be computed from real data.
        </p>
      </div>
    );
  }

  const chartData = ia.stresses.map(s => ({
    name: s.scenario.name,
    impact: +(s.portfolioImpact.value * 100).toFixed(1),
    fill: s.portfolioImpact.value < 0 ? "hsl(0,90%,55%)" : "hsl(152,90%,45%)",
  }));

  const avgRec = ia.risk?.drawdown.avgRecoveryDays ?? null;

  return (
    <div className="space-y-6">
      {/* Methodology strip */}
      <div className="flex items-center justify-between rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            Beta-Propagated
          </span>
          <span className="text-[10px] text-muted-foreground">
            Impact = Σ wᵢ·βᵢ·shock · β from {ia.betaBasis} · {ia.snapshot.lookbackDays}d history
          </span>
        </div>
        <MethodologyTooltip
          title="Stress Testing Methodology"
          methods={[
            { label: "Scenario propagation", formula: "ΔP/P = Σ wᵢ·βᵢ·shock_mkt", source: "Per-asset OLS betas on real benchmark returns", notes: "Shock sizes are documented historical episodes; portfolio impacts are computed, never stored." },
            { label: "Historical replay", formula: "min over t of Π(1+rₜ) across h-day windows", source: "The portfolio's own realized return series", notes: "No assumption — the worst window that actually happened to this book." },
            { label: "σ sensitivity", formula: "±kσ daily moves at σ_p = √(wᵀΣw)", source: "Realized covariance matrix" },
            { label: "Recovery estimate", formula: "mean trough→peak days over realized drawdowns ≥ 5%", source: "Portfolio equity curve", notes: "Omitted when no completed drawdowns exist — never guessed." },
          ]}
        />
      </div>

      {/* Scenario impacts */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
          Scenario Impact — Computed From Your Betas
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 130 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
              <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} width={125} />
              <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Portfolio Impact"]} />
              <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Scenario detail */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Scenario Detail</h3>
          <div className="space-y-2 max-h-[420px] overflow-y-auto">
            {ia.stresses.map(s => (
              <div key={s.scenario.id} className="rounded-lg bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{s.scenario.name}</p>
                  <div className="text-right">
                    <p className={`font-mono text-sm font-bold ${s.portfolioImpact.value < 0 ? "text-loss" : "text-gain"}`}>
                      {s.portfolioImpact.value >= 0 ? "+" : ""}{(s.portfolioImpact.value * 100).toFixed(1)}%
                    </p>
                    <p className={`font-mono text-[10px] ${s.lossValue > 0 ? "text-loss" : "text-gain"}`}>
                      {s.lossValue > 0 ? `-${fmt(s.lossValue)}` : `+${fmt(-s.lossValue)}`}
                    </p>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{s.scenario.basis}</p>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5 font-mono">
                  {s.portfolioImpact.provenance.calculation} · confidence: {s.portfolioImpact.provenance.confidence}
                </p>
                {avgRec && s.portfolioImpact.value < -0.05 && (
                  <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                    <History className="h-3 w-3" />
                    Realized recovery from ≥5% drawdowns: ~{Math.round(avgRec.value)} trading days
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Historical replay + sensitivity */}
        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <History className="h-4 w-4" /> Historical Replay — Your Worst Realized Windows
            </h3>
            {ia.replays.length === 0 ? (
              <p className="text-xs text-muted-foreground">Insufficient history for replay windows.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Window", "Worst Return", "Loss at Current NAV"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ia.replays.map(r => (
                    <tr key={r.windowDays} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono text-foreground">{r.windowDays}d</td>
                      <td className="px-3 py-2 font-mono text-loss">{(r.worstReturn.value * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 font-mono text-loss">-{fmt(r.lossValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4" /> Volatility Sensitivity (σ from Σ)
            </h3>
            {ia.sensitivity.length === 0 ? (
              <p className="text-xs text-muted-foreground">Covariance unavailable.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Shock", "Return Impact", "P&L Impact"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ia.sensitivity.map(s => (
                    <tr key={s.label} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono text-muted-foreground">{s.label}</td>
                      <td className="px-3 py-2 font-mono text-loss">{(s.impact.value * 100).toFixed(2)}%</td>
                      <td className="px-3 py-2 font-mono text-loss">-{fmt(s.lossValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Per-position stress decomposition for the deepest scenario */}
      {(() => {
        const worst = [...ia.stresses].sort((a, b) => a.portfolioImpact.value - b.portfolioImpact.value)[0];
        if (!worst || worst.positionImpacts.length === 0) return null;
        return (
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> Position Decomposition — {worst.scenario.name}
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                β sample: {worst.portfolioImpact.provenance.sampleSize} obs
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {["Position", "Weight", "β", "Impact", "P&L"].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {worst.positionImpacts.map(p => (
                    <tr key={p.ticker} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono font-medium text-foreground">{p.ticker}</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{(p.weight * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 font-mono text-muted-foreground">{p.beta.toFixed(2)}</td>
                      <td className={`px-3 py-2 font-mono ${p.impact < 0 ? "text-loss" : "text-gain"}`}>
                        {p.impact >= 0 ? "+" : ""}{(p.impact * 100).toFixed(2)}%
                      </td>
                      <td className={`px-3 py-2 font-mono ${p.impact < 0 ? "text-loss" : "text-gain"}`}>
                        {p.impact >= 0 ? "+" : "-"}{fmt(Math.abs(p.impact) * totalValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {worst.portfolioImpact.provenance.assumptions && (
              <div className="mt-3 space-y-0.5">
                {worst.portfolioImpact.provenance.assumptions.map((a, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground/70">• {a}</p>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default StressTestModule;
