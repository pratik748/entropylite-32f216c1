/**
 * VENOR Architecture: Crucible (Data Modeling & Simulation Engine)
 * 100% Deterministic Quantitative & Causal Simulation Layer
 */

import type {
  PolyhedralConstraint,
  CrucibleSimulationPath,
  FutureSurvivalScoreResult,
  CausalEdge,
  WorldState,
} from "./types";
import { mulberry32 } from "@/lib/quant/validation";
import { stdev, mean } from "@/lib/quant/institutional";

// ─────────────────────────────────────────────────────────────────────────────
// §1 GARCH(1,1) Volatility & Gaussian HMM Regimes
// ─────────────────────────────────────────────────────────────────────────────

export interface GarchParams {
  omega: number; // Baseline variance weight
  alpha: number; // Shock reaction parameter
  beta: number;  // Persistence parameter
}

export const DEFAULT_GARCH_PARAMS: GarchParams = {
  omega: 0.000005,
  alpha: 0.08,
  beta: 0.88,
};

/**
 * GARCH(1,1) conditional volatility step:
 * σ_t² = ω + α · ε_{t-1}² + β · σ_{t-1}²
 */
export function garchForecast(dailyReturns: number[], params = DEFAULT_GARCH_PARAMS): number {
  if (dailyReturns.length < 5) return 0.015; // default ~24% annualized
  let sigma2 = (dailyReturns[0] || 0.01) ** 2;

  for (let i = 1; i < dailyReturns.length; i++) {
    const eps2 = dailyReturns[i - 1] ** 2;
    sigma2 = params.omega + params.alpha * eps2 + params.beta * sigma2;
  }

  return Math.sqrt(Math.max(1e-8, sigma2));
}

/**
 * 3-State Regime Classifier:
 * - LOW_VOL_TREND (State 0): Annualized Vol < 18%, Trend > 0
 * - MEAN_REVERTING (State 1): 18% <= Vol < 35%
 * - HIGH_VOL_CRISIS (State 2): Vol >= 35% or extreme shock
 */
