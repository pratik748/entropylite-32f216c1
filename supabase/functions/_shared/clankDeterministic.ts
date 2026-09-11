/**
 * Deterministic Mechanical Constraint (CLANK) Detection Engine.
 *
 * Evaluates structural market mechanics that create non-negotiable, programmatic order flow:
 * 1. Volatility Targeting Funds (de-leveraging threshold triggers)
 * 2. CTA Trend Following triggers (moving average momentum breaks)
 * 3. Options Dealer Gamma Hedging (gamma flip levels)
 * 4. Index & ETF Rebalance flows (calendar and market cap drift)
 * 5. Margin Call & Liquidity Cascades
 */

import { compileConstraintReasoning } from "./nlgCompiler.ts";

export interface DetectedConstraint {
  id: "vol_control" | "cta_trend" | "gamma_exp" | "index_rebal" | "etf_arb" | "pension" | "margin" | "liquidity";
  name: string;
  status: "critical" | "active" | "approaching" | "watching" | "dormant";
  activation_probability: number;
  estimated_forced_volume_bn: number;
  direction: "SELL" | "BUY" | "REBALANCE" | "HEDGE";
  affected_tickers: string[];
  trigger_condition: string;
  time_horizon: "immediate" | "days" | "weeks";
  cascade_risk: "none" | "low" | "medium" | "high";
  ai_reasoning: string;
}

export interface ClankDetectionResponse {
  constraints: DetectedConstraint[];
  aggregate_pressure_score: number;
  cascade_sequence: {
    order: number;
    constraint: string;
    triggers: string;
    estimated_price_impact_pct: number;
  }[];
  meta: {
    model_confidence: number;
    analysis_depth: string;
    engine: "deterministic-clank-v1";
  };
  timestamp: number;
  provider: "deterministic";
}

