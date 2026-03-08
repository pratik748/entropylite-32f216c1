/**
 * CLANK — Structural Constraint Engine
 * Detects inevitable market movements caused by institutional constraints
 * rather than predicting price from past data.
 */

import { type PortfolioStock } from "@/components/PortfolioPanel";

// ─── Constraint Registry ────────────────────────────────────────────

export interface Constraint {
  id: string;
  name: string;
  shortName: string;
  affectedAssets: string[];
  institutionType: string;
  triggerCondition: string;
  forcedAction: "SELL" | "BUY" | "HEDGE";
  estimatedVolume: string;       // human-readable e.g. "$100B+"
  estimatedVolumeNum: number;    // in billions
  executionLatency: string;
  confidenceScore: number;       // 0-1
  category: "volatility" | "flow" | "structural" | "regulatory" | "options" | "rebalance";
}

export const CONSTRAINT_REGISTRY: Constraint[] = [
  {
    id: "vol-control",
    name: "Volatility Control Funds",
    shortName: "Vol Control",
    affectedAssets: ["SPY", "QQQ", "IWM", "EFA"],
    institutionType: "Risk Parity / Vol Target Funds",
    triggerCondition: "VIX > 25 OR 10-day realized vol > 18%",
    forcedAction: "SELL",
    estimatedVolume: "$80–120B",
    estimatedVolumeNum: 100,
    executionLatency: "Intraday – 2 days",
    confidenceScore: 0.82,
    category: "volatility",
  },
  {
    id: "cta-trend",
    name: "CTA Trend-Following Triggers",
    shortName: "CTA Trend",
    affectedAssets: ["ES", "NQ", "ZB", "GC", "CL"],
    institutionType: "Managed Futures / CTAs",
    triggerCondition: "Price crosses 50/100/200-day MA with momentum confirm",
    forcedAction: "SELL",
    estimatedVolume: "$30–60B",
    estimatedVolumeNum: 45,
    executionLatency: "1–3 days",
    confidenceScore: 0.75,
    category: "flow",
  },
  {
    id: "gamma-hedge",
    name: "Options Dealer Gamma Hedging",
    shortName: "Dealer Gamma",
    affectedAssets: ["SPX", "NDX", "AAPL", "TSLA", "NVDA"],
    institutionType: "Market Makers / Dealers",
    triggerCondition: "Net gamma exposure flips negative at strike clusters",
    forcedAction: "SELL",
    estimatedVolume: "$15–40B daily",
    estimatedVolumeNum: 28,
    executionLatency: "Real-time – intraday",
    confidenceScore: 0.88,
    category: "options",
  },
  {
    id: "etf-rebalance",
    name: "ETF & Index Rebalancing",
    shortName: "ETF Rebal",
    affectedAssets: ["SPY", "IWM", "QQQ", "VTI"],
    institutionType: "Passive Funds / ETF Issuers",
    triggerCondition: "Quarter-end, index reconstitution dates",
    forcedAction: "BUY",
    estimatedVolume: "$20–50B",
    estimatedVolumeNum: 35,
    executionLatency: "T-3 to T+1 around event",
    confidenceScore: 0.92,
    category: "rebalance",
  },
  {
    id: "margin-call",
    name: "Margin & Collateral Requirements",
    shortName: "Margin Call",
    affectedAssets: ["*"],
    institutionType: "Leveraged Funds / Prime Brokers",
    triggerCondition: "Portfolio drawdown > maintenance margin threshold",
    forcedAction: "SELL",
    estimatedVolume: "$10–80B",
    estimatedVolumeNum: 40,
    executionLatency: "T+0 – T+2",
    confidenceScore: 0.70,
    category: "structural",
  },
  {
    id: "reg-capital",
    name: "Regulatory Capital Rules",
    shortName: "Reg Capital",
    affectedAssets: ["XLF", "JPM", "GS", "MS", "BAC"],
    institutionType: "Banks / Systemically Important FIs",
    triggerCondition: "Capital ratios approach regulatory minimums",
    forcedAction: "SELL",
    estimatedVolume: "$20–60B",
    estimatedVolumeNum: 40,
    executionLatency: "Days – weeks",
    confidenceScore: 0.65,
    category: "regulatory",
  },
  {
    id: "index-inclusion",
    name: "Index Inclusion / Exclusion",
    shortName: "Index Incl.",
    affectedAssets: ["Newly added/removed tickers"],
    institutionType: "Index Funds / Passive Managers",
    triggerCondition: "Announcement of index changes",
    forcedAction: "BUY",
    estimatedVolume: "$5–30B per event",
    estimatedVolumeNum: 15,
    executionLatency: "Effective date ±3 days",
    confidenceScore: 0.95,
    category: "rebalance",
  },
  {
    id: "liquidity-threshold",
    name: "Liquidity Threshold Breaches",
    shortName: "Liq Breach",
    affectedAssets: ["*"],
    institutionType: "All Institutional",
    triggerCondition: "Bid-ask spreads widen > 3σ, depth thins > 50%",
    forcedAction: "SELL",
    estimatedVolume: "$10–50B cascade",
    estimatedVolumeNum: 30,
    executionLatency: "Immediate – hours",
    confidenceScore: 0.72,
    category: "structural",
  },
];

