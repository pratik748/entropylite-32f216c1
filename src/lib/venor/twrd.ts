/**
 * TWRD: Truth Weighted Reality Database
 * ──────────────────────────────────────────────────────────────────────────
 * Layer 1 of the VENOR Architecture:
 *
 * Ingests, cleans, tags, timestamps, and assigns:
 * 1. Provenance Verification & Verification Hashes
 * 2. Epistemic Uncertainty (lack of knowledge/data sparsity)
 * 3. Aleatoric Uncertainty (inherent statistical noise)
 * 4. Historical Source Reliability Tracking & Feedback Weighting
 *
 * Pure, deterministic, zero-download, client-side database.
 */

import { RawRealityInput, TruthWeightedFact, RealitySourceType } from "./types";

export class TruthWeightedRealityDatabase {
  private facts: Map<string, TruthWeightedFact> = new Map();
  private sourceReliability: Map<string, number> = new Map([
    ["market_data", 0.98],
    ["financial_filings", 0.95],
    ["regulatory", 0.92],
    ["macro_economic", 0.88],
    ["geopolitical", 0.72],
    ["alternative_data", 0.68],
    ["news_sentiment", 0.55],
  ]);

  /**
   * Ingest and truth-weight a raw reality signal.
   */
  public ingest(raw: RawRealityInput): TruthWeightedFact {
    const baseReliability = this.sourceReliability.get(raw.source) ?? 0.5;
    const publisherBonus = raw.publisherOrFeed.includes("institutional") || raw.publisherOrFeed.includes("sec_edgar") ? 0.05 : 0;
    const reliability = Math.min(0.99, Math.max(0.1, baseReliability + publisherBonus));

    // Epistemic uncertainty is high when confidence or source reliability is low
    const epistemicUncertainty = Math.max(0, 1 - (raw.rawConfidence * 0.5 + reliability * 0.5));
    // Aleatoric uncertainty measures inherent volatility of the channel
    const aleatoricNoise = raw.source === "news_sentiment" ? 0.35 : raw.source === "geopolitical" ? 0.25 : 0.05;

    const weightedConfidence = Math.max(0.01, Math.min(0.99, raw.rawConfidence * reliability * (1 - aleatoricNoise * 0.5)));

    // Deterministic hash computation
    const verificationHash = this.computeHash(`${raw.id}_${raw.timestamp}_${raw.source}_${weightedConfidence.toFixed(4)}`);

    const fact: TruthWeightedFact = {
      id: raw.id,
      source: raw.source,
      timestamp: raw.timestamp,
      provenance: {
        origin: raw.publisherOrFeed,
        verified: weightedConfidence > 0.4,
        verificationHash,
        historicalReliability: reliability,
      },
      confidence: weightedConfidence,
      epistemicUncertainty,
      aleatoricUncertainty: aleatoricNoise,
      content: raw.payload,
    };

    this.facts.set(fact.id, fact);
    return fact;
  }

  /**
   * Batch ingest raw reality items.
   */
  public ingestBatch(items: RawRealityInput[]): TruthWeightedFact[] {
    return items.map(item => this.ingest(item));
  }

  /**
   * Retrieve all facts filtered by source with confidence >= minConfidence.
   */
  public getFacts(source?: RealitySourceType, minConfidence = 0.3): TruthWeightedFact[] {
    const list: TruthWeightedFact[] = [];
    for (const fact of this.facts.values()) {
      if ((!source || fact.source === source) && fact.confidence >= minConfidence) {
        list.push(fact);
      }
    }
    return list.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Closed-loop feedback update:
   * Adjusts source reliability up or down based on post-decision outcome verification.
   */
  public updateFeedback(source: RealitySourceType, predictionAccuracy: number, learningRate = 0.05): void {
    const current = this.sourceReliability.get(source) ?? 0.6;
    const error = predictionAccuracy - current;
    const updated = Math.max(0.1, Math.min(0.99, current + learningRate * error));
    this.sourceReliability.set(source, updated);
  }

  public getSourceReliabilities(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.sourceReliability.entries()) {
      out[k] = v;
    }
    return out;
  }

  private computeHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 33) ^ str.charCodeAt(i);
    }
    return `0x${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }
}
