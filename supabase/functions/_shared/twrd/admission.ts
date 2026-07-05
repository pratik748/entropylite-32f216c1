// Simulation-grounded admission for TWRD ingest (TRUTH v2 §5.3, reduced).
// Hard data-quality gates + sybil-resistant evidence dedup, applied BEFORE
// probabilistic scoring: impossible claims never reach TWRD, and syndicated
// copies never manufacture independent corroboration in noisy-OR agreement.
//
// Deno twin of src/lib/discovery/{admission,novelty}.ts — keep in sync.

import type { RawClaim, ClaimEvidence } from "./types.ts";

// ─── relation bounds (loose: reject the impossible, not the unlikely) ──

interface RelationBound {
  match: string;
  min: number;
  max: number;
}

const RELATION_BOUNDS: RelationBound[] = [
  { match: "pct", min: -1, max: 10 },
  { match: "rate", min: -0.5, max: 1 },
  { match: "price", min: 0, max: 1e7 },
  { match: "volume", min: 0, max: 1e13 },
  { match: "flow", min: -1e12, max: 1e12 },
  { match: "sentiment", min: -1, max: 1 },
  { match: "probability", min: 0, max: 1 },
  { match: "yield", min: -0.05, max: 0.5 },
];

export interface ClaimAdmission {
  admitted: boolean;
  reasons: string[];
}

/** Admit or reject one raw claim. All failing reasons reported. */
export function admitClaim(claim: RawClaim, nowMs: number = Date.now()): ClaimAdmission {
  const reasons: string[] = [];

  if (!claim.subject?.trim()) reasons.push("empty_subject");
  if (!claim.relation?.trim()) reasons.push("empty_relation");
  if (!claim.object?.toString().trim()) reasons.push("empty_object");
  if (!claim.evidence?.length) reasons.push("no_evidence");

  for (const e of claim.evidence ?? []) {
    const t = Date.parse(e.ts);
    if (!Number.isFinite(t)) {
      reasons.push("invalid_evidence_timestamp");
      break;
    }
    if (t > nowMs + 5 * 60_000) {
      reasons.push("evidence_timestamp_in_future");
      break;
    }
  }

  // numeric-object bounds by relation pattern
  const objStr = (claim.object ?? "").toString().trim();
  const num = Number(objStr);
  if (objStr !== "" && Number.isFinite(num)) {
    const rel = claim.relation.toLowerCase();
    const bound = RELATION_BOUNDS.find((b) => rel.includes(b.match));
    if (bound && (num < bound.min || num > bound.max)) reasons.push(`out_of_bounds:${bound.match}`);
  }

  return { admitted: reasons.length === 0, reasons };
}

// ─── sybil dedup ─────────────────────────────────────────────────

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9%$.\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^\.+|\.+$/g, "")) // strip sentence punctuation, keep decimals (5.5)
      .filter((t) => t.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Collapse near-identical evidence (Jaccard > threshold on raw_text, or
 * duplicate source_id when no text). The deduped list is what should feed
 * noisy-OR agreement — k independent corroborators, not k wire copies.
 */
export function sybilDedupEvidence(evidence: ClaimEvidence[], threshold = 0.9): ClaimEvidence[] {
  const kept: ClaimEvidence[] = [];
  const keptTokens: (Set<string> | null)[] = [];
  const seenSources = new Set<string>();
  for (const e of evidence) {
    const src = e.source_id.toLowerCase();
    const tok = e.raw_text ? tokenSet(e.raw_text) : null;
    let dup = false;
    if (!tok) {
      dup = seenSources.has(src);
    } else {
      for (const kt of keptTokens) {
        if (kt && jaccard(tok, kt) > threshold) {
          dup = true;
          break;
        }
      }
    }
    if (!dup) {
      kept.push(e);
      keptTokens.push(tok);
      seenSources.add(src);
    }
  }
  return kept;
}

export interface AdmissionSummary {
  admitted: RawClaim[];
  rejected: { claim: RawClaim; reasons: string[] }[];
  evidenceDeduped: number;
}

/** Full admission pass over a cleaned batch: gate + evidence dedup. */
export function admitClaims(claims: RawClaim[], nowMs: number = Date.now()): AdmissionSummary {
  const admitted: RawClaim[] = [];
  const rejected: { claim: RawClaim; reasons: string[] }[] = [];
  let evidenceDeduped = 0;
  for (const c of claims) {
    const res = admitClaim(c, nowMs);
    if (!res.admitted) {
      rejected.push({ claim: c, reasons: res.reasons });
      continue;
    }
    const deduped = sybilDedupEvidence(c.evidence ?? []);
    evidenceDeduped += (c.evidence?.length ?? 0) - deduped.length;
    admitted.push({ ...c, evidence: deduped });
  }
  return { admitted, rejected, evidenceDeduped };
}
