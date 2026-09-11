/**
 * Deterministic Natural Language Generation (NLG) & Decision Synthesis Compiler (Client-Side).
 *
 * Provides pure, zero-latency, offline synthesis from quantitative metrics into institutional prose.
 */

export interface MacroTransmissionInput {
  origin: string;
  shock: string;
  channel: "rates" | "credit" | "fx" | "commodities" | "supply_chain" | "liquidity" | "sentiment" | "regulatory";
  dest: string;
  impactPct: number;
  mechanism: string;
  confidence: number;
  timeHorizon: "intraday" | "1-3 days" | "1-2 weeks" | "1-3 months" | "structural";
  direction?: "up" | "down" | "volatile";
}

export interface RiskVerdictInput {
  var95Pct: number;
  cvar95Pct: number;
  maxDrawdownPct: number;
  skewness?: number;
  excessKurtosis?: number;
  regime?: string;
  stressFactor?: number;
}

export interface ConstraintSummaryInput {
  name: string;
  status: "critical" | "active" | "approaching" | "watching" | "dormant";
  forcedVolumeBn: number;
  direction: "SELL" | "BUY" | "REBALANCE" | "HEDGE";
  triggerCondition: string;
  affectedTickers: string[];
  cascadeRisk: "none" | "low" | "medium" | "high";
  timeHorizon: string;
}

export interface ScenarioBranch {
  label: "Bull" | "Base" | "Bear" | "Tail Risk";
  probability: number;
  capitalImpactPct: number;
  keyMoves: string[];
  narrative?: string;
}

export interface PMBriefInput {
  portfolioValue?: number;
  avgBeta?: number;
  avgRisk?: number;
  activeScenario?: string;
  var95Pct?: number;
  topRisks?: string[];
  recommendations?: { label: string; type: "protect" | "opportunity" | "wait"; detail: string }[];
}

export function sanitizeQuantProse(text: string): string {
  return text
    .replace(/\s*[—–]\s+/g, ", ")
    .replace(/[—–]/g, "-")
    .replace(/\b(obviously|basically|hopefully|certainly|guaranteed|i think|we feel)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function compileTransmissionEffect(input: MacroTransmissionInput): string {
  const sign = input.impactPct > 0 ? "+" : "";
  const pctStr = `${sign}${input.impactPct.toFixed(1)}%`;
  const dirWord = input.direction || (input.impactPct >= 0 ? "up" : "down");
  const channelUpper = input.channel.replace("_", " ").toUpperCase();

  return sanitizeQuantProse(
    `[${channelUpper}] ${input.origin} ${input.shock} propagates to ${input.dest} (${pctStr}, ${dirWord}) via ${input.mechanism}. Horizon: ${input.timeHorizon} (conf: ${(input.confidence * 100).toFixed(0)}%).`
  );
}

export function compileRiskSummary(input: RiskVerdictInput): string {
  const varStr = `${Math.abs(input.var95Pct).toFixed(2)}%`;
  const cvarStr = `${Math.abs(input.cvar95Pct).toFixed(2)}%`;
  const ddStr = `${Math.abs(input.maxDrawdownPct).toFixed(1)}%`;
  const fatTail = (input.excessKurtosis ?? 0) > 1.5;
  const skewNeg = (input.skewness ?? 0) < -0.5;

  let tailAssessment = "Normal Gaussian dispersion observed in historical window.";
  if (fatTail && skewNeg) {
    tailAssessment = "Severe left-tail asymmetry detected (negative skewness with elevated leptokurtosis). Left tail risk dominates mean expectation.";
  } else if (fatTail) {
    tailAssessment = "Leptokurtic fat tails present across portfolio return distribution. Jump risk multiplier active.";
  } else if (skewNeg) {
    tailAssessment = "Negative return asymmetry detected, indicating downside vulnerability exceeds upside capture.";
  }

  const regimeStr = input.regime ? ` Active regime: ${input.regime}.` : "";
  return sanitizeQuantProse(
    `Portfolio VaR (95%, 1-day) stands at ${varStr} with Expected Shortfall (CVaR 95%) at ${cvarStr}. Realized maximum drawdown bounded at ${ddStr}.${regimeStr} ${tailAssessment}`
  );
}

export function compileConstraintReasoning(input: ConstraintSummaryInput): string {
  const volStr = input.forcedVolumeBn > 0 ? `$${input.forcedVolumeBn.toFixed(1)}B` : "nominal";
  const statusUpper = input.status.toUpperCase();
  const dirStr = input.direction;
  const tickersStr = input.affectedTickers.slice(0, 5).join(", ") || "broad market";

  return sanitizeQuantProse(
    `[${statusUpper}] ${input.name} triggered by ${input.triggerCondition}. Imposes forced ${dirStr} flow estimated at ${volStr} on ${tickersStr}. Cascade vulnerability rated ${input.cascadeRisk} over ${input.timeHorizon} horizon.`
  );
}

export function compilePMNarrative(input: PMBriefInput): string {
  const betaStr = (input.avgBeta ?? 1.0).toFixed(2);
  const scenarioStr = (input.activeScenario || "Base").toUpperCase();
  const varStr = input.var95Pct !== undefined ? `VaR (95%) at ${Math.abs(input.var95Pct).toFixed(1)}%` : "standard vol bands";

  let posture = "Maintain balanced delta exposure with systematic stop limits.";
  if ((input.avgRisk ?? 50) > 70) {
    posture = "High aggregate book risk warrants immediate downside convexity hedging and beta reduction.";
  } else if ((input.avgRisk ?? 50) < 35) {
    posture = "Capital preservation buffer is intact; opportunistic asymmetric deployment advised.";
  }

  return sanitizeQuantProse(
    `Under the ${scenarioStr} simulation regime (portfolio β = ${betaStr}, ${varStr}), risk-weighted outcomes remain governed by tail-dispersion. ${posture}`
  );
}
