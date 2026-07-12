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
  ledger: {
    supporting: number;
    opposing: number;
    neutral: number;
    estimated: number;
    movers: { id: string; weight: number }[];
  };
}
