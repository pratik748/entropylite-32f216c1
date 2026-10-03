/**
 * SASHA Orchestration Engine Types
 *
 * Strongly-typed definitions for DAG Execution Plans, Execution Nodes,
 * Traces, Dependency Resolution, and Provenance.
 */

import type { SashaTool, ToolExecutionContext, ToolProvenance } from "../tools/types";
import type { SashaResult, SashaParsedIntent } from "../types";

export type ExecutionNodeStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface ExecutionPlanNode {
  id: string;
  toolId: string;
  name: string;
  description: string;
  input: Record<string, any>;
  dependencies: string[]; // List of node IDs that must succeed before this node executes
  optional?: boolean;
  status: ExecutionNodeStatus;
  output?: any;
  error?: string;
  provenance?: ToolProvenance;
  elapsedMs?: number;
  startTime?: number;
  endTime?: number;
}

export interface ExecutionPlan {
  planId: string;
  query: string;
  intent: SashaParsedIntent;
  nodes: ExecutionPlanNode[];
  rationale: string;
  estimatedTimeMs: number;
  createdAt: number;
}

export interface ExecutionTrace {
  planId: string;
  query: string;
  nodesExecuted: number;
  totalDurationMs: number;
  nodeTraces: Array<{
    nodeId: string;
    toolId: string;
    status: ExecutionNodeStatus;
    elapsedMs: number;
    error?: string;
    provenance?: ToolProvenance;
  }>;
  warnings: string[];
}

export interface PlannerContext extends ToolExecutionContext {
  query: string;
  availableTools: SashaTool[];
  history?: SashaResult[];
}
