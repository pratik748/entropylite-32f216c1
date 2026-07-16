/**
 * Deterministic synthesis over the evidence graph — pillar scores, the
 * recommendation, probability-weighted cases, live thesis breakers and the
 * auditable confidence ledger. Pure computation: re-runs instantly whenever
 * a node changes, which is what makes the thesis continuously updated.
 */

import type {
  Action,
  EvidenceGraph,
  EvidenceMetric,
  Pillar,
  PillarScore,
  ScenarioCase,
  Synthesis,
  ThesisBreaker,
} from "./types";
import { clamp, normalCdf, round } from "./compute";
import type { Contribution } from "./types";
import type { DeskAnalysis } from "./inputs";
import { EVIDENCE_RELATIONS } from "./relations";

const PILLAR_LABELS: Record<Pillar, string> = {
  valuation: "Valuation",
  quality: "Quality",
  growth: "Growth",
  health: "Health",
  momentum: "Momentum",
  risk: "Risk",
};

const GRADE_SCORE = { good: 90, neutral: 55, bad: 15, unknown: 50 } as const;

/**
 * Decisions, not scores: each pillar's number resolves to the word an
 * analyst would actually write in the memo. High–mid–low per pillar.
 */
const PILLAR_VERDICTS: Record<Pillar, [string, string, string]> = {
  valuation: ["Undemanding", "Full", "Rich"],
  quality: ["Elite", "Sound", "Fragile"],
  growth: ["Compounding", "Moderate", "Stalling"],
  health: ["Fortress", "Stable", "Strained"],
  momentum: ["Leading", "Neutral", "Under pressure"],
  risk: ["Contained", "Watchful", "Elevated"],
};

export function pillarVerdict(pillar: Pillar, score: number): string {
  const [hi, mid, lo] = PILLAR_VERDICTS[pillar];
  return score >= 68 ? hi : score >= 45 ? mid : lo;
}

function pillarRead(pillar: Pillar, score: number, nodes: EvidenceMetric[]): string {
  const worst = [...nodes].sort((a, b) => a.thesisWeight - b.thesisWeight)[0];
  const best = [...nodes].sort((a, b) => b.thesisWeight - a.thesisWeight)[0];
  if (score >= 70) return best ? shortLabel(best) : "strong";
  if (score <= 38) return worst ? shortLabel(worst) : "weak";
  return "mixed";
}

function shortLabel(m: EvidenceMetric): string {
  const l = m.label.toLowerCase();
  if (l.length <= 18) return l;
  return l.slice(0, 16).trimEnd() + "…";
}

function scorePillar(pillar: Pillar, nodes: EvidenceMetric[]): PillarScore {
  const relevant = nodes.filter((n) => n.pillar === pillar && n.assessment.grade !== "unknown");
  if (relevant.length === 0) {
    return { pillar, label: PILLAR_LABELS[pillar], score: 50, verdict: "No evidence", read: "no evidence yet", nodeIds: [] };
  }
  let weighted = 0;
  let weights = 0;
  for (const n of relevant) {
    const importance = Math.max(0.1, Math.abs(n.thesisWeight)) || 0.1;
    weighted += GRADE_SCORE[n.assessment.grade] * importance;
    weights += importance;
  }
  const score = round(weighted / weights, 0);
  return {
    pillar,
    label: PILLAR_LABELS[pillar],
    score,
    verdict: pillarVerdict(pillar, score),
    read: pillarRead(pillar, score, relevant),
    nodeIds: relevant.map((n) => n.id),
  };
}

