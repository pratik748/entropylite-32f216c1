/**
 * Market data tools — quotes, history, news, sentiment, symbol resolution.
 * Pure pass-throughs to existing edge functions via the governed cache.
 */

import { governedInvoke } from "@/lib/apiGovernor";
import { normalizeUserTicker } from "@/lib/ticker";
import { registerTool } from "../registry";
import { fetchHistory, round } from "./dataHub";

registerTool({
  name: "symbol.resolve",
  description: "Resolve a company name or fuzzy ticker to exact exchange symbols. Use before other tools when the user gives a company name (e.g. 'Tata Motors' → TATAMOTORS.NS).",
  category: "market",
  permission: "read",
  keywords: ["ticker", "symbol", "lookup", "company name"],
  parameters: {
    query: { type: "string", required: true, description: "Company name or partial ticker" },
  },
  execute: async (params) => {
    const { data, error, cached } = await governedInvoke("symbol-search", {
      body: { query: params.query, limit: 5 },
    });
    if (error) throw new Error(`symbol-search failed: ${error.message || error}`);
    return { data, cached, source: "symbol-search" };
  },
});

registerTool({
  name: "market.quote",
  description: "Live prices for one or more tickers.",
  category: "market",
  permission: "read",
  keywords: ["price", "quote", "last", "live"],
  parameters: {
    tickers: { type: "array", required: true, items: { type: "string" }, maxItems: 20 },
  },
  execute: async (params, ctx) => {
    const tickers = (params.tickers as string[]).map((t) => normalizeUserTicker(t) || t.toUpperCase());
    const { data, error, cached } = await governedInvoke<{ prices: Record<string, { price: number; currency?: string }> }>(
      "price-feed",
      { body: { tickers } },
    );
    if (error || !data?.prices) throw new Error(`price-feed failed: ${error?.message || "no prices"}`);
    for (const [t, p] of Object.entries(data.prices)) {
      if (p?.price > 0) {
        ctx.recordFact({ label: `${t} last price`, value: round(p.price, 4), unit: p.currency, tool: "market.quote", cached });
      }
    }
    return { data: data.prices, cached, source: "price-feed" };
  },
});

registerTool({
  name: "market.history",
  description: "Daily close history for tickers. Returns per-ticker {closes, timestamps}. Ranges: 1mo|3mo|6mo|1y|2y.",
  category: "market",
  permission: "read",
  keywords: ["historical", "chart", "series", "closes"],
  parameters: {
    tickers: { type: "array", required: true, items: { type: "string" }, maxItems: 12 },
    range: { type: "enum", values: ["1mo", "3mo", "6mo", "1y", "2y"], default: "6mo" },
  },
  execute: async (params) => {
    const { data, cached } = await fetchHistory(params.tickers as string[], params.range as string);
    return { data, cached, source: `historical-prices ${params.range}` };
  },
});

registerTool({
  name: "market.overview",
  description: "Global market overview: index levels, movers, regime signals.",
  category: "market",
  permission: "read",
  keywords: ["indices", "market", "overview", "movers", "vix"],
  parameters: {},
  execute: async () => {
    const { data, error, cached } = await governedInvoke("market-data", { body: {} });
    if (error) throw new Error(`market-data failed: ${error.message || error}`);
    return { data, cached, source: "market-data" };
  },
});

registerTool({
  name: "market.fx",
  description: "Current FX rates versus the user's base currency.",
  category: "market",
  permission: "read",
  keywords: ["currency", "fx", "exchange rate", "usd", "inr"],
  parameters: {},
  execute: async () => {
    const { data, error, cached } = await governedInvoke("fx-rates", { body: {} });
    if (error) throw new Error(`fx-rates failed: ${error.message || error}`);
    return { data, cached, source: "fx-rates" };
  },
});

registerTool({
  name: "news.fetch",
  description: "Recent news for a ticker with per-article sentiment and impact classification.",
  category: "intelligence",
  permission: "read",
  keywords: ["news", "headlines", "articles", "press"],
  parameters: {
    ticker: { type: "string", required: true },
    region: { type: "string", description: "Optional region hint" },
  },
  execute: async (params) => {
    const ticker = normalizeUserTicker(params.ticker as string) || params.ticker;
    const { data, error, cached } = await governedInvoke("fetch-news", {
      body: { ticker, region: params.region },
    });
    if (error) throw new Error(`fetch-news failed: ${error.message || error}`);
    return { data, cached, source: "fetch-news" };
  },
});

registerTool({
  name: "news.sentiment",
  description: "Aggregated sentiment intelligence for a ticker (news + social tiers, credibility-weighted).",
  category: "intelligence",
  permission: "read",
  keywords: ["sentiment", "mood", "social", "bullish", "bearish"],
  parameters: {
    ticker: { type: "string", required: true },
  },
  execute: async (params) => {
    const ticker = normalizeUserTicker(params.ticker as string) || params.ticker;
    const { data, error, cached } = await governedInvoke("sentiment-intel", { body: { ticker } });
    if (error) throw new Error(`sentiment-intel failed: ${error.message || error}`);
    return { data, cached, source: "sentiment-intel" };
  },
});
