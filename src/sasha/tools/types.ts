/**
 * SASHA Universal Tool Registry Types
 *
 * Stage 2: Machine-readable contract for all analytical and quantitative
 * capabilities in EntropyLite.
 *
 * Every tool explicitly declares:
 *  - Unique identifier (e.g. "quant.calc_euler_risk")
 *  - Categorization and human-readable description
 *  - JSON Schema-compatible input parameters and output structures
 *  - Required data dependencies and preconditions
 *  - Execution handler with controlled timeout and error boundaries
 *  - Output interpretation schema and provenance generator
 *  - Known failure conditions
 */

import type { PortfolioPosition } from "@/foresight/types";

export type SashaToolCategory =
  | "market"
  | "quant"
  | "statarb"
  | "stress"
  | "fundamentals"
  | "macro"
  | "news"
  | "portfolio";

export type ProvenanceSourceType =
  | "retrieved_fact"
  | "calculated_metric"
  | "simulated_outcome"
  | "qualitative_synthesis";

export interface ToolProvenance {
  toolId: string;
  executionId: string;
  timestamp: number;
  sourceType: ProvenanceSourceType;
  primaryDataSource: string;
  modelOrMethod: string;
  assumptions: string[];
  computationTimeMs: number;
  warnings?: string[];
}

export interface ToolExecutionContext {
  executionId: string;
  positions: PortfolioPosition[];
  baseCurrency?: string;
  signal?: AbortSignal;
  stepResults?: Record<string, any>;
  memo?: Map<string, any>;
}

export interface ToolValidationResult {
  valid: boolean;
  errors?: string[];
}

export interface ToolParameterDef {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  required?: boolean;
  default?: any;
  enum?: string[];
}

export interface ToolOutputInterpretation<TOutput = any> {
  summary: string;
  primaryMetrics: Array<{ label: string; value: string | number; unit?: string; tone?: "gain" | "loss" | "neutral" }>;
  provenance: ToolProvenance;
  chartHint?: "dag" | "sparkline" | "euler_waterfall" | "table" | "comparison_grid";
}

export interface SashaTool<TInput = any, TOutput = any> {
  id: string;
  name: string;
  description: string;
  category: SashaToolCategory;
  keywords: string[];
  parameters: Record<string, ToolParameterDef>;
  requiredData: string[];
  dependencies: string[]; // Tool IDs this tool typically consumes
  permission: "read" | "compute" | "confirm";
  preconditions?: (input: TInput, ctx: ToolExecutionContext) => ToolValidationResult;
  execute: (input: TInput, ctx: ToolExecutionContext) => Promise<TOutput>;
  interpretOutput: (output: TOutput, input: TInput, ctx: ToolExecutionContext) => ToolOutputInterpretation<TOutput>;
  failureConditions: string[];
}
