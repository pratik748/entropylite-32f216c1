/**
 * SASHA Orchestration Engine
 *
 * Central entrypoint connecting Planner, Autonomous Executor, and Grounding Synthesizer.
 */

import { sashaPlanner } from "./planner";
import { sashaExecutor } from "./executor";
import { sashaSynthesizer } from "./synthesizer";
import type { ToolExecutionContext } from "../tools/types";
import type { SashaResult } from "../types";
import type { ExecutionPlan, ExecutionTrace } from "./types";

export interface OrchestrationResult {
  result: SashaResult;
  plan: ExecutionPlan;
  trace: ExecutionTrace;
}

export async function executeSashaOrchestration(
  query: string,
  ctx?: ToolExecutionContext
): Promise<OrchestrationResult> {
  const executionContext: ToolExecutionContext = {
    userId: ctx?.userId || "user_default",
    executionId: ctx?.executionId || `exec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    positions: ctx?.positions || [],
    portfolioValue: ctx?.portfolioValue || 100000,
    marketDataCache: ctx?.marketDataCache || new Map(),
    timestamp: Date.now(),
  };

  // 1. Intelligent Planning (DAG construction & validation)
  const plan = await sashaPlanner.createPlan(query, executionContext);

  // 2. Autonomous Execution (topological resolution & parallel execution)
  const { trace, resultsByNodeId, provenances } = await sashaExecutor.executePlan(
    plan,
    executionContext
  );

  // 3. Evidence-grounded Synthesis & Provenance Assembly
  const result = sashaSynthesizer.synthesize(
    plan,
    trace,
    resultsByNodeId,
    provenances,
    executionContext
  );

  return {
    result,
    plan,
    trace,
  };
}

export * from "./types";
export * from "./planner";
export * from "./executor";
export * from "./synthesizer";
