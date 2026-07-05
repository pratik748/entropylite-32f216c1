// Bounded k-hop impact propagation over the typed asset graph — TRUTH's
// Aftermath Simulation reduced to its browser-feasible core (k ≤ 2,
// provenance-weighted edges, per-hop attenuation).
//
//   impact(dst) += impact(src) · w_edge · ρ^hop,  summed over paths, clamped.
//
// "TSMC guidance cut → semis → AAPL suppliers": seed {TSM: −0.8}, get back a
// ranked list of second-order candidates. O(Σ dᵏ), d = avg out-degree.

import type { AssetEdge, PropagatedImpact } from "./types";

export interface PropagateOpts {
  /** max hops (default 2 — deeper chains are noise at our edge quality) */
  k?: number;
  /** per-hop attenuation ρ ∈ (0,1] (default 0.6) */
  rho?: number;
  /** ignore edges below this weight (default 0.3) */
  minWeight?: number;
  /** drop propagated impacts below this magnitude (default 0.02) */
  minImpact?: number;
}

/**
 * Propagate signed seed impacts (∈ [−1,1]) through the graph.
 * Seeds are never overwritten; each non-seed node accumulates the sum of
 * path contributions, clamped to [−1, 1]; `hops` reports the shortest
 * contributing distance. Cycles are handled by the hop bound (a node may be
 * reached along multiple paths — that is signal, not a bug).
 */
export function propagateImpact(
  edges: AssetEdge[],
  seeds: Record<string, number>,
  opts?: PropagateOpts,
): PropagatedImpact[] {
  const k = opts?.k ?? 2;
  const rho = opts?.rho ?? 0.6;
  const minWeight = opts?.minWeight ?? 0.3;
  const minImpact = opts?.minImpact ?? 0.02;

  const adj = new Map<string, AssetEdge[]>();
  for (const e of edges) {
    if (e.weight < minWeight || e.src === e.dst) continue;
    const list = adj.get(e.src);
    if (list) list.push(e);
    else adj.set(e.src, [e]);
  }

  const acc = new Map<string, { impact: number; hops: number }>();
  // frontier: node → strongest signed mass arriving at this hop
  let frontier = new Map<string, number>(
    Object.entries(seeds).map(([s, v]) => [s, Math.max(-1, Math.min(1, v))]),
  );

  for (let hop = 1; hop <= k; hop++) {
    const next = new Map<string, number>();
    for (const [node, mass] of frontier) {
      const out = adj.get(node);
      if (!out) continue;
      for (const e of out) {
        if (e.dst in seeds) continue; // never overwrite seeds
        const contrib = mass * e.weight * rho;
        if (Math.abs(contrib) < 1e-9) continue;
        const prev = acc.get(e.dst);
        if (prev) {
          prev.impact = Math.max(-1, Math.min(1, prev.impact + contrib));
          prev.hops = Math.min(prev.hops, hop);
        } else {
          acc.set(e.dst, { impact: Math.max(-1, Math.min(1, contrib)), hops: hop });
        }
        next.set(e.dst, (next.get(e.dst) ?? 0) + contrib);
      }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }

  return [...acc.entries()]
    .map(([symbol, v]) => ({ symbol, impact: v.impact, hops: v.hops }))
    .filter((r) => Math.abs(r.impact) >= minImpact)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}
