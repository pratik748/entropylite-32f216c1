import { useMemo, useState } from "react";
import { AlertTriangle, Shield, Zap, TrendingDown, Activity, ChevronDown, ChevronRight } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import {
  evaluateConstraints,
  computeClankScore,
  clankLevel,
  simulateCascade,
  CATEGORY_COLORS,
  STATUS_COLORS,
  type ConstraintStatus,
  type CascadeStep,
} from "@/lib/clank-engine";

interface ClankEngineProps {
  stocks: PortfolioStock[];
}

const ClankEngine = ({ stocks }: ClankEngineProps) => {
  const [expandedConstraint, setExpandedConstraint] = useState<string | null>(null);

  const statuses = useMemo(() => evaluateConstraints(stocks), [stocks]);
  const clankScore = useMemo(() => computeClankScore(statuses), [statuses]);
  const level = useMemo(() => clankLevel(clankScore), [clankScore]);
  const cascade = useMemo(() => simulateCascade(statuses), [statuses]);

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => b.activationProbability - a.activationProbability),
    [statuses]
  );

  // Pressure chart data
  const pressureData = useMemo(
    () => sorted.map(s => ({
      name: s.constraint.shortName,
      pressure: +s.pressureContribution.toFixed(1),
      probability: +(s.activationProbability * 100).toFixed(0),
      volume: +s.estimatedForcedVolume.toFixed(1),
    })),
    [sorted]
  );

  // Cascade waterfall data
  const cascadeData = useMemo(() => {
    let cumPrice = 0;
    return cascade.map(step => {
      cumPrice += step.priceImpact;
      return {
        name: step.constraintName,
        impact: +cumPrice.toFixed(2),
        liqDrain: step.liquidityDrain,
        vol: step.volSpike,
      };
    });
  }, [cascade]);

  const totalForcedVol = useMemo(
    () => statuses.reduce((s, cs) => s + cs.estimatedForcedVolume, 0),
    [statuses]
  );

  const criticalCount = statuses.filter(s => s.status === "critical" || s.status === "active").length;
  const watchCount = statuses.filter(s => s.status === "approaching" || s.status === "watching").length;

  return (
    <div className="space-y-4">
      {/* CLANK Header Score */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground tracking-wide">CLANK STRUCTURAL PRESSURE</h3>
              <p className="text-[10px] text-muted-foreground">Institutional constraint detection engine</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Score</p>
              <p className={`font-mono text-3xl sm:text-4xl font-black ${level.color}`}>{clankScore}</p>
            </div>
            <div className={`rounded-lg px-3 py-1.5 ${level.bgColor}`}>
              <p className={`text-[10px] font-bold uppercase tracking-wider ${level.color}`}>{level.label}</p>
            </div>
          </div>
        </div>

        {/* Score gauge */}
        <div className="relative h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              clankScore >= 80 ? "bg-loss" : clankScore >= 60 ? "bg-warning" : clankScore >= 30 ? "bg-amber-400" : "bg-gain"
            }`}
            style={{ width: `${clankScore}%` }}
          />
          {/* Threshold markers */}
          {[30, 60, 80].map(t => (
            <div key={t} className="absolute top-0 h-full w-px bg-foreground/20" style={{ left: `${t}%` }} />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-muted-foreground font-mono">
          <span>STABLE</span>
          <span>TENSION</span>
          <span>INSTABILITY</span>
          <span>CASCADE</span>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Critical Constraints", value: criticalCount, color: criticalCount > 0 ? "text-loss" : "text-gain", icon: AlertTriangle },
          { label: "Watching", value: watchCount, color: watchCount > 2 ? "text-warning" : "text-foreground", icon: Activity },
          { label: "Est. Forced Volume", value: `$${totalForcedVol.toFixed(0)}B`, color: "text-foreground", icon: TrendingDown },
          { label: "Cascade Steps", value: cascade.length, color: cascade.length > 3 ? "text-warning" : "text-foreground", icon: Shield },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <m.icon className="h-3 w-3 text-muted-foreground" />
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
            </div>
            <p className={`font-mono text-xl sm:text-2xl font-bold ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Pressure Chart + Constraint List */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pressure Distribution */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Pressure Distribution</h3>
          <div className="h-52 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pressureData} layout="vertical" margin={{ left: 70, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                <YAxis dataKey="name" type="category" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} width={68} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                  formatter={(val: number, name: string) => [
                    name === "pressure" ? `${val.toFixed(1)} pts` : `${val}%`,
                    name === "pressure" ? "Pressure" : "Activation %"
                  ]}
                />
                <Bar dataKey="pressure" radius={[0, 4, 4, 0]}>
                  {pressureData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.probability >= 60 ? "hsl(0, 84%, 55%)" : entry.probability >= 30 ? "hsl(38, 92%, 55%)" : "hsl(210, 100%, 60%)"}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Constraint Registry */}
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 overflow-hidden">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Active Constraints</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {sorted.map(cs => (
              <ConstraintRow
                key={cs.constraint.id}
                cs={cs}
                expanded={expandedConstraint === cs.constraint.id}
                onToggle={() => setExpandedConstraint(
                  expandedConstraint === cs.constraint.id ? null : cs.constraint.id
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Cascade Simulation */}
      {cascade.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
            Constraint Cascade Simulation
          </h3>
          <p className="text-[10px] text-muted-foreground mb-4">
            Sequential constraint activation modeling with liquidity drain and volatility amplification
          </p>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Cascade waterfall chart */}
            <div className="h-52 sm:h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cascadeData} margin={{ left: 10, right: 10, top: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                  <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={{ stroke: "hsl(var(--border))" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 11 }}
                    formatter={(val: number, name: string) => {
                      if (name === "impact") return [`${val.toFixed(2)}%`, "Cumulative Price Impact"];
                      if (name === "liqDrain") return [`${val.toFixed(1)}%`, "Liquidity Drained"];
                      return [`${val.toFixed(1)} pts`, "Vol Spike"];
                    }}
                  />
                  <Area type="monotone" dataKey="impact" stroke="hsl(0, 84%, 55%)" fill="hsl(0, 84%, 55%)" fillOpacity={0.15} strokeWidth={2} />
                  <Area type="monotone" dataKey="liqDrain" stroke="hsl(38, 92%, 55%)" fill="hsl(38, 92%, 55%)" fillOpacity={0.08} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Cascade table */}
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] sm:text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">#</th>
                    <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Constraint</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Action</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Vol $B</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Price %</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Liq %</th>
                    <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">P(cascade)</th>
                  </tr>
                </thead>
                <tbody>
                  {cascade.map(step => (
                    <tr key={step.order} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-1.5 px-2 font-mono text-muted-foreground">{step.order}</td>
                      <td className="py-1.5 px-2 font-medium text-foreground">{step.constraintName}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          step.action === "SELL" ? "bg-loss/15 text-loss" : step.action === "BUY" ? "bg-gain/15 text-gain" : "bg-primary/15 text-primary"
                        }`}>
                          {step.action}
                        </span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">${step.volumeImpact.toFixed(1)}</td>
                      <td className={`py-1.5 px-2 text-right font-mono ${step.priceImpact < 0 ? "text-loss" : "text-gain"}`}>
                        {step.priceImpact.toFixed(2)}%
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono text-warning">{step.liquidityDrain}%</td>
                      <td className="py-1.5 px-2 text-right font-mono">{step.cascadeProbability}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Structural Liquidity Impact */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
          Structural Liquidity Impact Model
        </h3>
        <p className="text-[10px] text-muted-foreground mb-3">
          Price Impact = Forced Volume / Available Liquidity — estimated from order book depth, historical impact curves, and volatility regime
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sorted.filter(s => s.activationProbability > 0.15).map(cs => {
            const liqAvailable = Math.max(200 - cs.estimatedForcedVolume * 2, 20);
            const priceImpact = (cs.estimatedForcedVolume / liqAvailable) * 100;
            return (
              <div key={cs.constraint.id} className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="text-[10px] font-medium text-foreground mb-1">{cs.constraint.shortName}</p>
                <div className="flex items-baseline gap-1.5">
                  <span className={`font-mono text-lg font-bold ${priceImpact > 3 ? "text-loss" : priceImpact > 1 ? "text-warning" : "text-foreground"}`}>
                    {priceImpact.toFixed(2)}%
                  </span>
                  <span className="text-[9px] text-muted-foreground">est. impact</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${priceImpact > 3 ? "bg-loss" : priceImpact > 1 ? "bg-warning" : "bg-primary"}`}
                    style={{ width: `${Math.min(priceImpact * 10, 100)}%` }}
                  />
                </div>
                <p className="text-[8px] text-muted-foreground mt-1">
                  Vol: ${cs.estimatedForcedVolume.toFixed(0)}B / Liq: ${liqAvailable.toFixed(0)}B
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── Constraint Row ─────────────────────────────────────────────────

function ConstraintRow({ cs, expanded, onToggle }: { cs: ConstraintStatus; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/20 overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 p-2 sm:p-2.5 text-left hover:bg-muted/40 transition-colors">
        {expanded ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
        <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase ${STATUS_COLORS[cs.status]}`}>
          {cs.status}
        </span>
        <span className={`rounded px-1.5 py-0.5 text-[8px] ${CATEGORY_COLORS[cs.constraint.category]}`}>
          {cs.constraint.category}
        </span>
        <span className="text-xs font-medium text-foreground flex-1 truncate">{cs.constraint.shortName}</span>
        <span className="font-mono text-xs text-muted-foreground">{(cs.activationProbability * 100).toFixed(0)}%</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-1.5 text-[10px] border-t border-border/30">
          <p><span className="text-muted-foreground">Full name:</span> <span className="text-foreground">{cs.constraint.name}</span></p>
          <p><span className="text-muted-foreground">Institution:</span> <span className="text-foreground">{cs.constraint.institutionType}</span></p>
          <p><span className="text-muted-foreground">Trigger:</span> <span className="text-foreground">{cs.constraint.triggerCondition}</span></p>
          <p><span className="text-muted-foreground">Forced action:</span> <span className={cs.constraint.forcedAction === "SELL" ? "text-loss" : "text-gain"}>{cs.constraint.forcedAction}</span></p>
          <p><span className="text-muted-foreground">Volume:</span> <span className="text-foreground">{cs.constraint.estimatedVolume}</span></p>
          <p><span className="text-muted-foreground">Latency:</span> <span className="text-foreground">{cs.constraint.executionLatency}</span></p>
          <p><span className="text-muted-foreground">Trigger distance:</span> <span className="text-foreground">{cs.triggerDistance}</span></p>
          <p><span className="text-muted-foreground">Confidence:</span> <span className="text-foreground">{(cs.constraint.confidenceScore * 100).toFixed(0)}%</span></p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-muted-foreground">Proximity:</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full ${cs.proximityToTrigger > 0.7 ? "bg-loss" : cs.proximityToTrigger > 0.4 ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${cs.proximityToTrigger * 100}%` }}
              />
            </div>
            <span className="font-mono">{(cs.proximityToTrigger * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default ClankEngine;
