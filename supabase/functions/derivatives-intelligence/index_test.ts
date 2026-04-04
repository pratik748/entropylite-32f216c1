import { assertEquals, assertGreater, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateDerivativesIntelligence } from "../_shared/derivativesDeterministic.ts";

Deno.test("derivatives generator returns complete per-ticker output", () => {
  const result = generateDerivativesIntelligence({
    tickers: ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS"],
    weights: [0.4, 0.35, 0.25],
    prices: [2940, 4025, 1680],
    volatilities: [0.24, 0.2, 0.18],
    sectors: ["Energy", "Technology", "Financials"],
    baseCurrency: "INR",
    discovery_mode: true,
    news_context: "RBI unscheduled FX intervention and reserve dip increase macro caution",
    sentiment_context: "risk-off, prefer hedges and defensive rotation",
    indiaMode: true,
  });

  assertEquals(result.options_intel.length, 3);
  assertGreater(result.futures.length, 0);
  assertGreater(result.opportunities.length, 0);
  assertGreater(result.discoveries.length, 0);
  assertStringIncludes(result.neutrality.hedge_suggestions[0].reasoning, "measured");
  assertEquals(result.provider, "deterministic");
});

Deno.test("risk-off context increases hedge urgency", () => {
  const result = generateDerivativesIntelligence({
    tickers: ["AAPL", "MSFT"],
    weights: [0.55, 0.45],
    prices: [188, 421],
    volatilities: [0.26, 0.22],
    sectors: ["Technology", "Technology"],
    discovery_mode: true,
    news_context: "FX intervention, reserve drawdown, rising volatility and policy stress",
    sentiment_context: "risk-off",
  });

  assertEquals(result.market_bias, "risk_off");
  assertEquals(result.discoveries[0].urgency, "high");
  assertStringIncludes(result.neutrality.hedge_suggestions[0].instrument, "GLD");
});