// ─── Constraint Monitor ─────────────────────────────────────────────

export interface ConstraintStatus {
  constraint: Constraint;
  activationProbability: number;    // 0–1
  proximityToTrigger: number;       // 0–1 (1 = at trigger)
  estimatedForcedVolume: number;    // $B
  pressureContribution: number;     // contribution to CLANK score
  status: "dormant" | "watching" | "approaching" | "critical" | "active";
  triggerDistance: string;           // human-readable
}

/**
 * Evaluate constraint activation probabilities based on portfolio & market signals.
 * In production this would consume live VIX, gamma exposure, etc.
 * Here we derive from portfolio risk characteristics.
 */
export function evaluateConstraints(stocks: PortfolioStock[], confidenceOverrides?: Record<string, number>): ConstraintStatus[] {
  const analyzed = stocks.filter(s => s.analysis);
  if (analyzed.length === 0) return CONSTRAINT_REGISTRY.map(c => defaultStatus(c));

  const avgRisk = analyzed.reduce((s, st) => s + (st.analysis.riskScore || 40), 0) / analyzed.length;
  const avgBeta = analyzed.reduce((s, st) => s + (st.analysis.beta || 1), 0) / analyzed.length;
  const avgVol = avgRisk / 100 * 0.03;
  const totalValue = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);

  // Derive synthetic market signals from portfolio
  const impliedVix = 12 + avgRisk * 0.35 + avgBeta * 5;
  const impliedRealizedVol = avgVol * 100 * 16; // annualized
  const drawdownProxy = analyzed.reduce((s, st) => {
    const ret = ((st.analysis.currentPrice || st.buyPrice) - st.buyPrice) / st.buyPrice;
    return s + Math.min(ret, 0);
  }, 0) / analyzed.length;

  return CONSTRAINT_REGISTRY.map(c => {
    const conf = confidenceOverrides?.[c.id] ?? c.confidenceScore;
    let prob = 0;
    let proximity = 0;
    let triggerDist = "";

    switch (c.id) {
      case "vol-control": {
        proximity = Math.min(impliedVix / 30, 1);
        prob = proximity > 0.7 ? proximity * conf : proximity * 0.5 * conf;
        triggerDist = `VIX ~${impliedVix.toFixed(0)} (trigger: 25)`;
        break;
      }
      case "cta-trend": {
        const trendBreak = avgRisk > 50 ? 0.7 : avgRisk > 35 ? 0.4 : 0.15;
        proximity = trendBreak;
        prob = trendBreak * conf;
        triggerDist = `Trend strength: ${(1 - trendBreak).toFixed(2)}`;
        break;
      }
      case "gamma-hedge": {
        const gammaFlip = impliedVix > 20 ? 0.6 + (impliedVix - 20) * 0.02 : 0.2;
        proximity = Math.min(gammaFlip, 1);
        prob = proximity * conf;
        triggerDist = `Net gamma: ${proximity > 0.5 ? "negative" : "positive"}`;
        break;
      }
      case "etf-rebalance": {
        const dayOfMonth = new Date().getDate();
        const monthEnd = dayOfMonth > 20;
        proximity = monthEnd ? 0.5 + (dayOfMonth - 20) / 20 : 0.1;
        prob = proximity * conf;
        triggerDist = monthEnd ? `${30 - dayOfMonth} days to rebal` : "Next quarter-end";
        break;
      }
      case "margin-call": {
        const marginStress = Math.abs(drawdownProxy) * 5;
        proximity = Math.min(marginStress, 1);
        prob = proximity * c.confidenceScore;
        triggerDist = `Drawdown proxy: ${(drawdownProxy * 100).toFixed(1)}%`;
        break;
      }
      case "reg-capital": {
        const bankExposure = analyzed.some(s => ["JPM", "GS", "MS", "BAC", "C"].includes(s.ticker)) ? 0.4 : 0.15;
        proximity = bankExposure + avgRisk * 0.003;
        prob = Math.min(proximity, 1) * c.confidenceScore;
        triggerDist = `Capital buffer est: ${((1 - proximity) * 100).toFixed(0)}%`;
        break;
      }
      case "index-inclusion": {
        proximity = 0.1;
        prob = 0.1 * c.confidenceScore;
        triggerDist = "No pending changes detected";
        break;
      }
      case "liquidity-threshold": {
        const liqStress = impliedVix > 22 ? 0.5 + (impliedVix - 22) * 0.03 : 0.1;
        proximity = Math.min(liqStress, 1);
        prob = proximity * c.confidenceScore;
        triggerDist = `Spread est: ${proximity > 0.5 ? ">2σ" : "normal"}`;
        break;
      }
      default:
        proximity = 0.1;
        prob = 0.1;
    }

    prob = Math.min(prob, 1);
    proximity = Math.min(proximity, 1);
    const forcedVol = c.estimatedVolumeNum * prob;
    const timeWeight = proximity > 0.6 ? 1.5 : proximity > 0.3 ? 1 : 0.5;
    const pressureContribution = forcedVol * prob * timeWeight;

    let status: ConstraintStatus["status"] = "dormant";
    if (prob >= 0.7) status = "critical";
    else if (prob >= 0.5) status = "approaching";
    else if (prob >= 0.2) status = "watching";

    return {
      constraint: c,
      activationProbability: prob,
      proximityToTrigger: proximity,
      estimatedForcedVolume: forcedVol,
      pressureContribution,
      status,
      triggerDistance: triggerDist,
    };
  });
}

