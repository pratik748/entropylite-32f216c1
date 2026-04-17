import { useMemo } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Brain,
  AlertTriangle,
  CheckCircle2,
  X,
  Activity,
  TrendingDown,
  Layers,
  Zap,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useFortressMode } from "@/hooks/useFortressMode";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { type Threat, type DefensiveAction } from "@/lib/fortress-engine";

interface FortressModeProps {
  stocks: PortfolioStock[];
}

const sevColor = (s: Threat["severity"]) =>
  s === "CRITICAL"
    ? "border-loss/40 bg-loss/10 text-loss"
    : s === "HIGH"
      ? "border-warning/40 bg-warning/10 text-warning"
      : "border-primary/30 bg-primary/10 text-primary";

const kindIcon = (k: DefensiveAction["kind"]) => {
  switch (k) {
    case "trim":
      return <TrendingDown className="h-3.5 w-3.5" />;
    case "hedge":
      return <ShieldCheck className="h-3.5 w-3.5" />;
    case "rebalance":
      return <Layers className="h-3.5 w-3.5" />;
    case "convert":
      return <Zap className="h-3.5 w-3.5" />;
  }
};

const FortressMode = ({ stocks }: FortressModeProps) => {
  const { fmt, sym } = useNormalizedPortfolio(stocks);
  const {
    active,
    toggle,
    threats,
    actions,
    appliedActions,
    metrics,
    lastActivatedAt,
    applyAction,
    applyAll,
    dismiss,
    resetActions,
    aiNarratives,
    aiLoading,
  } = useFortressMode(stocks);

  const analyzed = useMemo(() => stocks.filter((s) => s.analysis), [stocks]);

  if (analyzed.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <ShieldOff className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          Analyze positions to activate Fortress Mode.
        </p>
      </div>
    );
  }

  const activatedAgo = lastActivatedAt
    ? Math.max(1, Math.round((Date.now() - lastActivatedAt) / 60000))
    : null;

  return (
    <div className="space-y-4">
      {/* Master Control */}
      <div
        className={`rounded-xl border p-5 transition-colors ${
          active
            ? "border-gain/40 bg-gradient-to-br from-gain/5 via-card to-card"
            : "border-border bg-card"
        }`}
      >
        <div className="flex flex-wrap items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-lg border ${
              active ? "border-gain/40 bg-gain/10" : "border-border bg-surface-2"
            }`}
          >
            {active ? (
              <ShieldCheck className="h-6 w-6 text-gain" />
            ) : (
              <ShieldOff className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Fortress Mode
              </h2>
              {active ? (
                <span className="flex items-center gap-1.5 rounded-full border border-gain/30 bg-gain/10 px-2 py-0.5">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gain opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gain" />
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-gain">
                    Protection Active
                  </span>
                </span>
              ) : (
                <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  Passive Monitoring
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Capital-preservation supervisor. One toggle — system continuously scans, hedges,
              and bounds your downside.
            </p>
            {active && activatedAgo !== null && (
              <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">
                Active for {activatedAgo}m · {appliedActions.length} defensive action
                {appliedActions.length === 1 ? "" : "s"} applied
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {aiLoading && active && (
              <span className="flex items-center gap-1.5 text-[10px] font-mono text-primary">
                <Brain className="h-3 w-3 animate-pulse" /> rationale
              </span>
            )}
            <Switch
              checked={active}
              onCheckedChange={toggle}
              className="data-[state=checked]:bg-gain"
            />
          </div>
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MetricCard
          label="Bounded Downside"
          value={metrics.boundedDownside > 0 ? `${sym}${fmt(metrics.boundedDownside)}` : "—"}
          sub="1-day · 99% conf · post-hedge"
          tone="loss"
        />
        <MetricCard
          label="Risk Score"
          value={`${metrics.riskScore}/100`}
          sub={
            active && metrics.baselineRiskScore > metrics.riskScore
              ? `baseline ${metrics.baselineRiskScore}`
              : "current portfolio"
          }
          tone={
            metrics.riskScore >= 60 ? "loss" : metrics.riskScore >= 35 ? "warning" : "gain"
          }
        />
        <MetricCard
          label="Risk Reduction"
          value={metrics.reductionPct > 0 ? `▼ ${metrics.reductionPct}%` : "—"}
          sub={active ? "since activation" : "fortress inactive"}
          tone="gain"
        />
        <MetricCard
          label="Confidence"
          value={`${metrics.confidence}%`}
          sub="defensive positioning"
          tone={metrics.confidence >= 80 ? "gain" : metrics.confidence >= 60 ? "primary" : "warning"}
        />
      </div>

      {/* Threat Board + Action Ledger */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Threats */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-warning" />
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-widest text-foreground">
                Threat Board
              </h3>
            </div>
            <span className="font-mono text-[9px] text-muted-foreground">
              {threats.length} detected · continuous scan
            </span>
          </div>
          <div className="max-h-[420px] divide-y divide-border overflow-auto">
            {threats.length === 0 && (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-gain/60" />
                No structural threats detected. Portfolio within tolerance.
              </div>
            )}
            {threats.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{t.target}</span>
                      <span
                        className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest ${sevColor(t.severity)}`}
                      >
                        {t.severity}
                      </span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
                        {t.kind}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t.evidence}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {t.contributionToRisk}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Defensive Actions */}
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-[11px] font-mono font-semibold uppercase tracking-widest text-foreground">
                Defensive Actions Ledger
              </h3>
            </div>
            <div className="flex items-center gap-1.5">
              {actions.length > 0 && active && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyAll}
                  className="h-6 border-gain/30 px-2 text-[10px] text-gain hover:bg-gain/10"
                >
                  Apply All
                </Button>
              )}
              {(appliedActions.length > 0 || actions.length === 0) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={resetActions}
                  className="h-6 px-2 text-[10px] text-muted-foreground"
                >
                  Reset
                </Button>
              )}
            </div>
          </div>

          <div className="max-h-[420px] divide-y divide-border overflow-auto">
            {!active && (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                <ShieldOff className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
                Fortress is inactive. Toggle on to receive defensive proposals.
              </div>
            )}
            {active && actions.length === 0 && appliedActions.length === 0 && (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-gain/60" />
                No defensive actions required. Portfolio is within bounded risk.
              </div>
            )}

            {active &&
              actions.map((a) => {
                const aiText = aiNarratives[a.id];
                return (
                  <div key={a.id} className="px-4 py-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded ${
                          a.kind === "trim"
                            ? "bg-warning/15 text-warning"
                            : a.kind === "convert"
                              ? "bg-primary/15 text-primary"
                              : "bg-gain/15 text-gain"
                        }`}
                      >
                        {kindIcon(a.kind)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                            {a.kind}
                          </span>
                          <span className="text-xs font-semibold text-foreground">{a.target}</span>
                          {a.instrument && (
                            <span className="font-mono text-[9px] text-muted-foreground">
                              → {a.instrument}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-foreground/90">{aiText || a.rationale}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {a.trigger}
                        </p>
                        <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                          <span className="text-gain">−{a.riskReductionBps}bps risk</span>
                          <span>·</span>
                          <span>cost {a.costBps}bps</span>
                          <span>·</span>
                          <span>conf {a.confidence}%</span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          size="sm"
                          onClick={() => applyAction(a.id)}
                          className="h-6 bg-gain px-2 text-[10px] text-background hover:bg-gain/90"
                        >
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => dismiss(a.id)}
                          className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {appliedActions.length > 0 && (
              <div className="bg-surface-1/40 px-4 py-2">
                <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                  Applied ({appliedActions.length})
                </p>
                <div className="mt-1.5 space-y-1">
                  {appliedActions.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 text-[10px] text-muted-foreground"
                    >
                      <CheckCircle2 className="h-3 w-3 text-gain" />
                      <span>{a.kind.toUpperCase()} {a.target} — risk −{a.riskReductionBps}bps</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Aftermath Projection */}
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-mono font-semibold uppercase tracking-widest text-foreground">
            Aftermath Projection · Pre-Execution Simulation
          </h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ProjectionRow
            label="Portfolio σ (annualized)"
            pre={`${metrics.preSigma}%`}
            post={`${metrics.postSigma}%`}
            improved={metrics.postSigma < metrics.preSigma}
          />
          <ProjectionRow
            label="Estimated Max Drawdown"
            pre={`${metrics.preMaxDD}%`}
            post={`${metrics.postMaxDD}%`}
            improved={metrics.postMaxDD > metrics.preMaxDD}
          />
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">
          Projections are scenario observations, not guarantees. Fortress maintains balanced
          efficiency — hedge costs are capped to preserve upside.
        </p>
      </div>
    </div>
  );
};

const MetricCard = ({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "gain" | "loss" | "warning" | "primary";
}) => {
  const toneClass =
    tone === "gain"
      ? "text-gain"
      : tone === "loss"
        ? "text-loss"
        : tone === "warning"
          ? "text-warning"
          : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-[9px] text-muted-foreground">{sub}</p>
    </div>
  );
};

const ProjectionRow = ({
  label,
  pre,
  post,
  improved,
}: {
  label: string;
  pre: string;
  post: string;
  improved: boolean;
}) => (
  <div className="rounded-lg border border-border bg-surface-1 p-3">
    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
    <div className="mt-1.5 flex items-center gap-3 font-mono">
      <span className="text-sm text-muted-foreground line-through">{pre}</span>
      <span className="text-muted-foreground">→</span>
      <span className={`text-base font-bold ${improved ? "text-gain" : "text-foreground"}`}>
        {post}
      </span>
    </div>
  </div>
);

export default FortressMode;
