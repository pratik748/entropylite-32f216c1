/**
 * Risk : Reward — one canonical representation for the whole terminal.
 * ─────────────────────────────────────────────────────────────────────
 * Canonical quantity: the R-multiple — units of reward per unit of risk,
 *   R = (target − entry) / (entry − stop)   for a long structure.
 *
 * Canonical display: "2.5:1" (reward first), matching the evidence engine's
 * "Risk : reward structure" node and its 1.5:1 entry bar in
 * `src/lib/evidence/build.ts`. Before this module, tabs hand-rolled their
 * own renderings — "1:2.5" (risk first), "2.5:1" (reward first) and "2.5x"
 * — so the same trade structure read differently on different tabs. Every
 * surface must format through here; upstream strings (AI engines emit
 * risk-first "1:2.5") are normalized by `parseRiskReward`.
 */

/**
 * The desk's entry discipline, shared with the evidence engine: entries
 * below this R-multiple are structurally poor ("below the 1.5:1 bar").
 */
export const RR_ENTRY_BAR = 1.5;

/**
 * Parse any representation the platform's sources emit into the canonical
 * R-multiple. Returns null for missing/degenerate input — callers must not
 * substitute a default.
 *
 * Accepted forms: 2.5 · "2.5" · "2.5x" · "2.5R" · "1:2.5" (risk first) ·
 * "2.5:1" (reward first) · "a/b" · "a to b". For pairs, the leg equal to 1
 * is the risk leg; when neither leg is 1 the pair is read as risk:reward,
 * the only pair convention any EntropyLite source emits.
 */
export function parseRiskReward(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/×/g, "x");
  if (!s || s === "—" || s === "-") return null;
  const single = s.match(/^([0-9]*\.?[0-9]+)\s*[xr]?$/);
  if (single) {
    const n = parseFloat(single[1]);
    return isFinite(n) && n > 0 ? n : null;
  }
  const pair = s.match(/^([0-9]*\.?[0-9]+)\s*(?::|\/|to)\s*([0-9]*\.?[0-9]+)$/);
  if (!pair) return null;
  const a = parseFloat(pair[1]);
  const b = parseFloat(pair[2]);
  if (!isFinite(a) || !isFinite(b) || a <= 0 || b <= 0) return null;
  if (a === 1) return b;
  if (b === 1) return a;
  return b / a;
}

/** Canonical display: "2.5:1". Null/degenerate → "—" (never a fabricated default). */
export function formatRiskReward(rr: number | null | undefined, dp = 1): string {
  if (rr == null || !isFinite(rr) || rr <= 0) return "—";
  return `${rr.toFixed(dp)}:1`;
}

/** Parse-then-format: normalize any upstream representation to display text. */
export function normalizeRiskRewardText(v: unknown, dp = 1): string {
  return formatRiskReward(parseRiskReward(v), dp);
}

/**
 * R-multiple from real trade levels. Supports long (stop < entry < target)
 * and short (target < entry < stop) structures; anything else is degenerate
 * and returns null rather than an absolute-value fiction.
 */
export function riskRewardFromLevels(opts: { entry: number; target: number; stop: number }): number | null {
  const { entry, target, stop } = opts;
  if (![entry, target, stop].every((x) => isFinite(x) && x > 0)) return null;
  if (target > entry && stop < entry) return (target - entry) / (entry - stop);
  if (target < entry && stop > entry) return (entry - target) / (stop - entry);
  return null;
}
