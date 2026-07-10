/**
 * State-changing tools. Every tool here is permission="confirm": the runtime
 * stages the action and executes only after the analyst explicitly approves
 * the exact preview. This gate lives in the runtime, not in a prompt.
 */

import { registerTool } from "../registry";
import { registerWatch, unregisterWatch, upsertPrefs, fetchPrefs } from "@/lib/sentinel";
import { normalizeUserTicker } from "@/lib/ticker";
import { clearMemory } from "../memory";

registerTool({
  name: "state.add_position",
  description: "Add a position to the portfolio (persists to cloud, registers sentinel monitoring, triggers full analysis).",
  category: "state",
  permission: "confirm",
  keywords: ["add", "buy", "position", "portfolio", "track"],
  parameters: {
    ticker: { type: "string", required: true },
    buyPrice: { type: "number", required: true, min: 0.0001 },
    quantity: { type: "number", required: true, min: 0.000001 },
  },
  confirmationPreview: (p) =>
    `Add ${p.ticker} to the portfolio — ${p.quantity} @ ${p.buyPrice}`,
  execute: async (params, ctx) => {
    const ticker = normalizeUserTicker(params.ticker as string);
    if (!ticker) throw new Error(`unrecognized ticker: ${params.ticker}`);
    ctx.host.addPosition(ticker, params.buyPrice as number, params.quantity as number);
    return { data: { added: ticker }, source: "portfolio-state" };
  },
});

registerTool({
  name: "state.update_position",
  description: "Change the cost basis or quantity of an existing position.",
  category: "state",
  permission: "confirm",
  keywords: ["update", "edit", "quantity", "cost basis"],
  parameters: {
    ticker: { type: "string", required: true },
    buyPrice: { type: "number", min: 0.0001 },
    quantity: { type: "number", min: 0.000001 },
  },
  confirmationPreview: (p) => {
    const changes = [
      p.buyPrice !== undefined ? `cost basis → ${p.buyPrice}` : null,
      p.quantity !== undefined ? `quantity → ${p.quantity}` : null,
    ].filter(Boolean).join(", ");
    return `Update ${p.ticker}: ${changes || "no changes"}`;
  },
  execute: async (params, ctx) => {
    const t = (params.ticker as string).toUpperCase();
    const pos = ctx.host.getPositions().find((x) => x.ticker.toUpperCase() === t || x.ticker.toUpperCase().startsWith(t.split(".")[0]));
    if (!pos) throw new Error(`${params.ticker} is not in the portfolio`);
    ctx.host.updatePosition(pos.id, {
      buyPrice: params.buyPrice as number | undefined,
      quantity: params.quantity as number | undefined,
    });
    return { data: { updated: pos.ticker }, source: "portfolio-state" };
  },
});

registerTool({
  name: "state.close_position",
  description: "Close (remove) a portfolio position. Realizes the P&L into the trade journal and profit gradient. Irreversible.",
  category: "state",
  permission: "confirm",
  keywords: ["close", "sell", "remove", "delete", "exit"],
  parameters: {
    ticker: { type: "string", required: true },
  },
  confirmationPreview: (p) => `Close the ${p.ticker} position (removes it from the portfolio; P&L is journaled)`,
  execute: async (params, ctx) => {
    const t = (params.ticker as string).toUpperCase();
    const pos = ctx.host.getPositions().find((x) => x.ticker.toUpperCase() === t || x.ticker.toUpperCase().startsWith(t.split(".")[0]));
    if (!pos) throw new Error(`${params.ticker} is not in the portfolio`);
    ctx.host.removePosition(pos.id);
    return { data: { closed: pos.ticker }, source: "portfolio-state" };
  },
});

registerTool({
  name: "state.watch_ticker",
  description: "Register a ticker with Portfolio Sentinel for background risk monitoring and alerting (drawdown, verdict flips).",
  category: "state",
  permission: "confirm",
  keywords: ["watch", "monitor", "sentinel", "alert on"],
  parameters: {
    ticker: { type: "string", required: true },
    entryPrice: { type: "number", required: true, min: 0.0001 },
    quantity: { type: "number", default: 1, min: 0.000001 },
  },
  confirmationPreview: (p) => `Start sentinel monitoring for ${p.ticker} (entry ${p.entryPrice})`,
  execute: async (params) => {
    const ticker = normalizeUserTicker(params.ticker as string);
    if (!ticker) throw new Error(`unrecognized ticker: ${params.ticker}`);
    await registerWatch(ticker, params.entryPrice as number, params.quantity as number);
    return { data: { watching: ticker }, source: "portfolio-sentinel" };
  },
});

registerTool({
  name: "state.unwatch_ticker",
  description: "Stop Portfolio Sentinel monitoring for a ticker.",
  category: "state",
  permission: "confirm",
  keywords: ["unwatch", "stop monitoring", "remove alert"],
  parameters: {
    ticker: { type: "string", required: true },
  },
  confirmationPreview: (p) => `Stop sentinel monitoring for ${p.ticker}`,
  execute: async (params) => {
    const ticker = normalizeUserTicker(params.ticker as string) || (params.ticker as string);
    await unregisterWatch(ticker);
    return { data: { unwatched: ticker }, source: "portfolio-sentinel" };
  },
});

registerTool({
  name: "state.set_alert_prefs",
  description: "Update sentinel alert preferences: email on/off, drawdown thresholds (%), cooldown minutes.",
  category: "state",
  permission: "confirm",
  keywords: ["alert settings", "threshold", "email alerts", "preferences"],
  parameters: {
    emailEnabled: { type: "boolean" },
    drawdownPct: { type: "number", min: 1, max: 50 },
    peakDrawdownPct: { type: "number", min: 1, max: 60 },
    cooldownMinutes: { type: "number", min: 15, max: 1440, integer: true },
  },
  confirmationPreview: (p) => {
    const parts = [
      p.emailEnabled !== undefined ? `email ${p.emailEnabled ? "on" : "off"}` : null,
      p.drawdownPct !== undefined ? `drawdown threshold ${p.drawdownPct}%` : null,
      p.peakDrawdownPct !== undefined ? `peak-drawdown threshold ${p.peakDrawdownPct}%` : null,
      p.cooldownMinutes !== undefined ? `cooldown ${p.cooldownMinutes}m` : null,
    ].filter(Boolean).join(", ");
    return `Update alert preferences: ${parts || "no changes"}`;
  },
  execute: async (params) => {
    const current = await fetchPrefs();
    const next = {
      email_enabled: (params.emailEnabled as boolean | undefined) ?? current?.email_enabled ?? true,
      default_drawdown_pct: (params.drawdownPct as number | undefined) ?? current?.default_drawdown_pct ?? 8,
      default_peak_drawdown_pct: (params.peakDrawdownPct as number | undefined) ?? current?.default_peak_drawdown_pct ?? 12,
      cooldown_minutes: (params.cooldownMinutes as number | undefined) ?? current?.cooldown_minutes ?? 240,
      refresh_hours: current?.refresh_hours ?? 4,
    };
    await upsertPrefs(next);
    return { data: next, source: "portfolio-sentinel" };
  },
});

registerTool({
  name: "state.forget_research",
  description: "Erase Foresight's persistent research memory (all stored findings). Irreversible.",
  category: "state",
  permission: "confirm",
  keywords: ["forget", "clear memory", "erase", "privacy"],
  parameters: {},
  confirmationPreview: () => "Erase all stored Foresight research findings (cannot be undone)",
  execute: async () => {
    clearMemory();
    return { data: { cleared: true }, source: "foresight-memory" };
  },
});
