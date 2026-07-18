/**
 * Evidence graph — the only contract workstation screens render from.
 *
 * A value cannot exist on screen without its definition, calculation,
 * assessment, provenance and thesis influence: "numbers without
 * interpretation" are unrepresentable by construction.
 */

/** Where a figure came from. Always visible to the analyst. */
export type Provenance = "reported" | "computed" | "estimated" | "model";

export type Grade = "good" | "neutral" | "bad" | "unknown";

export type Pillar = "valuation" | "quality" | "growth" | "health" | "momentum" | "risk";

export type PeerScope = "history" | "sector" | "industry" | "direct" | "global" | "market";

export type MetricFormat = "percent" | "ratio" | "price" | "score" | "number" | "signed";

export interface MetricAssessment {
  grade: Grade;
  /** One plain-language sentence: is the value good or bad, and why. */
  reason: string;
}

export interface HistoryPoint {
  period: string;
  value: number;
}

export interface EvidenceMetric {
  id: string;
  label: string;
  value: number | null;
  format: MetricFormat;
  provenance: Provenance;
  /** Human-readable source, e.g. "price history · 2y daily" or "AI dossier". */
  source: string;
  /** What is it. */
  definition: string;
  /** How it was computed, with the actual operands where possible. */
  calculation: string;
  /** Stated implication — why it matters for this name. */
  whyItMatters: string;
  assessment: MetricAssessment;
  /** Trend series where a real series exists; empty otherwise. */
  history: HistoryPoint[];
  /** Percentile position (0–100) per available comparison scope. */
  percentiles: Partial<Record<PeerScope, number>>;
  /** Graph edges — ids of related metrics, navigable in the Inspector. */
  relatedIds: string[];
  /** Signed influence on the final recommendation, −1…+1. */
  thesisWeight: number;
  pillar: Pillar;
  /** Every "workspaceId/sectionId" view this node appears in. */
  sections: string[];
  /** Mechanical confidence in this node's value, 0–1 (provenance + sample). */
  confidence: number;
  /** When the underlying data was fetched (ms epoch); null if unknown. */
  updatedAt: number | null;
  /** Text rendered when value is null but a qualitative read exists (e.g. "Large Cap"). */
  displayText?: string;
  /**
   * Statistical uncertainty of the value itself, when measurable.
   * A point estimate without this field is either exact (reported) or its
   * uncertainty has not been quantified — never "certain by omission".
   */
  uncertainty?: {
    /** Standard error, same units as `value`. */
    se?: number;
    /** 95% interval, same units as `value`. */
    ci95?: [number, number];
    /** Sample size behind the estimate. */
    n?: number;
    /** How the uncertainty was computed and what it understates. */
    method: string;
  };
}

/* ── Relationship engine ───────────────────────────────────────── */

export type RelationKind = "driver" | "constraint" | "context";

export interface EvidenceRelation {
  /** The influencing node. */
  from: string;
  /** The influenced node. */
  to: string;
  kind: RelationKind;
  /** +1: from supports/raises to · −1: from pressures/undermines to. */
  polarity: 1 | -1;
  /** One institutional sentence naming the mechanism. */
  note: string;
}

/** A node's resolved neighborhood, for the constellation and highlighting. */
export interface RelationNeighborhood {
  drivers: { metric: EvidenceMetric; relation: EvidenceRelation }[];
  driven: { metric: EvidenceMetric; relation: EvidenceRelation }[];
  /** All connected ids including the center. */
  ids: Set<string>;
}

/** Causal contribution of one node to the recommendation. */
export interface Contribution {
  id: string;
  /** Raw thesis weight. */
  base: number;
  /** Weight after aligned/conflicting driver propagation. */
  scored: number;
  /** Labels of driver nodes that amplified or damped it. */
  via: string[];
}

export interface EvidenceGraph {
  ticker: string;
  currency: string;
  builtAt: number;
  metrics: Record<string, EvidenceMetric>;
  /** Stable display order. */
  order: string[];
  coverage: {
    total: number;
    estimated: number;
    sources: string[];
  };
}

/* ── Synthesis ─────────────────────────────────────────────────── */

export type Action = "ACCUMULATE" | "HOLD" | "REDUCE" | "AVOID";

export interface PillarScore {
  pillar: Pillar;
  label: string;
  /** 0–100; 50 is neutral. */
  score: number;
  /** Plain-language decision word for the pillar, e.g. "Rich" / "Elite" / "Contained". */
  verdict: string;
  /** Two-or-three-word read, e.g. "rich vs history". */
  read: string;
  nodeIds: string[];
}

export interface ScenarioCase {
  id: "bull" | "base" | "bear";
  label: string;
  probability: number;
  target: number | null;
  returnPct: number | null;
  narrative: string;
  anchorIds: string[];
}

export type BreakerState = "intact" | "watch" | "tripped";

export interface ThesisBreaker {
  id: string;
  label: string;
  state: BreakerState;
  detail: string;
  nodeIds: string[];
}

export interface Synthesis {
  action: Action;
  confidence: number;
  /** One-sentence institutional call. */
  headline: string;
  /** Supporting narrative sentences, each citing evidence labels. */
  narrative: string[];
  pillars: PillarScore[];
  cases: ScenarioCase[];
  breakers: ThesisBreaker[];
  keyDrivers: { id: string; weight: number }[];
  /** Causal contribution per node — the recommendation's full audit trail. */
  contributions: Contribution[];
  ledger: {
    supporting: number;
    opposing: number;
    neutral: number;
    estimated: number;
    movers: { id: string; weight: number }[];
  };
}