function buildBreakers(graph: EvidenceGraph): ThesisBreaker[] {
  const g = graph.metrics;
  const breakers: ThesisBreaker[] = [];

  const rr = g["support_distance"];
  if (rr) {
    const v = rr.value;
    breakers.push({
      id: "rr_collapse",
      label: "Risk:reward falls below 1:1",
      state: v == null ? "watch" : v < 1 ? "tripped" : v < 1.3 ? "watch" : "intact",
      detail:
        v == null
          ? "Price is sitting on support — the payoff ratio is unstable."
          : `Current structure ${v}:1 against the 1.5:1 entry discipline.`,
      nodeIds: ["support_distance"],
    });
  }

  const riskC = g["risk_composite"];
  if (riskC?.value != null) {
    breakers.push({
      id: "risk_regime",
      label: "Composite risk enters the danger zone (≥75)",
      state: riskC.value >= 75 ? "tripped" : riskC.value >= 65 ? "watch" : "intact",
      detail: `Composite risk at ${riskC.value}/100 across the five engine factors.`,
      nodeIds: ["risk_composite"],
    });
  }

  const vol = g["volatility"];
  if (vol?.value != null) {
    const pct = vol.percentiles.history;
    breakers.push({
      id: "vol_regime",
      label: "Volatility regime breaks to extremes",
      state: pct != null && pct >= 92 ? "tripped" : pct != null && pct >= 80 ? "watch" : "intact",
      detail:
        pct != null
          ? `Realized vol ${vol.value}% sits at the ${pct}th percentile of its own two-year regime.`
          : `Realized vol ${vol.value}% — regime percentile pending price history.`,
      nodeIds: ["volatility"],
    });
  }

  const insider = g["insider_confidence"] ?? g["insider_net_flow"];
  if (insider?.value != null) {
    const bad = insider.id === "insider_confidence" ? insider.value < 30 : insider.value < -40;
    const watch = insider.id === "insider_confidence" ? insider.value < 45 : insider.value < -15;
    breakers.push({
      id: "insider_distribution",
      label: "Insiders move to sustained net selling",
      state: bad ? "tripped" : watch ? "watch" : "intact",
      detail: insider.assessment.reason,
      nodeIds: [insider.id],
    });
  }

  const dd = g["max_drawdown"];
  const pos = g["pos_52w"];
  if (pos?.value != null) {
    breakers.push({
      id: "structure_break",
      label: "Price breaks to the bottom decile of its yearly range",
      state: pos.value <= 8 ? "tripped" : pos.value <= 20 ? "watch" : "intact",
      detail: `Sitting at ${pos.value}/100 of the 52-week range${dd?.value != null ? `; worst 2y drawdown ${dd.value}%` : ""}.`,
      nodeIds: ["pos_52w", ...(dd ? ["max_drawdown"] : [])],
    });
  }

  const reg = g["regulatory_exposure"] ?? g["regulatory_risk_engine"];
  if (reg?.value != null) {
    breakers.push({
      id: "regulatory_shock",
      label: "Regulatory exposure escalates (≥70)",
      state: reg.value >= 70 ? "tripped" : reg.value >= 55 ? "watch" : "intact",
      detail: reg.assessment.reason,
      nodeIds: [reg.id],
    });
  }

  return breakers;
}

/** Horizon of the engine's simulated outcome distribution, in sessions. */
export const CASE_HORIZON_SESSIONS = 21;

export interface HorizonModel {
  /** Log-drift of ln(S_T/S0) over the full horizon (drift − σ²/2 already applied). */
  m: number;
  /** Log-volatility of ln(S_T/S0) over the full horizon. */
  sigma: number;
  /** Annualized volatility (%) the model was built from. */
  annualVolPct: number;
  horizonSessions: number;
}

/**
 * The single log-normal model behind cases, Monte Carlo and tail metrics:
 * geometric Brownian motion over the engine's 21-session horizon with σ
 * from the realized-volatility node and a bounded evidence drift — the
 * momentum and risk pillars tilt the horizon mean by at most ±0.75σ.
 * Returns null when volatility or price are unavailable so callers can
 * fall back to designed pending states — never invented numbers.
 */
export function logNormalHorizon(
  graph: EvidenceGraph,
  pillars: PillarScore[],
  price: number | null,
): HorizonModel | null {
  const vol = graph.metrics["volatility"]?.value;
  if (vol == null || vol <= 0 || price == null || price <= 0) return null;
  const sigma = (vol / 100) * Math.sqrt(CASE_HORIZON_SESSIONS / 252);
  if (!(sigma > 0)) return null;
  const momentum = pillars.find((p) => p.pillar === "momentum")?.score ?? 50;
  const risk = pillars.find((p) => p.pillar === "risk")?.score ?? 50;
  // Evidence drift: momentum leads, contained risk supports; bounded ±0.75σ.
  // Thesis breakers drag the drift — a tripped breaker is realised downside
  // evidence, and the distribution that prices the cases and tail metrics
  // must carry it, otherwise the verdict (which reacts to breakers) can
  // contradict the expected return rendered next to it.
  const breakers = buildBreakers(graph);
  const breakerDrag =
    0.3 * breakers.filter((b) => b.state === "tripped").length +
    0.1 * breakers.filter((b) => b.state === "watch").length;
  const tilt = clamp((0.5 * (momentum - 50) + 0.25 * (risk - 50)) / 50 - breakerDrag, -0.75, 0.75);
  return {
    m: tilt * sigma - (sigma * sigma) / 2,
    sigma,
    annualVolPct: vol,
    horizonSessions: CASE_HORIZON_SESSIONS,
  };
}

