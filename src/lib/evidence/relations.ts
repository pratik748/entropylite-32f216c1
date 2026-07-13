/**
 * Evidence relationship engine — the typed edge web that turns isolated
 * metrics into a connected evidence network. Edges are declared once, with
 * direction, polarity and the mechanism named in one sentence; queries
 * resolve them against whatever nodes the current graph actually has, so
 * navigation never dead-ends on missing data.
 */

import type {
  EvidenceGraph,
  EvidenceMetric,
  EvidenceRelation,
  RelationNeighborhood,
} from "./types";
import { round } from "./compute";

/**
 * The declared web. `from` influences `to`; polarity +1 means strength in
 * `from` supports `to` (or raises it), −1 means it pressures or undermines
 * it. Edges only render when both endpoints exist in the built graph.
 */
export const EVIDENCE_RELATIONS: EvidenceRelation[] = [
  /* ── Returns, quality and what they justify ─────────────────── */
  { from: "roe", to: "pbv", kind: "driver", polarity: 1, note: "High returns on equity are what earn a premium to book — P/B without ROE is unpaid-for hope." },
  { from: "roe", to: "pe", kind: "driver", polarity: 1, note: "Durable capital efficiency is the classic justification for an above-market earnings multiple." },
  { from: "roe", to: "dividend_yield", kind: "driver", polarity: 1, note: "Returns above reinvestment needs create the payout capacity behind the dividend." },
  { from: "moat", to: "roe", kind: "driver", polarity: 1, note: "The moat is what lets returns on capital persist instead of being competed away." },
  { from: "moat", to: "pe", kind: "driver", polarity: 1, note: "Durable advantage extends the runway the multiple is capitalizing." },
  { from: "debt_equity", to: "roe", kind: "constraint", polarity: -1, note: "Leverage mechanically inflates ROE — the same returns on more borrowed capital, not better economics." },
  { from: "sharpe_1y", to: "engine_verdict", kind: "context", polarity: 1, note: "Risk-adjusted delivery corroborates the engine's read of the setup." },

  /* ── Statement chain: margins → returns → multiple ──────────── */
  { from: "moat", to: "gross_margin", kind: "driver", polarity: 1, note: "Pricing power is the moat made visible — it is what keeps gross margin from being competed away." },
  { from: "gross_margin", to: "operating_margin", kind: "driver", polarity: 1, note: "Everything below gross profit is cost discipline; the gross line sets the ceiling." },
  { from: "operating_margin", to: "net_margin", kind: "driver", polarity: 1, note: "Operating economics flow through to the bottom line net of financing and tax." },
  { from: "net_margin", to: "roe", kind: "driver", polarity: 1, note: "Margin is the first term of the DuPont identity — the profit engine inside ROE." },
  { from: "roa", to: "roe", kind: "context", polarity: 1, note: "The ROE–ROA gap is the leverage story: ROA is the unlevered truth." },
  { from: "revenue_growth", to: "pe", kind: "driver", polarity: 1, note: "Growth is what a premium multiple is buying; without it the multiple is a countdown." },
  { from: "earnings_growth", to: "pe", kind: "driver", polarity: 1, note: "Earnings revisions are the re-rating machine's primary input." },
  { from: "revenue_growth", to: "revenue", kind: "context", polarity: 1, note: "The growth rate is the derivative of the reported top line." },
  { from: "fcf_conversion", to: "pe", kind: "driver", polarity: 1, note: "Cash-backed earnings deserve a fuller multiple than accrual-heavy ones." },
  { from: "fcf", to: "capital_returned", kind: "driver", polarity: 1, note: "Buybacks and dividends are paid from free cash flow — or from the balance sheet when it falls short." },
  { from: "fcf", to: "dividend_yield", kind: "driver", polarity: 1, note: "FCF coverage is what makes a yield durable rather than a trap." },
  { from: "capex_intensity", to: "fcf", kind: "constraint", polarity: -1, note: "Every point of capital intensity is revenue that never becomes free cash." },
  { from: "net_debt", to: "financial_risk", kind: "driver", polarity: -1, note: "The net obligation, not gross debt, is what stresses the equity in a downturn." },
  { from: "current_ratio", to: "financial_risk", kind: "context", polarity: 1, note: "Near-term liquidity is the first buffer before balance-sheet risk becomes an event." },
  { from: "net_margin", to: "fcf_margin", kind: "driver", polarity: 1, note: "Accounting margin sets the ceiling for cash margin; the gap is accruals and reinvestment." },

  /* ── Balance sheet → risk chain ─────────────────────────────── */
  { from: "debt_equity", to: "financial_risk", kind: "driver", polarity: -1, note: "Leverage is the primary input to balance-sheet risk — it converts margin pressure into distress." },
  { from: "financial_risk", to: "risk_composite", kind: "driver", polarity: -1, note: "Balance-sheet fragility feeds directly into the composite risk the desk sizes against." },
  { from: "volatility", to: "risk_composite", kind: "driver", polarity: -1, note: "Realized volatility is the largest single component of composite risk." },
  { from: "volatility", to: "sharpe_1y", kind: "constraint", polarity: -1, note: "Every unit of volatility raises the bar returns must clear to stay risk-adjusted positive." },
  { from: "volatility", to: "max_drawdown", kind: "driver", polarity: -1, note: "High-vol regimes produce the deep drawdowns; the two travel together." },
  { from: "sector_risk", to: "risk_composite", kind: "driver", polarity: -1, note: "Sector cyclicality is undiversifiable within the name and flows straight into composite risk." },
  { from: "macro_risk", to: "risk_composite", kind: "driver", polarity: -1, note: "Macro dependence adds regime risk the company cannot control." },
  { from: "beta", to: "macro_risk", kind: "driver", polarity: -1, note: "Market sensitivity is the transmission channel for macro shocks into this name." },
  { from: "geo_concentration", to: "macro_risk", kind: "driver", polarity: -1, note: "Single-region revenue converts that region's politics, FX and cycle into company-level macro risk." },
  { from: "segment_concentration", to: "risk_composite", kind: "driver", polarity: -1, note: "One-product revenue means one product cycle is the whole risk book." },
  { from: "supply_chain_risk", to: "risk_composite", kind: "driver", polarity: -1, note: "Concentrated supply chains put revenue and margin at risk simultaneously." },
  { from: "regulatory_exposure", to: "regulatory_risk_engine", kind: "driver", polarity: -1, note: "The tracked regulatory register is what the engine's live headline scan is picking up." },
  { from: "regulatory_risk_engine", to: "risk_composite", kind: "driver", polarity: -1, note: "Regulatory action reprices in gaps — it carries disproportionate weight in composite risk." },
  { from: "risk_composite", to: "engine_verdict", kind: "constraint", polarity: -1, note: "Composite risk directly caps how aggressive the engine's verdict can be." },

  /* ── Tape, structure and simulation ─────────────────────────── */
  { from: "tsr_3m", to: "trend_structure", kind: "driver", polarity: 1, note: "Near-term flows are what build or break the trend structure." },
  { from: "tsr_1y", to: "pos_52w", kind: "driver", polarity: 1, note: "The year's return path determines where price sits in its range." },
  { from: "tsr_1y", to: "narrative_momentum", kind: "driver", polarity: 1, note: "Price leadership feeds the story; narratives follow the tape more than they lead it." },
  { from: "trend_structure", to: "support_distance", kind: "driver", polarity: 1, note: "Trend state sets where support and resistance sit, and with them the payoff shape of an entry." },
  { from: "rsi", to: "trend_structure", kind: "context", polarity: -1, note: "Stretched positioning warns that the trend's easy portion has already been paid out." },
  { from: "volume_trend", to: "trend_structure", kind: "context", polarity: 1, note: "Volume confirms trend: expansion validates the move, contraction says conviction is thin." },
  { from: "support_distance", to: "monte_carlo_spread", kind: "driver", polarity: 1, note: "The support/resistance frame is what shapes the simulated distribution's asymmetry." },
  { from: "monte_carlo_spread", to: "engine_verdict", kind: "driver", polarity: 1, note: "The engine acts on distribution skew — you are paid for asymmetry, not point forecasts." },
  { from: "pos_52w", to: "max_drawdown", kind: "context", polarity: 1, note: "Names pinned to their lows are usually mid-drawdown; range position and drawdown state read together." },

  /* ── Flow, ownership and narrative ──────────────────────────── */
  { from: "insider_net_flow", to: "insider_confidence", kind: "driver", polarity: 1, note: "The dossier's confidence score is anchored on the reported net buy/sell flow." },
  { from: "insider_confidence", to: "ownership_stability", kind: "context", polarity: 1, note: "Management conviction and register stability tend to move together." },
  { from: "institutional_pct", to: "ownership_stability", kind: "driver", polarity: 1, note: "Institutional sponsorship is what makes a register sticky through drawdowns." },
  { from: "news_pressure", to: "narrative_momentum", kind: "driver", polarity: 1, note: "Headline flow is the raw material the narrative is built from." },
  { from: "social_sentiment", to: "narrative_momentum", kind: "context", polarity: 1, note: "Retail tone follows and amplifies the prevailing story." },
  { from: "narrative_momentum", to: "analyst_upside", kind: "driver", polarity: 1, note: "Strengthening narratives pull analyst targets up before the numbers move." },
  { from: "analyst_upside", to: "pe", kind: "context", polarity: 1, note: "Street targets embed the same expectations the multiple is pricing — read the gap between them." },
  { from: "news_pressure", to: "regulatory_risk_engine", kind: "context", polarity: -1, note: "Adverse headline clusters are often the first visible edge of regulatory pressure." },
];

