/**
 * UI operating tools — Foresight drives the terminal instead of describing
 * it. All effects go through the typed UI bus; components own the actual
 * state transitions.
 */

import { registerTool } from "../registry";
import { emitUIEvent, listTargets, type WorkbenchCard } from "../uiBus";

const TABS = ["dashboard", "market", "geopolitical", "desirable", "sandbox", "statarb", "augment", "risk", "fortress"] as const;

const AUGMENT_MODULES = [
  "portfolio", "returns", "benchmark", "riskmodel", "stress", "oms", "trade", "data",
  "compliance", "multiasset", "valuation", "hedging", "exposure", "client", "esg", "workflow",
] as const;

registerTool({
  name: "ui.navigate",
  description: "Switch the terminal to a workspace tab: dashboard (Desk), market (Markets), geopolitical (Geo), desirable (Discover), sandbox, statarb (Stat Arb), augment (institutional modules), risk (Risk), fortress.",
  category: "ui",
  permission: "read",
  keywords: ["open", "go to", "navigate", "show", "screen", "tab"],
  parameters: {
    tab: { type: "enum", required: true, values: TABS },
  },
  execute: async (params) => {
    const delivered = emitUIEvent("navigate", { tab: params.tab as string });
    if (!delivered) throw new Error("terminal not mounted — navigation unavailable");
    return { data: { navigated: params.tab }, source: "ui" };
  },
});

registerTool({
  name: "ui.open_module",
  description: "Open a specific Augment institutional module (switches to the augment tab first): portfolio construction, returns estimate, benchmark, risk modeling, stress testing, OMS, trade lifecycle, data, compliance, multi-asset, valuation, hedging, exposure, client reporting, esg, workflow.",
  category: "ui",
  permission: "read",
  keywords: ["module", "augment", "stress module", "hedging", "valuation", "exposure"],
  parameters: {
    moduleId: { type: "enum", required: true, values: AUGMENT_MODULES },
  },
  execute: async (params) => {
    emitUIEvent("navigate", { tab: "augment" });
    const delivered = emitUIEvent("open_module", { moduleId: params.moduleId as string });
    if (!delivered) throw new Error("augment dashboard not mounted");
    return { data: { opened: params.moduleId }, source: "ui" };
  },
});

registerTool({
  name: "ui.focus_position",
  description: "Focus a portfolio position on the Desk (dashboard) so its full analysis, Monte-Carlo chart and news are visible. Pass the position ticker.",
  category: "ui",
  permission: "read",
  keywords: ["focus", "select", "show position", "open stock"],
  parameters: {
    ticker: { type: "string", required: true },
  },
  execute: async (params, ctx) => {
    const t = (params.ticker as string).toUpperCase();
    const pos = ctx.host.getPositions().find((p) => p.ticker.toUpperCase() === t || p.ticker.toUpperCase().startsWith(t.split(".")[0]));
    if (!pos) throw new Error(`${params.ticker} is not in the portfolio`);
    emitUIEvent("navigate", { tab: "dashboard" });
    emitUIEvent("set_active_stock", { positionId: pos.id });
    return { data: { focused: pos.ticker }, source: "ui" };
  },
});

registerTool({
  name: "ui.highlight",
  description: "Draw the analyst's attention to a mounted interface region (spotlight + note). Only target ids currently listed in ui.targets exist.",
  category: "ui",
  permission: "read",
  keywords: ["highlight", "spotlight", "point", "attention", "evidence"],
  parameters: {
    targetId: { type: "string", required: true },
    note: { type: "string", maxLength: 140, description: "One-line caption shown beside the highlight" },
  },
  execute: async (params) => {
    const exists = listTargets().some((t) => t.id === params.targetId);
    if (!exists) throw new Error(`no mounted target: ${params.targetId}`);
    emitUIEvent("highlight", { targetId: params.targetId as string, note: params.note as string | undefined });
    return { data: { highlighted: params.targetId }, source: "ui" };
  },
});

registerTool({
  name: "ui.workbench_pin",
  description: "Pin a structured result card into the Foresight workbench — a temporary workspace beside the conversation. Use for tables (weights, comparisons) and metric sets the analyst should keep in view. body for kind=table: {columns:[...], rows:[[...]]}; kind=metrics: {items:[{label, value, unit?}]}; kind=text: {text}.",
  category: "ui",
  permission: "read",
  keywords: ["pin", "workbench", "workspace", "keep", "card", "table"],
  parameters: {
    title: { type: "string", required: true, maxLength: 80 },
    kind: { type: "enum", required: true, values: ["metrics", "table", "text"] },
    body: { type: "object", required: true, properties: {}, open: true },
    source: { type: "string", description: "Which tool produced the data", default: "foresight" },
  },
  execute: async (params) => {
    const card: WorkbenchCard = {
      id: crypto.randomUUID(),
      title: params.title as string,
      kind: params.kind as WorkbenchCard["kind"],
      body: params.body,
      source: (params.source as string) || "foresight",
      createdAt: Date.now(),
    };
    emitUIEvent("workbench_pin", { card });
    return { data: { pinned: card.id, title: card.title }, source: "ui" };
  },
});

registerTool({
  name: "ui.workbench_clear",
  description: "Clear all pinned cards from the Foresight workbench.",
  category: "ui",
  permission: "read",
  keywords: ["clear", "workbench", "reset workspace"],
  parameters: {},
  execute: async () => {
    emitUIEvent("workbench_clear", {});
    return { data: { cleared: true }, source: "ui" };
  },
});
