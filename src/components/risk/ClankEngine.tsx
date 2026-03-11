import { useMemo, useState } from "react";
import { AlertTriangle, Shield, Zap, TrendingDown, Activity, ChevronDown, ChevronRight, Brain, BookOpen, PlusCircle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, AreaChart, Area } from "recharts";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import {
  evaluateConstraints,
  computeClankScore,
  clankLevel,
  simulateCascade,
  CATEGORY_COLORS,
  STATUS_COLORS,
  CONSTRAINT_REGISTRY,
  type ConstraintStatus,
} from "@/lib/clank-engine";
import { useClankLearning, type ActivationEvent } from "@/hooks/useClankLearning";
import { useAIIntelligence } from "@/hooks/useAIIntelligence";

interface ClankEngineProps {
  stocks: PortfolioStock[];
}

const ClankEngine = ({ stocks }: ClankEngineProps) => {
  const [expandedConstraint, setExpandedConstraint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"engine" | "learning">("engine");

  const { overrides, events, loading: learningLoading, confidenceOverridesMap, recordActivation, recordOutcome } = useClankLearning();

  const confMap = useMemo(() => confidenceOverridesMap(), [confidenceOverridesMap]);
  const statuses = useMemo(() => evaluateConstraints(stocks, confMap), [stocks, confMap]);
  const clankScore = useMemo(() => computeClankScore(statuses), [statuses]);
  const level = useMemo(() => clankLevel(clankScore), [clankScore]);
  const cascade = useMemo(() => simulateCascade(statuses), [statuses]);

  const sorted = useMemo(
    () => [...statuses].sort((a, b) => b.activationProbability - a.activationProbability),
    [statuses]
  );

  const pressureData = useMemo(
    () => sorted.map(s => ({
      name: s.constraint.shortName,
      pressure: +s.pressureContribution.toFixed(1),
      probability: +(s.activationProbability * 100).toFixed(0),
      volume: +s.estimatedForcedVolume.toFixed(1),
    })),
    [sorted]
  );

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
          {[30, 60, 80].map(t => (
            <div key={t} className="absolute top-0 h-full w-px bg-foreground/20" style={{ left: `${t}%` }} />
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[8px] text-muted-foreground font-mono">
          <span>STABLE</span><span>TENSION</span><span>INSTABILITY</span><span>CASCADE</span>
        </div>
      </div>

      {/* Tab switch */}
      <div className="flex gap-1 bg-muted/50 rounded-lg p-1">
        {[
          { id: "engine" as const, label: "Constraint Engine", icon: Zap },
          { id: "learning" as const, label: "Learning Loop", icon: Brain },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "engine" && (
        <EngineTab
          sorted={sorted}
          pressureData={pressureData}
          cascadeData={cascadeData}
          cascade={cascade}
          statuses={statuses}
          criticalCount={criticalCount}
          watchCount={watchCount}
          totalForcedVol={totalForcedVol}
          expandedConstraint={expandedConstraint}
          setExpandedConstraint={setExpandedConstraint}
          overrides={overrides}
          clankScore={clankScore}
          onRecordActivation={recordActivation}
        />
      )}

      {activeTab === "learning" && (
        <LearningTab
          events={events}
          overrides={overrides}
          loading={learningLoading}
          onRecordOutcome={recordOutcome}
        />
      )}
    </div>
  );
};

// ─── Engine Tab ─────────────────────────────────────────────────────

function EngineTab({
  sorted, pressureData, cascadeData, cascade, statuses,
  criticalCount, watchCount, totalForcedVol,
  expandedConstraint, setExpandedConstraint,
  overrides, clankScore, onRecordActivation,
}: any) {
  return (
    <>
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
                  {pressureData.map((entry: any, i: number) => (
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

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5 overflow-hidden">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Active Constraints</h3>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {sorted.map((cs: ConstraintStatus) => (
              <ConstraintRow
                key={cs.constraint.id}
                cs={cs}
                expanded={expandedConstraint === cs.constraint.id}
                onToggle={() => setExpandedConstraint(
                  expandedConstraint === cs.constraint.id ? null : cs.constraint.id
                )}
                hasOverride={!!overrides[cs.constraint.id]}
                sampleCount={overrides[cs.constraint.id]?.sample_count}
                clankScore={clankScore}
                onRecordActivation={onRecordActivation}
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
                  {cascade.map((step: any) => (
                    <tr key={step.order} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-1.5 px-2 font-mono text-muted-foreground">{step.order}</td>
                      <td className="py-1.5 px-2 font-medium text-foreground">{step.constraintName}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                          step.action === "SELL" ? "bg-loss/15 text-loss" : step.action === "BUY" ? "bg-gain/15 text-gain" : "bg-primary/15 text-primary"
                        }`}>{step.action}</span>
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono">${step.volumeImpact.toFixed(1)}</td>
                      <td className={`py-1.5 px-2 text-right font-mono ${step.priceImpact < 0 ? "text-loss" : "text-gain"}`}>{step.priceImpact.toFixed(2)}%</td>
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
          Price Impact = Forced Volume / Available Liquidity
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {sorted.filter((s: ConstraintStatus) => s.activationProbability > 0.15).map((cs: ConstraintStatus) => {
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
    </>
  );
}

// ─── Learning Tab ───────────────────────────────────────────────────

function LearningTab({
  events, overrides, loading, onRecordOutcome,
}: {
  events: ActivationEvent[];
  overrides: Record<string, { adjusted_confidence: number; sample_count: number }>;
  loading: boolean;
  onRecordOutcome: (eventId: string, price: number, vol: number, volChange: number) => Promise<boolean>;
}) {
  const [outcomeForm, setOutcomeForm] = useState<string | null>(null);
  const [formData, setFormData] = useState({ price: "", volume: "", vol: "" });
  const [saving, setSaving] = useState(false);

  const handleSubmitOutcome = async (eventId: string) => {
    setSaving(true);
    await onRecordOutcome(eventId, Number(formData.price) || 0, Number(formData.volume) || 0, Number(formData.vol) || 0);
    setOutcomeForm(null);
    setFormData({ price: "", volume: "", vol: "" });
    setSaving(false);
  };

  const totalSamples = Object.values(overrides).reduce((s, o) => s + o.sample_count, 0);

  return (
    <div className="space-y-4">
      {/* Learning Summary */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        {[
          { label: "Total Events", value: events.length, icon: BookOpen },
          { label: "Constraints Learned", value: Object.keys(overrides).length, icon: Brain },
          { label: "Total Samples", value: totalSamples, icon: Activity },
          { label: "Avg Accuracy", value: (() => {
            const withAcc = events.filter(e => e.outcome_accuracy != null);
            return withAcc.length > 0 ? `${(withAcc.reduce((s, e) => s + (e.outcome_accuracy || 0), 0) / withAcc.length * 100).toFixed(0)}%` : "—";
          })(), icon: Shield },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex items-center gap-1.5 mb-1">
              <m.icon className="h-3 w-3 text-muted-foreground" />
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{m.label}</p>
            </div>
            <p className="font-mono text-xl sm:text-2xl font-bold text-foreground">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Confidence Comparison */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Confidence: Default vs Learned</h3>
        <div className="space-y-2">
          {CONSTRAINT_REGISTRY.map(c => {
            const ov = overrides[c.id];
            const learned = ov?.adjusted_confidence;
            const defaultConf = c.confidenceScore;
            return (
              <div key={c.id} className="flex items-center gap-3">
                <span className="text-[10px] text-foreground w-24 truncate">{c.shortName}</span>
                <div className="flex-1 flex items-center gap-2">
                  {/* Default bar */}
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden relative">
                    <div className="h-full rounded-full bg-primary/40" style={{ width: `${defaultConf * 100}%` }} />
                    {learned != null && (
                      <div className="absolute top-0 h-full rounded-full bg-primary" style={{ width: `${learned * 100}%`, opacity: 0.9 }} />
                    )}
                  </div>
                  <span className="text-[9px] font-mono text-muted-foreground w-10 text-right">{(defaultConf * 100).toFixed(0)}%</span>
                  {learned != null ? (
                    <span className={`text-[9px] font-mono w-10 text-right ${learned > defaultConf ? "text-gain" : learned < defaultConf ? "text-loss" : "text-foreground"}`}>
                      →{(learned * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span className="text-[9px] text-muted-foreground w-10 text-right">—</span>
                  )}
                  {ov && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[8px] text-muted-foreground">
                      n={ov.sample_count}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activation History */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Activation History</h3>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : events.length === 0 ? (
          <div className="text-center py-8">
            <Brain className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No activations recorded yet.</p>
            <p className="text-[10px] text-muted-foreground mt-1">Use "Record Activation" on approaching/critical constraints in the Engine tab.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] sm:text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Date</th>
                  <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Constraint</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">P(act)</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Score</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Price Δ</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Accuracy</th>
                  <th className="text-right py-1.5 px-2 text-muted-foreground font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map(ev => {
                  const cName = CONSTRAINT_REGISTRY.find(c => c.id === ev.constraint_id)?.shortName || ev.constraint_id;
                  const hasOutcome = ev.outcome_accuracy != null;
                  return (
                    <tr key={ev.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-1.5 px-2 font-mono text-muted-foreground">
                        {new Date(ev.activated_at).toLocaleDateString()}
                      </td>
                      <td className="py-1.5 px-2 font-medium text-foreground">{cName}</td>
                      <td className="py-1.5 px-2 text-right font-mono">{(ev.activation_probability * 100).toFixed(0)}%</td>
                      <td className="py-1.5 px-2 text-right font-mono">{ev.clank_score_at_activation}</td>
                      <td className="py-1.5 px-2 text-right font-mono">
                        {ev.observed_price_impact != null ? (
                          <span className={ev.observed_price_impact < 0 ? "text-loss" : "text-gain"}>
                            {ev.observed_price_impact.toFixed(2)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {hasOutcome ? (
                          <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                            ev.outcome_accuracy! > 0.7 ? "bg-gain/15 text-gain" :
                            ev.outcome_accuracy! > 0.4 ? "bg-warning/15 text-warning" : "bg-loss/15 text-loss"
                          }`}>
                            {(ev.outcome_accuracy! * 100).toFixed(0)}%
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {!hasOutcome ? (
                          outcomeForm === ev.id ? (
                            <div className="flex flex-col gap-1 items-end">
                              <input
                                type="number"
                                step="0.01"
                                placeholder="Price %"
                                value={formData.price}
                                onChange={e => setFormData(p => ({ ...p, price: e.target.value }))}
                                className="w-20 rounded bg-muted border border-border px-1.5 py-0.5 text-[10px] text-foreground"
                              />
                              <input
                                type="number"
                                step="0.1"
                                placeholder="Vol $B"
                                value={formData.volume}
                                onChange={e => setFormData(p => ({ ...p, volume: e.target.value }))}
                                className="w-20 rounded bg-muted border border-border px-1.5 py-0.5 text-[10px] text-foreground"
                              />
                              <input
                                type="number"
                                step="0.1"
                                placeholder="Vol Δ pts"
                                value={formData.vol}
                                onChange={e => setFormData(p => ({ ...p, vol: e.target.value }))}
                                className="w-20 rounded bg-muted border border-border px-1.5 py-0.5 text-[10px] text-foreground"
                              />
                              <button
                                onClick={() => handleSubmitOutcome(ev.id)}
                                disabled={saving}
                                className="rounded bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground hover:bg-primary/90"
                              >
                                {saving ? "…" : "Save"}
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setOutcomeForm(ev.id); setFormData({ price: "", volume: "", vol: "" }); }}
                              className="rounded bg-muted px-2 py-0.5 text-[9px] text-foreground hover:bg-muted/80"
                            >
                              Update
                            </button>
                          )
                        ) : (
                          <span className="text-[9px] text-muted-foreground">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Constraint Row ─────────────────────────────────────────────────

function ConstraintRow({
  cs, expanded, onToggle, hasOverride, sampleCount, clankScore, onRecordActivation,
}: {
  cs: ConstraintStatus; expanded: boolean; onToggle: () => void;
  hasOverride: boolean; sampleCount?: number;
  clankScore: number; onRecordActivation: (id: string, score: number, prob: number) => void;
}) {
  const [recording, setRecording] = useState(false);

  const canRecord = cs.status === "approaching" || cs.status === "critical" || cs.status === "active";

  const handleRecord = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRecording(true);
    await onRecordActivation(cs.constraint.id, clankScore, cs.activationProbability);
    setRecording(false);
  };

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
        {hasOverride && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[8px] text-primary font-medium">
            n={sampleCount}
          </span>
        )}
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
          <p><span className="text-muted-foreground">Confidence:</span> <span className="text-foreground">{(cs.constraint.confidenceScore * 100).toFixed(0)}%</span>
            {hasOverride && <span className="text-primary ml-1">(learned)</span>}
          </p>
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
          {canRecord && (
            <button
              onClick={handleRecord}
              disabled={recording}
              className="mt-2 flex items-center gap-1 rounded bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
            >
              <PlusCircle className="h-3 w-3" />
              {recording ? "Recording…" : "Record Activation"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ClankEngine;
