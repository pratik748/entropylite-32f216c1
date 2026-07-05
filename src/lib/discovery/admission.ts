// Simulation-grounded admission (TRUTH v2 §5.3, reduced to hard data-quality
// gates). A zero-cost first-pass filter: physically/logically impossible
// inputs are rejected *before* any engine or probabilistic scoring sees them.
// No amount of source credibility can override a hard constraint.
//
// Browser + edge safe (no imports). The Deno twin used by twrd-ingest lives
// at supabase/functions/_shared/twrd/admission.ts — keep the two in sync.

import type { AdmissionResult, OHLCVBar } from "./types";

export interface BarAdmissionOpts {
  /** max |log return| close-vs-prevClose in one bar (0.7 ≈ ±100%) */
  maxAbsLogReturn?: number;
  /** max intrabar high/low log range */
  maxAbsLogRange?: number;
}

/**
 * Admit or reject one OHLCV bar. Checks are ordered cheap-first; all failing
 * reasons are reported (for the rejection log, per spec §"the system should
 * be seen to reject").
 */
export function admitBar(bar: OHLCVBar, prevClose?: number, opts?: BarAdmissionOpts): AdmissionResult {
  const maxRet = opts?.maxAbsLogReturn ?? 0.7;
  const maxRange = opts?.maxAbsLogRange ?? 0.9;
  const reasons: string[] = [];

  const finite = [bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite);
  if (!finite) reasons.push("non_finite_field");
  else {
    if (bar.close <= 0 || bar.open <= 0 || bar.high <= 0 || bar.low <= 0) reasons.push("non_positive_price");
    if (bar.volume < 0) reasons.push("negative_volume");
    if (bar.high < bar.low) reasons.push("high_below_low");
    if (bar.high < Math.max(bar.open, bar.close) - 1e-12) reasons.push("high_below_open_close");
    if (bar.low > Math.min(bar.open, bar.close) + 1e-12) reasons.push("low_above_open_close");
    if (reasons.length === 0) {
      if (Math.abs(Math.log(bar.high / bar.low)) > maxRange) reasons.push("range_exceeds_bound");
      if (prevClose !== undefined && prevClose > 0 && Math.abs(Math.log(bar.close / prevClose)) > maxRet) {
        reasons.push("return_exceeds_bound");
      }
    }
  }
  return { admitted: reasons.length === 0, reasons };
}

// ─── numeric-claim admission ─────────────────────────────────────

export interface RelationBound {
  /** substring matched against the claim relation (lowercased) */
  match: string;
  min: number;
  max: number;
}

/**
 * Hard physical/logical ranges for numeric claim objects, by relation
 * pattern. Deliberately loose — these reject the impossible, not the
 * unlikely (that is TWRD's job).
 */
export const DEFAULT_RELATION_BOUNDS: RelationBound[] = [
  { match: "pct", min: -1, max: 10 },            // percentage-change style, fraction units
  { match: "rate", min: -0.5, max: 1 },          // interest/growth rates, fraction units
  { match: "price", min: 0, max: 1e7 },
  { match: "volume", min: 0, max: 1e13 },
  { match: "flow", min: -1e12, max: 1e12 },      // signed $ flows
  { match: "sentiment", min: -1, max: 1 },
  { match: "probability", min: 0, max: 1 },
  { match: "yield", min: -0.05, max: 0.5 },
];

/**
 * Admit a numeric claim (subject, relation, value). Non-numeric objects are
 * admitted here (TWRD scores them); numeric ones must satisfy the matching
 * bound and basic sanity (finite, timestamp not in the future).
 */
export function admitNumericClaim(
  relation: string,
  value: unknown,
  tsMs?: number,
  bounds: RelationBound[] = DEFAULT_RELATION_BOUNDS,
  nowMs: number = Date.now(),
): AdmissionResult {
  const reasons: string[] = [];
  if (tsMs !== undefined) {
    if (!Number.isFinite(tsMs)) reasons.push("invalid_timestamp");
    else if (tsMs > nowMs + 5 * 60_000) reasons.push("timestamp_in_future");
  }
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(num))) {
    if (!Number.isFinite(num)) reasons.push("non_finite_value");
    else {
      const rel = relation.toLowerCase();
      const bound = bounds.find((b) => rel.includes(b.match));
      if (bound && (num < bound.min || num > bound.max)) reasons.push(`out_of_bounds:${bound.match}`);
    }
  }
  return { admitted: reasons.length === 0, reasons };
}
