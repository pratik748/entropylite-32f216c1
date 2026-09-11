/**
 * Deterministic Monte Carlo Calibration & PM Synthesis Engine.
 *
 * Calibrates Geometric Brownian Motion (GBM) + jump-diffusion parameters mathematically
 * from empirical portfolio risk characteristics and scenario stress factors.
 */

import { compilePMNarrative } from "./nlgCompiler.ts";

export interface ScenarioParam {
  drift: number;
  volMult: number;
  jumpProb: number;
  jumpSize: number;
  label: string;
  desc: string;
}

export interface MonteCarloIntelligenceResponse {
  calibratedParams: {
    drift: number;
    volMult: number;
    jumpProb: number;
    jumpSize: number;
  };
  scenarios: {
    base: ScenarioParam;
    rate_shock: ScenarioParam;
    fx_shock: ScenarioParam;
    liquidity_freeze: ScenarioParam;
    black_swan: ScenarioParam;
    war: ScenarioParam;
  };
  suggestions: {
    label: string;
    type: "protect" | "opportunity" | "wait";
    detail: string;
  }[];
  narrativeSummary: string;
  engine: "deterministic-mc-v1";
}

export function calibrateMonteCarloDeterministically(opts: {
  portfolio?: any[];
  totalValue?: number;
  avgRisk?: number;
  avgBeta?: number;
  scenario?: string;
}): MonteCarloIntelligenceResponse {
  const beta = Math.max(0.2, Math.min(3.0, typeof opts.avgBeta === "number" ? opts.avgBeta : 1.05));
  const risk = Math.max(0, Math.min(100, typeof opts.avgRisk === "number" ? opts.avgRisk : 48));
  const activeScenario = (opts.scenario || "base").toLowerCase();

  // Baseline risk-free (4.5%) + Equity Risk Premium (5.5%) adjusted for beta
  const baselineAnnualReturn = 0.045 + beta * 0.055;
  const baselineDailyDrift = baselineAnnualReturn / 252;

  // Risk tilt factor: High-risk book receives higher tail vol & jump intensity
  const riskTilt = 1 + ((risk - 50) / 100) * 0.25;

  const scenarios: MonteCarloIntelligenceResponse["scenarios"] = {
    base: {
      drift: Number(baselineDailyDrift.toFixed(5)),
      volMult: Number((1.0 * riskTilt).toFixed(2)),
      jumpProb: Number((0.005 * riskTilt).toFixed(4)),
      jumpSize: -0.025,
      label: "Baseline Drift & Volatility",
      desc: "Historical empirical log-returns with standard Gaussian dispersion",
    },
    rate_shock: {
      drift: Number((-0.00045 * beta).toFixed(5)),
      volMult: Number((1.55 * riskTilt).toFixed(2)),
      jumpProb: Number((0.012 * riskTilt).toFixed(4)),
      jumpSize: -0.045,
      label: "Yield Curve Dislocation (+100bp)",
      desc: "Duration contraction with compressed multiples on long-dated cash flows",
    },
    fx_shock: {
      drift: -0.00020,
      volMult: Number((1.35 * riskTilt).toFixed(2)),
      jumpProb: Number((0.010 * riskTilt).toFixed(4)),
      jumpSize: -0.035,
      label: "USD Dollar Surge / EM Devaluation",
      desc: "Cross-border carry trade unwind with selective sovereign currency strain",
    },
    liquidity_freeze: {
      drift: -0.00095,
      volMult: Number((1.85 * riskTilt).toFixed(2)),
      jumpProb: Number((0.028 * riskTilt).toFixed(4)),
      jumpSize: -0.075,
      label: "Market Maker Liquidity Freeze",
      desc: "Bid-ask spread widening with pro-cyclical dealer inventory liquidation",
    },
    black_swan: {
      drift: -0.00180,
      volMult: Number((2.60 * riskTilt).toFixed(2)),
      jumpProb: Number((0.042 * riskTilt).toFixed(4)),
      jumpSize: -0.110,
      label: "Fat-Tailed Systemic Solvency Crisis",
      desc: "Multi-sigma correlated drawdown across risk assets with volatility clustering",
    },
    war: {
      drift: -0.00085,
      volMult: Number((2.10 * riskTilt).toFixed(2)),
      jumpProb: Number((0.032 * riskTilt).toFixed(4)),
      jumpSize: -0.065,
      label: "Geopolitical Conflict & Supply Disruption",
      desc: "Commodity cost spikes with freight routing friction and risk-off asset flight",
    },
  };

  const activeParams = scenarios[activeScenario as keyof typeof scenarios] || scenarios.base;

  const calibratedParams = {
    drift: activeParams.drift,
    volMult: activeParams.volMult,
    jumpProb: activeParams.jumpProb,
    jumpSize: activeParams.jumpSize,
  };

  // Generate actionable portfolio suggestions deterministically
  const suggestions: MonteCarloIntelligenceResponse["suggestions"] = [
    {
      label: "Downside Convexity Protection",
      type: "protect",
      detail: `Allocate 1.5–2.5% risk budget into OTM SPY/QQQ puts or VIX call spreads to buffer against ${activeParams.label.toLowerCase()} tail drawdown.`,
    },
    {
      label: "Beta-Neutral Factor Rotation",
      type: "opportunity",
      detail: `Pair long quality balance sheets (Merton DD > 4.5) against high-duration levered names to harvest dispersion spread.`,
    },
    {
      label: "Liquidity Preservation Threshold",
      type: "wait",
      detail: `Maintain at least 15% tier-1 cash buffer until realized volatility drops below the 20-day historical mean.`,
    },
  ];

  const narrativeSummary = compilePMNarrative({
    portfolioValue: opts.totalValue,
    avgBeta: beta,
    avgRisk: risk,
    activeScenario: activeParams.label,
    var95Pct: -(activeParams.volMult * 1.645 * 1.15),
  });

  return {
    calibratedParams,
    scenarios,
    suggestions,
    narrativeSummary,
    engine: "deterministic-mc-v1",
  };
}