/**
 * Log-normal case probabilities from the shared horizon model. The bull
 * case is the probability of finishing inside the engine's bull band
 * (≥ its lower bound), the bear case of finishing inside the bear band
 * (≤ its upper bound); the base case is the remaining mass. Returns null
 * when the model or the bands are unavailable so a prior-based fallback
 * can take over — the surface is never blank.
 */
function caseProbabilities(
  graph: EvidenceGraph,
  pillars: PillarScore[],
  analysis: DeskAnalysis | null,
  price: number | null,
): { bull: number; base: number; bear: number } | null {
  const model = logNormalHorizon(graph, pillars, price);
  const bullLo = Array.isArray(analysis?.bullRange) ? analysis!.bullRange[0] : null;
  const bearHi = Array.isArray(analysis?.bearRange) ? analysis!.bearRange[1] : null;
  if (!model || price == null || price <= 0) return null;
  if (bullLo == null || bearHi == null || bullLo <= 0 || bearHi <= 0 || bearHi >= bullLo) return null;
  const { m, sigma } = model;

  let bull = 1 - normalCdf((Math.log(bullLo / price) - m) / sigma);
  let bear = normalCdf((Math.log(bearHi / price) - m) / sigma);
  bull = clamp(bull, 0.05, 0.85);
  bear = clamp(bear, 0.05, 0.85);
  // Keep a real base case: shrink the tails proportionally if they crowd it out.
  const minBase = 0.08;
  if (bull + bear > 1 - minBase) {
    const scale = (1 - minBase) / (bull + bear);
    bull *= scale;
    bear *= scale;
  }
  const bullPct = Math.round(bull * 100);
  const bearPct = Math.round(bear * 100);
  return { bull: bullPct, bear: bearPct, base: 100 - bullPct - bearPct };
}

function buildCases(
  graph: EvidenceGraph,
  pillars: PillarScore[],
  analysis: DeskAnalysis | null,
  price: number | null,
): ScenarioCase[] {
  const g = graph.metrics;

  const quant = caseProbabilities(graph, pillars, analysis, price);
  let bullP: number;
  let bearP: number;
  let baseP: number;
  if (quant) {
    ({ bull: bullP, bear: bearP, base: baseP } = quant);
  } else {
    // Prior fallback when the log-normal inputs are missing: 25/50/25
    // tilted by the momentum and risk pillars and the simulated skew.
    const skew = g["monte_carlo_spread"]?.value ?? 0;
    const momentum = pillars.find((p) => p.pillar === "momentum")?.score ?? 50;
    const risk = pillars.find((p) => p.pillar === "risk")?.score ?? 50;
    bullP = clamp(25 + (momentum - 50) * 0.2 + (skew > 0 ? 4 : 0), 10, 45);
    bearP = clamp(25 + (50 - risk) * 0.2 + (skew < 0 ? 4 : 0), 10, 45);
    baseP = 100 - bullP - bearP;
  }

  const mkCase = (
    id: ScenarioCase["id"],
    label: string,
    probability: number,
    target: number | null,
    ret: number | null,
    narrative: string,
    anchorIds: string[],
  ): ScenarioCase => ({
    id,
    label,
    probability: round(probability, 0),
    target,
    returnPct: ret,
    narrative,
    anchorIds: anchorIds.filter((a) => !!g[a]),
  });

  return [
    mkCase(
      "bull",
      "Bull",
      bullP,
      null,
      null,
      "Trend structure holds, headline flow stays constructive and the simulated bull tail is realized. Requires momentum evidence to persist and no breaker to trip.",
      ["trend_structure", "monte_carlo_spread", "news_pressure"],
    ),
    mkCase(
      "base",
      "Base",
      baseP,
      null,
      null,
      "The evidence-weighted center: structure and fundamentals roughly as scored today, price tracks the neutral simulated band.",
      ["engine_verdict", "risk_composite", "roe"],
    ),
    mkCase(
      "bear",
      "Bear",
      bearP,
      null,
      null,
      "Risk factors dominate: the bear tail of the simulation is realized via a structure break or a risk-regime escalation. Watch the breaker panel — it is the early warning for this case.",
      ["risk_composite", "max_drawdown", "volatility"],
    ),
  ];
}

