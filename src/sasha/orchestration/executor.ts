/**
 * SASHA Autonomous DAG Execution Engine
 *
 * Executes computational plans with topological dependency resolution, concurrent parallel execution,
 * dynamic input mapping from upstream outputs, bounded retries, schema validation, and full execution tracing.
 */

import { toolRegistry } from "../tools/registry";
import type { ToolExecutionContext, ToolProvenance } from "../tools/types";
import type { ExecutionPlan, ExecutionPlanNode, ExecutionTrace, ExecutionNodeStatus } from "./types";

export interface ExecutionOptions {
  timeoutMs?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  onNodeStart?: (node: ExecutionPlanNode) => void;
  onNodeComplete?: (node: ExecutionPlanNode) => void;
}

export class SashaExecutor {
  /**
   * Executes an entire DAG execution plan to completion.
   */
  public async executePlan(
    plan: ExecutionPlan,
    ctx: ToolExecutionContext,
    opts: ExecutionOptions = {}
  ): Promise<{
    plan: ExecutionPlan;
    trace: ExecutionTrace;
    resultsByNodeId: Record<string, any>;
    provenances: ToolProvenance[];
  }> {
    const startTime = Date.now();
    const timeoutMs = opts.timeoutMs || 8000;
    const maxRetries = opts.maxRetries ?? 1;
    const abortSignal = opts.abortSignal;

    const resultsByNodeId: Record<string, any> = {};
    const provenances: ToolProvenance[] = [];
    const warnings: string[] = [];

    const nodesMap = new Map<string, ExecutionPlanNode>();
    plan.nodes.forEach((n) => nodesMap.set(n.id, n));

    // Track completed, failed, and running node IDs
    const completedNodeIds = new Set<string>();
    const failedNodeIds = new Set<string>();
    const runningNodeIds = new Set<string>();

    while (completedNodeIds.size + failedNodeIds.size < plan.nodes.length) {
      if (abortSignal?.aborted) {
        throw new Error("Execution plan aborted by user.");
      }

      // Find all nodes whose dependencies have ALL completed and are currently 'pending'
      const readyNodes = plan.nodes.filter((node) => {
        if (node.status !== "pending") return false;
        if (runningNodeIds.has(node.id)) return false;

        // Check if any dependency failed
        const hasFailedDep = node.dependencies.some((depId) => failedNodeIds.has(depId));
        if (hasFailedDep) {
          node.status = "skipped";
          node.error = `Skipped because dependency failed.`;
          failedNodeIds.add(node.id);
          return false;
        }

        // Check if all dependencies have completed
        return node.dependencies.every((depId) => completedNodeIds.has(depId));
      });

      if (readyNodes.length === 0 && runningNodeIds.size === 0) {
        // No ready nodes and none running -> remaining nodes must be skipped or deadlock
        plan.nodes.forEach((n) => {
          if (n.status === "pending") {
            n.status = "skipped";
            failedNodeIds.add(n.id);
          }
        });
        break;
      }

      // Launch ready nodes in parallel
      const executionPromises = readyNodes.map(async (node) => {
        runningNodeIds.add(node.id);
        node.status = "running";
        node.startTime = Date.now();
        opts.onNodeStart?.(node);

        try {
          const resolvedInput = this.resolveDynamicInputs(node.input, resultsByNodeId);
          const tool = toolRegistry.get(node.toolId);

          if (!tool) {
            throw new Error(`Tool "${node.toolId}" not found in registry.`);
          }

          // Validate input
          const validation = toolRegistry.validateInput(node.toolId, resolvedInput);
          if (!validation.valid) {
            warnings.push(`Validation warning on [${node.toolId}]: ${validation.errors.join(", ")}`);
          }

          // Execute with bounded timeout and retries
          let output: any;
          let attempt = 0;
          let lastErr: any;

          while (attempt <= maxRetries) {
            attempt++;
            try {
              const execPromise = tool.execute(resolvedInput, ctx);
              const timerPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Tool execution timeout (${timeoutMs}ms)`)), timeoutMs)
              );
              output = await Promise.race([execPromise, timerPromise]);
              break;
            } catch (err: any) {
              lastErr = err;
              if (attempt > maxRetries) throw err;
            }
          }

          node.status = "completed";
          node.output = output;
          node.endTime = Date.now();
          node.elapsedMs = node.endTime - (node.startTime || node.endTime);
          resultsByNodeId[node.id] = output;
          completedNodeIds.add(node.id);

          // Extract interpretation provenance
          try {
            const interp = tool.interpretOutput(output, resolvedInput, ctx);
            if (interp.provenance) {
              node.provenance = interp.provenance;
              provenances.push(interp.provenance);
            }
          } catch (e) {
            // Provenance interpretation is non-fatal
          }

          opts.onNodeComplete?.(node);
        } catch (err: any) {
          node.status = "failed";
          node.error = err.message || "Unknown tool execution failure";
          node.endTime = Date.now();
          node.elapsedMs = node.endTime - (node.startTime || node.endTime);
          failedNodeIds.add(node.id);
          opts.onNodeComplete?.(node);

          if (!node.optional) {
            warnings.push(`Node "${node.name}" (${node.toolId}) failed: ${node.error}`);
          }
        } finally {
          runningNodeIds.delete(node.id);
        }
      });

      // Await parallel batch
      await Promise.all(executionPromises);
    }

    const totalDurationMs = Date.now() - startTime;

    const trace: ExecutionTrace = {
      planId: plan.planId,
      query: plan.query,
      nodesExecuted: completedNodeIds.size,
      totalDurationMs,
      nodeTraces: plan.nodes.map((n) => ({
        nodeId: n.id,
        toolId: n.toolId,
        status: n.status,
        elapsedMs: n.elapsedMs || 0,
        error: n.error,
        provenance: n.provenance,
      })),
      warnings,
    };

    return {
      plan,
      trace,
      resultsByNodeId,
      provenances,
    };
  }

  /**
   * Resolves dynamic parameter mappings (e.g. `"$output.fetch_history_NVDA.bars"`)
   * by reading values from upstream node outputs.
   */
  private resolveDynamicInputs(
    input: Record<string, any>,
    resultsByNodeId: Record<string, any>
  ): Record<string, any> {
    const resolved: Record<string, any> = { ...input };

    if (input.$map && typeof input.$map === "object") {
      for (const [targetKey, path] of Object.entries(input.$map)) {
        if (typeof path === "string" && path.startsWith("$output.")) {
          const parts = path.substring(8).split(".");
          const nodeId = parts[0];
          const nodeOutput = resultsByNodeId[nodeId];

          if (nodeOutput !== undefined) {
            let val = nodeOutput;
            for (let i = 1; i < parts.length; i++) {
              const part = parts[i];
              if (val === undefined || val === null) break;

              if (part === "*") {
                // Wildcard: pass through
                continue;
              } else if (Array.isArray(val) && isNaN(Number(part))) {
                // Array projection: map each item by property
                val = val.map((item) => (item !== undefined && item !== null ? item[part] : undefined)).filter((x) => x !== undefined);
              } else if (typeof val === "object") {
                val = val[part];
              } else {
                val = undefined;
                break;
              }
            }
            resolved[targetKey] = val;
          }
        }
      }
      delete resolved.$map;
    }

    return resolved;
  }
}

export const sashaExecutor = new SashaExecutor();