export function detectConstraintsDeterministically(opts: {
  portfolio?: any[];
  vix?: number;
  regime?: string;
}): ClankDetectionResponse {
  const vix = typeof opts.vix === "number" && opts.vix > 0 ? opts.vix : 18.5;
  const portfolioTickers = Array.isArray(opts.portfolio)
    ? opts.portfolio.map((p) => (typeof p === "string" ? p : p?.symbol || p?.ticker)).filter(Boolean)
    : ["SPY", "QQQ", "AAPL", "NVDA", "MSFT"];

  const constraints: DetectedConstraint[] = [];

  // 1. Volatility Control Funds
  // Target vol = 10-12%. As VIX rises above 20, forced selling accelerates exponentially.
  const volDeleverage = Math.max(0, 1 - (12 / Math.max(12, vix)));
  const volStatus = vix >= 28 ? "critical" : vix >= 22 ? "active" : vix >= 18 ? "approaching" : "dormant";
  const volVolume = vix >= 28 ? 85.0 : vix >= 22 ? 45.0 : vix >= 18 ? 18.0 : 4.0;
  const volProb = Math.min(0.98, Math.max(0.1, (vix - 12) / 25));

  constraints.push({
    id: "vol_control",
    name: "Volatility Targeting Funds De-risking",
    status: volStatus,
    activation_probability: Number(volProb.toFixed(2)),
    estimated_forced_volume_bn: volVolume,
    direction: "SELL",
    affected_tickers: ["SPY", "QQQ", "IWM", ...portfolioTickers.slice(0, 3)],
    trigger_condition: `VIX current at ${vix.toFixed(1)} vs 20.0 allocation hurdle`,
    time_horizon: vix >= 25 ? "immediate" : "days",
    cascade_risk: vix >= 25 ? "high" : vix >= 20 ? "medium" : "low",
    ai_reasoning: compileConstraintReasoning({
      name: "Volatility Targeting Funds De-risking",
      status: volStatus,
      forcedVolumeBn: volVolume,
      direction: "SELL",
      triggerCondition: `VIX at ${vix.toFixed(1)} triggering target-vol de-leveraging`,
      affectedTickers: ["SPY", "QQQ", ...portfolioTickers.slice(0, 2)],
      cascadeRisk: vix >= 25 ? "high" : "medium",
      timeHorizon: vix >= 25 ? "immediate" : "days",
    }),
  });

  // 2. CTA Trend Triggers
  const ctaStatus = opts.regime === "CRISIS" || vix > 26 ? "critical" : opts.regime === "BEAR" ? "active" : "watching";
  const ctaVolume = ctaStatus === "critical" ? 55.0 : ctaStatus === "active" ? 30.0 : 12.0;
  const ctaProb = ctaStatus === "critical" ? 0.92 : ctaStatus === "active" ? 0.74 : 0.40;

  constraints.push({
    id: "cta_trend",
    name: "CTA Trend-Following Stop & Reversal",
    status: ctaStatus,
    activation_probability: ctaProb,
    estimated_forced_volume_bn: ctaVolume,
    direction: ctaStatus === "critical" || ctaStatus === "active" ? "SELL" : "REBALANCE",
    affected_tickers: ["ES", "NQ", "SPY", ...portfolioTickers.slice(0, 3)],
    trigger_condition: "50-day / 200-day moving average momentum breakdown thresholds",
    time_horizon: "days",
    cascade_risk: ctaStatus === "critical" ? "high" : "medium",
    ai_reasoning: compileConstraintReasoning({
      name: "CTA Trend-Following Momentum Thresholds",
      status: ctaStatus,
      forcedVolumeBn: ctaVolume,
      direction: ctaStatus === "critical" || ctaStatus === "active" ? "SELL" : "REBALANCE",
      triggerCondition: "Price action crossing short-to-medium term momentum bounds",
      affectedTickers: ["ES", "NQ", "SPY"],
      cascadeRisk: ctaStatus === "critical" ? "high" : "medium",
      timeHorizon: "days",
    }),
  });

  // 3. Dealer Gamma Exposure
  const gammaNegative = vix > 21;
  const gammaStatus = vix >= 25 ? "critical" : vix >= 20 ? "active" : "dormant";
  const gammaVolume = vix >= 25 ? 38.0 : vix >= 20 ? 22.0 : 8.0;

  constraints.push({
    id: "gamma_exp",
    name: "Options Dealer Gamma Hedging Flip",
    status: gammaStatus,
    activation_probability: gammaNegative ? 0.88 : 0.35,
    estimated_forced_volume_bn: gammaVolume,
    direction: gammaNegative ? "SELL" : "BUY",
    affected_tickers: ["SPX", "NDX", "AAPL", "NVDA", "TSLA", ...portfolioTickers.slice(0, 2)],
    trigger_condition: gammaNegative ? "Dealer net gamma flipped negative (volatility amplifier active)" : "Dealer positive gamma regime (volatility dampener)",
    time_horizon: "immediate",
    cascade_risk: gammaNegative ? "high" : "none",
    ai_reasoning: compileConstraintReasoning({
      name: "Options Dealer Dynamic Delta/Gamma Hedging",
      status: gammaStatus,
      forcedVolumeBn: gammaVolume,
      direction: gammaNegative ? "SELL" : "BUY",
      triggerCondition: gammaNegative ? "Negative gamma territory requiring pro-cyclical hedging" : "Positive gamma strike pinning",
      affectedTickers: ["SPX", "NDX", "AAPL", "NVDA"],
      cascadeRisk: gammaNegative ? "high" : "none",
      timeHorizon: "immediate",
    }),
  });

  // 4. Index Rebalancing
  constraints.push({
    id: "index_rebal",
    name: "Index & ETF Rebalance Basket Flows",
    status: "watching",
    activation_probability: 0.65,
    estimated_forced_volume_bn: 25.0,
    direction: "REBALANCE",
    affected_tickers: ["SPY", "IWM", "QQQ", ...portfolioTickers.slice(0, 3)],
    trigger_condition: "Quarterly index reconstitution and market capitalization drift limits",
    time_horizon: "weeks",
    cascade_risk: "low",
    ai_reasoning: compileConstraintReasoning({
      name: "Passive Index Reconstitution Arbitrage",
      status: "watching",
      forcedVolumeBn: 25.0,
      direction: "REBALANCE",
      triggerCondition: "Quarter-end basket re-weighting",
      affectedTickers: ["SPY", "IWM", "QQQ"],
      cascadeRisk: "low",
      timeHorizon: "weeks",
    }),
  });

  // 5. Margin & Liquidity
  const marginStatus = vix >= 30 ? "critical" : vix >= 24 ? "approaching" : "dormant";
  const marginVolume = vix >= 30 ? 60.0 : vix >= 24 ? 20.0 : 0.0;

  constraints.push({
    id: "margin",
    name: "Leveraged Position Margin Call Spiral",
    status: marginStatus,
    activation_probability: vix >= 30 ? 0.85 : vix >= 24 ? 0.45 : 0.15,
    estimated_forced_volume_bn: marginVolume,
    direction: "SELL",
    affected_tickers: portfolioTickers.slice(0, 5),
    trigger_condition: "Collateral haircut expansion and retail/hedge fund maintenance margin breaches",
    time_horizon: "immediate",
    cascade_risk: vix >= 30 ? "high" : "medium",
    ai_reasoning: compileConstraintReasoning({
      name: "Margin Call & Collateral Haircut Liquidations",
      status: marginStatus,
      forcedVolumeBn: marginVolume,
      direction: "SELL",
      triggerCondition: "Maintenance margin collateral deficit",
      affectedTickers: portfolioTickers.slice(0, 4),
      cascadeRisk: vix >= 30 ? "high" : "medium",
      timeHorizon: "immediate",
    }),
  });

  // Calculate Aggregate Pressure Score (0-100)
  const activeWeights = constraints.reduce((sum, c) => {
    const mult = c.status === "critical" ? 1.0 : c.status === "active" ? 0.65 : c.status === "approaching" ? 0.35 : 0.1;
    return sum + c.estimated_forced_volume_bn * mult;
  }, 0);

  const aggregate_pressure_score = Math.min(100, Math.round((activeWeights / 180) * 100));

  const cascade_sequence = [
    { order: 1, constraint: "Options Dealer Negative Gamma Hedging", triggers: "Real-time intraday delta matching", estimated_price_impact_pct: -0.85 },
    { order: 2, constraint: "Volatility Target Fund De-leveraging", triggers: "Daily close realized vol calculation", estimated_price_impact_pct: -1.65 },
    { order: 3, constraint: "CTA Trend-Following Stop Trigger", triggers: "1-3 day moving average confirmation", estimated_price_impact_pct: -2.40 },
  ];

  return {
    constraints,
    aggregate_pressure_score,
    cascade_sequence,
    meta: {
      model_confidence: 94,
      analysis_depth: "institutional-mechanical-constraints",
      engine: "deterministic-clank-v1",
    },
    timestamp: Date.now(),
    provider: "deterministic",
  };
}
