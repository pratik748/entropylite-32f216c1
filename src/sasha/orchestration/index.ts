/**
 * SASHA Orchestration & Conversational Agent Engine
 *
 * Central entrypoint connecting ReAct Conversational Agent, Planner,
 * Autonomous Executor, and Grounding Synthesizer.
 */

import { sashaPlanner } from "./planner";
import { sashaExecutor } from "./executor";
import { sashaSynthesizer } from "./synthesizer";
import { sashaAgent, type AgentRunOptions } from "../agent/sashaAgent";
import type { ToolExecutionContext } from "../tools/types";
import type { SashaResult, SashaExecutionState, SashaMessage } from "../types";
import type { ExecutionPlan, ExecutionTrace } from "./types";

export interface OrchestrationResult {
  result: SashaResult;
  plan?: ExecutionPlan;
  trace?: ExecutionTrace;
}

export async function executeSashaOrchestration(
  query: string,
  ctx?: ToolExecutionContext,
  onStateChange?: (state: SashaExecutionState) => void,
  options: {
    history?: SashaMessage[];
    activeTab?: string;
    activeContextTicker?: string | null;
  } = {}
): Promise<OrchestrationResult> {
  const executionContext: ToolExecutionContext = {
    userId: ctx?.userId || "user_default",
    executionId: ctx?.executionId || `exec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    positions: ctx?.positions || [],
    portfolioValue: ctx?.portfolioValue || 100000,
    marketDataCache: ctx?.marketDataCache || new Map(),
    timestamp: Date.now(),
  };

  const agentOptions: AgentRunOptions = {
    history: options.history,
    activeTab: options.activeTab,
    activeContextTicker: options.activeContextTicker,
    onStateChange,
  };

  const output = await sashaAgent.execute(query, executionContext, agentOptions);

  return {
    result: output.result,
    plan: output.plan,
    trace: output.trace,
  };
}

export * from "./types";
export * from "./planner";
export * from "./executor";
export * from "./synthesizer";
export * from "../agent/sashaAgent";
