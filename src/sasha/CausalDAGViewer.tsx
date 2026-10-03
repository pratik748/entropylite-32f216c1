/**
 * SASHA Interactive Causal Transmission DAG Flowchart
 *
 * Visualizes multi-stage macroeconomic shock propagation:
 * Stage 1: Macro Shock Vector (e.g. Brent Crude +15%, Rates +50bps)
 * Stage 2: 1st-Order Transmission Channel (e.g. Energy Input Costs & Multiple Contraction)
 * Stage 3: Sector Spillover Shifts (e.g. Tech/Airlines/Financials)
 * Stage 4: Individual Portfolio Asset P&L Impacts (e.g. NVDA -$1,240, XOM +$320)
 *
 * 100% Monochrome Minimalist SVG, crisp hairline links, tone markers, and zero slop.
 */

import React, { useState } from "react";
import type { CausalTransmissionDAG, CausalDAGNode } from "./types";

interface CausalDAGViewerProps {
  dag: CausalTransmissionDAG;
}

export const CausalDAGViewer: React.FC<CausalDAGViewerProps> = ({ dag }) => {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  if (!dag || !dag.nodes || dag.nodes.length === 0) {
    return null;
  }

  // Group nodes by stage
  const stages: Array<CausalDAGNode["stage"]> = ["macro", "transmission", "sector", "asset"];
  const stageLabels: Record<CausalDAGNode["stage"], string> = {
    macro: "Macro Shock",
    transmission: "Transmission",
    sector: "Sector Flow",
    asset: "Portfolio Delta",
  };

  const groupedNodes: Record<CausalDAGNode["stage"], CausalDAGNode[]> = {
    macro: [],
    transmission: [],
    sector: [],
    asset: [],
  };

  dag.nodes.forEach((node) => {
    if (groupedNodes[node.stage]) {
      groupedNodes[node.stage].push(node);
    }
  });

  const selectedNode = dag.nodes.find((n) => n.id === selectedNodeId);

  return (
    <div className="rounded-lg border border-border/80 bg-surface-1/90 p-3 space-y-3 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground font-mono flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-foreground" />
          Causal Transmission Directed Acyclic Graph (DAG)
        </span>
        <span className="text-[9px] text-muted-foreground/70 font-mono">
          {dag.nodes.length} Nodes • {dag.edges.length} Causal Edges
        </span>
      </div>

      {/* Multi-Stage Transmission Flowchart Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 relative">
        {stages.map((stage, sIdx) => {
          const nodesInStage = groupedNodes[stage];
          if (!nodesInStage || nodesInStage.length === 0) return null;

          return (
            <div key={stage} className="space-y-1.5">
              {/* Stage Header */}
              <div className="flex items-center justify-between px-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80 font-mono">
                  {sIdx + 1}. {stageLabels[stage]}
                </span>
                <span className="text-[8.5px] font-mono text-muted-foreground/50">
                  [{nodesInStage.length}]
                </span>
              </div>

              {/* Node List in Column */}
              <div className="space-y-1.5">
                {nodesInStage.map((node) => {
                  const isSelected = selectedNodeId === node.id;
                  const toneColor =
                    node.tone === "loss"
                      ? "text-red-400 border-red-500/30 bg-red-950/20"
                      : node.tone === "gain"
                      ? "text-emerald-400 border-emerald-500/30 bg-emerald-950/20"
                      : "text-foreground border-border/70 bg-surface-2/60";

                  return (
                    <div
                      key={node.id}
                      onClick={() => setSelectedNodeId(isSelected ? null : node.id)}
                      className={`pressable rounded-md border p-2 cursor-pointer transition-all ${
                        isSelected
                          ? "border-foreground bg-surface-3 shadow-sm ring-1 ring-foreground/20"
                          : "border-border/70 bg-surface-2/40 hover:bg-surface-2/80 hover:border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-foreground leading-tight">
                          {node.label}
                        </span>
                        {node.deltaPct !== undefined && (
                          <span
                            className={`font-mono text-[10px] font-semibold shrink-0 px-1 py-0.2 rounded border ${toneColor}`}
                          >
                            {node.deltaPct > 0 ? "+" : ""}
                            {node.deltaPct.toFixed(1)}%
                          </span>
                        )}
                      </div>

                      {node.sublabel && (
                        <p className="mt-1 text-[9.5px] text-muted-foreground font-serif leading-snug line-clamp-2">
                          {node.sublabel}
                        </p>
                      )}

                      {node.deltaValueBase !== undefined && (
                        <div className="mt-1 flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                          <span>Impact:</span>
                          <span className={node.deltaValueBase < 0 ? "text-red-400 font-semibold" : "text-emerald-400 font-semibold"}>
                            {node.deltaValueBase < 0 ? "-" : "+"}${Math.abs(node.deltaValueBase).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Node Details & Connected Edges Inspector */}
      {selectedNode && (
        <div className="rounded-md border border-border/70 bg-surface-2/50 p-2 text-[10.5px] font-mono space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="font-semibold text-foreground">Node Transmission Link:</span>
            <span>ID: {selectedNode.id}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-0.5 text-foreground">
            <span>Stage: <strong className="text-foreground">{stageLabels[selectedNode.stage]}</strong></span>
            {selectedNode.deltaPct !== undefined && (
              <span>Shift: <strong className={selectedNode.deltaPct < 0 ? "text-red-400" : "text-emerald-400"}>{selectedNode.deltaPct > 0 ? "+" : ""}{selectedNode.deltaPct}%</strong></span>
            )}
            {selectedNode.sublabel && <span className="text-muted-foreground">({selectedNode.sublabel})</span>}
          </div>
        </div>
      )}
    </div>
  );
};
