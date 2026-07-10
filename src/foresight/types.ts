/**
 * Foresight — shared types.
 *
 * Foresight is the orchestration layer of EntropyLite: it plans with the
 * existing AI endpoint, executes deterministic engines and edge functions
 * through the tool registry, verifies its own output, and operates the UI.
 * Every quantitative value must originate from a tool result — these types
 * carry that provenance end to end.
 */

import type { ParamShape } from "./schema";

// ── Tools ──────────────────────────────────────────────────────────────

export type ToolCategory =
  | "market"
  | "portfolio"
  | "risk"
  | "intelligence"
  | "simulation"
  | "discovery"
  | "memory"
  | "ui"
  | "state"
  | "export";

/** read = execute immediately; confirm = hard gate, requires explicit user approval. */
export type ToolPermission = "read" | "confirm";

export interface ForesightContext {
  /** Live application handles — portfolio, navigation, prices. */
  host: HostAdapter;
  /** Abort signal for the current run (user cancelled / budget exhausted). */
  signal: AbortSignal;
  /** Record a fact for the provenance ledger as a side effect of execution. */
  recordFact: (fact: Omit<FactRecord, "id" | "recordedAt">) => void;
}

export interface ToolResult<R = unknown> {
  data: R;
  /** Whether the underlying request was served from cache (apiGovernor). */
  cached?: boolean;
  /** Free-form provenance note, e.g. "historical-prices 3mo · 63 obs". */
  source?: string;
  /** Confidence grade propagated from deterministic engines. */
  confidence?: "high" | "medium" | "low";
  /** Explicit caveats/assumptions that must surface in the answer. */
  caveats?: string[];
}

export interface ForesightTool<R = unknown> {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ParamShape;
  permission: ToolPermission;
  /** One-sentence human preview of the exact effect (confirm tools only). */
  confirmationPreview?: (params: Record<string, unknown>) => string;
  /** Hint keywords to improve registry discovery. */
  keywords?: string[];
  execute: (params: Record<string, unknown>, ctx: ForesightContext) => Promise<ToolResult<R>>;
}

// ── Host adapter — the application surface Foresight operates ─────────

export interface PortfolioPosition {
  id: string;
  ticker: string;
  buyPrice: number;
  quantity: number;
  currentPrice?: number;
  currency?: string;
  analysis?: Record<string, unknown> | null;
}

export interface HostAdapter {
  getPositions(): PortfolioPosition[];
  getActiveTab(): string;
  navigate(tab: string): void;
  openAugmentModule(moduleId: string): void;
  setActiveStock(id: string): void;
  addPosition(ticker: string, buyPrice: number, quantity: number): void;
  removePosition(id: string): void;
  updatePosition(id: string, changes: { buyPrice?: number; quantity?: number }): void;
  getHistoryEntries(): Array<{ ticker: string; timestamp: number; suggestion: string; currentPrice: number; confidence: number }>;
}

// ── Plan graph (dynamic execution DAG) ─────────────────────────────────

export interface PlanNode {
  id: string;
  tool: string;
  /** Params may contain {"$ref": "nodeId.path.to.value"} references. */
  params: Record<string, unknown>;
  /** Node ids that must complete first (also implied by $refs). */
  after?: string[];
  /** Why this node exists — shown in the activity ledger. */
  reason?: string;
}

export type PlannerMode = "plan" | "respond" | "clarify";

export interface PlannerDecision {
  mode: PlannerMode;
  /** Distinct goals extracted from the utterance (multi-task support). */
  goals: string[];
  /** Immediate one-line acknowledgement to surface while working. */
  say?: string;
  graph?: PlanNode[];
  /** Direct answer when mode=respond (small talk, capability questions). */
  answer?: string;
  /** Clarifying question when mode=clarify. */
  question?: string;
}

// ── Execution records / reasoning graph ───────────────────────────────

export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped" | "awaiting_confirmation";

export interface ExecutionStep {
  nodeId: string;
  tool: string;
  params: Record<string, unknown>;
  reason?: string;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  cached?: boolean;
  error?: string;
  /** Compact digest of the result for the ledger + planner feedback. */
  digest?: string;
  result?: ToolResult;
}

export interface ReasoningGraph {
  goal: string;
  goals: string[];
  createdAt: number;
  steps: ExecutionStep[];
  verification?: VerificationReport;
  answer?: string;
  /** Planner/verifier round-trips consumed. */
  iterations: number;
}

// ── Provenance ─────────────────────────────────────────────────────────

export interface FactRecord {
  id: string;
  /** Human label, e.g. "TATAMOTORS.NS 90-day Sharpe". */
  label: string;
  value: number | string;
  unit?: string;
  /** Tool that produced it. */
  tool: string;
  cached?: boolean;
  confidence?: "high" | "medium" | "low";
  recordedAt: number;
}

export interface VerificationReport {
  /** Deterministic numeric-provenance scan. */
  numericCheck: { ok: boolean; unsupported: string[] };
  /** LLM verifier assessment (optional pass). */
  goalCheck?: { satisfied: boolean; issues: string[] };
}

// ── Pending confirmation ───────────────────────────────────────────────

export interface PendingAction {
  nonce: string;
  tool: string;
  params: Record<string, unknown>;
  preview: string;
  createdAt: number;
}

// ── Run-level events streamed to the surface ───────────────────────────

export type RuntimeEvent =
  | { type: "ack"; text: string }
  | { type: "goals"; goals: string[] }
  | { type: "step"; step: ExecutionStep }
  | { type: "confirmation_required"; pending: PendingAction }
  | { type: "answer"; text: string; verification?: VerificationReport; facts: FactRecord[] }
  | { type: "clarify"; question: string }
  | { type: "error"; message: string }
  | { type: "done" };

// ── Research memory ────────────────────────────────────────────────────

export interface MemoryRecord {
  id: string;
  /** e.g. "finding" | "preference" | "watch-thesis" */
  kind: string;
  entities: string[];
  text: string;
  facts?: FactRecord[];
  createdAt: number;
  lastAccessedAt: number;
}
