/**
 * Fortress Engine — live, growth-aware capital-protection core.
 *
 * Pure synchronous functions that consume normalized portfolio holdings + LIVE
 * system intelligence (regime, geo, macro, institutional flows, per-ticker
 * threats) and produce structured threats, defensive actions, and bounded
 * downside metrics that ADAPT to the current market regime instead of using
 * static thresholds.
 *
 * Constraints baked in (per Fortress spec):
 *  - Prefer trim over hold for fragile positions
 *  - Cap total hedge cost ≤ regime-aware ceiling (1.0%–1.6% annualized)
 *  - Require minimum residual upside ≥ 30% of unhedged (growth preservation)
 *  - Hedges are correlation-grounded, never arbitrary pairing
 *  - Thresholds tighten in Crisis/High-Vol regimes, relax in Trending Bull
 */

export type ThreatKind =
  | "concentration"
  | "correlation"
  | "trajectory"
  | "volatility"
  | "liquidity"
  | "geopolitical"
  | "macro"
  | "flow";

export type ThreatSeverity = "MED" | "HIGH" | "CRITICAL";

export interface Threat {
  id: string;
  kind: ThreatKind;
  target: string; // ticker or sector cluster name
  severity: ThreatSeverity;
  evidence: string; // short, mono-friendly description
  contributionToRisk: number; // 0-100 share of overall portfolio risk
  source?: string; // which intelligence layer surfaced it
}

export type DefensiveActionKind = "trim" | "hedge" | "rebalance" | "convert";

export interface DefensiveAction {
  id: string;
  kind: DefensiveActionKind;
  target: string;
  sizePct: number; // % of position or portfolio affected
  instrument?: string; // hedge / rebalance instrument
  rationale: string; // ≤90 char plain-language "why"
  trigger: string; // quantitative trigger (mono-font)
  riskReductionBps: number; // estimated bps of portfolio risk removed
  costBps: number; // estimated cost in bps annualized
  upsideClippedPct: number; // % of unhedged upside foregone (growth-preservation guardrail)
  confidence: number; // 0-100
  threatId?: string;
}

export interface FortressMetrics {
  boundedDownside: number; // ₹ / base-currency hard floor (parametric VaR99 post-hedge)
  riskScore: number; // 0-100 current
  baselineRiskScore: number; // 0-100 if Fortress is OFF
  reductionPct: number; // % risk reduction achieved
  confidence: number; // 0-100 confidence in defensive positioning
  preSigma: number; // pre-fortress portfolio sigma (annualized %)
  postSigma: number; // post-fortress portfolio sigma
  preMaxDD: number; // pre-fortress max drawdown estimate (negative %)
  postMaxDD: number; // post-fortress max drawdown estimate
  upsidePreserved: number; // % of unhedged upside that survives the hedge stack (target ≥ 70)
  regimeLabel: string; // current market regime feeding the engine
}

export interface FortressHolding {
  ticker: string;
  rawTicker: string;
  value: number;
  pnlPct: number;
  beta: number;
  risk: number;
  sector: string;
  suggestion?: string;
  analysis?: any;
}

// Live signals piped in from the rest of the platform.
export interface LiveSignals {
  regime?: {
    label: string; // e.g. "Crisis", "Trending Bull"
    vix: number;
    moodScore: number;
    conditions: { id: string; label: string; severity: "low" | "medium" | "high" }[];
  };
  macro?: {
    regime: "expansion" | "slowdown" | "contraction" | "recovery";
    confidence: number;
    signals: string[];
  };
  flows?: {
    smartMoneyDirection: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
    unusualActivityCount: number;
  };
  // Map of stripped/raw ticker → geo threat record
  geoThreats?: Record<
    string,
    {
      threatLevel: "critical" | "high" | "medium" | "low" | "none";
      score: number;
      threats: string[];
      topConflict?: string;
    }
  >;
}

// ---------- Regime-aware thresholds ----------

interface RegimeProfile {
  concentrationLimit: number; // weight % above which concentration triggers
  sectorClusterLimit: number;
  trajectoryStopPct: number; // trim threshold for unrealized loss (negative %)
  volatilityBetaTrigger: number;
  hedgeCostCapBps: number;
  upsideFloorPct: number; // minimum residual upside as % of unhedged
  trimAggressivenessMult: number;
}

