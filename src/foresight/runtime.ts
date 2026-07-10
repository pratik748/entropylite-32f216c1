/**
 * Foresight runtime — the deterministic executor at the center of the
 * orchestration layer.
 *
 * One user turn:
 *   1. DECIDE   — foresight-plan (edge fn → existing callAI lanes) returns
 *                 either a direct response, a clarification, or a plan graph.
 *   2. EXECUTE  — the graph runs here, in application code: topological
 *                 order, independent nodes in parallel, $ref data-flow
 *                 between nodes, params validated against the registry.
 *   3. VERIFY   — deterministic numeric-provenance scan, plus an LLM goal
 *                 check for multi-step runs; one repair iteration allowed.
 *   4. RESPOND  — the explainer writes prose from the fact ledger only.
 *
 * Write tools never execute inside the loop. They surface as pending
 * actions and run only through confirmPending() after explicit user
 * approval — enforced here, not by the prompt.
 */

import { supabase } from "@/integrations/supabase/client";
import { getTool, validateToolParams, buildManifest } from "./registry";
import { FactLedger, verifyNumericProvenance } from "./provenance";
import { rememberFinding } from "./memory";
import { ForesightSession } from "./session";
import { listTargets, emitUIEvent } from "./uiBus";
import type {
  ExecutionStep, FactRecord, HostAdapter, PendingAction, PlannerDecision, PlanNode,
  ReasoningGraph, RuntimeEvent, ToolResult, VerificationReport,
} from "./types";

const MAX_NODES_PER_TURN = 12;
const MAX_PLAN_ITERATIONS = 3;
const NODE_TIMEOUT_MS = 95_000;

export interface RuntimeOptions {
  host: HostAdapter;
  onEvent: (event: RuntimeEvent) => void;
}

interface PlanServiceRequest {
  role: "decide" | "respond" | "verify";
  payload: Record<string, unknown>;
}

async function callPlanService<T>(req: PlanServiceRequest): Promise<T> {
  const { data, error } = await supabase.functions.invoke("foresight-plan", { body: req });
  if (error) {
    // supabase-js reports an undeployed function (404) and network/CORS
    // failures with the same opaque "Failed to send a request" message —
    // translate it into something an operator can act on.
    const raw = error.message || "";
    if (/failed to send a request/i.test(raw) || error.name === "FunctionsFetchError") {
      throw new Error(
        "Foresight's reasoning service is unreachable — the foresight-plan edge function is not deployed on this Supabase project (deploy it, then retry).",
      );
    }
    if (error.name === "FunctionsHttpError" && typeof error.context?.status === "number" && error.context.status === 401) {
      throw new Error("Foresight requires a signed-in session — please sign in and retry.");
    }
    throw new Error(raw || "foresight-plan unreachable");
  }
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

/** Resolve {"$ref":"nodeId.path.to.value"} references against completed results. */
export function resolveRefs(
  params: unknown,
  results: Map<string, ToolResult>,
): unknown {
  if (Array.isArray(params)) return params.map((p) => resolveRefs(p, results));
  if (params && typeof params === "object") {
    const obj = params as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 1 && keys[0] === "$ref" && typeof obj.$ref === "string") {
      const [nodeId, ...path] = obj.$ref.split(".");
      const res = results.get(nodeId);
      if (!res) throw new Error(`$ref to unknown/incomplete node: ${nodeId}`);
      let cur: unknown = res.data;
      for (const seg of path) {
        if (cur == null || typeof cur !== "object") throw new Error(`$ref path miss: ${obj.$ref}`);
        cur = (cur as Record<string, unknown>)[seg];
      }
      return cur;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = resolveRefs(v, results);
    return out;
  }
  return params;
}

/** Dependencies of a node: explicit `after` plus every $ref inside params. */
export function nodeDependencies(node: PlanNode): string[] {
  const deps = new Set<string>(node.after || []);
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      if (typeof obj.$ref === "string" && Object.keys(obj).length === 1) deps.add(obj.$ref.split(".")[0]);
      else Object.values(obj).forEach(walk);
    }
  };
  walk(node.params);
  return Array.from(deps);
}

