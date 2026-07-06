import { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ScatterChart, Scatter, ZAxis,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { useInstitutionalAnalytics } from "@/hooks/useInstitutionalAnalytics";
import { meanVarianceWeights, jacobiEigen, marchenkoPastur } from "@/lib/portfolio-math";
import type { OptimizerId, OptimizerConstraints } from "@/lib/analytics/types";
import { MethodologyTooltip } from "@/components/quant/MethodologyTooltip";
import {
  TrendingUp, ShieldAlert, Scale, Zap, AlertTriangle, ArrowRightLeft,
  Target, Brain, GitBranch, Layers, Sigma, Gauge, CheckCircle2, XCircle,
} from "lucide-react";

interface Props { stocks: PortfolioStock[]; }

const PALETTE = [
  "hsl(0, 0%, 95%)", "hsl(152, 90%, 45%)", "hsl(210, 60%, 55%)", "hsl(38, 92%, 55%)",
  "hsl(0, 90%, 55%)", "hsl(280, 60%, 55%)", "hsl(180, 60%, 45%)", "hsl(0, 0%, 60%)",
];

const GRID = "hsl(220,12%,13%)";
const MUTED = "hsl(210,8%,45%)";
const CARD_BG = "hsl(0,0%,5%)";
const BG = "hsl(0,0%,3%)";
const tipStyle = { background: CARD_BG, border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 11 };

const strategies: { id: OptimizerId; label: string; icon: typeof Scale; desc: string }[] = [
  { id: "equal_weight", label: "Equal Weight", icon: Scale, desc: "wᵢ = 1/N — no estimation risk" },
  { id: "min_variance", label: "Min Variance", icon: Target, desc: "Σ⁻¹·1 active-set long-only (Markowitz)" },
  { id: "mean_variance", label: "Mean–Variance", icon: TrendingUp, desc: "max μᵀw − λwᵀΣw (Markowitz 1952)" },
  { id: "robust_mean_variance", label: "Robust MVO", icon: Sigma, desc: "Ledoit–Wolf Σ + μ shrunk to grand mean" },
  { id: "risk_parity", label: "Risk Parity", icon: ShieldAlert, desc: "Equal risk contribution (Maillard 2010)" },
  { id: "risk_budget", label: "Risk Budget", icon: Gauge, desc: "RCᵢ ∝ current conviction (Bruder–Roncalli)" },
  { id: "hrp", label: "HRP", icon: GitBranch, desc: "Hierarchical clustering, no inversion (LdP 2016)" },
  { id: "black_litterman", label: "Black–Litterman", icon: Brain, desc: "Equilibrium prior Π = δΣw (BL 1992)" },
  { id: "min_cvar", label: "Min CVaR", icon: Layers, desc: "Minimize empirical 95% ES (Rockafellar–Uryasev)" },
];

const VOL_TARGETS = [
  { label: "Off", value: undefined },
  { label: "10%", value: 0.10 },
  { label: "15%", value: 0.15 },
  { label: "20%", value: 0.20 },
] as const;

const WEIGHT_CAPS = [
  { label: "Off", value: undefined },
  { label: "25%", value: 0.25 },
  { label: "40%", value: 0.40 },
] as const;

const TURNOVER_CAPS = [
  { label: "Off", value: undefined },
  { label: "20%", value: 0.20 },
  { label: "50%", value: 0.50 },
] as const;

const PortfolioConstructionModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt } = useNormalizedPortfolio(stocks);
  const regime = useMarketRegime(60000);
  const [activeStrategy, setActiveStrategy] = useState<OptimizerId>("hrp");
  const [volTargetIdx, setVolTargetIdx] = useState(0);
  const [capIdx, setCapIdx] = useState(0);
  const [turnoverIdx, setTurnoverIdx] = useState(0);

  const constraints = useMemo<OptimizerConstraints>(() => ({
    targetVolAnnual: VOL_TARGETS[volTargetIdx].value,
    maxWeight: WEIGHT_CAPS[capIdx].value,
    maxTurnover: TURNOVER_CAPS[turnoverIdx].value,
  }), [volTargetIdx, capIdx, turnoverIdx]);

  const ia = useInstitutionalAnalytics(stocks, { constraints, recommendedId: activeStrategy });
  const snap = ia.snapshot;

  const analytics = useMemo(() => {
    if (holdings.length === 0) return null;

    const currentWeights = holdings.map((h, i) => ({
      name: h.ticker, weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      value: h.value, color: PALETTE[i % PALETTE.length], sector: h.sector,
    }));

    const active = ia.optimizers.find(o => o.id === activeStrategy) ?? null;
    const strategyError = !snap.ready
      ? "Needs ≥30d real history for every holding"
      : active && !active.diagnostics.converged
        ? (active.diagnostics.notes.join("; ") || "Solver did not converge on real Σ")
        : null;

    let targets = holdings.map(() => 0);
    if (active && active.diagnostics.converged && active.weights.length > 0) {
      const byTicker: Record<string, number> = {};
      active.tickers.forEach((t, i) => { byTicker[t] = active.weights[i]; });
      targets = holdings.map(h => (byTicker[h.ticker] ?? 0) * 100);
    }

    const driftData = currentWeights.map((cw, i) => ({
      name: cw.name, current: +cw.weight.toFixed(1), target: +targets[i].toFixed(1),
      drift: +(cw.weight - targets[i]).toFixed(1),
      fill: cw.weight > targets[i] ? "hsl(0, 90%, 55%)" : "hsl(152, 90%, 45%)",
      action: cw.weight > targets[i] + 2 ? "TRIM" : cw.weight < targets[i] - 2 ? "ADD" : "HOLD",
      tradeValue: Math.abs(cw.weight - targets[i]) / 100 * totalValue,
    }));

    // Real time-series performance (fixes prior cross-sectional Sharpe bug)
    const perf = ia.performance;
    const sharpe = perf?.sharpe.value ?? 0;
    const sortino = perf?.sortino.value ?? 0;
    const maxDrawdown = -(perf?.maxDrawdown.value ?? 0) * 100;
    const annReturn = perf?.annualReturn.value ?? 0;
    const annVol = perf?.annualVol.value ?? 0;

    const hhi = ia.risk?.concentration.hhi.value ?? currentWeights.reduce((s, w) => s + (w.weight / 100) ** 2, 0);
    const concentrationScore = Math.round(hhi * 100);
    const effectiveN = ia.risk?.concentration.effectiveN.value ?? (hhi > 0 ? 1 / hhi : 0);

    // Efficient frontier: λ-sweep of Markowitz utility on real Σ
    const covTickers = snap.covariance.tickers;
    const Sigma = snap.covariance.matrix;
    const haveRealCov = snap.ready && covTickers.length >= 2 && Sigma.length === covTickers.length;
    const frontier: { risk: number; return: number }[] = [];
    if (haveRealCov) {
      const muVec = covTickers.map(t => snap.assetStats[t]?.mu ?? 0);
      const lambdas = [0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 12, 20, 35, 60];
      for (const lam of lambdas) {
        const w = meanVarianceWeights(muVec, Sigma, lam);
        if (!w) continue;
        let muP = 0, varP = 0;
        for (let i = 0; i < w.length; i++) muP += w[i] * muVec[i];
        for (let i = 0; i < w.length; i++)
          for (let j = 0; j < w.length; j++) varP += w[i] * w[j] * Sigma[i][j];
        frontier.push({
          risk: +(Math.sqrt(Math.max(varP, 0)) * Math.sqrt(252) * 100).toFixed(2),
          return: +(muP * 252 * 100).toFixed(2),
        });
      }
      frontier.sort((a, b) => a.risk - b.risk);
      // Overlay every converged optimizer as a candidate point
    }
    const optimizerPoints = ia.optimizers
      .filter(o => o.diagnostics.converged && o.weights.length > 0)
      .map(o => ({
        risk: +(o.volAnnual * 100).toFixed(2),
        return: o.expectedReturnAnnual != null ? +(o.expectedReturnAnnual * 100).toFixed(2) : 0,
        name: o.label,
      }))
      .filter(p => p.return !== 0 || p.risk !== 0);
    const portfolioPoint = { risk: +(annVol * 100).toFixed(1), return: +(annReturn * 100).toFixed(1) };

    const sectorMap: Record<string, { weight: number; count: number }> = {};
    currentWeights.forEach((cw) => {
      if (!sectorMap[cw.sector]) sectorMap[cw.sector] = { weight: 0, count: 0 };
      sectorMap[cw.sector].weight += cw.weight; sectorMap[cw.sector].count += 1;
    });
    const sectorData = Object.entries(sectorMap).map(([name, d]) => ({
      name: name.length > 12 ? name.slice(0, 12) + "…" : name, weight: +d.weight.toFixed(1), count: d.count,
    })).sort((a, b) => b.weight - a.weight);

    // Euler risk contributions from Σ (replaces β×risk-score heuristic)
    const riskContribData = (ia.attribution?.positions ?? [])
      .filter(p => p.riskContributionPct != null)
      .map(p => ({ name: p.ticker, pct: +((p.riskContributionPct as number) * 100).toFixed(1) }));

    const radarData = [
      { factor: "Diversification", value: Math.round(Math.min(100, (effectiveN / Math.max(holdings.length, 1)) * 100)) },
      { factor: "Risk-Adjusted", value: Math.round(Math.min(100, Math.max(0, sharpe * 30 + 50))) },
      { factor: "Momentum", value: Math.round(Math.min(100, Math.max(0, annReturn * 200 + 50))) },
      { factor: "Stability", value: Math.round(Math.min(100, Math.max(0, 100 + maxDrawdown * 2))) },
      { factor: "Efficiency", value: Math.round(Math.min(100, Math.max(0, sortino * 25 + 50))) },
    ];

    // Noise vs signal (RMT / Marchenko–Pastur) on the realized correlation
    let rmt: { lambdaPlus: number | null; signalCount: number | null; pc1Share: number | null; eigCount: number; T: number } =
      { lambdaPlus: null, signalCount: null, pc1Share: null, eigCount: 0, T: snap.lookbackDays };
    if (haveRealCov) {
      const N = Sigma.length;
      const stds = Sigma.map((r, i) => Math.sqrt(Math.max(r[i], 0)));
      if (stds.every(s => s > 0)) {
        const corr = Sigma.map((row, i) => row.map((v, j) => v / (stds[i] * stds[j])));
        const eig = jacobiEigen(corr);
        if (eig) {
          const mp = marchenkoPastur(eig.values, snap.lookbackDays, N, 1);
          const total = eig.values.reduce((a, v) => a + v, 0);
          rmt = {
            lambdaPlus: mp ? +mp.lambdaPlus.toFixed(3) : null,
            signalCount: mp ? mp.signalCount : null,
            pc1Share: total > 0 ? Math.max(...eig.values) / total : null,
            eigCount: N,
            T: snap.lookbackDays,
          };
        }
      }
    }

    const regimeName = regime?.regime || "Range-Bound";
    const regimeAdvice = (() => {
      switch (regimeName) {
        case "Trending Bull": return { color: "text-gain", suggestion: "Markowitz utility tilt — overweight high-μ names within the Σ risk budget", recommended: "mean_variance" as OptimizerId };
        case "Trending Bear": return { color: "text-loss", suggestion: "Shift to minimum variance, reduce beta exposure aggressively", recommended: "min_variance" as OptimizerId };
        case "Crisis": return { color: "text-loss", suggestion: "HRP — clustering stays stable exactly where Σ⁻¹ breaks in stress", recommended: "hrp" as OptimizerId };
        case "High Volatility": return { color: "text-warning", suggestion: "Risk parity rebalance, normalize contribution per position", recommended: "risk_parity" as OptimizerId };
        case "Rotation": return { color: "text-info", suggestion: "Equal weight rebalance, capture sector rotation evenly", recommended: "equal_weight" as OptimizerId };
        default: return { color: "text-muted-foreground", suggestion: "Maintain current allocation, no regime trigger detected", recommended: "hrp" as OptimizerId };
      }
    })();

    return {
      currentWeights, driftData, sharpe, sortino, maxDrawdown, concentrationScore, effectiveN,
      frontier, optimizerPoints, portfolioPoint, sectorData, riskContribData, radarData,
      regimeName, regimeAdvice, annReturn, annVol, strategyError, active, rmt,
    };
  }, [holdings, totalValue, activeStrategy, regime, snap, ia]);

  if (!analytics || holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks in the Dashboard to see portfolio construction.</p>
      </div>
    );
  }

  const {
    currentWeights, driftData, sharpe, sortino, maxDrawdown, concentrationScore, effectiveN,
    frontier, optimizerPoints, portfolioPoint, sectorData, riskContribData, radarData,
    regimeName, regimeAdvice, annReturn, annVol, strategyError, active, rmt,
  } = analytics;

  const diag = active?.diagnostics ?? null;

  return (
    <div className="space-y-5">
      {/* Regime Banner */}
      <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="h-5 w-5 text-primary" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market Regime</p>
            <p className={`text-sm font-bold ${regimeAdvice.color}`}>{regimeName}</p>
          </div>
        </div>
        <div className="text-right max-w-md">
          <p className="text-xs text-muted-foreground">{regimeAdvice.suggestion}</p>
          {activeStrategy !== regimeAdvice.recommended && (
            <button onClick={() => setActiveStrategy(regimeAdvice.recommended)}
              className="mt-1 text-[10px] font-medium text-primary underline underline-offset-2 hover:text-foreground transition-colors">
              Switch to {strategies.find(s => s.id === regimeAdvice.recommended)?.label} →
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip — real time-series metrics */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          { label: "Portfolio Value", value: fmt(totalValue), color: "text-foreground", sub: `${holdings.length} positions` },
          { label: "Sharpe (realized)", value: sharpe.toFixed(2), color: sharpe >= 1 ? "text-gain" : sharpe >= 0 ? "text-foreground" : "text-loss", sub: `${snap.lookbackDays}d series` },
          { label: "Sortino (realized)", value: sortino.toFixed(2), color: sortino >= 1 ? "text-gain" : sortino >= 0 ? "text-foreground" : "text-loss", sub: `${snap.lookbackDays}d series` },
          { label: "Max Drawdown", value: `${maxDrawdown.toFixed(1)}%`, color: maxDrawdown < -10 ? "text-loss" : maxDrawdown < -5 ? "text-warning" : "text-gain", sub: "equity curve" },
          { label: "Effective N", value: effectiveN.toFixed(1), color: concentrationScore > 40 ? "text-loss" : concentrationScore > 25 ? "text-warning" : "text-gain", sub: `HHI ${concentrationScore}` },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            <p className={`mt-1 font-mono text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
            <p className="text-[9px] text-muted-foreground/60 mt-0.5">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Strategy Selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Allocation Engine</h3>
          <MethodologyTooltip
            title="Optimizer Suite"
            methods={[
              { label: "Robust MVO", formula: "max μ̃ᵀw − 4wᵀΣ̃w · Σ̃ = Ledoit–Wolf, μ̃ = ½μ + ½μ̄", source: "Ledoit & Wolf (2004); James–Stein", notes: "Kills MVO's error-maximizing corners." },
              { label: "HRP", formula: "cluster on √(½(1−ρ)) → recursive bisection", source: "López de Prado (2016)", notes: "No matrix inversion; stable on singular Σ." },
              { label: "Risk Budget", formula: "wᵢ(Σw)ᵢ = bᵢσ²_p", source: "Bruder & Roncalli (2012)", notes: "Budgets ∝ current capital weights." },
              { label: "Black–Litterman", formula: "μ_BL = [(τΣ)⁻¹+PᵀΩ⁻¹P]⁻¹[(τΣ)⁻¹Π+PᵀΩ⁻¹Q]", source: "Black & Litterman (1992)", notes: "Prior = current portfolio equilibrium." },
              { label: "Min CVaR", formula: "min ES₉₅ over historical scenarios", source: "Rockafellar & Uryasev (2000)", notes: "Projected subgradient, deterministic." },
              { label: "Constraints", formula: "weight cap · turnover cap · σ targeting", source: "Capped-simplex projection; blend; cash padding" },
            ]}
          />
        </div>
        {strategyError && (
          <p className="mb-2 text-[10px] text-warning flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {strategyError} — no fallback allocation is shown
          </p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          {strategies.map(s => {
            const Icon = s.icon;
            const isActive = activeStrategy === s.id;
            const isRecommended = regimeAdvice.recommended === s.id;
            const result = ia.optimizers.find(o => o.id === s.id);
            const ok = result?.diagnostics.converged ?? false;
            return (
              <button key={s.id} onClick={() => setActiveStrategy(s.id)}
                className={`relative rounded-lg p-3 text-left transition-all border ${isActive ? "border-foreground bg-foreground/5" : "border-border hover:border-muted-foreground/30"}`}>
                {isRecommended && <span className="absolute -top-1.5 right-2 rounded bg-primary px-1.5 py-0.5 text-[8px] font-bold text-primary-foreground uppercase">Regime Pick</span>}
                <div className="flex items-center justify-between">
                  <Icon className={`h-4 w-4 mb-1.5 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
                  {snap.ready && (ok
                    ? <CheckCircle2 className="h-3 w-3 text-gain/70" />
                    : <XCircle className="h-3 w-3 text-loss/70" />)}
                </div>
                <p className={`text-xs font-semibold ${isActive ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-tight">{s.desc}</p>
              </button>
            );
          })}
        </div>

        {/* Constraint controls */}
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border/50 pt-3">
          {[
            { title: "Vol Target (σₐ)", options: VOL_TARGETS, idx: volTargetIdx, set: setVolTargetIdx },
            { title: "Position Cap", options: WEIGHT_CAPS, idx: capIdx, set: setCapIdx },
            { title: "Turnover Cap", options: TURNOVER_CAPS, idx: turnoverIdx, set: setTurnoverIdx },
          ].map(ctl => (
            <div key={ctl.title} className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{ctl.title}</span>
              <div className="flex gap-1">
                {ctl.options.map((o, i) => (
                  <button key={o.label} onClick={() => ctl.set(i)}
                    className={`rounded px-2 py-0.5 text-[10px] font-mono transition-colors ${ctl.idx === i ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimizer diagnostics */}
      {diag && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Solver Diagnostics — {active?.label}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
              <p className={`font-mono text-sm font-bold ${diag.converged ? "text-gain" : "text-loss"}`}>
                {diag.converged ? "CONVERGED" : "FAILED"}{diag.iterations != null ? ` · ${diag.iterations} it` : ""}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">κ(Σ) Condition</p>
              <p className={`font-mono text-sm font-bold ${diag.conditionNumber != null && diag.conditionNumber > 1000 ? "text-warning" : "text-foreground"}`}>
                {diag.conditionNumber == null ? "—" : diag.conditionNumber === Infinity ? "singular" : diag.conditionNumber.toFixed(0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">LW Shrinkage δ</p>
              <p className="font-mono text-sm font-bold text-foreground">{diag.shrinkageDelta != null ? diag.shrinkageDelta.toFixed(3) : "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Confidence</p>
              <p className={`font-mono text-sm font-bold uppercase ${diag.confidence === "high" ? "text-gain" : diag.confidence === "medium" ? "text-warning" : "text-loss"}`}>{diag.confidence}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Target σₐ / Cash</p>
              <p className="font-mono text-sm font-bold text-foreground">
                {active ? `${(active.volAnnual * 100).toFixed(1)}%` : "—"}
                {active && active.cashWeight > 0.005 ? ` · ${(active.cashWeight * 100).toFixed(0)}% cash` : ""}
              </p>
            </div>
          </div>
          {(diag.assumptions.length > 0 || diag.notes.length > 0) && (
            <div className="mt-2 space-y-0.5">
              {diag.assumptions.map((a, i) => <p key={`a${i}`} className="text-[10px] text-muted-foreground/70">• {a}</p>)}
              {diag.notes.map((nt, i) => <p key={`n${i}`} className="text-[10px] text-warning/80">• {nt}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Noise vs Signal (RMT / Marchenko-Pastur) */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            Noise vs Signal
            <span className="text-[9px] font-mono text-muted-foreground/60">RMT / Marchenko-Pastur</span>
          </h3>
          <MethodologyTooltip
            title="Random Matrix Theory"
            methods={[
              { label: "MP upper edge", formula: "λ₊ = (1 + √(N/T))²", source: "Marchenko & Pastur (1967)", notes: "Eigenvalues > λ₊ on the realised correlation matrix carry genuine signal; the rest are sampling noise." },
              { label: "PC1 concentration", formula: "λ₁ / Σλᵢ", source: "Bouchaud & Potters; Laloux et al. (1999)", notes: ">40% of variance in PC1 indicates a dominant systemic factor — diversification is illusory." },
            ]}
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Assets (N)</p>
            <p className="font-mono text-lg font-bold text-foreground">{rmt.eigCount || "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Lookback (T)</p>
            <p className="font-mono text-lg font-bold text-foreground">{rmt.T ? `${rmt.T}d` : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">λ₊ Edge</p>
            <p className="font-mono text-lg font-bold text-foreground">{rmt.lambdaPlus ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">PC1 Share</p>
            <p className={`font-mono text-lg font-bold ${
              rmt.pc1Share == null ? "text-muted-foreground"
              : rmt.pc1Share > 0.4 ? "text-loss"
              : rmt.pc1Share > 0.25 ? "text-warning"
              : "text-gain"
            }`}>{rmt.pc1Share == null ? "—" : `${(rmt.pc1Share * 100).toFixed(1)}%`}</p>
          </div>
        </div>
        {rmt.pc1Share != null && rmt.pc1Share > 0.4 && (
          <p className="mt-2 text-[11px] text-loss flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3" /> Systemic concentration: {(rmt.pc1Share * 100).toFixed(0)}% of variance in PC1 — diversification illusory.
          </p>
        )}
        {rmt.signalCount != null && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            {rmt.signalCount} of {rmt.eigCount} eigenvalues above MP noise edge.
          </p>
        )}
      </div>

      {/* Row 1: Allocation Pie + Efficient Frontier */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Current Allocation</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={currentWeights} dataKey="weight" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} strokeWidth={2} stroke={BG}>
                  {currentWeights.map((a, i) => <Cell key={i} fill={a.color} />)}
                </Pie>
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v.toFixed(1)}%`, "Weight"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1">
            {currentWeights.map(a => (
              <div key={a.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                  <span className="text-muted-foreground">{a.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-foreground">{a.weight.toFixed(1)}%</span>
                  <span className="font-mono text-muted-foreground/50 text-[10px]">{fmt(a.value)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Efficient Frontier & Optimizer Map</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis type="number" dataKey="risk" name="Risk %" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} label={{ value: "Volatility %", position: "bottom", fill: MUTED, fontSize: 9 }} />
                <YAxis type="number" dataKey="return" name="Return %" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} label={{ value: "Return %", angle: -90, position: "left", fill: MUTED, fontSize: 9 }} />
                <ZAxis range={[30, 30]} />
                <Tooltip contentStyle={tipStyle} />
                <Scatter name="Frontier" data={frontier} fill="hsl(0,0%,30%)" line={{ stroke: "hsl(0,0%,40%)", strokeWidth: 2 }} />
                <Scatter name="Optimizers" data={optimizerPoints} fill="hsl(210,60%,55%)" />
                <Scatter name="Your Portfolio" data={[portfolioPoint]} fill="hsl(152,90%,45%)" shape="star">
                  <Cell fill="hsl(152,90%,45%)" />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gain" /> Your Portfolio</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "hsl(210,60%,55%)" }} /> Optimizer Candidates</span>
            <span>Realized: {(annReturn * 100).toFixed(1)}% / {(annVol * 100).toFixed(1)}% σₐ</span>
          </div>
        </div>
      </div>

      {/* Row 2: Drift + Risk Contribution */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
            Drift vs {strategies.find(s => s.id === activeStrategy)?.label} Target
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={driftData} layout="vertical" margin={{ left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: MUTED, fontSize: 10 }} axisLine={{ stroke: GRID }} width={65} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="drift" radius={[0, 4, 4, 0]}>
                  {driftData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Risk Contribution</h3>
            <span className="text-[9px] font-mono text-muted-foreground/60">Euler: RCᵢ = wᵢ(Σw)ᵢ / σ²_p</span>
          </div>
          <div className="h-56">
            {riskContribData.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-xs text-muted-foreground">Needs real Σ (≥30d history per holding)</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={riskContribData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                  <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} />
                  <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                  <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Risk Share"]} />
                  <Bar dataKey="pct" fill="hsl(0,0%,50%)" radius={[4, 4, 0, 0]}>
                    {riskContribData.map((r, i) => (
                      <Cell key={i} fill={r.pct > 30 ? "hsl(0,90%,55%)" : r.pct > 20 ? "hsl(38,92%,55%)" : "hsl(0,0%,45%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Row 3: Sector + Radar */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Concentration</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 8 }} axisLine={{ stroke: GRID }} interval={0} angle={-20} textAnchor="end" height={45} />
                <YAxis tick={{ fill: MUTED, fontSize: 9 }} axisLine={{ stroke: GRID }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={tipStyle} formatter={(v: number) => [`${v}%`, "Weight"]} />
                <Bar dataKey="weight" fill="hsl(210,60%,55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Portfolio Quality</h3>
            <span className="text-[9px] font-mono text-muted-foreground/60">scaled from realized metrics</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(0,0%,14%)" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: "hsl(0,0%,50%)", fontSize: 9 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(0,0%,30%)", fontSize: 8 }} />
                <Radar dataKey="value" stroke="hsl(152,90%,45%)" fill="hsl(152,90%,45%)" fillOpacity={0.12} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rebalance Trade Sheet */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> Rebalance Trade Sheet
          </h3>
          {active && active.turnoverFromCurrent > 0 && (
            <span className="text-[10px] font-mono text-muted-foreground">
              one-way turnover: {(active.turnoverFromCurrent * 100).toFixed(1)}%
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left py-2 px-2">Asset</th>
                <th className="text-right py-2 px-2">Current</th>
                <th className="text-right py-2 px-2">Target</th>
                <th className="text-right py-2 px-2">Drift</th>
                <th className="text-center py-2 px-2">Action</th>
                <th className="text-right py-2 px-2">Est. Trade</th>
              </tr>
            </thead>
            <tbody>
              {driftData.map(d => (
                <tr key={d.name} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="py-2.5 px-2 font-mono font-semibold text-foreground">{d.name}</td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{d.current}%</td>
                  <td className="py-2.5 px-2 text-right font-mono text-foreground">{d.target}%</td>
                  <td className={`py-2.5 px-2 text-right font-mono font-bold ${d.drift > 0 ? "text-loss" : d.drift < 0 ? "text-gain" : "text-muted-foreground"}`}>
                    {d.drift > 0 ? "+" : ""}{d.drift}%
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${d.action === "TRIM" ? "bg-loss/10 text-loss" : d.action === "ADD" ? "bg-gain/10 text-gain" : "bg-surface-3 text-muted-foreground"}`}>{d.action}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{d.action !== "HOLD" ? fmt(d.tradeValue) : "—"}</td>
                </tr>
              ))}
              {active && active.cashWeight > 0.005 && (
                <tr className="border-b border-border/50">
                  <td className="py-2.5 px-2 font-mono font-semibold text-muted-foreground">CASH</td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">0.0%</td>
                  <td className="py-2.5 px-2 text-right font-mono text-foreground">{(active.cashWeight * 100).toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-right font-mono text-gain">−{(active.cashWeight * 100).toFixed(1)}%</td>
                  <td className="py-2.5 px-2 text-center">
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold bg-gain/10 text-gain">RAISE</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">{fmt(active.cashWeight * totalValue)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {driftData.every(d => d.action === "HOLD") && !strategyError && (
          <p className="mt-3 text-sm text-gain flex items-center gap-2"><Zap className="h-3.5 w-3.5" /> Portfolio within tolerance, no rebalancing needed.</p>
        )}
        {driftData.some(d => d.action !== "HOLD") && (
          <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
            <AlertTriangle className="h-3 w-3 text-warning" />
            {driftData.filter(d => d.action !== "HOLD").length} position(s) outside ±2% tolerance band
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioConstructionModule;
