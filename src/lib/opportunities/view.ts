// Pure view helpers over validated opportunities. Kept free of any
// network/client imports so every consumer (and the test suite) can use
// them directly. The canonical ordering everywhere is expected
// risk-adjusted edge (riskAdjustedScore, descending).

import type { OpportunityFilters, ValidatedOpportunity } from "./types";

export function filterOpportunities(
  opportunities: ValidatedOpportunity[],
  filters: OpportunityFilters,
): ValidatedOpportunity[] {
  let out = opportunities;
  if (filters.assetClasses && filters.assetClasses.length > 0) {
    const allowed = new Set(filters.assetClasses);
    out = out.filter((o) => allowed.has(o.assetClass));
  }
  if (filters.direction) out = out.filter((o) => o.direction === filters.direction);
  if (typeof filters.minConfidence === "number") {
    out = out.filter((o) => o.confidence >= filters.minConfidence!);
  }
  // The repository order IS the canonical ranking; re-sort defensively in
  // case a caller passed an unsorted list.
  out = [...out].sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
  if (typeof filters.maxResults === "number") out = out.slice(0, filters.maxResults);
  return out;
}

/**
 * Diff two slates and return opportunities that are new since the previous
 * one — the alert primitive. Purely derived from validated objects; no
 * alert is ever fabricated.
 */
export function newOpportunities(
  previousSymbols: string[],
  latest: ValidatedOpportunity[],
): ValidatedOpportunity[] {
  const prev = new Set(previousSymbols.map((s) => s.toUpperCase()));
  return latest.filter((o) => !prev.has(o.symbol.toUpperCase()));
}
