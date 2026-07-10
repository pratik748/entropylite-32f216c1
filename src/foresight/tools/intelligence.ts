/**
 * Intelligence tools — the platform's AI/analytical edge functions exposed
 * to the planner. Each is a governed pass-through; the heavy cache tiers in
 * apiGovernor (30 min for `heavy`) make repeated invocations free.
 */

import { governedInvoke } from "@/lib/apiGovernor";
import { normalizeUserTicker } from "@/lib/ticker";
import { registerTool } from "../registry";
import { positionWeights, round } from "./dataHub";

registerTool({
  name: "intel.analyze_stock",
  description: "Full single-stock analysis: verdict (BUY/HOLD/SELL), confidence, Monte-Carlo bull/bear ranges, news pressure, key risks. The platform's flagship per-asset engine.",
  category: "intelligence",
  permission: "read",
  keywords: ["analyze", "verdict", "buy", "sell", "hold", "recommendation", "stock"],
  parameters: {
    ticker: { type: "string", required: true },
    buyPrice: { type: "number", description: "Entry price if held; defaults to current price context" },
    quantity: { type: "number", default: 1 },
  },
  execute: async (params, ctx) => {
    const ticker = normalizeUserTicker(params.ticker as string) || (params.ticker as string).toUpperCase();
    const held = ctx.host.getPositions().find((p) => p.ticker === ticker);
    const body = {
      ticker,
      buyPrice: (params.buyPrice as number) ?? held?.buyPrice ?? 0,
      quantity: (params.quantity as number) ?? held?.quantity ?? 1,
    };
    const { data, error, cached } = await governedInvoke("analyze-stock", { body });
    if (error) throw new Error(`analyze-stock failed: ${error.message || error}`);
    if (typeof data?.currentPrice === "number") {
      ctx.recordFact({ label: `${ticker} current price`, value: round(data.currentPrice, 4), unit: data.currency, tool: "intel.analyze_stock", cached });
    }
    if (typeof data?.confidence === "number") {
      ctx.recordFact({ label: `${ticker} verdict ${data.suggestion || ""}`.trim(), value: `${data.suggestion} @ ${data.confidence}% confidence`, tool: "intel.analyze_stock", cached });
      ctx.recordFact({ label: `${ticker} verdict confidence`, value: data.confidence, unit: "%", tool: "intel.analyze_stock", cached });
    }
    if (Array.isArray(data?.bullRange) && data.bullRange.length === 2) {
      ctx.recordFact({ label: `${ticker} bull range low`, value: round(Number(data.bullRange[0]), 2), tool: "intel.analyze_stock", cached });
      ctx.recordFact({ label: `${ticker} bull range high`, value: round(Number(data.bullRange[1]), 2), tool: "intel.analyze_stock", cached });
    }
    if (Array.isArray(data?.bearRange) && data.bearRange.length === 2) {
      ctx.recordFact({ label: `${ticker} bear range low`, value: round(Number(data.bearRange[0]), 2), tool: "intel.analyze_stock", cached });
      ctx.recordFact({ label: `${ticker} bear range high`, value: round(Number(data.bearRange[1]), 2), tool: "intel.analyze_stock", cached });
    }
    return { data, cached, source: "analyze-stock" };
  },
});

registerTool({
  name: "intel.company",
  description: "Deep company intelligence: business model, moat, financial posture, catalysts, risks.",
  category: "intelligence",
  permission: "read",
  keywords: ["company", "fundamentals", "business", "moat", "profile"],
  parameters: { ticker: { type: "string", required: true } },
  execute: async (params) => {
    const ticker = normalizeUserTicker(params.ticker as string) || params.ticker;
    const { data, error, cached } = await governedInvoke("company-intelligence", { body: { ticker } });
    if (error) throw new Error(`company-intelligence failed: ${error.message || error}`);
    return { data, cached, source: "company-intelligence" };
  },
});

registerTool({
  name: "intel.macro",
  description: "Macro regime intelligence: rates, inflation, growth, positioning implications.",
  category: "intelligence",
  permission: "read",
  keywords: ["macro", "rates", "inflation", "fed", "economy", "regime"],
  parameters: {},
  execute: async () => {
    const { data, error, cached } = await governedInvoke("macro-intelligence", { body: {} });
    if (error) throw new Error(`macro-intelligence failed: ${error.message || error}`);
    return { data, cached, source: "macro-intelligence" };
  },
});

registerTool({
  name: "intel.geopolitical",
  description: "Live geopolitical event map with per-region intensity and ticker-level threat exposure.",
  category: "intelligence",
  permission: "read",
  keywords: ["geopolitical", "war", "conflict", "sanctions", "geo"],
  parameters: {},
  execute: async () => {
    const { data, error, cached } = await governedInvoke("geopolitical-data", { body: {} });
    if (error) throw new Error(`geopolitical-data failed: ${error.message || error}`);
    return { data, cached, source: "geopolitical-data" };
  },
});

registerTool({
  name: "intel.causal_effects",
  description: "Causal cascade of a hypothetical or live event through asset classes: 1st/2nd/3rd-order effects with transmission channels and a probability-weighted scenario tree. Use for 'what happens if X'.",
  category: "intelligence",
  permission: "read",
  keywords: ["causal", "cascade", "event", "what if", "shock", "propagation", "scenario"],
  parameters: {
    event: { type: "string", required: true, description: "The event, e.g. 'crude oil reaches $120'" },
  },
  execute: async (params, ctx) => {
    const positions = ctx.host.getPositions();
    const portfolio = positions.map((p) => p.ticker).join(", ") || undefined;
    const { data, error, cached } = await governedInvoke("causal-effects", {
      body: { event: params.event, portfolio },
    });
    if (error) throw new Error(`causal-effects failed: ${error.message || error}`);
    return { data, cached, source: "causal-effects", caveats: ["model-derived scenario tree — probabilistic, not a forecast"] };
  },
});