function deriveRegimeProfile(signals: LiveSignals | undefined): RegimeProfile {
  const vix = signals?.regime?.vix ?? 20;
  const label = signals?.regime?.label ?? "";
  const macro = signals?.macro?.regime ?? "expansion";
  const flow: "RISK_ON" | "RISK_OFF" | "NEUTRAL" =
    signals?.flows?.smartMoneyDirection ?? "NEUTRAL";

  // Default = balanced regime
  let p: RegimeProfile = {
    concentrationLimit: 0.25,
    sectorClusterLimit: 0.4,
    trajectoryStopPct: -8,
    volatilityBetaTrigger: 1.4,
    hedgeCostCapBps: 120,
    upsideFloorPct: 30,
    trimAggressivenessMult: 1,
  };

  // Tighten in stressed regimes
  if (label === "Crisis" || vix >= 35 || macro === "contraction") {
    p = {
      concentrationLimit: 0.18,
      sectorClusterLimit: 0.32,
      trajectoryStopPct: -5,
      volatilityBetaTrigger: 1.2,
      hedgeCostCapBps: 160,
      upsideFloorPct: 25,
      trimAggressivenessMult: 1.35,
    };
  } else if (label === "High Volatility" || vix >= 28 || flow === "RISK_OFF" || macro === "slowdown") {
    p = {
      concentrationLimit: 0.22,
      sectorClusterLimit: 0.36,
      trajectoryStopPct: -6.5,
      volatilityBetaTrigger: 1.3,
      hedgeCostCapBps: 140,
      upsideFloorPct: 28,
      trimAggressivenessMult: 1.15,
    };
  } else if (label === "Trending Bull" && vix < 18) {
    // Loosen so we don't over-hedge in a clean uptrend.
    p = {
      concentrationLimit: 0.3,
      sectorClusterLimit: 0.45,
      trajectoryStopPct: -10,
      volatilityBetaTrigger: 1.55,
      hedgeCostCapBps: 100,
      upsideFloorPct: 35,
      trimAggressivenessMult: 0.85,
    };
  }

  return p;
}

// ---------- Threat scanning ----------