/** Attach targets/returns to cases from the engine's simulated ranges. */
function priceCases(cases: ScenarioCase[], analysis: DeskAnalysis | null, price: number | null): ScenarioCase[] {
  if (!analysis || price == null || price <= 0) return cases;
  const bull = Array.isArray(analysis.bullRange) ? analysis.bullRange[1] : null;
  const base = Array.isArray(analysis.neutralRange)
    ? (analysis.neutralRange[0] + analysis.neutralRange[1]) / 2
    : null;
  const bear = Array.isArray(analysis.bearRange) ? analysis.bearRange[0] : null;
  const withTarget = (c: ScenarioCase, t: number | null): ScenarioCase =>
    t == null
      ? c
      : { ...c, target: round(t, 2), returnPct: round(((t - price) / price) * 100, 1) };
  return cases.map((c) => (c.id === "bull" ? withTarget(c, bull) : c.id === "base" ? withTarget(c, base) : withTarget(c, bear)));
}

function actionFrom(net: number, breakers: ThesisBreaker[], coverage: number): Action {
  const tripped = breakers.filter((b) => b.state === "tripped").length;
  if (tripped >= 2) return "AVOID";
  if (net >= 1.6 && tripped === 0 && coverage >= 8) return "ACCUMULATE";
  if (net <= -1.6 || tripped === 1) return net <= -2.5 ? "AVOID" : "REDUCE";
  return "HOLD";
}

/**
 * Causal contribution scoring. A node's pull on the recommendation is its
 * own weight, amplified when its declared drivers point the same way and
 * damped when they conflict — corroborated evidence counts for more than a
 * lone reading, and contested evidence counts for less. Deterministic:
 * contribution = w × (1 + 0.25·aligned − 0.15·conflicting), clamped ±1.
 */
export function scoreContributions(graph: EvidenceGraph): Contribution[] {
  return graph.order.map((id) => {
    const node = graph.metrics[id];
    const base = node.thesisWeight;
    if (base === 0) return { id, base, scored: 0, via: [] };
    let aligned = 0;
    let conflicting = 0;
    const via: string[] = [];
    for (const rel of EVIDENCE_RELATIONS) {
      if (rel.to !== id) continue;
      const driver = graph.metrics[rel.from];
      if (!driver || driver.thesisWeight === 0) continue;
      // The driver's push on this node: its own pull × edge polarity.
      const push = driver.thesisWeight * rel.polarity;
      if (push * base > 0) {
        aligned += Math.abs(driver.thesisWeight) * driver.confidence;
        via.push(driver.label);
      } else {
        conflicting += Math.abs(driver.thesisWeight) * driver.confidence;
        via.push(`${driver.label} (against)`);
      }
    }
    const scored = round(clamp(base * (1 + 0.25 * aligned - 0.15 * conflicting), -1, 1), 2);
    return { id, base, scored, via };
  });
}

