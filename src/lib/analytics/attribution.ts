/**
 * Attribution — position contribution, risk contribution, and Brinson
 * sector attribution, all from real portfolio state and Σ.
 * ────────────────────────────────────────────────────────────────────
 * Return contribution uses actual position P&L vs cost basis (weight ×
 * return, exactly additive to the portfolio return). Risk contribution is
 * the Euler decomposition RCᵢ = wᵢ(Σw)ᵢ / σ_p². Brinson runs against an
 * explicit, disclosed benchmark basis (equal-sector weights of the same
 * universe) — no pretend index composition.
 */

import { brinsonAttribution } from "@/lib/quant/institutional";
import type { AttributionAnalysis, PositionContribution, BrinsonRow } from "./types";

export interface AttributionPosition {
  ticker: string;
  weight: number;       // current capital weight, Σ = 1
  returnPct: number;    // position return since cost basis (%, e.g. 12.5)
  sector: string;
}

/** Euler risk contributions from Σ; returns null if Σ misaligned/degenerate. */
export function riskContributions(weights: number[], sigma: number[][]): number[] | null {
  const n = weights.length;
  if (n < 2 || sigma.length !== n) return null;
  const Sw = sigma.map(row => row.reduce((s, v, j) => s + v * weights[j], 0));
  const varP = weights.reduce((s, w, i) => s + w * Sw[i], 0);
  if (!(varP > 0)) return null;
  return weights.map((w, i) => (w * Sw[i]) / varP);
}

export function computeAttribution(opts: {
  positions: AttributionPosition[];
  /** Σ aligned to `sigmaTickers` (subset of positions with history). */
  sigma?: number[][];
  sigmaTickers?: string[];
}): AttributionAnalysis {
  const { positions, sigma, sigmaTickers } = opts;

  // Portfolio return = Σ wᵢ·rᵢ over invested weights (exact decomposition
  // of P&L over cost basis when weights are cost-basis weights; here we use
  // current weights, disclosed as such).
  const portReturn = positions.reduce((s, p) => s + p.weight * p.returnPct, 0);

  // Risk contributions where Σ covers the ticker
  let rcByTicker: Record<string, number> | null = null;
  if (sigma && sigmaTickers && sigmaTickers.length >= 2) {
    const wAligned = sigmaTickers.map(t => positions.find(p => p.ticker === t)?.weight ?? 0);
    const sum = wAligned.reduce((a, v) => a + v, 0);
    if (sum > 0) {
      const rc = riskContributions(wAligned.map(v => v / sum), sigma);
      if (rc) {
        rcByTicker = {};
        sigmaTickers.forEach((t, i) => { rcByTicker![t] = rc[i]; });
      }
    }
  }

  const contribs: PositionContribution[] = positions.map(p => ({
    ticker: p.ticker,
    weight: p.weight,
    returnPct: p.returnPct,
    contributionPct: p.weight * p.returnPct,
    riskContributionPct: rcByTicker ? (rcByTicker[p.ticker] ?? null) : null,
  })).sort((a, b) => b.contributionPct - a.contributionPct);

  // Brinson vs an equal-sector-weight benchmark of the same universe.
  // This is the only benchmark composition we actually know; the basis is
  // carried in the result so reports can state it.
  const sectors: Record<string, { wP: number; ret: number }> = {};
  for (const p of positions) {
    if (!sectors[p.sector]) sectors[p.sector] = { wP: 0, ret: 0 };
    sectors[p.sector].wP += p.weight;
    sectors[p.sector].ret += p.weight * p.returnPct;
  }
  const names = Object.keys(sectors);
  let brinson: BrinsonRow[] | null = null;
  if (names.length >= 2) {
    const wB = 1 / names.length;
    const rows = names.map(sec => {
      const s = sectors[sec];
      const rP = s.wP > 0 ? s.ret / s.wP : 0; // sector's own return
      return { sector: sec, wP: s.wP, wB, rP, rB: rP };
      // rB = rP: without independent benchmark sector returns, selection is
      // definitionally zero; the allocation effect vs equal-sector weights is
      // the honest, computable piece.
    });
    const attributed = brinsonAttribution(rows);
    brinson = attributed.map((a, i) => ({
      sector: a.sector,
      portfolioWeight: rows[i].wP,
      benchmarkWeight: rows[i].wB,
      allocation: a.allocation,
      selection: a.selection,
      interaction: a.interaction,
      total: a.total,
    })).sort((a, b) => b.total - a.total);
  }

  return {
    positions: contribs,
    brinson,
    brinsonBenchmarkBasis: "equal-sector-weight benchmark over the portfolio's own universe; selection ≡ 0 without independent benchmark sector returns",
  };
}

/** Exact check: contributions must sum to the portfolio return. */
export function contributionSum(positions: PositionContribution[]): number {
  return positions.reduce((s, p) => s + p.contributionPct, 0);
}