export function scanThreats(
  holdings: FortressHolding[],
  totalValue: number,
  signals?: LiveSignals,
): Threat[] {
  if (!holdings.length || totalValue <= 0) return [];
  const threats: Threat[] = [];
  const profile = deriveRegimeProfile(signals);

  // 1. Concentration — regime-aware single position weight ceiling
  holdings.forEach((h) => {
    const weight = h.value / totalValue;
    if (weight >= profile.concentrationLimit) {
      const sev: ThreatSeverity =
        weight >= profile.concentrationLimit + 0.15
          ? "CRITICAL"
          : weight >= profile.concentrationLimit + 0.07
            ? "HIGH"
            : "MED";
      threats.push({
        id: `conc-${h.rawTicker}`,
        kind: "concentration",
        target: h.ticker,
        severity: sev,
        evidence: `Position weight ${(weight * 100).toFixed(1)}% — exceeds ${(profile.concentrationLimit * 100) | 0}% regime limit`,
        contributionToRisk: Math.round(weight * 60),
        source: "portfolio",
      });
    }
  });

  // 2. Sector cluster correlation — regime-aware sector weight
  const sectorMap: Record<string, number> = {};
  holdings.forEach((h) => {
    sectorMap[h.sector] = (sectorMap[h.sector] || 0) + h.value;
  });
  Object.entries(sectorMap).forEach(([sector, value]) => {
    const weight = value / totalValue;
    if (weight >= profile.sectorClusterLimit && sector !== "Unknown") {
      const sev: ThreatSeverity =
        weight >= profile.sectorClusterLimit + 0.18 ? "CRITICAL" : "HIGH";
      threats.push({
        id: `corr-${sector}`,
        kind: "correlation",
        target: sector,
        severity: sev,
        evidence: `Sector cluster ${(weight * 100).toFixed(1)}% — correlated drawdown risk in current regime`,
        contributionToRisk: Math.round(weight * 40),
        source: "portfolio",
      });
    }
  });

  // 3. Trajectory deviation — regime-aware stop discipline
  holdings.forEach((h) => {
    if (h.pnlPct <= profile.trajectoryStopPct) {
      const sev: ThreatSeverity =
        h.pnlPct <= profile.trajectoryStopPct - 12
          ? "CRITICAL"
          : h.pnlPct <= profile.trajectoryStopPct - 4
            ? "HIGH"
            : "MED";
      threats.push({
        id: `traj-${h.rawTicker}`,
        kind: "trajectory",
        target: h.ticker,
        severity: sev,
        evidence: `Trajectory deviation ${h.pnlPct.toFixed(1)}% — past regime stop ${profile.trajectoryStopPct}%`,
        contributionToRisk: Math.min(40, Math.round(Math.abs(h.pnlPct))),
        source: "portfolio",
      });
    }
  });

  // 4. Volatility — regime-aware beta + risk threshold
  holdings.forEach((h) => {
    if (h.beta >= profile.volatilityBetaTrigger && h.risk >= 60) {
      const sev: ThreatSeverity = h.beta >= profile.volatilityBetaTrigger + 0.4 ? "HIGH" : "MED";
      threats.push({
        id: `vol-${h.rawTicker}`,
        kind: "volatility",
        target: h.ticker,
        severity: sev,
        evidence: `β=${h.beta.toFixed(2)} · risk=${h.risk}/100 — vulnerable in current vol regime`,
        contributionToRisk: Math.round((h.risk / 100) * 30),
        source: "portfolio",
      });
    }
  });

  // 5. Geopolitical — pulled from useGeoIntelligence per-ticker map
  if (signals?.geoThreats) {
    for (const h of holdings) {
      const g = signals.geoThreats[h.rawTicker] || signals.geoThreats[h.ticker];
      if (!g || g.threatLevel === "none" || g.threatLevel === "low") continue;
      const sev: ThreatSeverity =
        g.threatLevel === "critical" ? "CRITICAL" : g.threatLevel === "high" ? "HIGH" : "MED";
      threats.push({
        id: `geo-${h.rawTicker}`,
        kind: "geopolitical",
        target: h.ticker,
        severity: sev,
        evidence: `Geo exposure ${g.score}/100${g.topConflict ? ` · ${g.topConflict}` : ""}`,
        contributionToRisk: Math.min(35, Math.round(g.score * 0.35)),
        source: "geo-intel",
      });
    }
  }

  // 6. Macro — only when high-impact signals are present and we have meaningful book exposure
  if (signals?.macro && (signals.macro.regime === "contraction" || signals.macro.regime === "slowdown") && signals.macro.confidence >= 60) {
    threats.push({
      id: `macro-${signals.macro.regime}`,
      kind: "macro",
      target: "Portfolio (β-exposure)",
      severity: signals.macro.regime === "contraction" ? "HIGH" : "MED",
      evidence: `Macro regime: ${signals.macro.regime} · conf ${signals.macro.confidence}%`,
      contributionToRisk: signals.macro.regime === "contraction" ? 25 : 15,
      source: "macro-intel",
    });
  }

  // 7. Flow — smart money decisively risk-off is a real signal
  if (signals?.flows?.smartMoneyDirection === "RISK_OFF" && (signals.flows.unusualActivityCount ?? 0) >= 3) {
    threats.push({
      id: `flow-riskoff`,
      kind: "flow",
      target: "Portfolio (β-exposure)",
      severity: "MED",
      evidence: `Smart-money RISK-OFF · ${signals.flows.unusualActivityCount} unusual flows`,
      contributionToRisk: 18,
      source: "institutional-flows",
    });
  }

  return threats.sort(
    (a, b) =>
      severityWeight(b.severity) - severityWeight(a.severity) ||
      b.contributionToRisk - a.contributionToRisk,
  );
}

function severityWeight(s: ThreatSeverity): number {
  return s === "CRITICAL" ? 3 : s === "HIGH" ? 2 : 1;
}

// ---------- Defensive action proposal ----------

