/**
 * VENOR Architecture: TWRD (Truth-Weighted Reality Database)
 * 100% Deterministic Epistemic Engine & Admission Layer
 */

import type { ClaimRecord, TruthScoreResult, SourceCredibility } from "./types";

// Standard Sigmoid Activation
export function sigmoid(z: number): number {
  if (z > 40) return 1;
  if (z < -40) return 0;
  return 1 / (1 + Math.exp(-z));
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 Physical & Conservation Admission Gate
// ─────────────────────────────────────────────────────────────────────────────

export interface AdmissionCheckParams {
  price?: number;
  prevClose?: number;
  maxDailyChangePct?: number; // default 20%
  volume?: number;
  sharesOutstanding?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  reportedMargin?: number;
}

/**
 * Validates physical and financial invariants.
 * Returns 1 if valid, 0 if rejected by physical conservation laws.
 */
export function evaluateAdmissionGate(claim: ClaimRecord, params: AdmissionCheckParams = {}): 0 | 1 {
  // Check 1: Non-negative price and finite timeframe
  if (params.price !== undefined) {
    if (!Number.isFinite(params.price) || params.price <= 0) return 0;
    if (params.prevClose !== undefined && params.prevClose > 0) {
      const maxAllowed = params.maxDailyChangePct ?? 30;
      const changePct = Math.abs((params.price - params.prevClose) / params.prevClose) * 100;
      if (changePct > maxAllowed) return 0; // Exceeds physical exchange limit / circuit breaker
    }
  }

  // Check 2: Share and volume conservation
  if (params.volume !== undefined && params.sharesOutstanding !== undefined) {
    if (params.volume < 0 || params.sharesOutstanding <= 0) return 0;
    if (params.volume > params.sharesOutstanding * 2.5) return 0; // Impossible single-session turnover
  }

  // Check 3: Accounting balance sheet conservation (Assets = Liabilities + Equity)
  if (params.totalAssets !== undefined && params.totalLiabilities !== undefined && params.totalEquity !== undefined) {
    const sum = params.totalLiabilities + params.totalEquity;
    const diff = Math.abs(params.totalAssets - sum);
    const tolerance = Math.max(1, params.totalAssets * 0.05); // 5% rounding / reporting disparity margin
    if (diff > tolerance) return 0; // Violates fundamental double-entry identity
  }

  // Check 4: Margin sanity bounds
  if (params.reportedMargin !== undefined) {
    if (params.reportedMargin < -500 || params.reportedMargin > 100) return 0;
  }

  // Check 5: Claim timestamp sanity (cannot be in the far future)
  const now = Date.now();
  if (claim.timestamp > now + 86400000) return 0; // Future timestamp rejected

  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 Sybil Deduplication (Jaccard Text / Triple Clustering)
// ─────────────────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((t) => t.length > 2)
  );
}

/**
 * Jaccard Similarity between two token sets or text strings.
 */
