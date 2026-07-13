import type { EvidenceMetric, Grade } from "@/lib/evidence/types";
import { formatMetricValue, PROVENANCE_LABELS } from "@/lib/evidence/format";
import { useEvidence } from "./EvidenceContext";

/**
 * Metric display primitives — every figure on a workstation screen renders
 * through one of these, which makes every figure an Inspector target.
 */

export const gradeText: Record<Grade, string> = {
  good: "text-gain",
  bad: "text-loss",
  neutral: "text-muted-foreground",
  unknown: "text-muted-foreground/60",
};

const gradeDotBg: Record<Grade, string> = {
  good: "bg-gain",
  bad: "bg-loss",
  neutral: "bg-muted-foreground/50",
  unknown: "bg-muted-foreground/30",
};

export const GradeDot = ({ grade }: { grade: Grade }) => (
  <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${gradeDotBg[grade]}`} aria-hidden />
);

export const ProvenanceChip = ({ provenance }: { provenance: EvidenceMetric["provenance"] }) => (
  <span
    className={`rounded-sm border px-1.5 py-px font-mono text-[9px] font-medium uppercase tracking-[0.1em] ${
      provenance === "reported" || provenance === "computed"
        ? "border-border text-muted-foreground"
        : "border-warning/40 text-warning"
    }`}
    title={
      provenance === "reported"
        ? "Taken directly from filings or exchange data"
        : provenance === "computed"
          ? "Computed deterministically from market data"
          : provenance === "estimated"
            ? "Estimated from scraped data by the dossier model"
            : "Model-scored signal — treat as judgment, not fact"
    }
  >
    {PROVENANCE_LABELS[provenance]}
  </span>
);

/**
 * Data matrix — stat cells separated by hairline rules, the terminal grid.
 * Wrap MetricStat cells (or any cell) in this instead of a gap grid.
 */
export const MetricGrid = ({
  children,
  cols = "grid-cols-2 sm:grid-cols-3",
}: {
  children: React.ReactNode;
  cols?: string;
}) => (
  <div className={`grid ${cols} gap-px overflow-hidden rounded-sm border border-border/80 bg-border/70`}>
    {children}
  </div>
);

/** Stat cell — the primary evidence unit, designed to sit inside MetricGrid. */
export const MetricStat = ({ metric }: { metric: EvidenceMetric }) => {
  const { graph, select, selectedId, relatedIds } = useEvidence();
  const active = selectedId === metric.id;
  // Connected evidence illuminates softly when a related node is selected.
  const related = !active && relatedIds.has(metric.id);
  return (
    <button
      onClick={() => select(metric.id)}
      aria-pressed={active}
      data-evidence-related={related || undefined}
      className={`group flex min-w-0 flex-col px-3 py-2.5 text-left transition-colors duration-300 ${
        active
          ? "bg-surface-3"
          : related
            ? "bg-surface-2 shadow-[inset_2px_0_0_hsl(var(--foreground)/0.35)]"
            : "bg-card hover:bg-surface-2"
      }`}
    >
      <span className="flex items-center gap-1.5">
        <GradeDot grade={metric.assessment.grade} />
        <span className="truncate font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {metric.label}
        </span>
      </span>
      <span className="mt-1 font-mono text-[16px] font-semibold tabular-nums tracking-tight text-foreground">
        {formatMetricValue(metric, graph.currency)}
      </span>
      {metric.format === "score" && metric.value != null && (
        <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-surface-3">
          <span
            className={`ws-grow-x block h-full origin-left rounded-full ${
              metric.assessment.grade === "good" ? "bg-gain/80" : metric.assessment.grade === "bad" ? "bg-loss/80" : "bg-muted-foreground/50"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, metric.value))}%` }}
          />
        </span>
      )}
      <span className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${gradeText[metric.assessment.grade]}`}>
        {metric.assessment.reason}
      </span>
    </button>
  );
};

/** Row — compact evidence line for ledgers and lists. */
export const MetricRow = ({ metric, trailing }: { metric: EvidenceMetric; trailing?: string }) => {
  const { graph, select, selectedId, relatedIds } = useEvidence();
  const active = selectedId === metric.id;
  const related = !active && relatedIds.has(metric.id);
  return (
    <button
      onClick={() => select(metric.id)}
      aria-pressed={active}
      data-evidence-related={related || undefined}
      className={`flex w-full items-baseline gap-2.5 rounded-sm px-2 py-1.5 text-left transition-colors duration-300 ${
        active
          ? "bg-surface-3"
          : related
            ? "bg-surface-2 shadow-[inset_2px_0_0_hsl(var(--foreground)/0.35)]"
            : "hover:bg-surface-2"
      }`}
    >
      <GradeDot grade={metric.assessment.grade} />
      <span className="min-w-0 flex-1 truncate text-[12.5px] tracking-tight text-foreground">
        {metric.label}
      </span>
      <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-foreground">
        {formatMetricValue(metric, graph.currency)}
      </span>
      <span className={`w-16 shrink-0 text-right font-mono text-[10.5px] tabular-nums ${trailingColor(metric, trailing)}`}>
        {trailing ?? weightLabel(metric.thesisWeight)}
      </span>
    </button>
  );
};

function weightLabel(w: number): string {
  if (w === 0) return "—";
  return `${w > 0 ? "+" : ""}${w.toFixed(2)}`;
}

function trailingColor(metric: EvidenceMetric, trailing?: string): string {
  if (trailing != null) return "text-muted-foreground";
  if (metric.thesisWeight > 0) return "text-gain";
  if (metric.thesisWeight < 0) return "text-loss";
  return "text-muted-foreground/60";
}

/** Minimal sparkline for a metric's history series. */
export const Sparkline = ({ metric, className = "" }: { metric: EvidenceMetric; className?: string }) => {
  if (metric.history.length < 3) return null;
  const values = metric.history.map((h) => h.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${24 - ((v - min) / span) * 22 - 1}`)
    .join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className={`h-7 w-full ${className}`} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className={rising ? "stroke-gain" : "stroke-loss"}
      />
    </svg>
  );
};