export function proposeActions(
  threats: Threat[],
  holdings: FortressHolding[],
  totalValue: number,
  signals?: LiveSignals,
): DefensiveAction[] {
  if (!threats.length || !holdings.length) return [];
  const profile = deriveRegimeProfile(signals);
  const actions: DefensiveAction[] = [];
  let cumulativeCostBps = 0;
  let cumulativeUpsideClippedPct = 0;
  const HEDGE_COST_CAP_BPS = profile.hedgeCostCapBps;
  const UPSIDE_FLOOR_PCT = profile.upsideFloorPct;
  // Maximum cumulative upside we're willing to clip = 100 - floor
  const MAX_TOTAL_UPSIDE_CLIP = 100 - UPSIDE_FLOOR_PCT;

  const tryAccept = (a: DefensiveAction): boolean => {
    if (cumulativeCostBps + a.costBps > HEDGE_COST_CAP_BPS) return false;
    if (cumulativeUpsideClippedPct + a.upsideClippedPct > MAX_TOTAL_UPSIDE_CLIP) return false;
    actions.push(a);
    cumulativeCostBps += a.costBps;
    cumulativeUpsideClippedPct += a.upsideClippedPct;
    return true;
  };

  for (const t of threats) {
    if (t.kind === "concentration") {
      const h = holdings.find((x) => x.ticker === t.target);
      if (!h) continue;
      const baseTrim = t.severity === "CRITICAL" ? 30 : t.severity === "HIGH" ? 22 : 15;
      const trimPct = Math.round(baseTrim * profile.trimAggressivenessMult);
      const weight = h.value / totalValue;
      tryAccept({
        id: `act-trim-${t.id}`,
        kind: "trim",
        target: t.target,
        sizePct: trimPct,
        rationale: `Trim ${t.target} ${trimPct}% — concentration ${(weight * 100).toFixed(0)}% above ${(profile.concentrationLimit * 100) | 0}% regime cap`,
        trigger: `weight ${(weight * 100) | 0}% > ${(profile.concentrationLimit * 100) | 0}% threshold`,
        riskReductionBps: Math.round(trimPct * 4 * (h.beta || 1)),
        costBps: 4,
        upsideClippedPct: Math.round(trimPct * weight * 100) / 100, // upside foregone scales with weight
        confidence: 88,
        threatId: t.id,
      });
    } else if (t.kind === "correlation") {
      const defensive = pickDefensiveCandidate(holdings, t.target);
      const sizePct = t.severity === "CRITICAL" ? 8 : 5;
      tryAccept({
        id: `act-hedge-${t.id}`,
        kind: "hedge",
        target: t.target,
        sizePct,
        instrument: defensive,
        rationale: `Hedge ${t.target} cluster via ${defensive} (${sizePct}% notional)`,
        trigger: `sector cluster ${((sectorWeight(holdings, t.target, totalValue) * 100) | 0)}% > ${(profile.sectorClusterLimit * 100) | 0}%`,
        riskReductionBps: Math.round(sizePct * 6),
        costBps: 18,
        upsideClippedPct: sizePct * 0.45, // overlay clips a fraction of upside
        confidence: 79,
        threatId: t.id,
      });
    } else if (t.kind === "trajectory") {
      const h = holdings.find((x) => x.ticker === t.target);
      if (!h) continue;
      const baseTrim = t.severity === "CRITICAL" ? 50 : 30;
      const trimPct = Math.round(baseTrim * profile.trimAggressivenessMult);
      const weight = h.value / totalValue;
      tryAccept({
        id: `act-trim-${t.id}`,
        kind: "trim",
        target: t.target,
        sizePct: trimPct,
        rationale: `Trim ${t.target} ${trimPct}% — past regime stop (${h.pnlPct.toFixed(1)}%)`,
        trigger: `unrealized ${h.pnlPct.toFixed(1)}% < regime stop ${profile.trajectoryStopPct}%`,
        riskReductionBps: Math.round(trimPct * 3),
        costBps: 4,
        upsideClippedPct: Math.round(trimPct * weight * 100) / 100,
        confidence: 82,
        threatId: t.id,
      });
    } else if (t.kind === "volatility") {
      const h = holdings.find((x) => x.ticker === t.target);
      if (!h) continue;
      tryAccept({
        id: `act-convert-${t.id}`,
        kind: "convert",
        target: t.target,
        sizePct: 100,
        instrument: "protective collar",
        rationale: `Convert ${t.target} into collar — vol-spike risk in current regime`,
        trigger: `β=${h.beta.toFixed(2)} · risk=${h.risk}/100`,
        riskReductionBps: Math.round((h.risk / 100) * 25),
        costBps: 12,
        upsideClippedPct: 6, // collars cap upside slightly
        confidence: 74,
        threatId: t.id,
      });
    } else if (t.kind === "geopolitical") {
      const h = holdings.find((x) => x.ticker === t.target);
      if (!h) continue;
      const trimPct = t.severity === "CRITICAL" ? 25 : t.severity === "HIGH" ? 15 : 10;
      const weight = h.value / totalValue;
      tryAccept({
        id: `act-trim-${t.id}`,
        kind: "trim",
        target: t.target,
        sizePct: trimPct,
        rationale: `Reduce ${t.target} ${trimPct}% — live geopolitical exposure detected`,
        trigger: t.evidence,
        riskReductionBps: Math.round(trimPct * 3.5),
        costBps: 4,
        upsideClippedPct: Math.round(trimPct * weight * 100) / 100,
        confidence: 76,
        threatId: t.id,
      });
    } else if (t.kind === "macro" || t.kind === "flow") {
      // Portfolio-wide overlay rather than per-position trim
      const sizePct = t.severity === "HIGH" ? 7 : 4;
      tryAccept({
        id: `act-hedge-${t.id}`,
        kind: "hedge",
        target: "Portfolio β",
        sizePct,
        instrument: signals?.regime?.vix && signals.regime.vix >= 25 ? "VIX call spread" : "Index put overlay",
        rationale: `Top-down hedge — ${t.kind === "macro" ? "macro regime risk" : "smart-money risk-off"}`,
        trigger: t.evidence,
        riskReductionBps: Math.round(sizePct * 5),
        costBps: 14,
        upsideClippedPct: sizePct * 0.4,
        confidence: 70,
        threatId: t.id,
      });
    }
  }

  return actions;
}

