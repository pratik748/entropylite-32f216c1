// Claim extractor — turns heterogeneous engine payloads into TWRD claim triples.
// Lightweight rules-based: enough for MVP without a heavy NER model.

import type { RawClaim, TwrdDomain, ClaimEvidence } from "./types.ts";

export interface NewsItemLike {
  ticker?: string;
  title?: string;
  summary?: string;
  source?: string;
  publishedAt?: string;
  url?: string;
}

export interface FlowLike {
  ticker: string;
  direction: "BUY" | "SELL" | "NEUTRAL";
  intensity?: number;
  source?: string;
  ts?: string;
}

export interface SentimentLike {
  ticker?: string;
  compositeScore: number;
  source?: string;
  ts?: string;
}

const nowIso = () => new Date().toISOString();

/** News → ⟨ticker, mentioned_in, source⟩ (factual mention claim). */
export function extractFromNews(items: NewsItemLike[]): RawClaim[] {
  const out: RawClaim[] = [];
  for (const n of items) {
    if (!n.ticker || !n.title) continue;
    const ev: ClaimEvidence = {
      source_id: (n.source || "newsdata").toLowerCase(),
      raw_text: `${n.title}. ${n.summary ?? ""}`.trim(),
      ts: n.publishedAt || nowIso(),
    };
    out.push({
      subject: n.ticker.toUpperCase(),
      relation: "news_event",
      object: (n.title || "").slice(0, 140),
      domain: "news",
      evidence: [ev],
    });
  }
  return out;
}

/** Flow → ⟨ticker, flow_direction, BUY|SELL⟩. */
export function extractFromFlows(flows: FlowLike[]): RawClaim[] {
  return flows
    .filter((f) => f && f.ticker)
    .map((f) => ({
      subject: f.ticker.toUpperCase(),
      relation: "flow_direction",
      object: f.direction,
      domain: "financial" as TwrdDomain,
      evidence: [{
        source_id: (f.source || "polygon").toLowerCase(),
        raw_text: `flow ${f.direction} intensity ${f.intensity ?? "?"}`,
        ts: f.ts || nowIso(),
      }],
    }));
}

/** Sentiment → ⟨ticker, sentiment, BULL|BEAR|NEUTRAL⟩. */
export function extractFromSentiment(items: SentimentLike[]): RawClaim[] {
  return items.filter((s) => s.ticker).map((s) => {
    const label = s.compositeScore > 20 ? "BULL" : s.compositeScore < -20 ? "BEAR" : "NEUTRAL";
    return {
      subject: s.ticker!.toUpperCase(),
      relation: "sentiment",
      object: label,
      domain: "social" as TwrdDomain,
      evidence: [{
        source_id: (s.source || "twitter").toLowerCase(),
        raw_text: `composite ${s.compositeScore}`,
        ts: s.ts || nowIso(),
      }],
    };
  });
}