import type { SectionDef, WorkspaceDef } from "./registry";

interface SectionScaffoldProps {
  ticker: string;
  workspace: WorkspaceDef;
  section: SectionDef;
}

/**
 * Honest scaffold for a not-yet-populated section: states the analyst
 * question it will answer and the evidence planned for it. Replaced
 * section-by-section as build phases land live data.
 */
const SectionScaffold = ({ ticker, workspace, section }: SectionScaffoldProps) => {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        {workspace.label}
      </p>
      <h1 className="mt-1.5 text-[22px] font-semibold tracking-tight text-foreground">
        {section.label}
      </h1>
      <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
        {section.summary}
      </p>

      <div className="mt-6 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Planned evidence for {ticker}
          </p>
          <span className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            Scaffold · lands in phase {section.phase}
          </span>
        </div>
        <ul className="mt-3 space-y-2">
          {section.contents.map((item) => (
            <li key={item} className="flex items-baseline gap-2.5 text-[13px] text-secondary-foreground">
              <span className="h-1 w-1 shrink-0 translate-y-[-2px] rounded-full bg-muted-foreground/50" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SectionScaffold;