export function synthesize(
  graph: EvidenceGraph,
  analysis: DeskAnalysis | null,
  price: number | null,
): Synthesis {
  const nodes = graph.order.map((id) => graph.metrics[id]);
  const pillars = (Object.keys(PILLAR_LABELS) as Pillar[]).map((p) => scorePillar(p, nodes));
  const breakers = buildBreakers(graph);

  const contributions = scoreContributions(graph);
  const net = round(contributions.reduce((acc, c) => acc + c.scored, 0), 2);
  const supporting = contributions.filter((c) => c.scored > 0).length;
  const opposing = contributions.filter((c) => c.scored < 0).length;
  const neutral = contributions.length - supporting - opposing;
  const movers = [...contributions]
    .sort((a, b) => Math.abs(b.scored) - Math.abs(a.scored))
    .slice(0, 6)
    .map((c) => ({ id: c.id, weight: c.scored }));

  let action = actionFrom(net, breakers, nodes.length);

  // Quantitative coherence gate: the verdict must not contradict the sign
  // of the expected return implied by its own scenario distribution. An
  // ACCUMULATE with non-positive probability-weighted return, or a REDUCE
  // with positive expectancy and no tripped breaker, downgrades to HOLD —
  // the numbers on the surface and the action above them come from one
  // model or the ticket does not ship.
  const cases = priceCases(buildCases(graph, pillars, analysis, price), analysis, price);
  const evPct = cases.some((c) => c.returnPct != null)
    ? cases.reduce((s, c) => s + (c.probability / 100) * (c.returnPct ?? 0), 0)
    : null;
  const trippedCount = breakers.filter((b) => b.state === "tripped").length;
  if (evPct != null) {
    if (action === "ACCUMULATE" && evPct <= 0) action = "HOLD";
    if (action === "REDUCE" && evPct > 0 && trippedCount === 0) action = "HOLD";
  }

  // Symmetric decision-theoretic promotion — the mirror of the gate above,
  // and the same philosophy as the quant engine's (trade when the calibrated
  // probability sits off coin-flip AND expectancy clears costs). The
  // net-weight thresholds alone (±1.6) parked most names at HOLD even when
  // the horizon distribution had a real lean. Promotion demands probability
  // AND expectancy AND structure together, so conviction can never be
  // manufactured from a single number.
  const horizonModel = logNormalHorizon(graph, pillars, price);
  const pProfit = horizonModel ? normalCdf(horizonModel.m / horizonModel.sigma) : null;
  if (action === "HOLD" && pProfit != null && evPct != null) {
    if (pProfit >= 0.53 && evPct >= 1 && trippedCount === 0 && net > 0) action = "ACCUMULATE";
    else if (pProfit <= 0.47 && evPct <= -1) action = "REDUCE";
  }

  // Logistic confidence calibration: evidence volume, directional agreement
  // and the magnitude of the net contribution raise the logit; estimated
  // provenance and non-intact breakers lower it. The sigmoid is mapped onto
  // [35, 90] so displayed confidence saturates smoothly at both ends instead
  // of hitting an arbitrary linear clamp.
  const estimatedShare = graph.coverage.total > 0 ? graph.coverage.estimated / graph.coverage.total : 1;
  const agreement = nodes.length > 0 ? Math.abs(supporting - opposing) / nodes.length : 0;
  const breakerShare = breakers.length > 0 ? breakers.filter((b) => b.state !== "intact").length / breakers.length : 0;
  const zConf =
    -0.6 +
    1.3 * (Math.min(nodes.length, 40) / 40) +
    1.1 * agreement +
    0.9 * Math.tanh(Math.abs(net) / 4) -
    1.2 * estimatedShare -
    0.8 * breakerShare;
  const confidence = round(35 + 55 / (1 + Math.exp(-zConf)), 0);

  const strongestFor = movers.find((m) => m.weight > 0);
  const strongestAgainst = movers.find((m) => m.weight < 0);

  const headline =
    action === "ACCUMULATE"
      ? `Evidence favors owning ${graph.ticker}: net weight +${net} across ${nodes.length} nodes with no breaker tripped.`
      : action === "HOLD"
        ? `The evidence on ${graph.ticker} is balanced (net ${net >= 0 ? "+" : ""}${net}) — hold existing exposure, add only on improved structure.`
        : action === "REDUCE"
          ? net <= -1.6
            ? `Opposing evidence outweighs support on ${graph.ticker} (net ${net}) — reduce exposure and defend the position.`
            : trippedCount > 0
              ? `A tripped thesis breaker overrides the evidence balance on ${graph.ticker} (net ${net >= 0 ? "+" : ""}${net}) — reduce exposure while it stands.`
              : `The horizon distribution leans against ${graph.ticker}${pProfit != null ? ` (P(profit) ${Math.round(pProfit * 100)}%` : "("}${evPct != null ? `, Σ p·r ${evPct >= 0 ? "+" : ""}${evPct.toFixed(1)}%)` : ")"} — reduce exposure and defend the position.`
          : `The evidence stack argues against holding ${graph.ticker} here — ${breakers.filter((b) => b.state === "tripped").length} breaker(s) tripped, net weight ${net}.`;

  const narrative: string[] = [];
  if (strongestFor) {
    const n = graph.metrics[strongestFor.id];
    narrative.push(`Strongest support: ${n.label} — ${lowerFirst(n.assessment.reason)}`);
  }
  if (strongestAgainst) {
    const n = graph.metrics[strongestAgainst.id];
    narrative.push(`Strongest concern: ${n.label} — ${lowerFirst(n.assessment.reason)}`);
  }
  const watchers = breakers.filter((b) => b.state !== "intact");
  if (watchers.length > 0) {
    narrative.push(
      `Breaker panel: ${watchers.map((b) => `${b.label.toLowerCase()} (${b.state})`).join("; ")}.`,
    );
  } else if (breakers.length > 0) {
    narrative.push(`All ${breakers.length} thesis breakers are intact.`);
  }

  const keyDrivers = movers.slice(0, 5);

  return {
    action,
    confidence,
    headline,
    narrative,
    pillars,
    cases,
    breakers,
    keyDrivers,
    contributions,
    ledger: {
      supporting,
      opposing,
      neutral,
      estimated: graph.coverage.estimated,
      movers,
    },
  };
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0].toLowerCase() + s.slice(1) : s;
}
