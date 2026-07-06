import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import { MethodologyTooltip } from "@/components/quant/MethodologyTooltip";
import { Loader2, AlertTriangle } from "lucide-react";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 11 };

const BenchmarkModule = ({ stocks }: Props) => {
  const { holdings } = useNormalizedPortfolio(stocks);
  const ia = useInstitutionalAnalytics(stocks);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze assets to see real benchmark attribution.</p>
      </div>
    );
  }

  if (!ia.ready && ia.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading portfolio and {ia.benchmarkTicker} history…</p>
      </div>
    );
  }

  const bench = ia.performance?.benchmark ?? null;
  const perf = ia.performance;
  const attribution = ia.attribution;

  const rollingSharpe = (perf?.rolling.sharpe ?? []).map((p, i) => ({
    idx: i,
    sharpe: +p.value.toFixed(2),
    vol: +(((perf?.rolling.volatilityAnnual[i]?.value ?? 0) * 100)).toFixed(1),
  }));

  const contribBars = (attribution?.positions ?? []).map(p => ({
    ticker: p.ticker,
    contribution: +p.contributionPct.toFixed(2),
    fill: p.contributionPct >= 0 ? "hsl(152,82%,42%)" : "hsl(0,84%,55%)",
  }));

  return (
    <div className="space-y-6">
      {/* Methodology strip */}
      <div className="flex items-center justify-between rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            Real Benchmark
          </span>
          <span className="text-[10px] text-muted-foreground">
            {ia.benchmarkReady
              ? `${ia.benchmarkTicker} daily series · OLS on ${bench?.beta.provenance.sampleSize ?? 0} aligned days`
              : `${ia.benchmarkTicker} series unavailable — benchmark-relative metrics withheld`}
          </span>
        </div>
        <MethodologyTooltip
          title="Benchmark Methodology"
          methods={[
            { label: "Alpha / Beta", formula: "OLS: r_p = α + β·r_b + ε on daily returns", source: `Real ${ia.benchmarkTicker} closes via the same price pipeline`, notes: "No return/beta circularity — benchmark is an independent series." },
            { label: "Tracking Error", formula: "stdev(r_p − r_b) × √252", source: "Grinold & Kahn (2000)" },
            { label: "Information Ratio", formula: "annualized active return / TE", source: "Grinold & Kahn (2000)" },
            { label: "Capture Ratios", formula: "mean(r_p)/mean(r_b) over up / down benchmark days", source: "Aligned daily series" },
            { label: "Contribution", formula: "wᵢ × rᵢ, additive to portfolio return", source: "Portfolio state (cost basis vs current)" },
          ]}
        />
      </div>

      {/* KPI strip */}
      {bench ? (
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          {[
            { label: `Alpha vs ${bench.benchmarkTicker} (ann.)`, value: `${bench.alphaAnnual.value >= 0 ? "+" : ""}${(bench.alphaAnnual.value * 100).toFixed(2)}%`, color: bench.alphaAnnual.value >= 0 ? "text-gain" : "text-loss" },
            { label: "Beta", value: bench.beta.value.toFixed(3), color: "text-foreground" },
            { label: "R²", value: bench.rSquared.value.toFixed(2), color: "text-foreground" },
            { label: "Tracking Error", value: `${(bench.trackingError.value * 100).toFixed(2)}%`, color: "text-foreground" },
            { label: "Information Ratio", value: bench.informationRatio.value.toFixed(3), color: bench.informationRatio.value >= 0.5 ? "text-gain" : "text-foreground" },
            { label: "Up / Down Capture", value: `${(bench.upCapture.value * 100).toFixed(0)} / ${(bench.downCapture.value * 100).toFixed(0)}`, color: bench.upCapture.value >= bench.downCapture.value ? "text-gain" : "text-loss" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
              <p className={`mt-1 font-mono text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <p className="text-sm text-muted-foreground">
            Benchmark-relative metrics require the {ia.benchmarkTicker} series and ≥20 aligned observations.
            Nothing is estimated from the portfolio's own beta — that would be circular.
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rolling risk-adjusted performance */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Rolling Sharpe & Volatility</h3>
            <span className="text-[10px] text-muted-foreground font-mono">{perf?.rolling.window ?? 0}d window</span>
          </div>
          <div className="h-64">
            {rollingSharpe.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Insufficient history for rolling metrics.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={rollingSharpe} margin={{ left: 5, right: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="idx" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                  <YAxis yAxisId="l" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={tipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Line yAxisId="l" type="monotone" dataKey="sharpe" stroke="hsl(152,90%,45%)" strokeWidth={1.5} dot={false} name="Rolling Sharpe" />
                  <Line yAxisId="r" type="monotone" dataKey="vol" stroke="hsl(38,92%,55%)" strokeWidth={1.5} dot={false} name="Rolling Vol %" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Position contribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Return Contribution</h3>
            <span className="text-[10px] text-muted-foreground font-mono">wᵢ × rᵢ (pp)</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contribBars} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}pp`} />
                <YAxis dataKey="ticker" type="category" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} width={55} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v > 0 ? "+" : ""}${v}pp`, "Contribution"]} />
                <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
                  {contribBars.map((c, i) => <Cell key={i} fill={c.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Brinson sector attribution */}
      {attribution?.brinson && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Sector Attribution (Brinson)</h3>
          </div>
          <p className="text-[10px] text-muted-foreground mb-4">Basis: {attribution.brinsonBenchmarkBasis}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  {["Sector", "Portfolio W", "Benchmark W", "Allocation Effect", "Total"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {attribution.brinson.map(a => (
                  <tr key={a.sector} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono text-foreground">{a.sector}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{(a.portfolioWeight * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{(a.benchmarkWeight * 100).toFixed(1)}%</td>
                    <td className={`px-3 py-2 font-mono ${a.allocation >= 0 ? "text-gain" : "text-loss"}`}>{a.allocation >= 0 ? "+" : ""}{a.allocation.toFixed(2)}pp</td>
                    <td className={`px-3 py-2 font-mono font-bold ${a.total >= 0 ? "text-gain" : "text-loss"}`}>{a.total >= 0 ? "+" : ""}{a.total.toFixed(2)}pp</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-asset returns */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Per-Asset Returns</h3>
        <div className="space-y-2">
          {(attribution?.positions ?? []).map(s => (
            <div key={s.ticker} className="flex items-center gap-3">
              <span className="w-20 font-mono text-xs font-semibold text-foreground">{s.ticker}</span>
              <div className="flex-1 h-2.5 rounded-full bg-surface-3 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${s.returnPct >= 0 ? "bg-gain" : "bg-loss"}`} style={{ width: `${Math.min(Math.abs(s.returnPct), 100)}%` }} />
              </div>
              <span className={`font-mono text-xs w-16 text-right font-semibold ${s.returnPct >= 0 ? "text-gain" : "text-loss"}`}>
                {s.returnPct >= 0 ? "+" : ""}{s.returnPct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BenchmarkModule;
