// Engine bucketing — the core decorrelation fix.
//
// The previous ensemble treated every engine as an independent vote, but
// most engines ultimately read the same data (recent price). 5 momentum-
// style engines all agreeing isn't 5 independent confirmations — it's
// 1 confirmation echoed 5 times. We group engines into 3 buckets that
// genuinely source different information, then require ≥2 buckets to
// agree before firing. This is the single biggest accuracy lever in this
// rebuild.

export type Bucket = "A" | "B" | "C";

/**
 * A = Price / flow / technicals  (same underlying = recent price tape)
 * B = Fundamental / intel / sentiment / news  (orthogonal: humans + AI)
 * C = Risk / regime / structural constraints  (macro overlay)
 */
export const BUCKET_ASSIGNMENT: Record<string, Bucket> = {
  // ── Bucket A ── price/flow
  deterministic: "A",
  momentum: "A",
  mean_reversion: "A",
  sharpe: "A",
  volume: "A",
  trend: "A",
  winrate: "A",
  drawdown: "A",
  filter_tier: "A",
  cointegration: "A",
  walkforward: "A",
  // ── Bucket B ── fundamental/intel
  ai_verdict: "B",
  ai_confidence: "B",
  intelligence: "B",
  desirable: "B",
  sentiment: "B",
  news: "B",
  // ── Bucket C ── risk/regime/structural
  clank: "C",
  reflexivity: "C",
  veracity: "C",
  regime: "C",
  structural_credit: "C",
};

export function bucketOf(engineId: string): Bucket {
  return BUCKET_ASSIGNMENT[engineId] ?? "A";
}

export interface BucketVote {
  bucket: Bucket;
  direction: -1 | 0 | 1;
  agreement: number; // 0..1 within-bucket agreement
  weight: number;    // total weight across engines in this bucket
  engines: number;
}

export interface BucketDecision {
  /** Per-bucket directional votes */
  buckets: BucketVote[];
  /** How many buckets fired with a non-zero direction */
  votingBuckets: number;
  /** How many buckets agree with the dominant side */
  agreeingBuckets: number;
  /** Cross-bucket agreement label */
  consensus: "ALL_3" | "TWO_OF_3" | "SPLIT" | "INSUFFICIENT";
}