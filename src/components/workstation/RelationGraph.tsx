import { useMemo } from "react";
import type { EvidenceMetric } from "@/lib/evidence/types";
import { neighborhood } from "@/lib/evidence/relations";
import { useEvidence } from "./EvidenceContext";

/**
 * Relationship constellation — the selected node at center, its drivers
 * flowing in from the left, the evidence it drives on the right. Solid
 * hairlines are supportive mechanisms, dashed are pressuring ones. Every
 * node is clickable, so investigations branch without dead ends.
 * Monochrome, one gentle fade — institutional, not decorative.
 */
const W = 300;
const H = 190;
const CX = W / 2;
const CY = H / 2;

const gradeFill = (m: EvidenceMetric) =>
  m.assessment.grade === "good"
    ? "hsl(var(--gain))"
    : m.assessment.grade === "bad"
      ? "hsl(var(--loss))"
      : "hsl(var(--muted-foreground))";

const RelationGraph = ({ id }: { id: string }) => {
  const { graph, select } = useEvidence();

  const layout = useMemo(() => {
    const hood = neighborhood(graph, id);
    const place = (count: number, index: number, side: -1 | 1) => {
      // Vertical spread across the panel height; dots sit inboard so the
      // outward-anchored labels have room and never clip at the edges.
      const span = Math.min(H - 44, 34 * Math.max(count - 1, 1));
      const y = count === 1 ? CY : CY - span / 2 + (span / (count - 1)) * index;
      const x = side === -1 ? 104 : W - 104;
      return { x, y };
    };
    return {
      drivers: hood.drivers.slice(0, 5).map((e, i, arr) => ({ ...e, ...place(arr.length, i, -1) })),
      driven: hood.driven.slice(0, 5).map((e, i, arr) => ({ ...e, ...place(arr.length, i, 1) })),
      moreDrivers: Math.max(0, hood.drivers.length - 5),
      moreDriven: Math.max(0, hood.driven.length - 5),
    };
  }, [graph, id]);

  const center = graph.metrics[id];
  if (!center || (layout.drivers.length === 0 && layout.driven.length === 0)) return null;

  const edge = (x: number, y: number, polarity: 1 | -1, key: string) => {
    const midX = (x + CX) / 2;
    return (
      <path
        key={key}
        d={`M ${x} ${y} Q ${midX} ${y}, ${CX} ${CY}`}
        fill="none"
        stroke="hsl(var(--muted-foreground))"
        strokeOpacity={0.45}
        strokeWidth={1}
        strokeDasharray={polarity === -1 ? "3 3" : undefined}
      />
    );
  };

  const nodeLabel = (m: EvidenceMetric, x: number, y: number, side: -1 | 1, note: string) => (
    <g
      key={m.id}
      onClick={() => select(m.id)}
      className="cursor-pointer"
      role="button"
      aria-label={`Inspect ${m.label}`}
    >
      <title>{note}</title>
      <circle cx={x} cy={y} r={3} fill={gradeFill(m)} />
      <text
        x={x + side * 7}
        y={y + 3}
        textAnchor={side === -1 ? "end" : "start"}
        className="fill-[hsl(var(--muted-foreground))] font-mono text-[8.5px] uppercase tracking-[0.04em] transition-colors hover:fill-[hsl(var(--foreground))]"
      >
        {m.label.length > 16 ? `${m.label.slice(0, 15)}…` : m.label}
      </text>
    </g>
  );

  return (
    <div key={id} className="animate-fade-in">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`Relationship map for ${center.label}`}>
        {layout.drivers.map((e) => edge(e.x, e.y, e.relation.polarity, `d-${e.metric.id}`))}
        {layout.driven.map((e) => edge(e.x, e.y, e.relation.polarity, `o-${e.metric.id}`))}

        {/* center */}
        <circle cx={CX} cy={CY} r={5} fill="none" stroke="hsl(var(--foreground))" strokeWidth={1.25} />
        <circle cx={CX} cy={CY} r={2} fill={gradeFill(center)} />
        <text
          x={CX}
          y={CY + 16}
          textAnchor="middle"
          className="fill-[hsl(var(--foreground))] font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em]"
        >
          {center.label.length > 24 ? `${center.label.slice(0, 22)}…` : center.label}
        </text>

        {layout.drivers.map((e) => nodeLabel(e.metric, e.x, e.y, -1, e.relation.note))}
        {layout.driven.map((e) => nodeLabel(e.metric, e.x, e.y, 1, e.relation.note))}

        {layout.moreDrivers > 0 && (
          <text x={8} y={H - 6} className="fill-[hsl(var(--muted-foreground)/0.6)] font-mono text-[8px]">
            +{layout.moreDrivers} more
          </text>
        )}
        {layout.moreDriven > 0 && (
          <text x={W - 8} y={H - 6} textAnchor="end" className="fill-[hsl(var(--muted-foreground)/0.6)] font-mono text-[8px]">
            +{layout.moreDriven} more
          </text>
        )}
      </svg>
      <div className="flex justify-between font-mono text-[8.5px] uppercase tracking-[0.1em] text-muted-foreground/60">
        <span>drivers →</span>
        <span>→ drives</span>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground/60">
        Solid: supportive mechanism · dashed: pressuring. Click any node to continue the investigation.
      </p>
    </div>
  );
};

export default RelationGraph;
