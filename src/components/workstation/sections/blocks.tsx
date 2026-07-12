import type { ReactNode } from "react";
import type { SectionDef } from "../registry";
import { useEvidence } from "../EvidenceContext";

/** Card container used by all section views. */
export const Block = ({
  title,
  children,
  action,
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) => (
  <section className="rounded-sm border border-border/80 bg-card">
    {(title || action) && (
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 px-3 py-1.5 sm:px-3.5">
        {title && (
          <h2 className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {title}
          </h2>
        )}
        {action}
      </div>
    )}
    <div className="p-3 sm:p-3.5">{children}</div>
  </section>
);

/** Simple horizontal share bar, monochrome. */
export const ShareBar = ({ label, pct, detail }: { label: string; pct: number; detail?: string }) => (
  <div className="flex items-center gap-2.5 py-1">
    <span className="w-32 shrink-0 truncate text-[12px] tracking-tight text-foreground">{label}</span>
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-3">
      <div className="h-full rounded-full bg-muted-foreground/60" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
    <span className="w-11 shrink-0 text-right font-mono text-[11px] tabular-nums text-foreground">
      {Math.round(pct)}%
    </span>
    {detail && <span className="hidden w-20 shrink-0 truncate text-right text-[10.5px] text-muted-foreground sm:inline">{detail}</span>}
  </div>
);

/**
 * Designed pending state for evidence a future pipeline delivers. Shows the
 * planned contents from the registry and — when the cause is a source still
 * loading or offline — says so quietly. Never a raw error, never blank.
 */
export const PendingEvidence = ({ section, note }: { section: SectionDef; note?: string }) => {
  const { data } = useEvidence();
  const dossierDown = data.status.dossier.state === "unavailable";
  return (
    <Block title="Evidence in the pipeline">
      <ul className="space-y-1.5">
        {section.contents.map((item) => (
          <li key={item} className="flex items-baseline gap-2.5 text-[12.5px] text-muted-foreground">
            <span className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-muted-foreground/40" />
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground/70">
        {note ??
          (dossierDown
            ? "The dossier feed is re-syncing in the background — this view fills in automatically when it lands. The related evidence elsewhere in this workspace remains live."
            : "This slice of the evidence graph is fed by the next data pipeline phase. Everything already computable is shown across this workspace now.")}
      </p>
    </Block>
  );
};
