/**
 * Foresight core tests — the trust boundary paths: schema validation,
 * registry/confirmation invariants, $ref data flow, dependency extraction,
 * and numeric provenance verification.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { validateParams, shapeToManifest, type ParamShape } from "./schema";
import { _clearRegistry, registerTool, buildManifest, discoverTools, validateToolParams } from "./registry";
import { resolveRefs, nodeDependencies } from "./runtime";
import { FactLedger, extractNumbers, verifyNumericProvenance } from "./provenance";
import { ForesightSession } from "./session";
import type { ToolResult } from "./types";

// localStorage shim for the memory module in the node test env.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

describe("schema validation", () => {
  const shape: ParamShape = {
    ticker: { type: "string", required: true },
    range: { type: "enum", values: ["1mo", "3mo"], default: "3mo" },
    qty: { type: "number", min: 0, integer: true },
    tags: { type: "array", items: { type: "string" }, maxItems: 2 },
  };

  it("applies defaults and coerces scalars", () => {
    const r = validateParams(shape, { ticker: "AAPL", qty: "5" });
    expect(r.ok).toBe(true);
    expect(r.value).toMatchObject({ ticker: "AAPL", range: "3mo", qty: 5 });
  });

  it("rejects missing required and bad enums", () => {
    expect(validateParams(shape, {}).ok).toBe(false);
    expect(validateParams(shape, { ticker: "A", range: "5y" }).ok).toBe(false);
  });

  it("tolerates enum case drift, bounds arrays, rejects non-integers", () => {
    const r = validateParams(shape, { ticker: "A", range: "1MO", tags: ["a", "b", "c"] });
    expect(r.ok).toBe(true);
    expect(r.value!.range).toBe("1mo");
    expect(r.value!.tags).toEqual(["a", "b"]);
    expect(validateParams(shape, { ticker: "A", qty: 1.5 }).ok).toBe(false);
  });

  it("renders a compact manifest with required keys", () => {
    const m = shapeToManifest(shape) as { required?: string[]; properties: Record<string, unknown> };
    expect(m.required).toEqual(["ticker"]);
    expect(Object.keys(m.properties)).toContain("range");
  });
});

describe("registry", () => {
  beforeEach(() => _clearRegistry());

  it("self-registers, validates, and manifests tools", () => {
    registerTool({
      name: "t.echo", description: "echo", category: "market", permission: "read",
      parameters: { v: { type: "number", required: true } },
      execute: async (p) => ({ data: p.v }),
    });
    expect(buildManifest()).toHaveLength(1);
    expect(validateToolParams("t.echo", { v: 1 }).ok).toBe(true);
    expect(validateToolParams("t.missing", {}).errors[0]).toMatch(/unknown tool/);
  });

  it("refuses confirm tools without a preview (gate integrity)", () => {
    expect(() =>
      registerTool({
        name: "t.write", description: "w", category: "state", permission: "confirm",
        parameters: {}, execute: async () => ({ data: null }),
      }),
    ).toThrow(/confirmationPreview/);
  });

  it("discovers tools by keyword", () => {
    registerTool({
      name: "portfolio.optimize", description: "run optimizers", category: "portfolio",
      permission: "read", keywords: ["black litterman"], parameters: {},
      execute: async () => ({ data: null }),
    });
    registerTool({
      name: "market.quote", description: "live prices", category: "market",
      permission: "read", parameters: {}, execute: async () => ({ data: null }),
    });
    const hits = discoverTools("black litterman optimization");
    expect(hits[0]?.name).toBe("portfolio.optimize");
  });
});

describe("execution graph plumbing", () => {
  it("resolves nested $refs against completed results", () => {
    const results = new Map<string, ToolResult>([
      ["n1", { data: { closes: [1, 2, 3], meta: { ccy: "USD" } } }],
    ]);
    const params = {
      series: { $ref: "n1.closes" },
      label: { deep: { $ref: "n1.meta.ccy" } },
      plain: 42,
    };
    expect(resolveRefs(params, results)).toEqual({
      series: [1, 2, 3],
      label: { deep: "USD" },
      plain: 42,
    });
  });

  it("throws on refs to unknown nodes or bad paths", () => {
    const results = new Map<string, ToolResult>([["n1", { data: { a: 1 } }]]);
    expect(() => resolveRefs({ x: { $ref: "n9.a" } }, results)).toThrow(/unknown/);
    expect(() => resolveRefs({ x: { $ref: "n1.a.b.c" } }, results)).toThrow(/path miss/);
  });

  it("extracts dependencies from both after and $refs", () => {
    const deps = nodeDependencies({
      id: "n3", tool: "t", after: ["n1"],
      params: { series: { $ref: "n2.closes" }, arr: [{ $ref: "n1.x" }] },
    });
    expect(deps.sort()).toEqual(["n1", "n2"]);
  });
});

describe("numeric provenance", () => {
  it("extracts meaningful numbers, skipping years and small ordinals", () => {
    expect(extractNumbers("In 2024 the Sharpe was 1.42 across 3 assets, drawdown -18.5%"))
      .toEqual([1.42, -18.5]);
  });

  it("accepts answers whose figures trace to the ledger (incl. % duality and rounding)", () => {
    const ledger = new FactLedger();
    ledger.record({ label: "Sharpe", value: 1.4211, tool: "t" });
    ledger.record({ label: "vol", value: 0.185, tool: "t" }); // prose says 18.5%
    const check = verifyNumericProvenance("Sharpe is 1.42 with volatility near 18.5%.", ledger.all());
    expect(check.ok).toBe(true);
  });

  it("flags fabricated figures", () => {
    const ledger = new FactLedger();
    ledger.record({ label: "Sharpe", value: 1.42, tool: "t" });
    const check = verifyNumericProvenance("Sharpe is 1.42 and expected return is 27.3%.", ledger.all());
    expect(check.ok).toBe(false);
    expect(check.unsupported).toContain("27.3");
  });
});

describe("session context", () => {
  it("tracks entities and renders a compact planner context", () => {
    const s = new ForesightSession();
    s.noteUser("compare tata motors with mahindra");
    s.noteTickers(["TATAMOTORS.NS", "M&M.NS"]);
    s.noteForesight("Comparison done.", ["compare.assets"]);
    const ctx = s.toPromptContext();
    expect(ctx).toContain("TATAMOTORS.NS");
    expect(ctx).toContain("last_comparison");
    expect(ctx).toContain("compare tata motors");
  });
});

describe("research memory", () => {
  it("stores and recalls findings by entity with recency weighting", async () => {
    const { rememberFinding, searchMemory, clearMemory } = await import("./memory");
    clearMemory();
    rememberFinding({ entities: ["TATAMOTORS.NS"], text: "Sharpe 1.4, concentrated in autos." });
    rememberFinding({ entities: ["NVDA"], text: "High momentum, stretched valuation." });
    const hits = searchMemory("tata motors");
    expect(hits).toHaveLength(1);
    expect(hits[0].entities).toContain("TATAMOTORS.NS");
    clearMemory();
  });
});
