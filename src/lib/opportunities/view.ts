// Pure view helpers over validated opportunities. Kept free of any
// network/client imports so every consumer (and the test suite) can use
// them directly. The canonical ordering everywhere is expected
// risk-adjusted edge — diversification-adjusted when the engine had
// portfolio context — descending.

import type { OpportunityFilters, ValidatedOpportunity } from "./types";

/** The single ranking key every consumer sorts by: expected risk-adjusted
 *  edge (diversification-adjusted when the engine had portfolio context),
 *  scaled by the measured multi-factor conviction multiplier so the most
 *  strongly-corroborated setups rank highest. */
export function rankingScore(o: ValidatedOpportunity): number {
  return (o.portfolioAdjustedScore ?? o.riskAdjustedScore) * (o.convictionMultiplier ?? 1);
}

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
  out = [...out].sort((a, b) => rankingScore(b) - rankingScore(a));
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