function digestResult(result: ToolResult): string {
  try {
    const s = JSON.stringify(result.data);
    return s.length > 900 ? s.slice(0, 900) + "…" : s;
  } catch {
    return "(unserializable)";
  }
}

export class ForesightRuntime {
  private host: HostAdapter;
  private onEvent: (event: RuntimeEvent) => void;
  readonly session = new ForesightSession();
  private pending = new Map<string, PendingAction>();
  private abort: AbortController | null = null;
  private busy = false;

  constructor(opts: RuntimeOptions) {
    this.host = opts.host;
    this.onEvent = opts.onEvent;
  }

  isBusy(): boolean {
    return this.busy;
  }

  cancel(): void {
    this.abort?.abort();
  }

  /** Execute a previously proposed state-changing action after user approval. */
  async confirmPending(nonce: string): Promise<void> {
    const action = this.pending.get(nonce);
    if (!action) {
      this.onEvent({ type: "error", message: "That action has expired. Ask again to re-stage it." });
      return;
    }
    this.pending.delete(nonce);
    const tool = getTool(action.tool);
    if (!tool) {
      this.onEvent({ type: "error", message: `Tool ${action.tool} is no longer available.` });
      return;
    }
    const ledger = new FactLedger();
    const step: ExecutionStep = {
      nodeId: `confirm-${nonce.slice(0, 6)}`,
      tool: action.tool,
      params: action.params,
      status: "running",
      startedAt: Date.now(),
      reason: action.preview,
    };
    this.onEvent({ type: "step", step: { ...step } });
    try {
      const ctrl = new AbortController();
      const result = await tool.execute(action.params, {
        host: this.host,
        signal: ctrl.signal,
        recordFact: (f) => ledger.record(f),
      });
      step.status = "done";
      step.finishedAt = Date.now();
      step.digest = digestResult(result);
      this.onEvent({ type: "step", step: { ...step } });
      const text = `Done — ${action.preview}`;
      this.session.noteForesight(text, [action.tool]);
      this.onEvent({ type: "answer", text, facts: ledger.all() });
    } catch (e) {
      step.status = "failed";
      step.finishedAt = Date.now();
      step.error = e instanceof Error ? e.message : String(e);
      this.onEvent({ type: "step", step: { ...step } });
      this.onEvent({ type: "error", message: `Could not complete "${action.preview}": ${step.error}` });
    } finally {
      this.onEvent({ type: "done" });
    }
  }

  rejectPending(nonce: string): void {
    if (this.pending.delete(nonce)) {
      this.session.noteForesight("Action cancelled by user before execution.", []);
    }
  }