function sectorWeight(holdings: FortressHolding[], sector: string, totalValue: number): number {
  const v = holdings.filter((h) => h.sector === sector).reduce((s, h) => s + h.value, 0);
  return totalValue > 0 ? v / totalValue : 0;
}

function pickDefensiveCandidate(holdings: FortressHolding[], excludeSector: string): string {
  const candidates = holdings
    .filter((h) => h.sector !== excludeSector && h.beta < 1.0)
    .sort((a, b) => a.beta - b.beta);
  if (candidates[0]) return candidates[0].ticker;
  return "low-β defensive proxy";
}

// ---------- Simulation + bounded downside ----------

export function simulateDefensiveOutcome(
  holdings: FortressHolding[],
  totalValue: number,
  actions: DefensiveAction[],
  fortressActive: boolean,
  signals?: LiveSignals,
): FortressMetrics {
  if (!holdings.length || totalValue <= 0) {
    return {
      boundedDownside: 0,
      riskScore: 0,
      baselineRiskScore: 0,
      reductionPct: 0,
      confidence: 0,
      preSigma: 0,
      postSigma: 0,
      preMaxDD: 0,
      postMaxDD: 0,
      upsidePreserved: 100,
      regimeLabel: signals?.regime?.label || "—",
    };
  }

  const avgBeta = holdings.reduce((s, h) => s + (h.beta || 1), 0) / holdings.length;
  const avgRisk = holdings.reduce((s, h) => s + (h.risk || 40), 0) / holdings.length;

  // Live VIX scales the pre-fortress sigma envelope
  const vix = signals?.regime?.vix ?? 20;
  const vixMult = Math.max(0.85, Math.min(1.6, vix / 20));
  const preSigma = +(avgBeta * 18 * vixMult + (avgRisk - 40) * 0.25).toFixed(1);
  const preMaxDD = +(-(preSigma * 1.6)).toFixed(1);
  const baselineRiskScore = Math.round(avgRisk);

  const totalReductionBps = actions.reduce((s, a) => s + a.riskReductionBps, 0);
  const reductionPct = fortressActive ? Math.min(45, Math.round(totalReductionBps / 30)) : 0;
  const postSigma = +Math.max(8, preSigma * (1 - reductionPct / 100)).toFixed(1);
  const postMaxDD = +(-(postSigma * 1.45)).toFixed(1);
  const riskScore = Math.max(15, Math.round(baselineRiskScore * (1 - reductionPct / 100)));

  const oneDayPostSigma = postSigma / Math.sqrt(252) / 100;
  const boundedDownside = Math.round(totalValue * oneDayPostSigma * 2.326);

  const upsideClipped = actions.reduce((s, a) => s + a.upsideClippedPct, 0);
  const upsidePreserved = Math.max(0, Math.round(100 - upsideClipped));

  const avgActionConf =
    actions.length > 0
      ? actions.reduce((s, a) => s + a.confidence, 0) / actions.length
      : 50;
  const confidence = fortressActive
    ? Math.min(95, Math.round(60 + actions.length * 4 + (avgActionConf - 70) * 0.4))
    : Math.round(avgActionConf * 0.5);

  return {
    boundedDownside,
    riskScore,
    baselineRiskScore,
    reductionPct,
    confidence,
    preSigma,
    postSigma,
    preMaxDD,
    postMaxDD,
    upsidePreserved,
    regimeLabel: signals?.regime?.label || "Balanced",
  };
}

export const FORTRESS_CONSTRAINTS = {
  hedgeCostCapBps: 120,
  minResidualUpsidePct: 30,
  preferTrim: true,
} as const;
