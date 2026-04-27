// Domain cleaners — assign π̂ caps and bias hints. Lightweight, deterministic.

import type { RawClaim, TwrdDomain } from "../types.ts";

const SPECULATIVE_PATTERNS = [
  /\bis expected to\b/i, /\brumou?red\b/i, /\bsources close to\b/i,
  /\bpeople familiar with\b/i, /\bwe hypothesi[sz]e\b/i, /\bcould\b/i,
  /\bmight\b/i, /\breportedly\b/i, /\ballegedly\b/i,
];

const BIAS_PATTERNS = [
  /\b(buy now|moon|to the moon|guaranteed|sure thing)\b/i,
  /\b(disaster|catastroph|collapse imminent)\b/i,
];

const PI_CAP_BY_DOMAIN: Record<TwrdDomain, { min: number; max: number }> = {
  financial:  { min: 0.10, max: 0.90 },
  news:       { min: 0.20, max: 0.85 },
  social:     { min: 0.05, max: 0.50 },
  geo:        { min: 0.00, max: 0.80 },
  scientific: { min: 0.10, max: 0.75 },
};

function isSpeculative(text: string): boolean {
  return SPECULATIVE_PATTERNS.some((re) => re.test(text));
}

function biasScore(text: string): number {
  let hits = 0;
  for (const re of BIAS_PATTERNS) if (re.test(text)) hits++;
  return Math.min(1, hits * 0.4);
}

/** Run cleaner for a single claim — assigns π̂_cap and biasHat in-place. */
export function clean(claim: RawClaim): RawClaim {
  const cap = PI_CAP_BY_DOMAIN[claim.domain] ?? PI_CAP_BY_DOMAIN.financial;
  const text = (claim.evidence?.[0]?.raw_text ?? "").toString();
  const speculative = text ? isSpeculative(text) : false;

  // Speculative news/social claims capped at 0.45 per TWRD §4.3.
  let piHatCap = cap.max;
  if (speculative && (claim.domain === "news" || claim.domain === "social")) {
    piHatCap = Math.min(piHatCap, 0.45);
  }

  // Social-source viral cluster collapse: if multiple evidence rows share the same
  // source_id within 30 minutes, treat as single voice (drop dups).
  let evidence = claim.evidence ?? [];
  if (claim.domain === "social" && evidence.length > 1) {
    const seen = new Map<string, ClaimEvidenceLite>();
    for (const e of evidence) {
      const key = e.source_id;
      const prev = seen.get(key);
      if (!prev) { seen.set(key, e); continue; }
      const dt = Math.abs(new Date(e.ts).getTime() - new Date(prev.ts).getTime());
      if (dt > 30 * 60 * 1000) seen.set(`${key}@${e.ts}`, e);
    }
    evidence = [...seen.values()];
  }

  const biasHat = Math.max(claim.biasHat ?? 0, text ? biasScore(text) : 0);

  return { ...claim, evidence, piHatCap, biasHat };
}

type ClaimEvidenceLite = { source_id: string; raw_text?: string; ts: string };

/** Bulk cleaner. */
export function cleanAll(claims: RawClaim[]): RawClaim[] {
  return claims.map(clean);
}