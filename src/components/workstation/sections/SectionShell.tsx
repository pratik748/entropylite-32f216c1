import type { ReactNode } from "react";
import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";

/**
 * Common frame for every section: workspace eyebrow, title, the analyst
 * question it answers, and a quiet data-state line when sources are still
 * assembling or serving from cache. Never shows a raw error.
 */
const SectionShell = ({
  workspace,
  section,
  children,
  wide = false,
}: {
  workspace: WorkspaceDef;
  section: SectionDef;
  children: ReactNode;
  wide?: boolean;
}) => {
  const { data } = useEvidence();
  const pendingSources = Object.entries(data.status).filter(([, s]) => s.state === "loading");
  const staleSources = Object.entries(data.status).filter(([, s]) => s.state === "cached");

  return (
    <div className={`mx-auto px-4 py-4 sm:px-5 sm:py-5 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border/70 pb-2.5">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
            {workspace.label}
          </p>
          <span className="text-muted-foreground/40">/</span>
          <h1 className="text-[16px] font-semibold tracking-tight text-foreground">{section.label}</h1>
        </div>
        {pendingSources.length > 0 ? (
          <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/70 animate-breathe">
            assembling — {pendingSources.map(([k]) => k).join(", ")}
          </span>
        ) : staleSources.length > 0 ? (
          <span
            className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground/70"
            title="Serving the last good data while live feeds refresh in the background"
          >
            {staleSources.map(([k]) => k).join(", ")} · cache
          </span>
        ) : null}
      </div>
      <p className="mt-2 max-w-2xl text-[12px] leading-relaxed text-muted-foreground">{section.summary}</p>
      <div className="mt-3.5 space-y-3">{children}</div>
    </div>
  );
};

export default SectionShell;