registerTool({
  name: "intel.monte_carlo",
  description: "Portfolio-level Monte Carlo simulation: outcome distribution, scenario paths, tail statistics.",
  category: "simulation",
  permission: "read",
  keywords: ["monte carlo", "simulation", "paths", "distribution", "probability"],
  parameters: {
    scenario: { type: "string", description: "Optional scenario tilt, e.g. 'rates +100bp'" },
  },
  execute: async (params, ctx) => {
    const positions = ctx.host.getPositions();
    if (positions.length === 0) throw new Error("The portfolio is empty — nothing to simulate.");
    const { totalValue } = positionWeights(positions);
    const portfolio = positions.map((p) => ({
      ticker: p.ticker, quantity: p.quantity, buyPrice: p.buyPrice,
      currentPrice: p.currentPrice ?? p.buyPrice,
    }));
    const { data, error, cached } = await governedInvoke("monte-carlo-intelligence", {
      body: { portfolio, totalValue, scenario: params.scenario },
    });
    if (error) throw new Error(`monte-carlo-intelligence failed: ${error.message || error}`);
    return { data, cached, source: "monte-carlo-intelligence" };
  },
});

registerTool({
  name: "intel.portfolio",
  description: "Holistic AI portfolio review: structural strengths/weaknesses, positioning advice grounded in current holdings.",
  category: "intelligence",
  permission: "read",
  keywords: ["portfolio review", "advice", "assessment", "health"],
  parameters: {},
  execute: async (params, ctx) => {
    const positions = ctx.host.getPositions();
    if (positions.length === 0) throw new Error("The portfolio is empty.");
    const { totalValue } = positionWeights(positions);
    const portfolio = positions.map((p) => ({
      ticker: p.ticker, quantity: p.quantity, buyPrice: p.buyPrice,
      currentPrice: p.currentPrice ?? p.buyPrice,
    }));
    const { data, error, cached } = await governedInvoke("portfolio-intelligence", {
      body: { portfolio, totalValue },
    });
    if (error) throw new Error(`portfolio-intelligence failed: ${error.message || error}`);
    return { data, cached, source: "portfolio-intelligence" };
  },
});

registerTool({
  name: "intel.brief",
  description: "The Entropy Brief — a synthesized daily digest of the portfolio: what moved, what needs attention, verdict changes.",
  category: "intelligence",
  permission: "read",
  keywords: ["brief", "digest", "summary", "daily", "morning"],
  parameters: {},
  execute: async (params, ctx) => {
    const positions = ctx.host.getPositions();
    const portfolio = positions.map((p) => {
      const last = p.currentPrice ?? p.buyPrice;
      const a = (p.analysis || {}) as Record<string, unknown>;
      return {
        ticker: p.ticker,
        pnlPct: p.buyPrice > 0 ? ((last - p.buyPrice) / p.buyPrice) * 100 : 0,
        currentPrice: last, buyPrice: p.buyPrice,
        suggestion: (a.suggestion as string) || "HOLD",
        confidence: (a.confidence as number) || 0,
      };
    });
    const { data, error, cached } = await governedInvoke("entropy-brief", { body: { portfolio } });
    if (error) throw new Error(`entropy-brief failed: ${error.message || error}`);
    return { data, cached, source: "entropy-brief" };
  },
});

registerTool({
  name: "discover.assets",
  description: "Desirable Assets discovery engine: screened, multi-gate opportunity zones with edge statistics.",
  category: "discovery",
  permission: "read",
  keywords: ["discover", "opportunities", "ideas", "screen", "desirable"],
  parameters: {},
  execute: async () => {
    const { data, error, cached } = await governedInvoke("desirable-assets", { body: {} });
    if (error) throw new Error(`desirable-assets failed: ${error.message || error}`);
    return { data, cached, source: "desirable-assets" };
  },
});

registerTool({
  name: "intel.filings",
  description: "Recent SEC/regulatory filings intelligence for a ticker.",
  category: "intelligence",
  permission: "read",
  keywords: ["sec", "filings", "10-k", "insider", "regulatory"],
  parameters: { ticker: { type: "string", required: true } },
  execute: async (params) => {
    const ticker = normalizeUserTicker(params.ticker as string) || params.ticker;
    const { data, error, cached } = await governedInvoke("sec-filings", { body: { ticker } });
    if (error) throw new Error(`sec-filings failed: ${error.message || error}`);
    return { data, cached, source: "sec-filings" };
  },
});

registerTool({
  name: "knowledge.query",
  description: "Query the TWRD truth base for a scored claim: subject + relation (+ optional object). Returns the platform's credibility-weighted truth score for that claim.",
  category: "intelligence",
  permission: "read",
  keywords: ["truth", "claim", "knowledge", "twrd", "verify claim"],
  parameters: {
    subject: { type: "string", required: true },
    relation: { type: "string", required: true },
    object: { type: "string" },
  },
  execute: async (params, ctx) => {
    const { data, error, cached } = await governedInvoke("twrd-query", {
      body: { subject: params.subject, relation: params.relation, object: params.object },
    });
    if (error) throw new Error(`twrd-query failed: ${error.message || error}`);
    if (typeof data?.truth === "number") {
      ctx.recordFact({ label: `truth score: ${params.subject} ${params.relation} ${params.object || ""}`.trim(), value: round(data.truth, 3), tool: "knowledge.query", cached });
    }
    return { data, cached, source: "twrd-query" };
  },
});
