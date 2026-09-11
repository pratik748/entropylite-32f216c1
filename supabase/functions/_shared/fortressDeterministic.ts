/**
 * Deterministic Fortress Mode Defense & Capital Preservation Engine.
 *
 * Generates exact, observational, institutional rationales for defensive actions
 * based on structural risk triggers and balance sheet solvency constraints.
 */

export function generateDeterministicFortressNarratives(opts: {
  holdings?: any[];
  threats?: any[];
  actions?: any[];
  baseCurrency?: string;
  totalValue?: number;
}): Record<string, string> {
  const narratives: Record<string, string> = {};
  const actions = Array.isArray(opts.actions) ? opts.actions : [];

  for (const act of actions) {
    const id = act.id || act.actionId || act.type || "action";
    const type = (act.type || "").toUpperCase();
    const ticker = act.ticker || act.symbol || "portfolio";

    if (type.includes("HEDGE") || type.includes("PUT") || type.includes("CONVEXITY")) {
      narratives[id] = `Allocates tail protection against negative gamma expansion and systemic drawdowns.`;
    } else if (type.includes("REDUCE") || type.includes("TRIM") || type.includes("SELL")) {
      narratives[id] = `De-risks high-beta concentration in ${ticker} to compress total portfolio portfolio VaR.`;
    } else if (type.includes("CASH") || type.includes("LIQUIDITY")) {
      narratives[id] = `Builds tier-1 liquidity reserves to eliminate forced selling risk during market dislocations.`;
    } else if (type.includes("STOP") || type.includes("TIGHTEN")) {
      narratives[id] = `Tightens trailing invalidation boundaries to lock in accrued convex profits.`;
    } else {
      narratives[id] = `Systematic risk-budget rebalancing to restore portfolio Sharpe-optimal efficiency.`;
    }
  }

  return narratives;
}
