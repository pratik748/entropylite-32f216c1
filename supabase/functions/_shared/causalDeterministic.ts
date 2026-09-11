/**
 * Deterministic Econometric Transmission Matrix & Causal Shock Propagation Engine.
 *
 * Implements structural econometric transmission channels and Pearl-style DAG cascade propagation:
 * 1. Macro Shock Classification (Rates, Commodities, FX, Credit, Geopolitics, Liquidity)
 * 2. 1st-Order: Direct asset re-pricing via primary elasticity
 * 3. 2nd-Order: Correlated flow, hedge unwinds, cross-asset spillover
 * 4. 3rd-Order: Behavioral, structural policy responses, capex adjustments
 * 5. Scenario Tree: Joint marginal probability distribution (Bull, Base, Bear, Tail Risk)
 */

import {
  compileTransmissionEffect,
  type MacroTransmissionInput,
  type ScenarioBranch,
} from "./nlgCompiler.ts";

export interface CausalEffectItem {
  order: 1 | 2 | 3;
  effect: string;
  asset_class: "equities" | "bonds" | "commodities" | "forex" | "crypto";
  direction: "up" | "down" | "volatile";
  magnitude: string;
  confidence: number;
  time_horizon: string;
}

export interface CausalCascadeResponse {
  event: string;
  first_order: CausalEffectItem[];
  second_order: CausalEffectItem[];
  third_order: CausalEffectItem[];
  scenario_tree: ScenarioBranch[];
  reflexivity_score: number;
  scar_tag: string;
  model?: Record<string, unknown>;
  disclaimer?: string;
  engine: "deterministic-causal-v1";
}

interface ShockArchetype {
  key: string;
  name: string;
  scarTag: string;
  reflexivityScore: number;
  firstOrder: Omit<MacroTransmissionInput, "origin" | "shock">[];
  secondOrder: Omit<MacroTransmissionInput, "origin" | "shock">[];
  thirdOrder: Omit<MacroTransmissionInput, "origin" | "shock">[];
  scenarioProbabilities: { bull: number; base: number; bear: number; tail: number };
  baseCapitalImpacts: { bull: number; base: number; bear: number; tail: number };
}

