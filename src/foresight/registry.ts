/**
 * Foresight tool registry.
 *
 * Self-registering: tool modules call registerTool() at import time, so
 * adding a capability is one file with one call — the planner discovers it
 * automatically through the generated manifest. Nothing in the runtime
 * refers to any tool by name.
 */

import { shapeToManifest, validateParams, type ValidationResult } from "./schema";
import type { ForesightTool, ToolCategory } from "./types";

const tools = new Map<string, ForesightTool>();

export function registerTool<R>(tool: ForesightTool<R>): void {
  if (tools.has(tool.name)) {
    // Hot-reload friendly: last registration wins, but flag double
    // registration in dev so accidental name collisions surface.
    if (import.meta.env?.DEV) console.warn(`[foresight] tool re-registered: ${tool.name}`);
  }
  if (tool.permission === "confirm" && !tool.confirmationPreview) {
    throw new Error(`[foresight] confirm tool ${tool.name} must define confirmationPreview`);
  }
  tools.set(tool.name, tool as ForesightTool);
}

export function getTool(name: string): ForesightTool | undefined {
  return tools.get(name);
}

export function listTools(category?: ToolCategory): ForesightTool[] {
  const all = Array.from(tools.values());
  return category ? all.filter((t) => t.category === category) : all;
}

export function validateToolParams(name: string, raw: unknown): ValidationResult {
  const tool = tools.get(name);
  if (!tool) return { ok: false, errors: [`unknown tool: ${name}`] };
  return validateParams(tool.parameters, raw);
}

/**
 * Keyword discovery over the registry — lets the planner (or the command
 * palette) find capabilities without the full manifest in context.
 */
export function discoverTools(query: string, limit = 8): ForesightTool[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored = Array.from(tools.values()).map((t) => {
    const hay = `${t.name} ${t.description} ${(t.keywords || []).join(" ")} ${t.category}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (t.name.toLowerCase().includes(term)) score += 3;
      else if (hay.includes(term)) score += 1;
    }
    return { t, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.t);
}

export interface ToolManifestEntry {
  name: string;
  description: string;
  category: ToolCategory;
  permission: "read" | "confirm";
  params: Record<string, unknown>;
}

/**
 * Compact manifest sent to the planner on every turn. Sorted by category
 * then name so the prompt is byte-stable across turns (prompt-cache
 * friendly on providers that support it).
 */
export function buildManifest(): ToolManifestEntry[] {
  return Array.from(tools.values())
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category)))
    .map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
      permission: t.permission,
      params: shapeToManifest(t.parameters),
    }));
}

/** Test/dev utility. */
export function _clearRegistry(): void {
  tools.clear();
}
