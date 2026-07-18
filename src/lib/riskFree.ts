/**
 * Risk-free rate architecture — CLIENT side.
 * MIRRORED by supabase/functions/_shared/riskFree.ts; the truth-spine test asserts the two
 * tables are identical. Change BOTH or the build fails.
 *
 * Phase I gave the system ONE risk-free assumption (consistency).
 * Phase II makes the assumption correct per context: a USD book must not
 * silently inherit an INR discount assumption or vice versa, and every
 * dependent number must be able to say which rate it used, as of when,
 * from what source.
 *
 * Methodology (stated, not hidden):
 *  - Rates are short-tenor government-bill yields, ROUNDED TO 25bp, from a
 *    STATIC SNAPSHOT maintained manually in this file (`asOf` below). They
 *    are deliberately coarse — the honest error bar on a manually
 *    maintained snapshot is ±50bp, and consumers are told so via `basis`.
 *  - No live rates source is connected yet. When one is added, only this
 *    module changes; every consumer already carries the provenance fields.
 *  - Unknown currencies fall back to USD and say so in `fallbackFrom`.
 */

export interface RiskFreeRate {
  currency: string;
  /** Annual rate, decimal (0.0425 = 4.25%). */
  annualRate: number;
  /** Tenor of the underlying instrument. */
  tenor: "3M";
  /** Observation date of the snapshot. */
  asOf: string;
  /** Where the number comes from. */
  source: string;
  /** How to interpret it: a manually maintained snapshot, ±50bp honest error bar. */
  basis: "static_snapshot";
  /** Set when the requested currency had no entry and USD was substituted. */
  fallbackFrom?: string;
}

const AS_OF = "2025-12-31";
const SNAPSHOT_NOTE = "approximate short-tenor government yield, static snapshot rounded to 25bp";

const TABLE: Record<string, Omit<RiskFreeRate, "fallbackFrom">> = {
  USD: { currency: "USD", annualRate: 0.0425, tenor: "3M", asOf: AS_OF, source: `US 3M T-bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  INR: { currency: "INR", annualRate: 0.06,   tenor: "3M", asOf: AS_OF, source: `India 91-day T-bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  EUR: { currency: "EUR", annualRate: 0.02,   tenor: "3M", asOf: AS_OF, source: `Euro-area 3M bill (ECB depo anchor) — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  GBP: { currency: "GBP", annualRate: 0.04,   tenor: "3M", asOf: AS_OF, source: `UK 3M gilt bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  JPY: { currency: "JPY", annualRate: 0.005,  tenor: "3M", asOf: AS_OF, source: `Japan 3M bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  CAD: { currency: "CAD", annualRate: 0.0275, tenor: "3M", asOf: AS_OF, source: `Canada 3M bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  AUD: { currency: "AUD", annualRate: 0.0375, tenor: "3M", asOf: AS_OF, source: `Australia 3M bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  SGD: { currency: "SGD", annualRate: 0.025,  tenor: "3M", asOf: AS_OF, source: `Singapore 3M bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  HKD: { currency: "HKD", annualRate: 0.04,   tenor: "3M", asOf: AS_OF, source: `Hong Kong 3M bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
  CNY: { currency: "CNY", annualRate: 0.015,  tenor: "3M", asOf: AS_OF, source: `China 3M bill — ${SNAPSHOT_NOTE}`, basis: "static_snapshot" },
};

/**
 * Risk-free rate for a currency. Unknown/missing currency falls back to USD
 * with `fallbackFrom` set — consumers must surface the substitution rather
 * than hide it.
 */
export function riskFreeFor(currency: string | null | undefined): RiskFreeRate {
  const code = (currency || "USD").toUpperCase();
  const hit = TABLE[code];
  if (hit) return { ...hit };
  return { ...TABLE.USD, fallbackFrom: code };
}

/** True when the snapshot is older than `maxAgeDays` (default 270). */
export function riskFreeIsStale(rate: RiskFreeRate, maxAgeDays = 270): boolean {
  const asOfMs = Date.parse(rate.asOf);
  if (!Number.isFinite(asOfMs)) return true;
  return Date.now() - asOfMs > maxAgeDays * 24 * 3600 * 1000;
}

/** Full snapshot, for tests and diagnostics. */
export const RISK_FREE_SNAPSHOT: Readonly<Record<string, Omit<RiskFreeRate, "fallbackFrom">>> = TABLE;
