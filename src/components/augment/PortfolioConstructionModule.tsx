import { useMemo, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area, LineChart, Line, RadarChart, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Radar, ScatterChart, Scatter, ZAxis,
} from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { TrendingUp, ShieldAlert, Scale, Zap, AlertTriangle, ArrowRightLeft, Target, Brain } from "lucide-react";

interface Props { stocks: PortfolioStock[]; }

type Strategy = "equal_weight" | "risk_parity" | "momentum" | "min_variance";

const PALETTE = [
  "hsl(0, 0%, 95%)", "hsl(152, 90%, 45%)", "hsl(210, 60%, 55%)", "hsl(38, 92%, 55%)",
  "hsl(0, 90%, 55%)", "hsl(280, 60%, 55%)", "hsl(180, 60%, 45%)", "hsl(0, 0%, 60%)",
];

const strategies: { id: Strategy; label: string; icon: typeof Scale; desc: string }[] = [
  { id: "equal_weight", label: "Equal Weight", icon: Scale, desc: "Uniform allocation across all positions" },
  { id: "risk_parity", label: "Risk Parity", icon: ShieldAlert, desc: "Weight inversely by volatility — equalize risk contribution" },
  { id: "momentum", label: "Momentum Tilt", icon: TrendingUp, desc: "Overweight winners, underweight losers" },
  { id: "min_variance", label: "Min Variance", icon: Target, desc: "Minimize portfolio variance via low-beta overweight" },
];

const PortfolioConstructionModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt, totalPnl, totalInvested } = useNormalizedPortfolio(stocks);
  const regime = useMarketRegime(60000);
  const [activeStrategy, setActiveStrategy] = useState<Strategy>("risk_parity");

  const analytics = useMemo(() => {
    if (holdings.length === 0) return null;

    // --- Current weights ---
    const currentWeights = holdings.map((h, i) => ({
      name: h.ticker, weight: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      value: h.value, color: PALETTE[i % PALETTE.length],
      risk: h.risk, beta: h.beta, pnlPct: h.pnlPct, sector: h.sector,
    }));

    // --- Target weights based on strategy ---
    const computeTargets = (strategy: Strategy) => {
      const n = holdings.length;
      switch (strategy) {
        case "equal_weight":
          return holdings.map(() => 100 / n);
        case "risk_parity": {
          const invRisks = holdings.map(h => 1 / Math.max(h.risk, 5));
          const sumInv = invRisks.reduce((s, v) => s + v, 0);
          return invRisks.map(ir => (ir / sumInv) * 100);
        }
        case "momentum": {
          const scores = holdings.map(h => Math.max(h.pnlPct + 50, 1));
          const sumScores = scores.reduce((s, v) => s + v, 0);
          return scores.map(sc => (sc / sumScores) * 100);
        }
        case "min_variance": {
          const invBetas = holdings.map(h => 1 / Math.max(Math.abs(h.beta), 0.1));
          const sumBeta = invBetas.reduce((s, v) => s + v, 0);
          return invBetas.map(ib => (ib / sumBeta) * 100);
        }
      }
    };

    const targets = computeTargets(activeStrategy);

    // --- Drift data ---
    const driftData = currentWeights.map((cw, i) => ({
      name: cw.name, current: +cw.weight.toFixed(1), target: +targets[i].toFixed(1),
      drift: +(cw.weight - targets[i]).toFixed(1),
      fill: cw.weight > targets[i] ? "hsl(0, 90%, 55%)" : "hsl(152, 90%, 45%)",
      action: cw.weight > targets[i] + 2 ? "TRIM" : cw.weight < targets[i] - 2 ? "ADD" : "HOLD",
      tradeValue: Math.abs(cw.weight - targets[i]) / 100 * totalValue,
    }));

    // --- Portfolio metrics ---
    const returns = holdings.map(h => h.pnlPct / 100);
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const riskFreeRate = 0.05;
    const annReturn = avgReturn * 252;
    const annVol = stdDev * Math.sqrt(252);
    const sharpe = annVol > 0 ? (annReturn - riskFreeRate) / annVol : 0;
    const sortino = (() => {
      const downside = returns.filter(r => r < 0);
      if (downside.length === 0) return sharpe * 1.5;
      const downDev = Math.sqrt(downside.reduce((s, r) => s + r ** 2, 0) / downside.length) * Math.sqrt(252);
      return downDev > 0 ? (annReturn - riskFreeRate) / downDev : 0;
    })();
    const maxDrawdown = Math.min(...holdings.map(h => h.pnlPct), 0);

    // --- Concentration (HHI) ---
    const hhi = currentWeights.reduce((s, w) => s + (w.weight / 100) ** 2, 0);
    const concentrationScore = Math.round(hhi * 100);

    // --- Efficient frontier simulation ---
    const frontier = Array.from({ length: 20 }, (_, i) => {
      const riskLevel = 5 + i * 2.5;
      const expectedReturn = -2 + riskLevel * 0.6 + Math.sin(riskLevel * 0.3) * 2;
      return { risk: +riskLevel.toFixed(1), return: +expectedReturn.toFixed(1) };
    });
    const portfolioPoint = { risk: +(annVol * 100).toFixed(1), return: +(annReturn * 100).toFixed(1) };

    // --- Sector breakdown ---
    const sectorMap: Record<string, { weight: number; count: number }> = {};
    currentWeights.forEach((cw, i) => {
      const sec = holdings[i].sector;
      if (!sectorMap[sec]) sectorMap[sec] = { weight: 0, count: 0 };
      sectorMap[sec].weight += cw.weight;
      sectorMap[sec].count += 1;
    });
    const sectorData = Object.entries(sectorMap).map(([name, d]) => ({
      name: name.length > 12 ? name.slice(0, 12) + "…" : name,
      weight: +d.weight.toFixed(1), count: d.count,
    })).sort((a, b) => b.weight - a.weight);

    // --- Risk contribution ---
    const riskContrib = holdings.map((h, i) => {
      const w = currentWeights[i].weight / 100;
      const marginalRisk = h.beta * h.risk * w;
      return { name: h.ticker, contribution: +marginalRisk.toFixed(1), beta: h.beta, risk: h.risk };
    });
    const totalRiskContrib = riskContrib.reduce((s, r) => s + r.contribution, 0);
    const riskContribData = riskContrib.map(r => ({
      ...r, pct: totalRiskContrib > 0 ? +((r.contribution / totalRiskContrib) * 100).toFixed(1) : 0,
    }));

    // --- Radar summary ---
    const radarData = [
      { factor: "Diversification", value: Math.round(100 - concentrationScore) },
      { factor: "Risk-Adjusted", value: Math.round(Math.min(100, Math.max(0, sharpe * 30 + 50))) },
      { factor: "Momentum", value: Math.round(Math.min(100, Math.max(0, avgReturn * 500 + 50))) },
      { factor: "Stability", value: Math.round(Math.min(100, Math.max(0, 100 + maxDrawdown * 2))) },
      { factor: "Efficiency", value: Math.round(Math.min(100, Math.max(0, sortino * 25 + 50))) },
    ];

    // --- Regime-aware advice ---
    const regimeName = regime?.regime || "Range-Bound";
    const regimeAdvice = (() => {
      switch (regimeName) {
        case "Trending Bull": return { color: "text-gain", suggestion: "Tilt toward momentum — overweight high-beta winners", recommended: "momentum" as Strategy };
        case "Trending Bear": return { color: "text-loss", suggestion: "Shift to minimum variance — reduce beta exposure aggressively", recommended: "min_variance" as Strategy };
        case "Crisis": return { color: "text-loss", suggestion: "Emergency risk parity — equalize risk and raise cash allocation", recommended: "risk_parity" as Strategy };
        case "High Volatility": return { color: "text-warning", suggestion: "Risk parity rebalance — normalize contribution per position", recommended: "risk_parity" as Strategy };
        case "Rotation": return { color: "text-info", suggestion: "Equal weight rebalance — capture sector rotation evenly", recommended: "equal_weight" as Strategy };
        default: return { color: "text-muted-foreground", suggestion: "Maintain current allocation — no regime trigger detected", recommended: "equal_weight" as Strategy };
      }
    })();

    return {
      currentWeights, targets, driftData, sharpe, sortino, maxDrawdown,
      concentrationScore, hhi, frontier, portfolioPoint, sectorData,
      riskContribData, radarData, regimeName, regimeAdvice, annReturn, annVol,
    };
  }, [holdings, totalValue, activeStrategy, regime]);

  if (!analytics || holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks in the Dashboard to see portfolio construction.</p>
      </div>
    );
  }

  const { currentWeights, driftData, sharpe, sortino, maxDrawdown, concentrationScore,
    frontier, portfolioPoint, sectorData, riskContribData, radarData, regimeName, regimeAdvice,
    annReturn, annVol } = analytics;

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
            <button
              onClick={() => setActiveStrategy(regimeAdvice.recommended)}
              className="mt-1 text-[10px] font-medium text-primary underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Switch to {strategies.find(s => s.id === regimeAdvice.recommended)?.label} →
            </button>
          )}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        {[
          { label: "Portfolio Value", value: fmt(totalValue), color: "text-foreground" },
          { label: "Sharpe", value: sharpe.toFixed(2), color: sharpe >= 1 ? "text-gain" : sharpe >= 0 ? "text-foreground" : "text-loss" },
          { label: "Sortino", value: sortino.toFixed(2), color: sortino >= 1 ? "text-gain" : sortino >= 0 ? "text-foreground" : "text-loss" },
          { label: "Max Drawdown", value: `${maxDrawdown.toFixed(1)}%`, color: maxDrawdown < -10 ? "text-loss" : maxDrawdown < -5 ? "text-warning" : "text-gain" },
          { label: "Concentration", value: `${concentrationScore}`, color: concentrationScore > 40 ? "text-loss" : concentrationScore > 25 ? "text-warning" : "text-gain" },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{kpi.label}</p>
            <p className={`mt-1 font-mono text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Strategy Selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Rebalancing Strategy</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {strategies.map(s => {
            const Icon = s.icon;
            const active = activeStrategy === s.id;
            const isRecommended = regimeAdvice.recommended === s.id;
            return (
              <button key={s.id} onClick={() => setActiveStrategy(s.id)}
                className={`relative rounded-lg p-3 text-left transition-all border ${
                  active ? "border-foreground bg-foreground/5" : "border-border hover:border-muted-foreground/30"
                }`}>
                {isRecommended && (
                  <span className="absolute -top-1.5 right-2 rounded bg-primary px-1.5 py-0.5 text-[8px] font-bold text-primary-foreground uppercase">Regime Pick</span>
                )}
                <Icon className={`h-4 w-4 mb-1.5 ${active ? "text-foreground" : "text-muted-foreground"}`} />
                <p className={`text-xs font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>{s.label}</p>
                <p className="text-[9px] text-muted-foreground/60 mt-0.5 leading-tight">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 1: Allocation Pie + Efficient Frontier */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Current Allocation */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Current Allocation</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={currentWeights} dataKey="weight" nameKey="name" cx="50%" cy="50%" outerRadius={85} innerRadius={45} strokeWidth={2} stroke="hsl(var(--background))">
                  {currentWeights.map((a, i) => <Cell key={i} fill={a.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v.toFixed(1)}%`, "Weight"]} />
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

        {/* Efficient Frontier */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Efficient Frontier</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 10, bottom: 5, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" dataKey="risk" name="Risk %" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} label={{ value: "Volatility %", position: "bottom", fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                <YAxis type="number" dataKey="return" name="Return %" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} label={{ value: "Return %", angle: -90, position: "left", fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                <ZAxis range={[30, 30]} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                <Scatter name="Frontier" data={frontier} fill="hsl(0, 0%, 30%)" line={{ stroke: "hsl(0, 0%, 40%)", strokeWidth: 2 }} />
                <Scatter name="Your Portfolio" data={[portfolioPoint]} fill="hsl(152, 90%, 45%)" shape="star">
                  <Cell fill="hsl(152, 90%, 45%)" />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gain" /> Your Portfolio</span>
            <span>Ann. Return: {(annReturn * 100).toFixed(1)}%</span>
            <span>Ann. Vol: {(annVol * 100).toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Row 2: Drift Chart + Risk Contribution */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Drift vs Target */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">
            Drift vs {strategies.find(s => s.id === activeStrategy)?.label} Target
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={driftData} layout="vertical" margin={{ left: 70 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}%`} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} width={65} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }} />
                <Bar dataKey="drift" radius={[0, 4, 4, 0]}>
                  {driftData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Risk Contribution */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Risk Contribution</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskContribData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number, name: string) => [name === "pct" ? `${v}%` : v, name === "pct" ? "Risk Share" : "Marginal Risk"]} />
                <Bar dataKey="pct" fill="hsl(0, 0%, 50%)" radius={[4, 4, 0, 0]}>
                  {riskContribData.map((_, i) => (
                    <Cell key={i} fill={riskContribData[i].pct > 30 ? "hsl(0, 90%, 55%)" : riskContribData[i].pct > 20 ? "hsl(38, 92%, 55%)" : "hsl(0, 0%, 45%)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row 3: Sector Breakdown + Portfolio Quality Radar */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Sector */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Sector Concentration</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sectorData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }} axisLine={{ stroke: "hsl(var(--border))" }} interval={0} angle={-20} textAnchor="end" height={45} />
                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} tickFormatter={v => `${v}%`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(v: number) => [`${v}%`, "Weight"]} />
                <Bar dataKey="weight" fill="hsl(210, 60%, 55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Radar */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Portfolio Quality</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(0,0%,14%)" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: "hsl(0,0%,50%)", fontSize: 9 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "hsl(0,0%,30%)", fontSize: 8 }} />
                <Radar dataKey="value" stroke="hsl(152, 90%, 45%)" fill="hsl(152, 90%, 45%)" fillOpacity={0.12} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Rebalance Trade Sheet */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4" />
          Rebalance Trade Sheet
        </h3>
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
                    <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      d.action === "TRIM" ? "bg-loss/10 text-loss" : d.action === "ADD" ? "bg-gain/10 text-gain" : "bg-surface-3 text-muted-foreground"
                    }`}>{d.action}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-muted-foreground">
                    {d.action !== "HOLD" ? fmt(d.tradeValue) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {driftData.every(d => d.action === "HOLD") && (
          <p className="mt-3 text-sm text-gain flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" /> Portfolio within tolerance — no rebalancing needed.
          </p>
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
