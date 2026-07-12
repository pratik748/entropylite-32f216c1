import type { SectionDef, WorkspaceDef } from "../registry";
import { useEvidence } from "../EvidenceContext";
import { MetricRow, MetricStat } from "../Metric";
import SectionShell from "./SectionShell";
import { Block, PendingEvidence } from "./blocks";

/**
 * Default section renderer: the section's evidence nodes as stat tiles
 * (strongest first) plus a compact ledger of the rest. Sections whose
 * pipeline hasn't landed yet get the designed pending state — never blank.
 */
const GenericSectionView = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const { sectionMetrics, data } = useEvidence();
  const metrics = sectionMetrics(`${workspace.id}/${section.id}`);
  const tiles = metrics.slice(0, 6);
  const rest = metrics.slice(6);

  if (data.bootstrapping) {
    return (
      <SectionShell workspace={workspace} section={section}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[86px] animate-pulse rounded-lg border border-border/50 bg-surface-2" />
          ))}
        </div>
        <p className="text-center text-[11px] text-muted-foreground/70 animate-breathe">
          Running the evidence engines for {data.status.analysis.state === "loading" ? "fundamentals, " : ""}
          price structure and the dossier…
        </p>
      </SectionShell>
    );
  }

  return (
    <SectionShell workspace={workspace} section={section}>
      {tiles.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {tiles.map((m) => (
            <MetricStat key={m.id} metric={m} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <Block title="Further evidence">
          <div className="space-y-0.5">
            {rest.map((m) => (
              <MetricRow key={m.id} metric={m} />
            ))}
          </div>
        </Block>
      )}
      {metrics.length === 0 && <PendingEvidence section={section} />}
      {metrics.length > 0 && metrics.length <= 2 && (
        <p className="text-[11px] leading-relaxed text-muted-foreground/60">
          Deeper evidence for this view ({section.contents.slice(0, 2).join("; ").toLowerCase()}…) lands
          with the next data pipeline phase.
        </p>
      )}
    </SectionShell>
  );
};

export default GenericSectionView;
