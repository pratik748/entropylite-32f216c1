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
    <div className={`mx-auto px-4 py-5 sm:px-6 sm:py-6 ${wide ? "max-w-5xl" : "max-w-3xl"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        {workspace.label}
      </p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-[21px] font-semibold tracking-tight text-foreground">{section.label}</h1>
        {pendingSources.length > 0 ? (
          <span className="text-[10.5px] text-muted-foreground/70 animate-breathe">
            assembling evidence — {pendingSources.map(([k]) => k).join(", ")}
          </span>
        ) : staleSources.length > 0 ? (
          <span
            className="text-[10.5px] text-muted-foreground/70"
            title="Serving the last good data while live feeds refresh in the background"
          >
            {staleSources.map(([k]) => k).join(", ")} · from cache
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{section.summary}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
};

export default SectionShell;