export function classifyRegime(
  closes: number[],
  vix = 18
): {
  regime: "LOW_VOL_TREND" | "MEAN_REVERTING" | "HIGH_VOL_CRISIS";
  probabilities: [number, number, number];
  annualizedVol: number;
} {
  if (closes.length < 10) {
    return {
      regime: "MEAN_REVERTING",
      probabilities: [0.2, 0.6, 0.2],
      annualizedVol: 20,
    };
  }

  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) {
      rets.push(Math.log(closes[i] / closes[i - 1]));
    }
  }

  const volDaily = stdev(rets);
  const annVol = volDaily * Math.sqrt(252) * 100;
  const momentum = (closes[closes.length - 1] - closes[0]) / closes[0];

  let p0 = 0.33, p1 = 0.33, p2 = 0.34;

  if (annVol < 18 && vix < 20 && momentum > 0.02) {
    p0 = 0.75;
    p1 = 0.20;
    p2 = 0.05;
  } else if (annVol >= 35 || vix >= 28) {
    p0 = 0.05;
    p1 = 0.20;
    p2 = 0.75;
  } else {
    p0 = 0.20;
    p1 = 0.65;
    p2 = 0.15;
  }

  const maxP = Math.max(p0, p1, p2);
  const regime = maxP === p0 ? "LOW_VOL_TREND" : maxP === p2 ? "HIGH_VOL_CRISIS" : "MEAN_REVERTING";

  return {
    regime,
    probabilities: [Number(p0.toFixed(2)), Number(p1.toFixed(2)), Number(p2.toFixed(2))],
    annualizedVol: Number(annVol.toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §2 Polyhedral Feasibility Polytope P_K
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds standard market structural constraints:
 * 1. Exchange Circuit Breaker Limit (±15% to ±20%)
 * 2. Enterprise Value Floor
 * 3. Dealer Gamma Flip Barrier
 * 4. Liquidity Vacuum Ceiling
 */
export function buildPolyhedralConstraints(
  currentPrice: number,
  supportLevel: number,
  resistanceLevel: number,
  annualizedVol: number
): PolyhedralConstraint[] {
  const constraints: PolyhedralConstraint[] = [];

  // 1. Hard Downside Circuit Breaker
  const circuitBreakerFloor = currentPrice * 0.80; // -20%
  constraints.push({
    id: "circuit_breaker_down",
    name: "Exchange Lower Circuit Breaker",
    type: "CIRCUIT_BREAKER",
    expression: "Price >= CurrentPrice * 0.80",
    threshold: circuitBreakerFloor,
    isBinding: false,
    distanceToBinding: Math.max(0, (currentPrice - circuitBreakerFloor) / currentPrice),
    severity: "CRITICAL",
  });

  // 2. Enterprise Value Fundamental Floor
  const evFloor = Math.max(supportLevel * 0.90, currentPrice * 0.70);
  constraints.push({
    id: "ev_floor",
    name: "Fundamental Enterprise Value Floor",
    type: "ENTERPRISE_VALUE",
    expression: `Price >= ${evFloor.toFixed(2)}`,
    threshold: evFloor,
    isBinding: false,
    distanceToBinding: Math.max(0, (currentPrice - evFloor) / currentPrice),
    severity: "HIGH",
  });

  // 3. Dealer Gamma Dislocation Barrier (Upper Pin / Resistance)
  const gammaPin = Math.max(resistanceLevel, currentPrice * 1.15);
  constraints.push({
    id: "gamma_pin_up",
    name: "Dealer Gamma Strike Pin Barrier",
    type: "GAMMA_PIN",
    expression: `Price <= ${gammaPin.toFixed(2)}`,
    threshold: gammaPin,
    isBinding: false,
    distanceToBinding: Math.max(0, (gammaPin - currentPrice) / currentPrice),
    severity: "MEDIUM",
  });

  // 4. Volatility Spike Ceiling
  const volCeiling = 60.0;
  const volBinding = annualizedVol >= 45.0;
  constraints.push({
    id: "vol_ceiling",
    name: "Volatility Control Deleveraging Ceiling",
    type: "VOL_CEILING",
    expression: "AnnVol <= 60.0%",
    threshold: volCeiling,
    isBinding: volBinding,
    distanceToBinding: Math.max(0, (volCeiling - annualizedVol) / volCeiling),
    severity: volBinding ? "CRITICAL" : "MEDIUM",
  });

  return constraints;
}

/**
 * Computes structural fragility index κ_K(s) = weighted average of constraint closeness.
 */
export function computeFragilityIndex(constraints: PolyhedralConstraint[]): number {
  if (constraints.length === 0) return 0.1;
  let score = 0;
  for (const c of constraints) {
    const closeness = 1 - Math.min(1, c.distanceToBinding);
    const weight = c.severity === "CRITICAL" ? 1.5 : c.severity === "HIGH" ? 1.0 : 0.6;
    score += closeness * weight;
  }
  return Number(Math.min(1.0, Math.max(0.0, score / (constraints.length * 1.2))).toFixed(3));
}

// ─────────────────────────────────────────────────────────────────────────────
// §3 Constraint-Filtered Monte Carlo & Future Survival Score (FSS)
// ─────────────────────────────────────────────────────────────────────────────

export interface MonteCarloConfig {
  currentPrice: number;
  targetPrice: number;
  stopLoss: number;
  horizonDays: number; // e.g. 21 days
  annualizedVolPct: number;
  driftAnnualPct?: number;
  numPaths?: number; // default 5,000 for browser speed
  seed?: number;
}

/**
 * Runs constraint-filtered Monte Carlo over P_K to calculate the Future Survival Score (FSS).
 */
export function runPolyhedralMonteCarlo(
  config: MonteCarloConfig,
  constraints: PolyhedralConstraint[]
): FutureSurvivalScoreResult {
  const {
    currentPrice,
    targetPrice,
    stopLoss,
    horizonDays,
    annualizedVolPct,
    driftAnnualPct = 0,
    numPaths = 5000,
    seed = 42,
  } = config;

  const rng = mulberry32(seed);
  const dt = 1 / 252;
  const sigma = Math.max(0.05, annualizedVolPct / 100);
  const mu = driftAnnualPct / 100;
  const driftPerStep = (mu - 0.5 * sigma * sigma) * dt;
  const volPerStep = sigma * Math.sqrt(dt);

  const isLong = targetPrice >= currentPrice;
  const circuitFloor = constraints.find((c) => c.type === "CIRCUIT_BREAKER")?.threshold ?? currentPrice * 0.7;

  let polyhedralFeasibleCount = 0;
  let targetHitCount = 0;
  let stopHitCount = 0;
  const pathTerminalReturns: number[] = [];

  for (let i = 0; i < numPaths; i++) {
    let p = currentPrice;
    let feasible = true;
    let targetHit = false;
    let stopHit = false;

    for (let step = 0; step < horizonDays; step++) {
      // Standard Gaussian via Box-Muller with deterministic mulberry32
      let u1 = 0, u2 = 0;
      while (u1 === 0) u1 = rng();
      while (u2 === 0) u2 = rng();
      const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

      p = p * Math.exp(driftPerStep + volPerStep * z);

      // Enforce Polyhedral constraint check per step
      if (p < circuitFloor || p <= 0) {
        feasible = false;
        break; // Path violates physical market boundary
      }

      if (isLong) {
        if (!targetHit && p >= targetPrice) {
          targetHit = true;
          break;
        }
        if (!stopHit && p <= stopLoss) {
          stopHit = true;
          break;
        }
      } else {
        if (!targetHit && p <= targetPrice) {
          targetHit = true;
          break;
        }
        if (!stopHit && p >= stopLoss) {
          stopHit = true;
          break;
        }
      }
    }

    if (feasible) {
      polyhedralFeasibleCount++;
      const ret = (p - currentPrice) / currentPrice;
      pathTerminalReturns.push(ret);

      if (targetHit) targetHitCount++;
      else if (stopHit) stopHitCount++;
    }
  }

  const feasibleFraction = polyhedralFeasibleCount / Math.max(1, numPaths);
  const fss = polyhedralFeasibleCount > 0 ? targetHitCount / polyhedralFeasibleCount : 0;

  // Expected Shortfall (CVaR at 95% on feasible paths)
  pathTerminalReturns.sort((a, b) => a - b);
  const tailIdx = Math.max(1, Math.floor(pathTerminalReturns.length * 0.05));
  const tailSlice = pathTerminalReturns.slice(0, tailIdx);
  const es95 = tailSlice.length > 0 ? Math.abs(mean(tailSlice)) : 0.08;

  // Omega Asymmetry: Ratio of gains to losses
  let gainSum = 0, lossSum = 0;
  for (const r of pathTerminalReturns) {
    if (r > 0) gainSum += r;
    else lossSum += Math.abs(r);
  }
  const omega = lossSum > 0 ? gainSum / lossSum : 2.0;

  // Deflated Sharpe Ratio calculation approximation
  const retMean = mean(pathTerminalReturns);
  const retStd = stdev(pathTerminalReturns) || 0.01;
  const rawSharpe = (retMean / retStd) * Math.sqrt(252 / horizonDays);
  const deflatedSharpeRatio = Math.max(0, rawSharpe * feasibleFraction * 0.85);

  return {
    totalPaths: numPaths,
    polyhedralFeasiblePaths: polyhedralFeasibleCount,
    feasibleFraction: Number(feasibleFraction.toFixed(4)),
    targetHitPaths: targetHitCount,
    stopHitPaths: stopHitCount,
    fss: Number(fss.toFixed(4)),
    expectedShortfall95: Number(es95.toFixed(4)),
    asymmetryOmega: Number(omega.toFixed(2)),
    deflatedSharpeRatio: Number(deflatedSharpeRatio.toFixed(2)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// §4 Causal Graph & Second-Order Aftermath Cascade
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Propagates a shock event through the typed asset graph with depth discounting (ρ = 0.75).
 */
export function propagateAftermathCascade(
  initialShockTicker: string,
  initialShockMagnitudePct: number,
  graphEdges: CausalEdge[],
  maxDepth = 2,
  depthDecay = 0.75
): Record<string, number> {
  const impacts: Record<string, number> = {
    [initialShockTicker]: initialShockMagnitudePct,
  };

  const queue: { ticker: string; depth: number; magnitude: number }[] = [
    { ticker: initialShockTicker, depth: 0, magnitude: initialShockMagnitudePct },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxDepth) continue;

    const outgoing = graphEdges.filter((e) => e.sourceTicker === current.ticker && e.fdrSignificant);

    for (const edge of outgoing) {
      const transmittedImpact = current.magnitude * edge.weight * Math.pow(depthDecay, current.depth + 1);
      if (!impacts[edge.targetTicker] || Math.abs(transmittedImpact) > Math.abs(impacts[edge.targetTicker])) {
        impacts[edge.targetTicker] = Number(transmittedImpact.toFixed(3));
      }
      queue.push({
        ticker: edge.targetTicker,
        depth: current.depth + 1,
        magnitude: transmittedImpact,
      });
    }
  }

  return impacts;
}
