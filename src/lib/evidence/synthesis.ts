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
import { clamp, round } from "./compute";
import type { DeskAnalysis } from "./inputs";

const PILLAR_LABELS: Record<Pillar, string> = {
  valuation: "Valuation",
  quality: "Quality",
  growth: "Growth",
  health: "Health",
  momentum: "Momentum",
  risk: "Risk",
};

const GRADE_SCORE = { good: 90, neutral: 55, bad: 15, unknown: 50 } as const;

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
    return { pillar, label: PILLAR_LABELS[pillar], score: 50, read: "no evidence yet", nodeIds: [] };
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

function buildCases(graph: EvidenceGraph, pillars: PillarScore[]): ScenarioCase[] {
  const g = graph.metrics;
  const skew = g["monte_carlo_spread"]?.value ?? 0;
  const momentum = pillars.find((p) => p.pillar === "momentum")?.score ?? 50;
  const risk = pillars.find((p) => p.pillar === "risk")?.score ?? 50;

  // Probabilities: start 25/50/25, tilt by momentum and risk pillars, renormalize.
  let bullP = 25 + (momentum - 50) * 0.2 + (skew > 0 ? 4 : 0);
  let bearP = 25 + (50 - risk) * 0.2 + (skew < 0 ? 4 : 0);
  bullP = clamp(bullP, 10, 45);
  bearP = clamp(bearP, 10, 45);
  const baseP = 100 - bullP - bearP;

  const price = g["market_cap"] ? null : null; // price handled below from ranges only
  void price;

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

export function synthesize(
  graph: EvidenceGraph,
  analysis: DeskAnalysis | null,
  price: number | null,
): Synthesis {
  const nodes = graph.order.map((id) => graph.metrics[id]);
  const pillars = (Object.keys(PILLAR_LABELS) as Pillar[]).map((p) => scorePillar(p, nodes));
  const breakers = buildBreakers(graph);

  const net = round(nodes.reduce((acc, n) => acc + n.thesisWeight, 0), 2);
  const supporting = nodes.filter((n) => n.thesisWeight > 0).length;
  const opposing = nodes.filter((n) => n.thesisWeight < 0).length;
  const neutral = nodes.length - supporting - opposing;
  const movers = [...nodes]
    .sort((a, b) => Math.abs(b.thesisWeight) - Math.abs(a.thesisWeight))
    .slice(0, 6)
    .map((n) => ({ id: n.id, weight: n.thesisWeight }));

  const action = actionFrom(net, breakers, nodes.length);

  const estimatedShare = graph.coverage.total > 0 ? graph.coverage.estimated / graph.coverage.total : 1;
  const agreement = nodes.length > 0 ? Math.abs(supporting - opposing) / nodes.length : 0;
  const confidence = round(
    clamp(38 + Math.min(nodes.length, 30) * 0.9 + agreement * 30 - estimatedShare * 14 - breakers.filter((b) => b.state !== "intact").length * 3, 35, 88),
    0,
  );

  const strongestFor = movers.find((m) => m.weight > 0);
  const strongestAgainst = movers.find((m) => m.weight < 0);

  const headline =
    action === "ACCUMULATE"
      ? `Evidence favors owning ${graph.ticker}: net weight +${net} across ${nodes.length} nodes with no breaker tripped.`
      : action === "HOLD"
        ? `The evidence on ${graph.ticker} is balanced (net ${net >= 0 ? "+" : ""}${net}) — hold existing exposure, add only on improved structure.`
        : action === "REDUCE"
          ? `Opposing evidence outweighs support on ${graph.ticker} (net ${net}) — reduce exposure and defend the position.`
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
  const cases = priceCases(buildCases(graph, pillars), analysis, price);

  return {
    action,
    confidence,
    headline,
    narrative,
    pillars,
    cases,
    breakers,
    keyDrivers,
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