function defaultStatus(c: Constraint): ConstraintStatus {
  return {
    constraint: c,
    activationProbability: 0,
    proximityToTrigger: 0,
    estimatedForcedVolume: 0,
    pressureContribution: 0,
    status: "dormant",
    triggerDistance: "No data",
  };
}

// ─── CLANK Pressure Score ───────────────────────────────────────────

export function computeClankScore(statuses: ConstraintStatus[]): number {
  if (statuses.length === 0) return 0;
  const totalPressure = statuses.reduce((s, cs) => s + cs.pressureContribution, 0);
  // Normalize: max possible ~sum of all estimatedVolumeNum * 1 * 1 * 1.5
  const maxPossible = CONSTRAINT_REGISTRY.reduce((s, c) => s + c.estimatedVolumeNum * 1.5, 0);
  return Math.min(Math.round((totalPressure / maxPossible) * 100), 100);
}

export function clankLevel(score: number): { label: string; color: string; bgColor: string } {
  if (score >= 80) return { label: "CASCADE RISK", color: "text-loss", bgColor: "bg-loss/20" };
  if (score >= 60) return { label: "HIGH INSTABILITY", color: "text-warning", bgColor: "bg-warning/20" };
  if (score >= 30) return { label: "RISING TENSION", color: "text-amber-400", bgColor: "bg-amber-400/10" };
  return { label: "STABLE", color: "text-gain", bgColor: "bg-gain/10" };
}

// ─── Constraint Cascade Simulation ──────────────────────────────────

export interface CascadeStep {
  order: number;
  constraintName: string;
  action: string;
  volumeImpact: number;    // $B
  priceImpact: number;     // % move
  liquidityDrain: number;  // % of available liquidity consumed
  volSpike: number;        // additional vol points
  cascadeProbability: number;
}

export function simulateCascade(statuses: ConstraintStatus[]): CascadeStep[] {
  const active = statuses
    .filter(s => s.activationProbability > 0.2)
    .sort((a, b) => b.activationProbability - a.activationProbability);

  if (active.length === 0) return [];

  const steps: CascadeStep[] = [];
  let cumulativeLiqDrain = 0;
  let cumulativeVol = 0;

  active.forEach((cs, i) => {
    const order = i + 1;
    const baseLiq = 0.05 + cs.estimatedForcedVolume * 0.005;
    cumulativeLiqDrain += baseLiq;
    // Price impact = forced volume / available liquidity (simplified)
    const availableLiq = Math.max(1 - cumulativeLiqDrain, 0.05);
    const priceImpact = -(cs.estimatedForcedVolume / (availableLiq * 200)) * 100;
    const volSpike = cs.estimatedForcedVolume * 0.08 * (1 + cumulativeLiqDrain);
    cumulativeVol += volSpike;

    // Secondary triggers increase probability of later constraints
    const cascadeProb = Math.min(cs.activationProbability * (1 + cumulativeLiqDrain * 0.5), 1);

    steps.push({
      order,
      constraintName: cs.constraint.shortName,
      action: cs.constraint.forcedAction,
      volumeImpact: cs.estimatedForcedVolume,
      priceImpact: +priceImpact.toFixed(2),
      liquidityDrain: +(cumulativeLiqDrain * 100).toFixed(1),
      volSpike: +cumulativeVol.toFixed(1),
      cascadeProbability: +cascadeProb.toFixed(2),
    });
  });

  return steps;
}

// ─── Category helpers ───────────────────────────────────────────────

export const CATEGORY_COLORS: Record<Constraint["category"], string> = {
  volatility: "bg-purple-500/20 text-purple-400",
  flow: "bg-blue-500/20 text-blue-400",
  structural: "bg-orange-500/20 text-orange-400",
  regulatory: "bg-red-500/20 text-red-400",
  options: "bg-cyan-500/20 text-cyan-400",
  rebalance: "bg-emerald-500/20 text-emerald-400",
};

export const STATUS_COLORS: Record<ConstraintStatus["status"], string> = {
  dormant: "bg-muted text-muted-foreground",
  watching: "bg-blue-500/15 text-blue-400",
  approaching: "bg-amber-500/15 text-amber-400",
  critical: "bg-loss/20 text-loss",
  active: "bg-loss/30 text-loss animate-pulse",
};
