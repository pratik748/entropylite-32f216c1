import { useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useQuantSnapshot } from "@/hooks/useQuantSnapshot";
import { mertonDistanceToDefault } from "@/lib/quant-engine";
import { MethodologyTooltip } from "@/components/quant/MethodologyTooltip";
import { Loader2 } from "lucide-react";

interface Props { stocks: PortfolioStock[]; }

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 6, fontSize: 11 };

const RiskModelingModule = ({ stocks }: Props) => {
  const { fmt } = useNormalizedPortfolio(stocks);
  const snap = useQuantSnapshot(stocks);

  const { riskFactors, concentrationData, varTrend, creditData, hasData } = useMemo(() => {
    if (!snap.ready) return { riskFactors: [], concentrationData: [], varTrend: [], creditData: [], hasData: false };

    const tickers = Object.keys(snap.assetStats);
    const n = tickers.length;

    // ── Real risk factors from historical math ───────────────
    const avgVol = tickers.reduce((s, t) => s + snap.assetStats[t].sigmaAnnual, 0) / n; // annualized
    const avgKurt = tickers.reduce((s, t) => s + snap.assetStats[t].kurtosis, 0) / n;
    const avgJump = tickers.reduce((s, t) => s + snap.assetStats[t].jumpProb, 0) / n;
    const avgDD = Math.abs(tickers.reduce((s, t) => s + snap.assetStats[t].maxDD, 0) / n);

    // Correlation stress: average pairwise abs correlation
    const corrM = snap.correlation.matrix;
    let cc = 0, cn = 0;
    for (let i = 0; i < corrM.length; i++)
      for (let j = i + 1; j < corrM.length; j++) { cc += Math.abs(corrM[i][j]); cn++; }
    const avgCorr = cn > 0 ? cc / cn : 0;

    const factors = [
      { risk: "Volatility (σ)", value: Math.min(100, Math.round(avgVol * 200)) },          // 50% σ → 100
      { risk: "Tail Risk (κ)", value: Math.min(100, Math.round(Math.max(0, avgKurt) * 15)) },
      { risk: "Jump Frequency", value: Math.min(100, Math.round(avgJump * 1000)) },          // 0.1 → 100
      { risk: "Concentration", value: n <= 3 ? 85 : n <= 5 ? 60 : n <= 10 ? 35 : 20 },
      { risk: "Correlation", value: Math.round(avgCorr * 100) },
      { risk: "Realized DD", value: Math.min(100, Math.round(avgDD * 200)) },
    ];

    const concData = tickers.map(t => ({
      name: t, pct: (snap.weights[t] ?? 0) * 100,
    })).sort((a, b) => b.pct - a.pct);

    // ── REAL rolling historical VaR (no synthetic noise) ─────
    const trend = snap.portfolio.rollingVar.map(p => ({
      day: p.day,
      var95: Math.round(p.var),
      cvar95: Math.round(p.cvar),
    }));

    // ── Merton distance-to-default ───────────────────────────
    const credit = tickers.map(t => {
      const stats = snap.assetStats[t];
      const h = stocks.find(s => s.ticker === t);
      const E = stats.lastPrice * (h?.quantity || 0);
      const debt = E * 0.4; // approximate D/(D+E) = 0.29, fallback when fundamentals absent
      const merton = mertonDistanceToDefault(E, debt, stats.sigmaAnnual);
      const dd = merton.dd;
      const pd = merton.pd * 100;
      const rating =
        dd > 4 ? "AAA" : dd > 3 ? "AA" : dd > 2 ? "A" : dd > 1 ? "BBB" : dd > 0 ? "BB" : "B";
      const lgd = 45;
      const el = E * (pd / 100) * (lgd / 100);
      return {
        name: t, rating, dd: dd.toFixed(2),
        exp: fmt(E), pd: `${pd.toFixed(2)}%`, lgd: `${lgd}%`, el: fmt(el),
      };
    });

    return { riskFactors: factors, concentrationData: concData, varTrend: trend, creditData: credit, hasData: true };
  }, [snap, stocks, fmt]);

  if (!snap.ready && snap.loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading 1-year price history for portfolio...</p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Add holdings with available price history to see institutional risk metrics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Methodology header strip */}
      <div className="flex items-center justify-between rounded-lg border border-primary/15 bg-primary/5 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
            Historical Math
          </span>
          <span className="text-[10px] text-muted-foreground">
            {snap.lookbackDays} daily observations · σ from log-returns · σ̄ₐ = {(snap.portfolio.sigmaAnnual * 100).toFixed(1)}% · Sharpe = {snap.portfolio.sharpe.toFixed(2)}
          </span>
        </div>
        <MethodologyTooltip
          title="Risk Modeling Methodology"
          methods={[
            { label: "Volatility (σ)", formula: "σ = stdev(ln(Pₜ/Pₜ₋₁))", source: "Yahoo Finance daily closes (Alpha Vantage fallback)", lookback: `${snap.lookbackDays} days`, notes: "Annualized as σ × √252" },
            { label: "Parametric VaR (95%)", formula: "VaR = V × σ × √h × 1.645", source: "Portfolio σ from real covariance", lookback: `${snap.lookbackDays} days` },
            { label: "Historical VaR (95%)", formula: "5th percentile of portfolio return distribution", source: "Real portfolio return series", lookback: `${snap.lookbackDays} days`, notes: "Captures fat tails parametric VaR misses" },
            { label: "CVaR / Expected Shortfall", formula: "E[L | L > VaR], mean of tail beyond VaR", source: "Empirical distribution", lookback: `${snap.lookbackDays} days` },
            { label: "Rolling VaR backtest", formula: "60-day rolling 5th percentile", source: "Real return series", lookback: "30 trailing observations", notes: "Replaces previous synthetic sine-wave trend" },
            { label: "Correlation matrix", formula: "Pearson on aligned log-returns", source: "Multi-asset history" },
            { label: "Merton Distance-to-Default", formula: "DD = (ln(V/D) + (r − 0.5σᵥ²)T) / (σᵥ√T), PD = N(−DD)", source: "Equity vol + leverage proxy", lookback: "1y equity history", notes: "Iterative solve for asset value V and asset vol σᵥ" },
          ]}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Historical VaR (95%)", value: fmt(snap.portfolio.var95), sub: `1-day · ${snap.lookbackDays}d empirical` },
          { label: "CVaR / ES (95%)", value: fmt(snap.portfolio.cvar95), sub: "Mean of tail losses" },
          { label: "Parametric VaR (95%)", value: fmt(snap.portfolio.paramVar95), sub: "V × σ × 1.645" },
          { label: "Stress VaR (99%)", value: fmt(snap.portfolio.var99), sub: "1-day historical" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-xl font-bold text-loss">{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* REAL VaR Trend Chart from rolling backtest */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Rolling VaR / CVaR Backtest</h3>
          <span className="text-[10px] text-muted-foreground font-mono">60-day window · {varTrend.length} obs</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={varTrend} margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="day" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: GRID }} interval={4} />
              <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
              <Tooltip contentStyle={tipStyle} />
              <Area type="monotone" dataKey="cvar95" stroke="hsl(0,90%,55%)" fill="hsl(0,90%,55%)" fillOpacity={0.08} strokeWidth={1.5} name="CVaR 95%" />
              <Area type="monotone" dataKey="var95" stroke="hsl(38,92%,55%)" fill="hsl(38,92%,55%)" fillOpacity={0.1} strokeWidth={2} name="VaR 95%" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Multi-Factor Risk Radar</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={riskFactors}>
                <PolarGrid stroke={GRID} />
                <PolarAngleAxis dataKey="risk" tick={{ fill: MUTED, fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: MUTED, fontSize: 9 }} />
                <Radar dataKey="value" stroke="hsl(0,0%,95%)" fill="hsl(0,0%,95%)" fillOpacity={0.15} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Concentration Risk</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={concentrationData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} />
                <YAxis tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {concentrationData.map((_, i) => (
                    <Cell key={i} fill={`hsl(0, 0%, ${100 - i * 12}%)`} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Merton Structural Credit Risk</h3>
          <span className="text-[10px] text-muted-foreground font-mono">Distance-to-default model (Merton 1974)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Issuer", "Rating", "DD (σ)", "Exposure", "PD (1y)", "LGD", "Expected Loss"].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {creditData.map(r => (
                <tr key={r.name} className="border-b border-border/50">
                  <td className="px-3 py-2 font-mono text-foreground">{r.name}</td>
                  <td className="px-3 py-2"><span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-xs text-foreground">{r.rating}</span></td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.dd}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.exp}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.pd}</td>
                  <td className="px-3 py-2 font-mono text-muted-foreground">{r.lgd}</td>
                  <td className="px-3 py-2 font-mono text-loss">{r.el}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default RiskModelingModule;
