import { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Zap } from "lucide-react";
import { governedInvoke } from "@/lib/apiGovernor";

interface Effect {
  order: number;
  effect: string;
  asset_class?: string;
  direction?: "up" | "down" | "volatile";
  magnitude?: string;
  confidence?: number;
  time_horizon?: string;
}

interface CausalResponse {
  event?: string;
  first_order?: Effect[];
  second_order?: Effect[];
  third_order?: Effect[];
  reflexivity_score?: number;
  scar_tag?: string;
}

interface Props {
  rootLabel: string;
  eventKey: string; // change → refetch
  portfolio?: string;
}

const DIR_COLOR: Record<string, string> = {
  up: "#10b981",
  down: "#ef4444",
  volatile: "#f59e0b",
};

function effectsToGraph(root: string, data: CausalResponse): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: "root",
    position: { x: 0, y: 0 },
    data: { label: root.length > 60 ? root.slice(0, 58) + "…" : root },
    style: {
      background: "hsl(var(--primary) / 0.18)",
      color: "hsl(var(--foreground))",
      border: "1px solid hsl(var(--primary))",
      borderRadius: 6,
      padding: "8px 12px",
      fontSize: 11,
      fontWeight: 600,
      maxWidth: 220,
    },
    sourcePosition: "right" as any,
    targetPosition: "left" as any,
  });

  const cols = [
    { key: "first_order", x: 320, items: data.first_order || [] },
    { key: "second_order", x: 660, items: data.second_order || [] },
    { key: "third_order", x: 1000, items: data.third_order || [] },
  ];

  cols.forEach((col, ci) => {
    const items = col.items.slice(0, 6);
    const ySpacing = 90;
    const yStart = -((items.length - 1) * ySpacing) / 2;
    items.forEach((eff, i) => {
      const id = `${col.key}-${i}`;
      const dir = eff.direction || "volatile";
      const color = DIR_COLOR[dir] || "#a855f7";
      const conf = eff.confidence ?? 0.5;
      nodes.push({
        id,
        position: { x: col.x, y: yStart + i * ySpacing },
        data: {
          label: (
            <div style={{ maxWidth: 180 }}>
              <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.25 }}>{eff.effect}</div>
              {eff.magnitude && (
                <div style={{ fontSize: 9, opacity: 0.7, marginTop: 3, fontFamily: "monospace" }}>
                  {eff.magnitude} · {eff.time_horizon || ""}
                </div>
              )}
            </div>
          ),
        },
        style: {
          background: "hsl(var(--surface-1))",
          border: `1px solid ${color}${Math.round(40 + conf * 60).toString(16)}`,
          color: "hsl(var(--foreground))",
          borderRadius: 6,
          padding: "6px 10px",
          boxShadow: `0 0 ${Math.round(conf * 18)}px ${color}40`,
          maxWidth: 200,
        },
        sourcePosition: "right" as any,
        targetPosition: "left" as any,
      });

      // edge from previous col (or root)
      const sources = ci === 0 ? ["root"] : (cols[ci - 1].items.length > 0 ? [`${cols[ci - 1].key}-${Math.min(i, cols[ci - 1].items.length - 1)}`] : ["root"]);
      sources.forEach(src => {
        edges.push({
          id: `${src}->${id}`,
          source: src,
          target: id,
          animated: conf > 0.6,
          style: { stroke: color, strokeWidth: 1 + conf * 2, opacity: 0.55 + conf * 0.4 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        });
      });
    });
  });

  return { nodes, edges };
}

export default function CausalGraph({ rootLabel, eventKey, portfolio }: Props) {
  const [data, setData] = useState<CausalResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    governedInvoke<CausalResponse>("causal-effects", {
      tier: "ai",
      body: { event: rootLabel, portfolio: portfolio || "" },
    })
      .then(({ data: res, error: err }) => {
        if (cancelled) return;
        if (err) throw err;
        setData(res || null);
      })
      .catch(e => !cancelled && setError(e?.message || "Causal engine failed"))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [eventKey, rootLabel, portfolio]);

  const graph = useMemo(() => (data ? effectsToGraph(rootLabel, data) : { nodes: [], edges: [] }), [data, rootLabel]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-xs">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Modeling cascade…
      </div>
    );
  }
  if (error) {
    return <div className="p-3 text-[11px] text-muted-foreground">Causal engine unavailable. Tap another event.</div>;
  }
  if (!data || graph.nodes.length <= 1) {
    return <div className="p-3 text-[11px] text-muted-foreground">No cascade derived for this event.</div>;
  }

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-1.5 right-2 z-10 flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
        {data.reflexivity_score != null && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-sm border border-warning/30 bg-warning/5 text-warning">
            <Zap className="h-2.5 w-2.5" /> reflex {data.reflexivity_score}
          </span>
        )}
        {data.scar_tag && (
          <span className="px-1.5 py-0.5 rounded-sm border border-border bg-muted/40">
            scar: {data.scar_tag}
          </span>
        )}
      </div>
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        fitView
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag={true}
      >
        <Background gap={16} size={1} color="hsl(var(--border))" />
        <Controls showInteractive={false} className="!bg-background !border-border" />
      </ReactFlow>
    </div>
  );
}