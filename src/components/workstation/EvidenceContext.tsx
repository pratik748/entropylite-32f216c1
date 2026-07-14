import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useWorkstationData, type WorkstationData } from "@/hooks/useWorkstationData";
import { buildEvidenceGraph, metricsForSection } from "@/lib/evidence/build";
import { synthesize } from "@/lib/evidence/synthesis";
import { connectedIds } from "@/lib/evidence/relations";
import { diffAndStore, type EvidenceChange } from "@/lib/evidence/history";
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
  /** Ids connected to the selection through the relationship web — for soft cross-page highlighting. */
  relatedIds: Set<string>;
  /** Material evidence changes since the last stored session. */
  changes: EvidenceChange[];
  sectionMetrics: (sectionKey: string) => EvidenceMetric[];
  refresh: () => void;
}

const EvidenceContext = createContext<EvidenceContextValue | null>(null);

export function EvidenceProvider({ ticker, initialSelectedId, children }: { ticker: string; initialSelectedId?: string | null; children: ReactNode }) {
  const { refresh, ...data } = useWorkstationData(ticker);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [changes, setChanges] = useState<EvidenceChange[]>([]);

  const graph = useMemo(
    () =>
      buildEvidenceGraph({
        ticker,
        analysis: data.analysis,
        bars: data.bars,
        dossier: data.dossier,
        quote: data.quote,
        financials: data.financials,
        fetchedAt: {
          analysis: data.status.analysis.fetchedAt,
          bars: data.status.bars.fetchedAt,
          dossier: data.status.dossier.fetchedAt,
          quote: data.status.quote.fetchedAt,
          financials: data.status.financials.fetchedAt,
        },
      }),
    [ticker, data.analysis, data.bars, data.dossier, data.quote, data.financials, data.status],
  );

  const synthesis = useMemo(
    () => synthesize(graph, data.analysis, data.quote?.price ?? data.analysis?.currentPrice ?? null),
    [graph, data.analysis, data.quote],
  );

  useEffect(() => {
    if (initialSelectedId && graph.metrics[initialSelectedId]) setSelectedId(initialSelectedId);
  }, [initialSelectedId, graph.metrics]);

  // Session-over-session diff: run once the graph is materially assembled.
  useEffect(() => {
    if (graph.coverage.total >= 10) {
      setChanges(diffAndStore(graph));
    }
  }, [graph]);

  const relatedIds = useMemo(() => connectedIds(graph, selectedId), [graph, selectedId]);

  const value = useMemo<EvidenceContextValue>(
    () => ({
      ticker,
      data,
      graph,
      synthesis,
      selectedId,
      select: setSelectedId,
      selected: selectedId ? (graph.metrics[selectedId] ?? null) : null,
      relatedIds,
      changes,
      sectionMetrics: (sectionKey: string) => metricsForSection(graph, sectionKey),
      refresh,
    }),
    [ticker, data, graph, synthesis, selectedId, relatedIds, changes, refresh],
  );

  return <EvidenceContext.Provider value={value}>{children}</EvidenceContext.Provider>;
}

export function useEvidence(): EvidenceContextValue {
  const ctx = useContext(EvidenceContext);
  if (!ctx) throw new Error("useEvidence must be used inside EvidenceProvider");
  return ctx;
}
