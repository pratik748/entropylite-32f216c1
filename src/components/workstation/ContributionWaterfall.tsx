import { useEvidence } from "./EvidenceContext";
import { formatMetricValue } from "@/lib/evidence/format";

/**
 * How the call adds up — the recommendation's causal contributions as a
 * signed bar ledger around a zero axis. This is the decision made visible:
 * every bar is a named evidence node, its length the scored pull on the
 * call, clickable into its investigation. Bars grow once on mount; nothing
 * loops or glows.
 */
const ContributionWaterfall = ({ limit = 8 }: { limit?: number }) => {
  const { graph, synthesis, select, selectedId, relatedIds } = useEvidence();

  const rows = [...synthesis.contributions]
    .filter((c) => c.scored !== 0)
    .sort((a, b) => Math.abs(b.scored) - Math.abs(a.scored))
    .slice(0, limit);

  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.scored)), 0.01);
  const net = synthesis.contributions.reduce((acc, c) => acc + c.scored, 0);

  return (
    <div>
      <div className="space-y-[3px]">
        {rows.map((c, i) => {
          const m = graph.metrics[c.id];
          if (!m) return null;
          const positive = c.scored > 0;
          const width = (Math.abs(c.scored) / max) * 50;
          const active = selectedId === c.id;
          const related = !active && relatedIds.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => select(c.id)}
              aria-pressed={active}
              title={`${m.label}: ${formatMetricValue(m, graph.currency)} — ${m.assessment.reason}`}
              className={`group flex w-full items-center gap-2.5 rounded-sm px-1.5 py-[3px] text-left transition-colors duration-300 ${
                active ? "bg-surface-3" : related ? "bg-surface-2" : "hover:bg-surface-2"
              }`}
            >
              <span className="w-[132px] shrink-0 truncate text-[11.5px] tracking-tight text-foreground sm:w-[168px]">
                {m.label}
              </span>
              <span className="relative h-[9px] min-w-0 flex-1">
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                <span
                  className={`ws-grow-x absolute inset-y-[1px] rounded-[1px] ${
                    positive ? "left-1/2 origin-left bg-gain/70" : "right-1/2 origin-right bg-loss/70"
                  }`}
                  style={{ width: `${width}%`, animationDelay: `${i * 45}ms` }}
                />
              </span>
              <span
                className={`w-12 shrink-0 text-right font-mono text-[10.5px] font-semibold tabular-nums ${
                  positive ? "text-gain" : "text-loss"
                }`}
              >
                {positive ? "+" : ""}
                {c.scored.toFixed(2)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t border-border/60 pt-1.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/70">
          Net causal weight → {synthesis.action}
        </span>
        <span className={`font-mono text-[11px] font-semibold tabular-nums ${net >= 0 ? "text-gain" : "text-loss"}`}>
          {net >= 0 ? "+" : ""}
          {net.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

export default ContributionWaterfall;