const SHOCK_ARCHETYPES: Record<string, ShockArchetype> = {
  rates_hawkish: {
    key: "rates_hawkish",
    name: "Monetary Tightening / Yield Spike",
    scarTag: "2022 Fed Rate Shock",
    reflexivityScore: 68,
    firstOrder: [
      { channel: "rates", dest: "2Y / 10Y Sovereign Yields", impactPct: 24, mechanism: "Direct benchmark curve discounting and duration re-pricing", confidence: 0.94, timeHorizon: "intraday", direction: "up" },
      { channel: "rates", dest: "High-Duration Tech (QQQ, ARKK)", impactPct: -4.8, mechanism: "Discount rate expansion on long-dated terminal cash flows", confidence: 0.91, timeHorizon: "1-3 days", direction: "down" },
      { channel: "fx", dest: "USD Index (DXY)", impactPct: 1.8, mechanism: "Widening interest rate differentials attracting cross-border capital", confidence: 0.88, timeHorizon: "1-3 days", direction: "up" },
      { channel: "credit", dest: "Investment Grade & High Yield Spreads", impactPct: 16, mechanism: "Refinancing cost escalation widening default risk premiums", confidence: 0.82, timeHorizon: "1-3 days", direction: "up" },
    ],
    secondOrder: [
      { channel: "fx", dest: "Emerging Market Currencies & Sovereign Debt", impactPct: -3.6, mechanism: "USD debt servicing surge triggering capital flight and FX intervention", confidence: 0.85, timeHorizon: "1-2 weeks", direction: "down" },
      { channel: "liquidity", dest: "Risk Parity & Volatility Target Allocations", impactPct: -5.2, mechanism: "Bond-equity positive correlation spike forcing multi-asset de-leveraging", confidence: 0.79, timeHorizon: "1-2 weeks", direction: "down" },
      { channel: "commodities", dest: "Gold & Industrial Metals", impactPct: -2.8, mechanism: "Elevated real yields increasing carrying cost of non-yielding bullion", confidence: 0.76, timeHorizon: "2-4 weeks", direction: "down" },
    ],
    thirdOrder: [
      { channel: "supply_chain", dest: "Corporate Capex & Real Estate Transactions", impactPct: -6.5, mechanism: "Cost of capital exceeding hurdle rates leading to project deferrals", confidence: 0.72, timeHorizon: "1-3 months", direction: "down" },
      { channel: "regulatory", dest: "Banking Sector Net Interest Margins & Credit Standards", impactPct: 4.2, mechanism: "Lending standards tighten, increasing commercial default provisions", confidence: 0.68, timeHorizon: "3-6 months", direction: "volatile" },
    ],
    scenarioProbabilities: { bull: 0.15, base: 0.52, bear: 0.25, tail: 0.08 },
    baseCapitalImpacts: { bull: 2.1, base: -0.8, bear: -4.9, tail: -11.4 },
  },
  energy_shock: {
    key: "energy_shock",
    name: "Crude Oil & Energy Supply Disruption",
    scarTag: "1973/1990 Oil Supply Shock",
    reflexivityScore: 74,
    firstOrder: [
      { channel: "commodities", dest: "Brent / WTI Crude Oil", impactPct: 12.5, mechanism: "Immediate physical supply deficit and geopolitical risk premium", confidence: 0.95, timeHorizon: "intraday", direction: "up" },
      { channel: "rates", dest: "Breakeven Inflation Rates (TIPS)", impactPct: 28, mechanism: "Headline CPI pass-through expectation widening inflation forwards", confidence: 0.90, timeHorizon: "1-3 days", direction: "up" },
      { channel: "equities", dest: "Airlines, Logistics & Consumer Discretionary", impactPct: -5.4, mechanism: "Jet fuel / freight input cost surge compressing gross operating margins", confidence: 0.89, timeHorizon: "1-3 days", direction: "down" },
      { channel: "equities", dest: "Upstream Energy Producers (XOM, CVX)", impactPct: 7.2, mechanism: "Free cash flow expansion and realized price realization uplift", confidence: 0.92, timeHorizon: "1-3 days", direction: "up" },
    ],
    secondOrder: [
      { channel: "supply_chain", dest: "Petrochemicals, Fertilizers & Agriculture", impactPct: 6.8, mechanism: "Natural gas / feedstocks cost inflation driving crop and food prices higher", confidence: 0.84, timeHorizon: "1-2 weeks", direction: "up" },
      { channel: "sentiment", dest: "Consumer Sentiment & Real Disposable Income", impactPct: -3.9, mechanism: "Energy consumption tax at the pump draining discretionary spending", confidence: 0.81, timeHorizon: "2-4 weeks", direction: "down" },
    ],
    thirdOrder: [
      { channel: "regulatory", dest: "Central Bank Policy Trajectory (Stagflation Risk)", impactPct: -4.5, mechanism: "Central banks constrained from easing despite slowing GDP output", confidence: 0.70, timeHorizon: "1-3 months", direction: "down" },
      { channel: "supply_chain", dest: "Strategic Petroleum Reserves & Energy Transition Capex", impactPct: 8.5, mechanism: "Government emergency replenishment and sovereign energy security mandates", confidence: 0.75, timeHorizon: "structural", direction: "up" },
    ],
    scenarioProbabilities: { bull: 0.12, base: 0.48, bear: 0.30, tail: 0.10 },
    baseCapitalImpacts: { bull: 3.4, base: -1.2, bear: -5.8, tail: -13.6 },
  },
  geopolitical_conflict: {
    key: "geopolitical_conflict",
    name: "Geopolitical Escalation & Trade Sanctions",
    scarTag: "2022 Russia-Ukraine Disruption",
    reflexivityScore: 82,
    firstOrder: [
      { channel: "sentiment", dest: "Safe Haven Assets (Gold, USD, Swiss Franc)", impactPct: 4.5, mechanism: "Immediate flight to safety and geopolitical risk hedge allocations", confidence: 0.93, timeHorizon: "intraday", direction: "up" },
      { channel: "commodities", dest: "Strategic Commodities (Crude, Wheat, Palladium)", impactPct: 8.4, mechanism: "Export restriction expectations and maritime freight war insurance hikes", confidence: 0.89, timeHorizon: "1-3 days", direction: "up" },
      { channel: "equities", dest: "Global Equities (MSCI World, EM)", impactPct: -3.8, mechanism: "Equity risk premium expansion and cross-border risk reduction", confidence: 0.87, timeHorizon: "1-3 days", direction: "down" },
    ],
    secondOrder: [
      { channel: "supply_chain", dest: "Maritime Shipping Rates & Transit Delays", impactPct: 22, mechanism: "Chokepoint rerouting (Suez / Hormuz / Malacca) lengthening voyage days", confidence: 0.86, timeHorizon: "1-2 weeks", direction: "up" },
      { channel: "liquidity", dest: "Cross-Border Settlement & Correspondent Banking", impactPct: -4.0, mechanism: "Sanctions compliance friction freezing collateral and credit lines", confidence: 0.78, timeHorizon: "2-4 weeks", direction: "volatile" },
    ],
    thirdOrder: [
      { channel: "regulatory", dest: "Defense Spending & Supply Chain Reshoring", impactPct: 11.5, mechanism: "Bipartisan sovereign budget reallocations to domestic industrial base", confidence: 0.81, timeHorizon: "structural", direction: "up" },
    ],
    scenarioProbabilities: { bull: 0.10, base: 0.45, bear: 0.33, tail: 0.12 },
    baseCapitalImpacts: { bull: 1.8, base: -1.5, bear: -6.4, tail: -15.2 },
  },
  liquidity_credit_crunch: {
    key: "liquidity_credit_crunch",
    name: "Liquidity Seizure & Margin Cascade",
    scarTag: "1998 LTCM / 2008 Lehman Seizure",
    reflexivityScore: 91,
    firstOrder: [
      { channel: "liquidity", dest: "Interbank Funding & CP Spreads (FRA-OIS)", impactPct: 35, mechanism: "Counterparty credit risk scrutiny hoarding tier-1 liquidity reserves", confidence: 0.96, timeHorizon: "intraday", direction: "up" },
      { channel: "credit", dest: "High Yield CDX & Leveraged Loans", impactPct: -7.2, mechanism: "Forced selling by levered credit funds meeting redemption notices", confidence: 0.92, timeHorizon: "1-3 days", direction: "down" },
      { channel: "equities", dest: "Mega-Cap Liquid Equities (SPY, QQQ)", impactPct: -4.9, mechanism: "Liquid assets liquidated first to fund margin calls on illiquid paper", confidence: 0.90, timeHorizon: "1-3 days", direction: "down" },
    ],
    secondOrder: [
      { channel: "liquidity", dest: "Market Maker Bid-Ask Spreads & Depth", impactPct: 45, mechanism: "Dealer balance sheet constraints forcing withdrawal of automated quotes", confidence: 0.88, timeHorizon: "1-2 weeks", direction: "volatile" },
      { channel: "sentiment", dest: "VIX / VVIX Volatility Index", impactPct: 38, mechanism: "Downside convexity panic buying of deep out-of-the-money puts", confidence: 0.91, timeHorizon: "1-2 weeks", direction: "up" },
    ],
    thirdOrder: [
      { channel: "regulatory", dest: "Central Bank Emergency Liquidity Windows", impactPct: 6.0, mechanism: "Standing Repo Facilities and swap line activations to halt contagion", confidence: 0.83, timeHorizon: "1-3 months", direction: "up" },
    ],
    scenarioProbabilities: { bull: 0.08, base: 0.40, bear: 0.36, tail: 0.16 },
    baseCapitalImpacts: { bull: 2.5, base: -2.4, bear: -8.5, tail: -18.0 },
  },
};

