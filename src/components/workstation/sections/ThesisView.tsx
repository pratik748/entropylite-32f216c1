import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricRow } from "../Metric";
import ContributionWaterfall from "../ContributionWaterfall";
import { formatCurrency } from "@/lib/currency";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";
import type { Action, ScenarioCase } from "@/lib/evidence/types";

const ACTION_TONE: Record<Action, string> = {
  ACCUMULATE: "text-gain border-gain/40",
  HOLD: "text-muted-foreground border-border",
  REDUCE: "text-warning border-warning/40",
  AVOID: "text-loss border-loss/40",
};

const CASE_EDGE: Record<ScenarioCase["id"], string> = {
  bull: "border-t-2 border-t-gain/60",
  base: "border-t-2 border-t-muted-foreground/40",
  bear: "border-t-2 border-t-loss/60",
};

const caseCard = "rounded-sm border border-border/80 bg-card p-3.5";

/** Thesis workspace — where all evidence converges. One view per section. */
const ThesisView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { graph, synthesis, data } = useEvidence();

  if (graph.coverage.total === 0) {
    return (
      <SectionShell workspace={workspace} section={section}>
        <Block title="Synthesis pending">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            The thesis is computed from the evidence graph, and the graph is still assembling — the
            feeds retry automatically and this page populates the moment evidence lands.
          </p>
        </Block>
        <PendingEvidence section={section} />
      </SectionShell>
    );
  }

  const body = () => {
    switch (section.id) {
      case "investment-thesis":
        return <InvestmentThesis />;
      case "key-drivers":
        return <KeyDrivers />;
      case "cases":
        return <Cases />;
      case "validation":
        return <Validation />;
      case "breakers":
        return <Breakers />;
      case "confidence":
        return <Confidence />;
      case "recommendation":
        return <Recommendation />;
      default:
        return <PendingEvidence section={section} />;
    }
  };

  return (
    <SectionShell workspace={workspace} section={section} wide={section.id === "cases"}>
      {body()}
    </SectionShell>
  );

  function InvestmentThesis() {
    return (
      <>
        <Block>
          <p className="text-[14px] leading-relaxed text-foreground">{synthesis.headline}</p>
          <div className="mt-2 space-y-1.5">
            {synthesis.narrative.map((line, i) => (
              <p key={i} className="text-[12.5px] leading-relaxed text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        </Block>
        <Block title="What you must believe">
          <div className="space-y-0.5">
            {synthesis.keyDrivers.map((d) => (
              <MetricRow key={d.id} metric={graph.metrics[d.id]} />
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground/70">
            Each line is a live evidence node — select it for the definition, trend and its exact pull
            on the call. When one flips grade, the thesis re-synthesizes automatically.
          </p>
        </Block>
      </>
    );
  }

  function KeyDrivers() {
    return (
      <Block title="Driver ranking">
        <div className="space-y-0.5">
          {synthesis.ledger.movers.map((m) => (
            <MetricRow key={m.id} metric={graph.metrics[m.id]} />
          ))}
        </div>
      </Block>
    );
  }

  function Cases() {
    return (
      <>
        <div className="grid gap-3 lg:grid-cols-3">
          {synthesis.cases.map((c) => (
            <div key={c.id} className={`${caseCard} ${CASE_EDGE[c.id]}`}>
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  {c.label} · {c.probability}%
                </span>
                {c.target != null && (
                  <span
                    className={`font-mono text-[12.5px] font-semibold tabular-nums ${
                      (c.returnPct ?? 0) >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {formatCurrency(c.target, graph.currency)} · {(c.returnPct ?? 0) >= 0 ? "+" : ""}
                    {c.returnPct}%
                  </span>
                )}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{c.narrative}</p>
              {c.anchorIds.length > 0 && (
                <div className="mt-2.5 space-y-0.5">
                  {c.anchorIds.map((id) => (
                    <MetricRow key={id} metric={graph.metrics[id]} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <ExpectedValue />
      </>
    );
  }

  function ExpectedValue() {
    const priced = synthesis.cases.filter((c) => c.returnPct != null);
    if (priced.length < 3) return null;
    const ev = priced.reduce((acc, c) => acc + (c.returnPct! * c.probability) / 100, 0);
    return (
      <Block title="Expected return">
        <p className="text-[13px] text-foreground">
          <span className={`font-semibold tabular-nums ${ev >= 0 ? "text-gain" : "text-loss"}`}>
            {ev >= 0 ? "+" : ""}
            {ev.toFixed(1)}%
          </span>{" "}
          <span className="text-muted-foreground">
            across the three cases at current probabilities — the single number the sizing decision hangs on.
          </span>
        </p>
      </Block>
    );
  }

  function Validation() {
    const engine = graph.metrics["engine_verdict"];
    return (
      <>
        <Block title="Belief vs current evidence">
          <div className="space-y-0.5">
            {synthesis.keyDrivers.map((d) => {
              const m = graph.metrics[d.id];
              return (
                <MetricRow
                  key={d.id}
                  metric={m}
                  trailing={m.assessment.grade === "good" ? "tracking" : m.assessment.grade === "bad" ? "diverging" : "neutral"}
                />
              );
            })}
          </div>
        </Block>
        {engine && (
          <Block title="Engine cross-check">
            <MetricRow metric={engine} />
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground/70">
              The desk's confluence engine weighs the same name with different priors. Agreement with
              the evidence-graph call raises conviction; disagreement is itself a finding to resolve.
            </p>
          </Block>
        )}
      </>
    );
  }

  function Breakers() {
    return (
      <Block title="Standing invalidation conditions">
        <div className="space-y-2.5">
          {synthesis.breakers.map((b) => (
            <div key={b.id} className="flex items-start gap-3 rounded-sm border border-border/60 px-3 py-2.5">
              <span
                className={`mt-0.5 shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.1em] ${
                  b.state === "tripped"
                    ? "border-loss/50 text-loss"
                    : b.state === "watch"
                      ? "border-warning/50 text-warning"
                      : "border-border text-muted-foreground"
                }`}
              >
                {b.state}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium tracking-tight text-foreground">{b.label}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{b.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </Block>
    );
  }

  function Confidence() {
    const { supporting, opposing, neutral, estimated } = synthesis.ledger;
    return (
      <>
        <Block title="Confidence derivation">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[22px] font-semibold tabular-nums text-foreground">
              {synthesis.confidence}%
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
              <div className="h-full rounded-full bg-muted-foreground/70" style={{ width: `${synthesis.confidence}%` }} />
            </div>
          </div>
          <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
            Derived mechanically from the ledger: {supporting} supporting, {opposing} opposing and{" "}
            {neutral} neutral nodes, penalized for the {estimated} estimated/model-graded inputs and
            any breaker off intact. Nothing is asserted — remove evidence and the number falls.
          </p>
        </Block>
        <Block title="How the call adds up">
          <ContributionWaterfall limit={12} />
        </Block>
      </>
    );
  }

  function Recommendation() {
    const price = data.quote?.price ?? null;
    const support = graph.metrics["support_distance"];
    const vol = graph.metrics["volatility"];
    return (
      <>
        <Block>
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-sm border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] ${ACTION_TONE[synthesis.action]}`}
            >
              {synthesis.action}
            </span>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              confidence {synthesis.confidence}%
              {price != null && ` · at ${formatCurrency(price, graph.currency)}`}
            </span>
          </div>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-foreground">{synthesis.headline}</p>
        </Block>
        <Block title="Execution discipline">
          <ul className="space-y-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {vol?.value != null && (
              <li>
                Size against {vol.value}% realized volatility — conviction does not override the vol
                budget.
              </li>
            )}
            {support?.value != null && (
              <li>
                Entry structure is {support.value}:1 risk-reward
                {support.value < 1.5 ? " — below the 1.5:1 bar, so scale in on structure, not at market" : " — clears the 1.5:1 entry bar"}.
              </li>
            )}
            <li>
              Review triggers live on the Breakers panel — a tripped breaker overrides this call until
              re-synthesis.
            </li>
          </ul>
        </Block>
        <Block title="Evidence trail">
          <div className="space-y-0.5">
            {synthesis.keyDrivers.map((d) => (
              <MetricRow key={d.id} metric={graph.metrics[d.id]} />
            ))}
          </div>
        </Block>
      </>
    );
  }
};

export default ThesisView;
