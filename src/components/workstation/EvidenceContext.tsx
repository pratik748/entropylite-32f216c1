import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useWorkstationData, type WorkstationData } from "@/hooks/useWorkstationData";
import { buildEvidenceGraph, metricsForSection } from "@/lib/evidence/build";
import { synthesize } from "@/lib/evidence/synthesis";
import type { EvidenceGraph, EvidenceMetric, Synthesis } from "@/lib/evidence/types";

interface EvidenceContextValue {
  ticker: string;
  data: WorkstationData;
  graph: EvidenceGraph;
  synthesis: Synthesis;
  /** Currently inspected metric id (drives the Inspector). */
  selectedId: string | null;
  select: (id: string | null) => void;
  selected: EvidenceMetric | null;
  sectionMetrics: (sectionKey: string) => EvidenceMetric[];
  refresh: () => void;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function EvidenceProvider({ ticker, children }: { ticker: string; children: ReactNode }) {
  const { refresh, ...data } = useWorkstationData(ticker);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const graph = useMemo(
    () =>
      buildEvidenceGraph({
        ticker,
        analysis: data.analysis,
        bars: data.bars,
        dossier: data.dossier,
        quote: data.quote,
      }),
    [ticker, data.analysis, data.bars, data.dossier, data.quote],
  );

  const synthesis = useMemo(
    () => synthesize(graph, data.analysis, data.quote?.price ?? data.analysis?.currentPrice ?? null),
    [graph, data.analysis, data.quote],
  );

  const value = useMemo<EvidenceContextValue>(
    () => ({
      ticker,
      data,
      graph,
      synthesis,
      selectedId,
      select: setSelectedId,
      selected: selectedId ? (graph.metrics[selectedId] ?? null) : null,
      sectionMetrics: (sectionKey: string) => metricsForSection(graph, sectionKey),
      refresh,
    }),
    [ticker, data, graph, synthesis, selectedId, refresh],
  );

  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

export function useEvidence(): EvidenceContextValue {
  const ctx = useContext(EvidenceContext);
  if (!ctx) throw new Error("useEvidence must be used inside EvidenceProvider");
  return ctx;
}