export function jaccardSimilarity(a: Set<string> | string, b: Set<string> | string): number {
  const setA = typeof a === "string" ? tokenize(a) : a;
  const setB = typeof b === "string" ? tokenize(b) : b;
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Groups syndicated news wire clones into single deduplicated clusters.
 */
export function deduplicateSybilClaims(claims: ClaimRecord[], similarityThreshold = 0.85): ClaimRecord[][] {
  const clusters: ClaimRecord[][] = [];
  const tokenCache = new Map<string, Set<string>>();

  for (const c of claims) {
    const text = `${c.entity} ${c.relation} ${c.objectValue} ${c.provenanceDetails || ""}`;
    const tokens = tokenize(text);
    tokenCache.set(c.id, tokens);

    let merged = false;
    for (const cluster of clusters) {
      const leader = cluster[0];
      const leaderTokens = tokenCache.get(leader.id)!;
      if (jaccardSimilarity(tokens, leaderTokens) >= similarityThreshold) {
        cluster.push(c);
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push([c]);
    }
  }

  return clusters;
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 Beta-Posterior Source Credibility
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_SOURCE_CREDIBILITY: SourceCredibility = {
  sourceId: "default",
  alpha: 10,
  beta: 2,
  lambda: 0.98,
  credibilityMean: 0.833,
  sampleCount: 12,
};

/**
 * Updates source credibility with exponential forgetting (λ = 0.98).
 */
export function updateSourceCredibility(
  source: SourceCredibility,
  verifiedOutcome: number // 1.0 = true, 0.0 = false
): SourceCredibility {
  const y = Math.max(0, Math.min(1, verifiedOutcome));
  const l = source.lambda || 0.98;
  const alpha = l * source.alpha + y;
  const beta = l * source.beta + (1 - y);
  const credibilityMean = alpha / Math.max(alpha + beta, 1e-6);

  return {
    sourceId: source.sourceId,
    alpha,
    beta,
    lambda: l,
    credibilityMean,
    sampleCount: source.sampleCount + 1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 Epistemic Truth Scoring & Momentum Formula
// ─────────────────────────────────────────────────────────────────────────────

export interface TruthWeightParameters {
  w1_sourceCred: number;   // Weight for S(x,t), default 1.2
  w2_agreement: number;    // Weight for A(x,t), default 1.0
  w3_depth: number;        // Weight for D(x,t), default 0.8
  w4_bias: number;         // Weight for B(x,t), default 0.6
  w5_contradict: number;   // Weight for C(x,t), default 1.1
  biasConstant: number;    // Base offset b, default -0.3
}

export const DEFAULT_TRUTH_WEIGHTS: TruthWeightParameters = {
  w1_sourceCred: 1.2,
  w2_agreement: 1.0,
  w3_depth: 0.8,
  w4_bias: 0.6,
  w5_contradict: 1.1,
  biasConstant: -0.3,
};

/**
 * Computes the continuous epistemic score:
 * T(x,t) = σ(w₁S + w₂A + w₃D − w₄B − w₅C + b)
 */
export function computeTruthScore(
  claim: ClaimRecord,
  sourceCredibility: number,
  corroboratingClaims: ClaimRecord[] = [],
  contradictingClaims: ClaimRecord[] = [],
  previousTScore: number | null = null,
  timeDeltaHours = 1,
  weights: TruthWeightParameters = DEFAULT_TRUTH_WEIGHTS
): TruthScoreResult {
  // If physically rejected, score is strictly 0
  if (claim.admissionStatus === 0) {
    return {
      claimId: claim.id,
      score: 0,
      sourceCredibility: 0,
      agreementScore: 0,
      evidenceDepth: 0,
      sourceBias: 1,
      contradictionWeight: 1,
      epistemicMomentum: 0,
      sybilClusterSize: 1,
      rawLogit: -999,
    };
  }

  // Deduplicate corroborating claims to prevent Sybil attacks
  const clusters = deduplicateSybilClaims(corroboratingClaims);
  const clusterSize = clusters.length;

  // Multi-source Noisy-OR Agreement: A = 1 - ∏(1 - p_i)
  let agreementProduct = 1.0;
  for (const cluster of clusters) {
    const representative = cluster[0];
    const p = Math.max(0.1, Math.min(0.95, representative.piHatPrior));
    agreementProduct *= 1 - p;
  }
  const A = Math.max(0, Math.min(1, 1 - agreementProduct));

  // Evidence Depth (log-scaled count of independent pathways)
  const D = Math.min(1.0, Math.log2(1 + clusterSize) / 3.0);

  // Source Bias (penalize if sentiment-only or social unverified source)
  const isSocial = claim.category === "NEWS" && claim.source.toLowerCase().includes("social");
  const B = isSocial ? 0.45 : 0.05;

  // Contradiction Weight: C = ∑ T_opposing
  let contradictionSum = 0;
  for (const c of contradictingClaims) {
    if (c.admissionStatus === 1) {
      contradictionSum += c.piHatPrior;
    }
  }
  const C = Math.min(1.0, contradictionSum / 2.0);

  // S(x,t) Source Credibility
  const S = Math.max(0, Math.min(1, sourceCredibility));

  // Epistemic Logit: z = w₁S + w₂A + w₃D − w₄B − w₅C + b
  const z =
    weights.w1_sourceCred * S +
    weights.w2_agreement * A +
    weights.w3_depth * D -
    weights.w4_bias * B -
    weights.w5_contradict * C +
    weights.biasConstant;

  const score = sigmoid(z);

  // Epistemic Momentum: μ(x,t) = ∂T / ∂t ≈ (T_current - T_previous) / Δt
  const epistemicMomentum =
    previousTScore !== null && timeDeltaHours > 0
      ? (score - previousTScore) / timeDeltaHours
      : 0;

  return {
    claimId: claim.id,
    score: Number(score.toFixed(4)),
    sourceCredibility: Number(S.toFixed(4)),
    agreementScore: Number(A.toFixed(4)),
    evidenceDepth: Number(D.toFixed(4)),
    sourceBias: Number(B.toFixed(4)),
    contradictionWeight: Number(C.toFixed(4)),
    epistemicMomentum: Number(epistemicMomentum.toFixed(4)),
    sybilClusterSize: clusterSize,
    rawLogit: Number(z.toFixed(4)),
  };
}
