import { useEffect, useState } from "react";
import { Crosshair, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { EvidenceMetric } from "@/lib/evidence/types";
import { formatMetricValue, SCOPE_LABELS } from "@/lib/evidence/format";
import { useEvidence } from "./EvidenceContext";
import { GradeDot, ProvenanceChip, Sparkline, gradeText } from "./Metric";

/**
 * Evidence Inspector — the workstation's cross-linking surface. Any metric
 * anywhere resolves here with the full contract: definition → calculation →
 * assessment → trend → percentile ladder → related evidence → thesis
 * influence. A panel on xl screens; a bottom sheet below that.
 */

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 mt-3.5 font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
    {children}
  </p>
);

const InspectorBody = ({ metric }: { metric: EvidenceMetric }) => {
  const { graph, synthesis, select } = useEvidence();
  const influenceRank = synthesis.ledger.movers.findIndex((m) => m.id === metric.id);
  const related = metric.relatedIds.map((id) => graph.metrics[id]).filter(Boolean);

  return (
    <div className="px-3.5 pb-5">
      <div className="flex items-start justify-between gap-2 pt-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold tracking-tight text-foreground">{metric.label}</p>
          <p className="mt-0.5 font-mono text-[17px] font-semibold tabular-nums tracking-tight text-foreground">
            {formatMetricValue(metric, graph.currency)}
          </p>
        </div>
        <ProvenanceChip provenance={metric.provenance} />
      </div>

      <Label>Definition</Label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{metric.definition}</p>

      <Label>Calculation &amp; source</Label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{metric.calculation}</p>
      <p className="mt-1 text-[10.5px] text-muted-foreground/60">{metric.source}</p>

      <Label>Assessment</Label>
      <p className={`flex items-start gap-1.5 text-[11.5px] leading-relaxed ${gradeText[metric.assessment.grade]}`}>
        <span className="mt-1.5"><GradeDot grade={metric.assessment.grade} /></span>
        <span>{metric.assessment.reason}</span>
      </p>

      <Label>Why it matters</Label>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">{metric.whyItMatters}</p>

      {metric.history.length >= 3 && (
        <>
          <Label>Trend</Label>
          <Sparkline metric={metric} />
          <div className="flex justify-between text-[9.5px] tabular-nums text-muted-foreground/60">
            <span>{metric.history[0].period}</span>
            <span>{metric.history[metric.history.length - 1].period}</span>
          </div>
        </>
      )}

      {Object.keys(metric.percentiles).length > 0 && (
        <>
          <Label>Percentile position</Label>
          <div className="space-y-1.5">
            {Object.entries(metric.percentiles).map(([scope, pct]) => (
              <div key={scope} className="flex items-center gap-2">
                <span className="w-24 shrink-0 text-[10.5px] text-muted-foreground">
                  {SCOPE_LABELS[scope] ?? scope}
                </span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-9 shrink-0 text-right text-[10.5px] tabular-nums text-foreground">
                  {pct}th
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {Object.keys(metric.percentiles).length === 0 && (
        <>
          <Label>Percentile position</Label>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground/60">
            Peer percentile ladders for this metric arrive with the peer-data pipeline; the assessment
            above already states how the current level reads.
          </p>
        </>
      )}

      {related.length > 0 && (
        <>
          <Label>Related evidence</Label>
          <div className="flex flex-wrap gap-1.5">
            {related.map((r) => (
              <button
                key={r.id}
                onClick={() => select(r.id)}
                className="rounded-sm border border-border/70 px-2 py-1 font-mono text-[10px] tracking-tight text-muted-foreground transition-colors hover:border-border hover:bg-surface-2 hover:text-foreground"
              >
                {r.label}
              </button>
            ))}
          </div>
        </>
      )}

      <Label>Influence on recommendation</Label>
      <div className="flex items-center gap-2">
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
          <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
          <div
            className={`absolute inset-y-0 rounded-full ${metric.thesisWeight >= 0 ? "left-1/2 bg-gain" : "right-1/2 bg-loss"}`}
            style={{ width: `${Math.abs(metric.thesisWeight) * 50}%` }}
          />
        </div>
        <span
          className={`w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums ${
            metric.thesisWeight > 0 ? "text-gain" : metric.thesisWeight < 0 ? "text-loss" : "text-muted-foreground"
          }`}
        >
          {metric.thesisWeight > 0 ? "+" : ""}
          {metric.thesisWeight.toFixed(2)}
        </span>
      </div>
      <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted-foreground/70">
        {metric.thesisWeight === 0
          ? "Context evidence — informs the picture without pushing the call."
          : influenceRank >= 0
            ? `${influenceRank + 1 === 1 ? "Largest" : `#${influenceRank + 1}`} single influence on the ${synthesis.action} call among ${graph.coverage.total} nodes.`
            : `One of ${graph.coverage.total} weighted inputs behind the ${synthesis.action} call.`}
      </p>
    </div>
  );
};

const EmptyState = () => (
  <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-surface-2">
      <Crosshair className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
    </div>
    <p className="text-[12px] font-medium text-foreground">No evidence selected</p>
    <p className="text-[11px] leading-relaxed text-muted-foreground">
      Select any metric to see its definition, calculation, trend, percentile position, related
      evidence and its influence on the recommendation.
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
      {/* xl+: docked panel */}
      <aside
        aria-label="Evidence inspector"
        className="hidden w-[264px] shrink-0 flex-col overflow-y-auto border-l border-border/70 bg-surface-1/60 xl:flex"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/70 bg-surface-1/95 px-3.5 py-2 backdrop-blur">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
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
              <SheetTitle className="text-left text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
