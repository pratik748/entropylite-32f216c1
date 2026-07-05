// Claim novelty + sybil-resistant deduplication (TRUTH v2 §6.2 Factor 2).
//
// Both operate on token sets of canonical claim content — never on
// embeddings, never via an LLM. Purpose:
//   • novelty:   1 − max Jaccard vs the recent claim base → "is this new
//                information?" (feeds the News Intelligence engine and the
//                Novelty factor of the Opportunity Score).
//   • sybilDedup: near-identical content from "different" sources counts as
//                ONE source in Noisy-OR agreement — syndicated/churned news
//                must not manufacture independent corroboration.
//
// Browser + edge safe (no imports). Deno twin: _shared/twrd/admission.ts.

export function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9%$.\s-]/g, " ")
      .split(/\s+/)
      .map((t) => t.replace(/^\.+|\.+$/g, "")) // strip sentence punctuation, keep decimals (5.5)
      .filter((t) => t.length > 1),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

export interface ClaimContent {
  subject: string;
  relation: string;
  object: string;
}

export function claimTokens(c: ClaimContent): Set<string> {
  return tokenSet(`${c.subject} ${c.relation} ${c.object}`);
}

/**
 * Novelty of a claim against a recent base: 1 − max Jaccard similarity.
 * O(|recent| · |tokens|). Callers should pre-filter `recent` to the same
 * entity and a rolling window (e.g. 90d) to keep the base small.
 */
export function claimNovelty(claim: ClaimContent, recent: ClaimContent[]): number {
  if (recent.length === 0) return 1;
  const t = claimTokens(claim);
  let maxSim = 0;
  for (const r of recent) {
    const s = jaccard(t, claimTokens(r));
    if (s > maxSim) maxSim = s;
    if (maxSim >= 0.999) break;
  }
  return 1 - maxSim;
}

export interface EvidenceLike {
  source_id: string;
  raw_text?: string;
}

/**
 * Sybil-resistant dedup: evidence items whose text content overlaps with an
 * already-kept item at Jaccard > threshold are collapsed (first kept wins).
 * Evidence without text dedups on source_id only. Returns the deduped list —
 * feed THIS to noisy-OR `agreement()`, never the raw list.
 */
export function sybilDedup<E extends EvidenceLike>(evidence: E[], threshold = 0.9): E[] {
  const kept: E[] = [];
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