/** Neighborhood of a node, resolved against the current graph. */
export function neighborhood(graph: EvidenceGraph, id: string): RelationNeighborhood {
  const drivers: RelationNeighborhood["drivers"] = [];
  const driven: RelationNeighborhood["driven"] = [];
  const ids = new Set<string>([id]);
  for (const rel of EVIDENCE_RELATIONS) {
    if (rel.to === id && graph.metrics[rel.from]) {
      drivers.push({ metric: graph.metrics[rel.from], relation: rel });
      ids.add(rel.from);
    }
    if (rel.from === id && graph.metrics[rel.to]) {
      driven.push({ metric: graph.metrics[rel.to], relation: rel });
      ids.add(rel.to);
    }
  }
  return { drivers, driven, ids };
}

/** All node ids connected to `id` (for cross-page highlighting). */
export function connectedIds(graph: EvidenceGraph, id: string | null): Set<string> {
  if (!id) return new Set();
  return neighborhood(graph, id).ids;
}

/**
 * Corroborating / countervailing evidence: neighbors whose own thesis pull
 * agrees with or opposes this node's pull on the recommendation.
 */
export function alignment(graph: EvidenceGraph, id: string) {
  const center = graph.metrics[id];
  const { drivers, driven } = neighborhood(graph, id);
  const all = [...drivers, ...driven];
  const seen = new Set<string>();
  const unique = all.filter((e) => {
    if (seen.has(e.metric.id) || e.metric.id === id) return false;
    seen.add(e.metric.id);
    return true;
  });
  const supporting = unique.filter((e) => e.metric.thesisWeight * (center?.thesisWeight ?? 0) > 0);
  const opposing = unique.filter((e) => e.metric.thesisWeight * (center?.thesisWeight ?? 0) < 0);
  return { supporting, opposing };
}

