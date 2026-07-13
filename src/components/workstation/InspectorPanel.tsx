import { useEffect, useState } from "react";
import { Crosshair, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { EvidenceMetric } from "@/lib/evidence/types";
import { formatMetricValue, SCOPE_LABELS } from "@/lib/evidence/format";
import { alignment, neighborhood, valuationSensitivity } from "@/lib/evidence/relations";
import { useEvidence } from "./EvidenceContext";
import { GradeDot, MetricRow, ProvenanceChip, Sparkline, gradeText } from "./Metric";

/**
 * Evidence Inspector — an investigation workspace, not a tooltip. For any
 * node: the full contract (definition → influence), what changed since the
 * last session, the relationship constellation, corroborating and
 * countervailing evidence, effect on the Bull/Base/Bear cases, and
 * deterministic sensitivity for valuation nodes. Every listed node is a
 * click away — investigations branch without dead ends.
 */

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 mt-3.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
    {children}
  </p>
);

const ago = (ts: number | null): string => {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const InspectorBody = ({ metric }: { metric: EvidenceMetric }) => {
  const { graph, synthesis, select, changes, data } = useEvidence();
  const contribution = synthesis.contributions.find((c) => c.id === metric.id);
  const scored = contribution?.scored ?? metric.thesisWeight;
  const influenceRank = synthesis.ledger.movers.findIndex((m) => m.id === metric.id);
  const { supporting, opposing } = alignment(graph, metric.id);
  const change = changes.find((c) => c.id === metric.id);
  const casesCiting = synthesis.cases.filter((c) => c.anchorIds.includes(metric.id));
  const sensitivity =
    metric.id === "pe" ? valuationSensitivity(graph, data.quote?.price ?? data.analysis?.currentPrice ?? null) : null;

  return (
    <div className="px-3.5 pb-5">
      {/* Header: identity, value, provenance, confidence, freshness */}
      <div className="flex items-start justify-between gap-2 pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-foreground">{metric.label}</p>
          <p className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums tracking-tight text-foreground">
            {formatMetricValue(metric, graph.currency)}
          </p>
        </div>
        <ProvenanceChip provenance={metric.provenance} />
      </div>
      <div className="mt-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground/70">
        <span title="Mechanical confidence from provenance and sample depth">
          confidence {(metric.confidence * 100).toFixed(0)}%
        </span>
        <span className="h-1 w-14 overflow-hidden rounded-full bg-surface-3">
          <span className="block h-full rounded-full bg-muted-foreground/60" style={{ width: `${metric.confidence * 100}%` }} />
        </span>
        <span className="ml-auto" title="When the underlying data was fetched">
          {ago(metric.updatedAt)}
        </span>
      </div>

      <Label>Definition</Label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{metric.definition}</p>

      <Label>Calculation &amp; source</Label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{metric.calculation}</p>
      <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted-foreground/60">{metric.source}</p>

      <Label>Assessment</Label>
      <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${gradeText[metric.assessment.grade]}`}>
        <span className="mt-1.5"><GradeDot grade={metric.assessment.grade} /></span>
        <span>{metric.assessment.reason}</span>
      </p>

      <Label>Why it matters</Label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{metric.whyItMatters}</p>

      {change && (
        <>
          <Label>What changed</Label>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {change.previous != null && change.current != null ? (
              <>
                <span className="font-mono tabular-nums">{change.previous}</span> →{" "}
                <span className="font-mono tabular-nums text-foreground">{change.current}</span>
                {change.deltaPct != null && (
                  <span className={change.deltaPct >= 0 ? "text-gain" : "text-loss"}>
                    {" "}({change.deltaPct >= 0 ? "+" : ""}{change.deltaPct}%)
                  </span>
                )}
              </>
            ) : (
              "Assessment changed"
            )}
            {change.regraded && (
              <span> · regraded <span className={gradeText[change.gradeFrom]}>{change.gradeFrom}</span> → <span className={gradeText[change.gradeTo]}>{change.gradeTo}</span></span>
            )}
            <span className="text-muted-foreground/60"> · since {ago(change.sinceTs)}</span>
          </p>
        </>
      )}

      {metric.history.length >= 3 && (
        <>
          <Label>Trend</Label>
          <Sparkline metric={metric} />
          <div className="flex justify-between font-mono text-[9px] tabular-nums text-muted-foreground/60">
            <span>{metric.history[0].period}</span>
            <span>{metric.history[metric.history.length - 1].period}</span>
          </div>
        </>
      )}

      {Object.keys(metric.percentiles).length > 0 ? (
        <>
          <Label>Percentile position</Label>
          <div className="space-y-1.5">
            {Object.entries(metric.percentiles).map(([scope, pct]) => (
              <div key={scope} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[10.5px] text-muted-foreground">
                  {SCOPE_LABELS[scope] ?? scope}
                </span>
                <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-[10px] tabular-nums text-foreground">
                  {pct}th
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <Label>Percentile position</Label>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground/60">
            Sector, industry and market percentile ladders arrive with the peer-data pipeline; the
            assessment above states how the current level reads meanwhile.
          </p>
        </>
      )}

      <RelationLedger id={metric.id} />

      {(supporting.length > 0 || opposing.length > 0) && (
        <>
          <Label>Corroborating evidence</Label>
          {supporting.length > 0 ? (
            <div className="space-y-0.5">
              {supporting.slice(0, 4).map((e) => (
                <MetricRow key={e.metric.id} metric={e.metric} />
              ))}
            </div>
          ) : (
            <p className="text-[10.5px] text-muted-foreground/60">Nothing in the web currently backs this reading.</p>
          )}
          <Label>Countervailing evidence</Label>
          {opposing.length > 0 ? (
            <div className="space-y-0.5">
              {opposing.slice(0, 4).map((e) => (
                <MetricRow key={e.metric.id} metric={e.metric} />
              ))}
            </div>
          ) : (
            <p className="text-[10.5px] text-muted-foreground/60">No connected evidence currently pushes the other way.</p>
          )}
        </>
      )}

      {casesCiting.length > 0 && (
        <>
          <Label>Effect on cases</Label>
          <div className="space-y-1">
            {casesCiting.map((c) => (
              <p key={c.id} className="text-[11px] leading-relaxed text-muted-foreground">
                <span className={`font-mono text-[10px] font-semibold uppercase ${c.id === "bull" ? "text-gain" : c.id === "bear" ? "text-loss" : "text-foreground"}`}>
                  {c.label} · {c.probability}%
                </span>
                {" — this node is a named anchor; if it flips grade, the case re-weights."}
              </p>
            ))}
          </div>
        </>
      )}

      {sensitivity && (
        <>
          <Label>Implied assumptions &amp; sensitivity</Label>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">{sensitivity.implied}</p>
          <div className="mt-1.5 space-y-1">
            {sensitivity.rows.map((r) => (
              <div key={r.scenario} className="flex items-baseline gap-2 text-[10.5px]">
                <span className="min-w-0 flex-1 text-muted-foreground">{r.scenario}</span>
                <span className="shrink-0 font-mono tabular-nums text-foreground">{r.implied}</span>
                <span className={`w-14 shrink-0 text-right font-mono tabular-nums ${r.deltaPct >= 0 ? "text-gain" : "text-loss"}`}>
                  {r.deltaPct >= 0 ? "+" : ""}{r.deltaPct}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <Label>Influence on recommendation</Label>
      <div className="flex items-center gap-2">
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          <div
            className={`absolute inset-y-0 rounded-full ${scored >= 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss"}`}
            style={{ width: `${Math.abs(scored) * 50}%` }}
          />
        </div>
        <span
          className={`w-12 shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums ${
            scored > 0 ? "text-gain" : scored < 0 ? "text-loss" : "text-muted-foreground"
          }`}
        >
          {scored > 0 ? "+" : ""}
          {scored.toFixed(2)}
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/70">
        {scored === 0
          ? "Context evidence — informs the picture without pushing the call."
          : influenceRank >= 0
            ? `${influenceRank + 1 === 1 ? "Largest" : `#${influenceRank + 1}`} causal contribution to the ${synthesis.action} call.`
            : `One of ${graph.coverage.total} causal inputs behind the ${synthesis.action} call.`}
        {contribution && contribution.via.length > 0 && (
          <span> Propagated through: {contribution.via.slice(0, 3).join("; ")}{contribution.via.length > 3 ? "…" : ""}.</span>
        )}
      </p>
    </div>
  );
};

/**
 * Relationship mechanisms as a ledger — the named cause-and-effect sentences
 * behind the evidence web, each row opening the connected investigation.
 * Prose over diagrams: this is a memo, not a mind map.
 */
const RelationLedger = ({ id }: { id: string }) => {
  const { graph, select } = useEvidence();
  const hood = neighborhood(graph, id);
  if (hood.drivers.length === 0 && hood.driven.length === 0) return null;

  const row = (m: EvidenceMetric, note: string, polarity: 1 | -1) => (
    <button
      key={`${m.id}-${note.slice(0, 8)}`}
      onClick={() => select(m.id)}
      className="block w-full rounded-sm px-2 py-1.5 text-left transition-colors hover:bg-surface-2"
    >
      <span className="flex items-baseline gap-1.5">
        <GradeDot grade={m.assessment.grade} />
        <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium tracking-tight text-foreground">
          {m.label}
        </span>
        <span className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] ${polarity === 1 ? "text-muted-foreground" : "text-warning"}`}>
          {polarity === 1 ? "supports" : "pressures"}
        </span>
      </span>
      <span className="mt-0.5 block pl-3.5 text-[10.5px] leading-snug text-muted-foreground/80">{note}</span>
    </button>
  );

  return (
    <>
      {hood.drivers.length > 0 && (
        <>
          <Label>Driven by</Label>
          <div className="space-y-0.5">
            {hood.drivers.slice(0, 4).map((e) => row(e.metric, e.relation.note, e.relation.polarity))}
          </div>
        </>
      )}
      {hood.driven.length > 0 && (
        <>
          <Label>Drives</Label>
          <div className="space-y-0.5">
            {hood.driven.slice(0, 4).map((e) => row(e.metric, e.relation.note, e.relation.polarity))}
          </div>
        </>
      )}
    </>
  );
};

const EmptyState = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-surface-2">
      <Crosshair className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
    </div>
    <p className="text-[12px] font-medium text-foreground">No evidence selected</p>
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      Select any metric to open its investigation: definition, calculation, trend, relationships,
      corroborating and countervailing evidence, and its causal pull on the recommendation.
    </p>
  </div>
);

/**
 * The bottom sheet portals to <body>, so a CSS xl:hidden wrapper cannot
 * suppress it — gate it with a real media query instead.
 */
function useIsXl(): boolean {
  const [isXl, setIsXl] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 1280px)").matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const onChange = () => setIsXl(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isXl;
}

const InspectorPanel = () => {
  const { selected, select } = useEvidence();
  const isXl = useIsXl();

  return (
    <>
      {/* xl+: docked investigation panel */}
      <aside
        aria-label="Evidence inspector"
        className="hidden w-[300px] shrink-0 flex-col overflow-y-auto border-l border-border/70 bg-surface-1/60 xl:flex"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/70 bg-surface-1/95 px-3.5 py-2 backdrop-blur">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            Inspector
          </p>
          {selected && (
            <button
              onClick={() => select(null)}
              title="Clear selection"
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {selected ? <InspectorBody metric={selected} /> : <EmptyState />}
      </aside>

      {/* below xl: bottom sheet on selection (JS-gated — it portals to body) */}
      {!isXl && (
        <Sheet open={!!selected} onOpenChange={(open) => !open && select(null)}>
          <SheetContent side="bottom" className="max-h-[82vh] overflow-y-auto border-border bg-background p-0">
            <SheetHeader className="border-b border-border/70 px-4 py-2.5">
              <SheetTitle className="text-left font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Evidence Inspector
              </SheetTitle>
            </SheetHeader>
            {selected && <InspectorBody metric={selected} />}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
};

export default InspectorPanel;
