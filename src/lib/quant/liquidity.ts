/**
 * Liquidity & capacity analytics — what "handling a large book" actually
 * requires: how fast could this book be unwound without owning the tape?
 * ─────────────────────────────────────────────────────────────────────────
 * Method, fully disclosed:
 *  - ADV = median of the last 20 positive daily volumes (median, not mean,
 *    so one halt or spike day cannot distort capacity).
 *  - Days-to-exit = position shares ÷ (ADV × participation), default 20%
 *    participation — a standard institutional ceiling before a desk is
 *    assumed to move the price.
 *  - No market-impact model is applied; this is a participation constraint,
 *    not a cost estimate, and is labeled as such in the UI.
 *  - Assets without volume history (some FX/crypto/index feeds) are
 *    excluded and disclosed via coveredValueShare.
 */

export interface LiquidityInput {
  ticker: string;
  quantity: number;
  /** Base-currency market value of the position. */
  valueBase: number;
  /** Daily share volumes, oldest→newest; may be missing or all zero. */
  volumes?: number[];
}

export interface PositionLiquidity {
  ticker: string;
  valueBase: number;
  /** Median 20d daily volume in shares; null when no usable history. */
  adv20: number | null;
  /** Trading days to exit at the participation cap; null when adv unknown. */
  daysToExit: number | null;
  /** Position as a multiple of one day's ADV. */
  advMultiple: number | null;
}

export interface LiquidityProfile {
  participation: number;
  perPosition: PositionLiquidity[];
  /** Share of covered value exitable within 1 / 5 / 20 trading days. */
  shareWithin: { d1: number; d5: number; d20: number };
  /** Share of total book value with usable volume history. */
  coveredValueShare: number;
  /** Weighted average days-to-exit over covered value. */
  weightedDaysToExit: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function liquidityProfile(
  positions: LiquidityInput[],
  participation = 0.2,
): LiquidityProfile | null {
  if (positions.length === 0 || participation <= 0 || participation > 1) return null;

  const perPosition: PositionLiquidity[] = positions.map((p) => {
    const recent = (p.volumes ?? []).slice(-20).filter((v) => v > 0);
    const adv20 = recent.length >= 5 ? median(recent) : null;
    const daysToExit = adv20 && adv20 > 0 && p.quantity > 0
      ? p.quantity / (adv20 * participation)
      : null;
    return {
      ticker: p.ticker,
      valueBase: p.valueBase,
      adv20,
      daysToExit,
      advMultiple: adv20 && adv20 > 0 ? p.quantity / adv20 : null,
    };
  });

  const totalValue = positions.reduce((s, p) => s + Math.max(0, p.valueBase), 0);
  const covered = perPosition.filter((p) => p.daysToExit != null);
  const coveredValue = covered.reduce((s, p) => s + Math.max(0, p.valueBase), 0);
  if (totalValue <= 0 || coveredValue <= 0) return null;

  const within = (d: number) =>
    covered.reduce((s, p) => s + ((p.daysToExit as number) <= d ? Math.max(0, p.valueBase) : 0), 0) / coveredValue;

  return {
    participation,
    perPosition: perPosition.sort((a, b) => (b.daysToExit ?? -1) - (a.daysToExit ?? -1)),
    shareWithin: { d1: within(1), d5: within(5), d20: within(20) },
    coveredValueShare: coveredValue / totalValue,
    weightedDaysToExit:
      covered.reduce((s, p) => s + (p.daysToExit as number) * Math.max(0, p.valueBase), 0) / coveredValue,
  };
}
