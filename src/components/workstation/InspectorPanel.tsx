import { Crosshair } from "lucide-react";

/**
 * Evidence Inspector — the workstation's cross-linking surface.
 * Phase 0 ships the slot with its empty state; Phase 1 wires it to the
 * evidence graph so any metric anywhere resolves here with definition,
 * calculation, assessment, history, peer percentiles, related metrics and
 * thesis influence.
 */
const InspectorPanel = () => {
  return (
    <aside
      aria-label="Evidence inspector"
      className="hidden w-[248px] shrink-0 flex-col border-l border-border/70 bg-surface-1/60 xl:flex"
    >
      <div className="border-b border-border/70 px-3.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
          Inspector
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-surface-2">
          <Crosshair className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        </div>
        <p className="text-[12px] font-medium text-foreground">No evidence selected</p>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Select any metric to see its definition, calculation, historical trend, peer
          percentiles, related metrics and influence on the recommendation.
        </p>
      </div>
    </aside>
  );
};

export default InspectorPanel;
