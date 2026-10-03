/**
 * SASHA Universal Tool Registry
 *
 * Centralized, machine-readable registry of all institutional quantitative
 * mathematical engines, market data providers, statistical arbitrage calculators,
 * fundamental evaluators, and macro shock simulators in EntropyLite.
 */

import type { SashaTool, SashaToolCategory, ToolValidationResult, ToolParameterDef } from "./types";

class SashaToolRegistry {
  private tools = new Map<string, SashaTool>();
  private toolsByCategory = new Map<SashaToolCategory, SashaTool[]>();

  public register<TInput, TOutput>(tool: SashaTool<TInput, TOutput>): void {
    if (this.tools.has(tool.id)) {
      // Hot-reload friendly overwrite
    }
    this.tools.set(tool.id, tool as SashaTool);

    const catList = this.toolsByCategory.get(tool.category) || [];
    const existingIndex = catList.findIndex((t) => t.id === tool.id);
    if (existingIndex >= 0) {
      catList[existingIndex] = tool as SashaTool;
    } else {
      catList.push(tool as SashaTool);
    }
    this.toolsByCategory.set(tool.category, catList);
  }

  public get(id: string): SashaTool | undefined {
    this.ensureInitialized();
    return this.tools.get(id);
  }

  public getAll(): SashaTool[] {
    this.ensureInitialized();
    return this.list();
  }

  public has(id: string): boolean {
    this.ensureInitialized();
    return this.tools.has(id);
  }

  public list(category?: SashaToolCategory): SashaTool[] {
    this.ensureInitialized();
    if (category) {
      return this.toolsByCategory.get(category) || [];
    }
    return Array.from(this.tools.values());
  }

  /**
   * Dynamic keyword & semantic discovery over the tool registry.
   * Matches against tool id, name, description, category, and keywords.
   */
  public discover(query: string, limit = 10): SashaTool[] {
    this.ensureInitialized();
    const terms = query
      .toLowerCase()
      .split(/[^a-z0-9_.-]+/)
      .filter((t) => t.length >= 2);

    if (terms.length === 0) return this.list().slice(0, limit);

    const scored = Array.from(this.tools.values()).map((tool) => {
      const hayId = tool.id.toLowerCase();
      const hayName = tool.name.toLowerCase();
      const hayDesc = tool.description.toLowerCase();
      const hayKeywords = (tool.keywords || []).map((k) => k.toLowerCase());
      const hayCategory = tool.category.toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (hayId.includes(term)) score += 6;
        if (hayName.includes(term)) score += 4;
        if (hayKeywords.some((k) => k.includes(term))) score += 3;
        if (hayCategory.includes(term)) score += 2;
        if (hayDesc.includes(term)) score += 1;
      }

      return { tool, score };
    });

    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.tool);
  }

  /**
   * Validate tool inputs against parameter definitions.
   */
  public validateInput(toolId: string, input: Record<string, any>): ToolValidationResult {
    this.ensureInitialized();
    const tool = this.get(toolId);
    if (!tool) {
      return { valid: false, errors: [`Tool '${toolId}' is not registered.`] };
    }

    const errors: string[] = [];
    const params = tool.parameters || {};

    for (const [paramName, def] of Object.entries(params)) {
      const val = input?.[paramName];
      if (def.required && (val === undefined || val === null || val === "")) {
        errors.push(`Missing required parameter '${paramName}' for tool '${toolId}'.`);
        continue;
      }

      if (val !== undefined && val !== null) {
        if (def.type === "number" && typeof val !== "number") {
          errors.push(`Parameter '${paramName}' must be a number, got ${typeof val}.`);
        } else if (def.type === "string" && typeof val !== "string") {
          errors.push(`Parameter '${paramName}' must be a string, got ${typeof val}.`);
        } else if (def.type === "boolean" && typeof val !== "boolean") {
          errors.push(`Parameter '${paramName}' must be a boolean, got ${typeof val}.`);
        } else if (def.type === "array" && !Array.isArray(val)) {
          errors.push(`Parameter '${paramName}' must be an array, got ${typeof val}.`);
        } else if (def.type === "object" && (typeof val !== "object" || Array.isArray(val))) {
          errors.push(`Parameter '${paramName}' must be an object, got ${typeof val}.`);
        }

        if (def.enum && !def.enum.includes(val)) {
          errors.push(`Parameter '${paramName}' value '${val}' is not in allowed enum [${def.enum.join(", ")}].`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Compact machine-readable manifest formatted for LLM / Planner consumption.
   */
  public buildManifest(): Array<{
    id: string;
    name: string;
    category: SashaToolCategory;
    description: string;
    parameters: Record<string, ToolParameterDef>;
    dependencies: string[];
    requiredData: string[];
  }> {
    this.ensureInitialized();
    return Array.from(this.tools.values()).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      parameters: t.parameters,
      dependencies: t.dependencies,
      requiredData: t.requiredData,
    }));
  }

  public clear(): void {
    this.tools.clear();
    this.toolsByCategory.clear();
  }

  private isInitializing = false;
  private ensureInitialized(): void {
    if (this.tools.size === 0 && !this.isInitializing) {
      this.isInitializing = true;
      try {
        // Dynamic self-registration bootstrap
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { registerAllSashaTools } = require("./index");
        registerAllSashaTools?.();
      } catch {
        // Fallback for circular import or esm
      } finally {
        this.isInitializing = false;
      }
    }
  }
}

export const toolRegistry = new SashaToolRegistry();