/* ── Deterministic sensitivity for valuation nodes ─────────────── */

export interface SensitivityRow {
  scenario: string;
  implied: number;
  deltaPct: number;
}

/**
 * What the current multiple implies and how price responds to the two
 * levers (earnings delivery, multiple reversion). Pure arithmetic on the
 * node's actual operands — no forecasts invented.
 */
export function valuationSensitivity(
  graph: EvidenceGraph,
  price: number | null,
): { rows: SensitivityRow[]; implied: string } | null {
  const pe = graph.metrics["pe"]?.value ?? null;
  if (pe == null || pe <= 0 || price == null || price <= 0) return null;
  const eps = price / pe;
  const mk = (scenario: string, implied: number): SensitivityRow => ({
    scenario,
    implied: round(implied, 2),
    deltaPct: round(((implied - price) / price) * 100, 1),
  });
  const rows: SensitivityRow[] = [
    mk("EPS +10%, multiple held", eps * 1.1 * pe),
    mk("EPS −10%, multiple held", eps * 0.9 * pe),
    mk("Multiple → market norm 18×, EPS held", eps * 18),
    mk("Multiple → 26× (upper normal band), EPS held", eps * 26),
  ];
  const earningsYield = round((1 / pe) * 100, 1);
  const implied = `At ${round(pe, 1)}× the earnings yield is ${earningsYield}%. Holding this multiple requires the market to keep believing earnings compound faster than the broad market's long-run trend — the moment that belief breaks, the reversion rows below are the price path.`;
  return { rows, implied };
}
