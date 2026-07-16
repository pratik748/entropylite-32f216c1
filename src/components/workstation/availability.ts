import type { WorkstationData } from "@/hooks/useWorkstationData";
import type { EvidenceGraph } from "@/lib/evidence/types";
import {
  computeCapitalStructure,
  computeCashCascade,
  computeDuPont,
  computeHealthScore,
  computeRiskDecomposition,
} from "@/lib/evidence/analytics";
import { metricsForSection } from "@/lib/evidence/build";
import { WORKSPACES, type SectionDef, type WorkspaceDef } from "./registry";

/**
 * Availability-aware registry filter.
 *
 * A section earns its place in the rail only when its module can render
 * real evidence from the data actually on hand. While a source is still
 * loading the section stays visible (designed pending states cover the
 * gap); once every relevant input has settled and nothing can populate
 * the module, the section is withdrawn from navigation rather than shown
 * as an empty shell. Sections with deterministic fallbacks keep their
 * place as long as the fallback is computable — the balance sheet, for
 * example, survives a missing statement feed because capital structure
 * derives from market cap ÷ P/B and D/E in the analysis feed.
 */

const ALWAYS_VISIBLE = new Set(["overview"]);

export function computeAvailableSections(
  data: WorkstationData,
  graph: EvidenceGraph,
): Set<string> {
  const s = data.status;
  const loading = (state: string) => state === "loading";

  const financialsPending = loading(s.financials.state);
  const dossierPending = loading(s.dossier.state);
  const analysisPending = loading(s.analysis.state);
  const barsPending = loading(s.bars.state);
  const anyGraphSourcePending =
    analysisPending || financialsPending || dossierPending || loading(s.quote.state);

  const available = new Set<string>();

  for (const workspace of WORKSPACES) {
    for (const section of workspace.sections) {
      const key = `${workspace.id}/${section.id}`;

      if (ALWAYS_VISIBLE.has(workspace.id) || workspace.id === "thesis") {
        available.add(key);
        continue;
      }

      let visible: boolean;
      switch (key) {
        // Statement modules: strictly need the deterministic statement feed.
        case "financials/income-statement":
          visible = financialsPending || (data.financials?.income?.length ?? 0) > 0;
          break;
        case "financials/cash-flow":
          visible = financialsPending || (data.financials?.cashflow?.length ?? 0) > 0;
          break;
        // Modules with deterministic fallbacks: visible whenever computable.
        case "financials/balance-sheet":
          visible =
            financialsPending ||
            analysisPending ||
            computeCapitalStructure(data.financials, data.analysis) != null;
          break;
        case "financials/health":
          visible =
            financialsPending ||
            analysisPending ||
            computeHealthScore(data.financials, data.analysis) != null;
          break;
        case "financials/cash-generation":
          visible = financialsPending || computeCashCascade(data.financials) != null;
          break;
        case "valuation/profitability":
          visible =
            financialsPending ||
            analysisPending ||
            computeDuPont(data.financials, data.analysis) != null ||
            metricsForSection(graph, key).length > 0;
          break;
        case "risk/risk-analysis":
          visible = analysisPending || computeRiskDecomposition(data.analysis) != null;
          break;
        // Price-structure modules: need the tape or the analysis engine.
        case "structure/technical":
        case "risk/monte-carlo":
          visible = barsPending || analysisPending || data.bars != null || data.analysis != null;
          break;
        default:
          // Everything else renders evidence nodes tagged with the section
          // key; a section with zero nodes after all sources settle is an
          // empty shell and is withdrawn.
          visible = anyGraphSourcePending || metricsForSection(graph, key).length > 0;
          break;
      }

      // Dossier-backed registers additionally survive on the dossier alone.
      if (!visible && isDossierSection(key)) {
        visible = dossierPending || data.dossier != null;
      }

      if (visible) available.add(key);
    }
  }

  return available;
}

const DOSSIER_KEYS = new Set([
  "competition/landscape",
  "competition/network",
  "competition/peer-matrix",
  "ecosystem/supply-chain",
  "ecosystem/suppliers",
  "ecosystem/customers",
  "ecosystem/products-segments",
  "ecosystem/geographic",
  "intelligence/management",
  "intelligence/earnings-calls",
  "intelligence/filings",
  "intelligence/news",
  "structure/ownership",
  "structure/insider",
]);

function isDossierSection(key: string): boolean {
  return DOSSIER_KEYS.has(key);
}

/** Sections of a workspace that survived the availability filter, in registry order. */
export function visibleSections(workspace: WorkspaceDef, available: Set<string>): SectionDef[] {
  return workspace.sections.filter((section) => available.has(`${workspace.id}/${section.id}`));
}

/** Workspaces with at least one visible section, sections pre-filtered. */
export function visibleWorkspaces(available: Set<string>): WorkspaceDef[] {
  return WORKSPACES.map((workspace) => ({
    ...workspace,
    sections: visibleSections(workspace, available),
  })).filter((workspace) => workspace.sections.length > 0);
}

/** Flat visible-section order for [ / ] keyboard navigation. */
export function flattenVisible(
  available: Set<string>,
): { workspace: WorkspaceDef; section: SectionDef }[] {
  return visibleWorkspaces(available).flatMap((workspace) =>
    workspace.sections.map((section) => ({ workspace, section })),
  );
}
