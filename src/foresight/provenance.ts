/**
 * Confidence provenance — the trust boundary of Foresight.
 *
 * Every number a user reads must trace to a deterministic engine or a cited
 * data source. Tools record FactRecords as they execute; the explainer is
 * given only those facts; and this module's numeric scan rejects any figure
 * in the final answer that does not appear in the ledger.
 */

import type { FactRecord, VerificationReport } from "./types";

let counter = 0;

export class FactLedger {
  private facts: FactRecord[] = [];

  record(fact: Omit<FactRecord, "id" | "recordedAt">): FactRecord {
    const full: FactRecord = { ...fact, id: `f${++counter}`, recordedAt: Date.now() };
    this.facts.push(full);
    return full;
  }

  all(): FactRecord[] {
    return [...this.facts];
  }

  /** Compact table for the explainer prompt. */
  toPromptTable(): string {
    if (this.facts.length === 0) return "(no facts recorded)";
    return this.facts
      .map((f) => {
        const conf = f.confidence ? ` [${f.confidence}]` : "";
        const cache = f.cached ? " (cached)" : "";
        return `${f.id} | ${f.label} = ${f.value}${f.unit ? " " + f.unit : ""} | src=${f.tool}${cache}${conf}`;
      })
      .join("\n");
  }
}

/** Extract numeric literals from prose, ignoring years, list indices, ordinals. */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  // Strip markdown links/urls first — they contain incidental digits.
  const cleaned = text.replace(/https?:\/\/\S+/g, "");
  const re = /-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?/g;
  for (const m of cleaned.match(re) || []) {
    const n = Number(m.replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    // Skip years and trivially small integers (list markers, "2 stocks").
    if (Number.isInteger(n) && n >= 1900 && n <= 2100) continue;
    if (Number.isInteger(n) && Math.abs(n) <= 12) continue;
    out.push(n);
  }
  return out;
}

/**
 * Deterministic verification: every number in the answer must match a ledger
 * fact within rounding tolerance (numbers are routinely rounded for prose —
 * 0.5% relative or 0.051 absolute covers 1-2 decimal display rounding).
 */
export function verifyNumericProvenance(answer: string, facts: FactRecord[]): VerificationReport["numericCheck"] {
  const ledgerValues: number[] = [];
  for (const f of facts) {
    if (typeof f.value === "number") ledgerValues.push(f.value);
    else extractNumbers(String(f.value)).forEach((n) => ledgerValues.push(n));
    // Percent/fraction duality: engines emit 0.042, prose says 4.2%.
    if (typeof f.value === "number") {
      ledgerValues.push(f.value * 100, f.value / 100, -f.value, Math.abs(f.value));
    }
  }
  const unsupported: string[] = [];
  for (const n of extractNumbers(answer)) {
    const supported = ledgerValues.some((v) => {
      const absTol = 0.051;
      const relTol = Math.abs(v) * 0.005;
      return Math.abs(v - n) <= Math.max(absTol, relTol);
    });
    if (!supported) unsupported.push(String(n));
  }
  return { ok: unsupported.length === 0, unsupported };
}