  /** Main entry — one conversational turn, possibly containing several tasks. */
  async runTurn(userText: string): Promise<void> {
    if (this.busy) {
      this.onEvent({ type: "error", message: "A run is already in progress — cancel it first or wait." });
      return;
    }
    this.busy = true;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.session.noteUser(userText);

    try {
      const decision = await this.decide(userText);
      if (signal.aborted) return;

      if (decision.say) this.onEvent({ type: "ack", text: decision.say });
      if (decision.goals?.length) this.onEvent({ type: "goals", goals: decision.goals });

      if (decision.mode === "clarify" && decision.question) {
        this.session.noteForesight(decision.question, []);
        this.onEvent({ type: "clarify", question: decision.question });
        return;
      }
      if (decision.mode === "respond" || !decision.graph || decision.graph.length === 0) {
        const answer = decision.answer || decision.say || "Understood.";
        this.session.noteForesight(answer, []);
        this.onEvent({ type: "answer", text: answer, facts: [] });
        return;
      }

      await this.executeGoal(userText, decision, signal);
    } catch (e) {
      if (!signal.aborted) {
        this.onEvent({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    } finally {
      this.busy = false;
      this.onEvent({ type: "done" });
    }
  }

  // ── DECIDE ─────────────────────────────────────────────────────────

  private async decide(userText: string): Promise<PlannerDecision> {
    const positions = this.host.getPositions().map((p) => ({
      id: p.id, ticker: p.ticker, qty: p.quantity, buy: p.buyPrice, last: p.currentPrice ?? null,
    }));
    return await callPlanService<PlannerDecision>({
      role: "decide",
      payload: {
        message: userText,
        context: this.session.toPromptContext(),
        manifest: buildManifest(),
        ui: { activeTab: this.host.getActiveTab(), targets: listTargets() },
        portfolio: positions,
        now: new Date().toISOString(),
      },
    });
  }

  // ── EXECUTE + VERIFY + RESPOND ─────────────────────────────────────

  private async executeGoal(userText: string, decision: PlannerDecision, signal: AbortSignal): Promise<void> {
    const ledger = new FactLedger();
    const graph: ReasoningGraph = {
      goal: userText,
      goals: decision.goals || [userText],
      createdAt: Date.now(),
      steps: [],
      iterations: 1,
    };

    let nodes = (decision.graph || []).slice(0, MAX_NODES_PER_TURN);
    const results = new Map<string, ToolResult>();
    const toolsUsed: string[] = [];

    for (let iteration = 1; iteration <= MAX_PLAN_ITERATIONS; iteration++) {
      graph.iterations = iteration;
      const { failures } = await this.executeGraph(nodes, results, ledger, graph, toolsUsed, signal);
      if (signal.aborted) return;

      // Replan only when something failed and budget remains — the planner
      // gets the error digests and may route around the failure.
      if (failures.length === 0 || iteration === MAX_PLAN_ITERATIONS) break;
      const repair = await this.replan(userText, graph, failures);
      if (!repair || repair.length === 0) break;
      nodes = repair.slice(0, MAX_NODES_PER_TURN);
    }

    // Note referenced tickers for follow-up resolution.
    const tickers = new Set<string>();
    for (const step of graph.steps) {
      const p = step.params as Record<string, unknown>;
      for (const key of ["ticker", "tickers"]) {
        const v = p[key];
        if (typeof v === "string") tickers.add(v);
        if (Array.isArray(v)) v.forEach((t) => typeof t === "string" && tickers.add(t));
      }
    }
    if (tickers.size) this.session.noteTickers(Array.from(tickers));

    const answer = await this.respond(userText, decision, graph, ledger, signal);
    if (signal.aborted) return;

    const verification = await this.verify(userText, decision, graph, ledger, answer.text, signal);
    graph.verification = verification;
    graph.answer = answer.text;

    this.session.lastGraph = graph;
    this.session.lastFacts = ledger.all();
    this.session.lastSnapshotAt = Date.now();
    this.session.noteForesight(answer.text, toolsUsed);

    // Persist a research finding when the run produced substantive facts.
    if (ledger.all().length >= 2) {
      rememberFinding({
        entities: Array.from(tickers),
        text: `${decision.goals?.[0] || userText} → ${answer.text.slice(0, 400)}`,
        facts: ledger.all(),
      });
    }

    // Evidence highlighting chosen by the explainer.
    for (const h of answer.highlights || []) {
      emitUIEvent("highlight", { targetId: h.targetId, note: h.note });
    }

    this.onEvent({ type: "answer", text: answer.text, verification, facts: ledger.all() });
  }

  private async executeGraph(
    nodes: PlanNode[],
    results: Map<string, ToolResult>,
    ledger: FactLedger,
    graph: ReasoningGraph,
    toolsUsed: string[],
    signal: AbortSignal,
  ): Promise<{ failures: ExecutionStep[] }> {
    const remaining = new Map(nodes.map((n) => [n.id, n]));
    const done = new Set<string>(results.keys());
    const failed = new Set<string>();
    const failures: ExecutionStep[] = [];

    while (remaining.size > 0 && !signal.aborted) {
      const ready = Array.from(remaining.values()).filter((n) =>
        nodeDependencies(n).every((d) => done.has(d)),
      );
      if (ready.length === 0) {
        // Cycle, dangling dependency, or everything upstream failed.
        for (const n of Array.from(remaining.values())) {
          const blockedByFailure = nodeDependencies(n).some((d) => failed.has(d));
          const step: ExecutionStep = {
            nodeId: n.id, tool: n.tool, params: n.params, reason: n.reason,
            status: "skipped",
            error: blockedByFailure ? "upstream step failed" : "unresolvable dependency",
          };
          graph.steps.push(step);
          this.onEvent({ type: "step", step: { ...step } });
          remaining.delete(n.id);
        }
        break;
      }

      await Promise.all(ready.map(async (node) => {
        remaining.delete(node.id);
        const step = await this.executeNode(node, results, ledger, signal);
        graph.steps.push(step);
        if (step.status === "done") {
          done.add(node.id);
          toolsUsed.push(node.tool);
        } else if (step.status === "failed") {
          failed.add(node.id);
          failures.push(step);
        } else if (step.status === "awaiting_confirmation") {
          // Confirm-gated: treated as satisfied for graph flow purposes so
          // unrelated branches continue, but nothing downstream may consume
          // its output (it has none).
          failed.add(node.id);
        }
      }));
    }
    return { failures };
  }

  private async executeNode(
    node: PlanNode,
    results: Map<string, ToolResult>,
    ledger: FactLedger,
    signal: AbortSignal,
  ): Promise<ExecutionStep> {
    const step: ExecutionStep = {
      nodeId: node.id, tool: node.tool, params: node.params, reason: node.reason,
      status: "running", startedAt: Date.now(),
    };
    const tool = getTool(node.tool);
    if (!tool) {
      step.status = "failed";
      step.error = `unknown tool: ${node.tool}`;
      step.finishedAt = Date.now();
      this.onEvent({ type: "step", step: { ...step } });
      return step;
    }

    let resolved: unknown;
    try {
      resolved = resolveRefs(node.params, results);
    } catch (e) {
      step.status = "failed";
      step.error = e instanceof Error ? e.message : String(e);
      step.finishedAt = Date.now();
      this.onEvent({ type: "step", step: { ...step } });
      return step;
    }

    const validation = validateToolParams(node.tool, resolved);
    if (!validation.ok) {
      step.status = "failed";
      step.error = `invalid params: ${validation.errors.join("; ")}`;
      step.finishedAt = Date.now();
      this.onEvent({ type: "step", step: { ...step } });
      return step;
    }
    step.params = validation.value!;

    // ── Confirmation gate. Registry-declared, enforced here. The planner
    // cannot downgrade a tool's permission; the check reads the registry.
    if (tool.permission === "confirm") {
      const preview = tool.confirmationPreview!(validation.value!);
      const pending: PendingAction = {
        nonce: crypto.randomUUID(),
        tool: node.tool,
        params: validation.value!,
        preview,
        createdAt: Date.now(),
      };
      this.pending.set(pending.nonce, pending);
      step.status = "awaiting_confirmation";
      step.finishedAt = Date.now();
      step.digest = preview;
      this.onEvent({ type: "step", step: { ...step } });
      this.onEvent({ type: "confirmation_required", pending });
      return step;
    }

    this.onEvent({ type: "step", step: { ...step } });
    try {
      const timeout = new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error("tool timed out")), NODE_TIMEOUT_MS);
        signal.addEventListener("abort", () => { clearTimeout(t); reject(new Error("cancelled")); }, { once: true });
      });
      const result = await Promise.race([
        tool.execute(validation.value!, {
          host: this.host,
          signal,
          recordFact: (f) => ledger.record(f),
        }),
        timeout,
      ]);
      results.set(node.id, result);
      step.status = "done";
      step.cached = result.cached;
      step.digest = digestResult(result);
      step.result = result;
    } catch (e) {
      step.status = "failed";
      step.error = e instanceof Error ? e.message : String(e);
    }
    step.finishedAt = Date.now();
    this.onEvent({ type: "step", step: { ...step } });
    return step;
  }

  // ── REPLAN / RESPOND / VERIFY ──────────────────────────────────────

  private async replan(userText: string, graph: ReasoningGraph, failures: ExecutionStep[]): Promise<PlanNode[] | null> {
    try {
      const decision = await callPlanService<PlannerDecision>({
        role: "decide",
        payload: {
          message: userText,
          context: this.session.toPromptContext(),
          manifest: buildManifest(),
          ui: { activeTab: this.host.getActiveTab(), targets: listTargets() },
          portfolio: [],
          now: new Date().toISOString(),
          repair: {
            completed: graph.steps.filter((s) => s.status === "done").map((s) => ({ id: s.nodeId, tool: s.tool, digest: s.digest })),
            failed: failures.map((f) => ({ id: f.nodeId, tool: f.tool, error: f.error })),
          },
        },
      });
      return decision.mode === "plan" ? decision.graph || null : null;
    } catch {
      return null;
    }
  }

  private async respond(
    userText: string,
    decision: PlannerDecision,
    graph: ReasoningGraph,
    ledger: FactLedger,
    signal: AbortSignal,
  ): Promise<{ text: string; highlights?: Array<{ targetId: string; note?: string }> }> {
    if (signal.aborted) return { text: "" };
    const stepSummary = graph.steps.map((s) =>
      `${s.nodeId} ${s.tool} → ${s.status}${s.error ? ` (${s.error})` : ""}${s.digest ? ` :: ${s.digest.slice(0, 500)}` : ""}`,
    ).join("\n");
    try {
      const res = await callPlanService<{ answer: string; highlights?: Array<{ targetId: string; note?: string }> }>({
        role: "respond",
        payload: {
          message: userText,
          goals: decision.goals,
          facts: ledger.toPromptTable(),
          steps: stepSummary,
          targets: listTargets(),
          context: this.session.toPromptContext(),
        },
      });
      return { text: res.answer || "Run complete — results are in the activity ledger.", highlights: res.highlights };
    } catch {
      // Explainer unavailable — fall back to a deterministic summary so the
      // user still gets grounded output.
      const doneSteps = graph.steps.filter((s) => s.status === "done");
      const failedSteps = graph.steps.filter((s) => s.status === "failed");
      const lines = [
        `Completed ${doneSteps.length} of ${graph.steps.length} steps.`,
        ...ledger.all().slice(0, 10).map((f) => `• ${f.label}: ${f.value}${f.unit ? " " + f.unit : ""} (${f.tool})`),
      ];
      if (failedSteps.length) lines.push(`Failed: ${failedSteps.map((s) => s.tool).join(", ")}.`);
      return { text: lines.join("\n") };
    }
  }

  private async verify(
    userText: string,
    decision: PlannerDecision,
    graph: ReasoningGraph,
    ledger: FactLedger,
    answer: string,
    signal: AbortSignal,
  ): Promise<VerificationReport> {
    const numericCheck = verifyNumericProvenance(answer, ledger.all());
    const report: VerificationReport = { numericCheck };
    // LLM goal check only for multi-step analytical runs; single-step runs
    // are already verified by the deterministic scan.
    if (!signal.aborted && graph.steps.filter((s) => s.status === "done").length >= 2) {
      try {
        report.goalCheck = await callPlanService<{ satisfied: boolean; issues: string[] }>({
          role: "verify",
          payload: {
            message: userText,
            goals: decision.goals,
            answer,
            facts: ledger.toPromptTable(),
          },
        });
      } catch {
        // Verification is best-effort; the numeric scan already ran.
      }
    }
    return report;
  }
}