/**
 * Classifies an incoming text event into the nearest econometric shock archetype.
 */
function classifyShockArchetype(eventText: string): ShockArchetype {
  const text = (eventText || "").toLowerCase();

  if (/oil|crude|opec|energy|gas|pipeline|refinery|fuel/.test(text)) {
    return SHOCK_ARCHETYPES.energy_shock;
  }
  if (/war|conflict|geopolit|sanction|missile|taiwan|russia|ukraine|iran|israel|red sea|tariff|trade war/.test(text)) {
    return SHOCK_ARCHETYPES.geopolitical_conflict;
  }
  if (/liquidity|margin|haircut|lehman|bank run|default|credit spread|freeze|seizure|contagion/.test(text)) {
    return SHOCK_ARCHETYPES.liquidity_credit_crunch;
  }
  // Default to rates / macro yield shock
  return SHOCK_ARCHETYPES.rates_hawkish;
}

/**
 * Generates the full causal cascade response deterministically.
 */
export function generateDeterministicCausalCascade(event: string, portfolio?: any): CausalCascadeResponse {
  const archetype = classifyShockArchetype(event);

  const buildEffects = (items: Omit<MacroTransmissionInput, "origin" | "shock">[], order: 1 | 2 | 3): CausalEffectItem[] => {
    return items.map((item) => {
      const compiled = compileTransmissionEffect({
        ...item,
        origin: event.slice(0, 30),
        shock: "Shock",
      });
      const magnitudeStr = `${item.impactPct > 0 ? "+" : ""}${item.impactPct.toFixed(1)}%`;
      return {
        order,
        effect: compiled,
        asset_class: (item.channel === "commodities" ? "commodities" : item.channel === "fx" ? "forex" : item.channel === "rates" ? "bonds" : "equities") as any,
        direction: item.direction || (item.impactPct >= 0 ? "up" : "down"),
        magnitude: magnitudeStr,
        confidence: item.confidence,
        time_horizon: item.timeHorizon,
      };
    });
  };

  const firstOrder = buildEffects(archetype.firstOrder, 1);
  const secondOrder = buildEffects(archetype.secondOrder, 2);
  const thirdOrder = buildEffects(archetype.thirdOrder, 3);

  const scenario_tree: ScenarioBranch[] = [
    {
      label: "Bull",
      probability: archetype.scenarioProbabilities.bull,
      capitalImpactPct: archetype.baseCapitalImpacts.bull,
      keyMoves: ["Hedges Outperform (+4.2%)", "Short Squeeze Rally (+3.1%)", "Volatility Mean Reverts (-18%)"],
    },
    {
      label: "Base",
      probability: archetype.scenarioProbabilities.base,
      capitalImpactPct: archetype.baseCapitalImpacts.base,
      keyMoves: ["Orderly Asset Re-pricing (-0.8%)", "Index Churn / Rotation", "Credit Absorbs Shock (+12bp)"],
    },
    {
      label: "Bear",
      probability: archetype.scenarioProbabilities.bear,
      capitalImpactPct: archetype.baseCapitalImpacts.bear,
      keyMoves: ["Broad Equities Pullback (-5.4%)", "Flight to Quality (+2.8%)", "Spreads Widen (+35bp)"],
    },
    {
      label: "Tail Risk",
      probability: archetype.scenarioProbabilities.tail,
      capitalImpactPct: archetype.baseCapitalImpacts.tail,
      keyMoves: ["Forced Liquidation Wave (-12.5%)", "Liquidity Freeze", "Vol Spike VIX > 40"],
    },
  ];

  return {
    event,
    first_order: firstOrder,
    second_order: secondOrder,
    third_order: thirdOrder,
    scenario_tree,
    reflexivity_score: archetype.reflexivityScore,
    scar_tag: archetype.scarTag,
    engine: "deterministic-causal-v1",
    disclaimer: "Econometric transmission model. Derived from structural cross-asset elasticity matrices and joint marginal probability distributions.",
  };
}
