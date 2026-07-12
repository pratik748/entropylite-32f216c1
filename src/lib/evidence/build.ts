/**
 * Evidence graph builder — turns raw inputs (desk analysis, price history,
 * AI dossier, live quote) into typed EvidenceMetric nodes. Everything
 * computable is computed here deterministically; model-derived figures are
 * labeled with `estimated` / `model` provenance so the analyst can always
 * tell a filed number from a modeled one.
 */

import type { EvidenceGraph, EvidenceMetric, Grade, HistoryPoint } from "./types";
import type { DeskAnalysis, Dossier, Quote } from "./inputs";
import {
  annualizedVol,
  clamp,
  concentrationIndex,
  maxDrawdown,
  mean,
  percentileOfLast,
  positionIn52w,
  realizedSharpe,
  rollingVolSeries,
  round,
  sma,
  toHistory,
  trailingReturn,
  volumeTrend,
} from "./compute";

export interface Bars {
  closes: number[];
  volumes: number[];
  timestamps: number[];
}

export interface BuildInputs {
  ticker: string;
  /** analyze-stock response (already deployed engine). */
  analysis: DeskAnalysis | null;
  /** 2y daily bars from historical-prices. */
  bars: Bars | null;
  /** company-intelligence dossier. */
  dossier: Dossier | null;
  /** live quote from price-feed. */
  quote: Quote | null;
}

/** grade → contribution multiplier for thesis weight. */
const GRADE_SIGN: Record<Grade, number> = { good: 1, neutral: 0, bad: -1, unknown: 0 };

const SRC_PRICE = "price history · 2y daily";
const SRC_ENGINE = "analysis engine · live scrape";
const SRC_DOSSIER = "AI dossier · scrape-grounded";
const SRC_QUOTE = "live price feed";

interface NodeSpec {
  id: string;
  label: string;
  value: number | null;
  format: EvidenceMetric["format"];
  provenance: EvidenceMetric["provenance"];
  source: string;
  definition: string;
  calculation: string;
  whyItMatters: string;
  grade: Grade;
  reason: string;
  /** importance 0–1; thesisWeight = sign(grade) × importance. */
  importance: number;
  pillar: EvidenceMetric["pillar"];
  sections: string[];
  history?: HistoryPoint[];
  percentiles?: EvidenceMetric["percentiles"];
  relatedIds?: string[];
}

function makeNode(spec: NodeSpec): EvidenceMetric {
  return {
    id: spec.id,
    label: spec.label,
    value: spec.value,
    format: spec.format,
    provenance: spec.provenance,
    source: spec.source,
    definition: spec.definition,
    calculation: spec.calculation,
    whyItMatters: spec.whyItMatters,
    assessment: { grade: spec.grade, reason: spec.reason },
    history: spec.history ?? [],
    percentiles: spec.percentiles ?? {},
    relatedIds: spec.relatedIds ?? [],
    thesisWeight: round(GRADE_SIGN[spec.grade] * spec.importance, 2),
    pillar: spec.pillar,
    sections: spec.sections,
  };
}

const fmtNum = (v: number | null | undefined, dp = 2) =>
  v == null || !Number.isFinite(v) ? "—" : String(round(v, dp));

export function buildEvidenceGraph(inputs: BuildInputs): EvidenceGraph {
  const { ticker, analysis: a, bars, dossier: d, quote } = inputs;
  const nodes: EvidenceMetric[] = [];
  const push = (spec: NodeSpec | null) => {
    if (spec) nodes.push(makeNode(spec));
  };

  const currency: string = quote?.currency || a?.currency || "USD";
  const price: number | null = quote?.price ?? a?.currentPrice ?? null;
  const closes = bars?.closes ?? [];
  const priceHistory = bars ? toHistory(bars.closes, bars.timestamps) : [];

  /* ── Valuation ──────────────────────────────────────────────── */

  const pe = a?.pe ?? null;
  if (pe != null) {
    const grade: Grade = pe <= 0 ? "bad" : pe < 14 ? "good" : pe <= 26 ? "neutral" : "bad";
    push({
      id: "pe",
      label: "P/E (trailing)",
      value: pe,
      format: "ratio",
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Price divided by trailing twelve-month earnings per share — the price of one unit of current profit.",
      calculation: `Market price ÷ trailing EPS = ${fmtNum(pe)}× (scraped from exchange/aggregator filings data).`,
      whyItMatters: "The multiple embeds the market's growth and risk expectations; paying a high multiple without matching growth is the classic de-rating setup.",
      grade,
      reason:
        pe <= 0
          ? "Negative or nil earnings — the multiple is meaningless and profitability is the real question."
          : pe < 14
            ? `${fmtNum(pe)}× sits below the long-run broad-market norm (~18×) — undemanding if earnings hold.`
            : pe <= 26
              ? `${fmtNum(pe)}× is around the long-run broad-market norm (~18×) — neither cheap nor stretched.`
              : `${fmtNum(pe)}× is well above the long-run broad-market norm (~18×) — priced for sustained delivery.`,
      importance: 0.7,
      pillar: "valuation",
      sections: ["valuation/valuation", "financials/ratios"],
      relatedIds: ["pbv", "roe", "tsr_1y"],
    });
  }

  const pbv = a?.pbv ?? null;
  if (pbv != null) {
    const grade: Grade = pbv <= 0 ? "unknown" : pbv < 1.5 ? "good" : pbv <= 5 ? "neutral" : "bad";
    push({
      id: "pbv",
      label: "P/B",
      value: pbv,
      format: "ratio",
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Price divided by book value per share — what the market pays for each unit of accounting equity.",
      calculation: `Market price ÷ book value per share = ${fmtNum(pbv)}×.`,
      whyItMatters: "Read together with ROE: a high P/B is earned by high returns on equity and unearned without them.",
      grade,
      reason:
        pbv <= 0
          ? "Book value not meaningful for this name."
          : pbv < 1.5
            ? `${fmtNum(pbv)}× is close to book — limited downside to accounting equity if returns are adequate.`
            : pbv <= 5
              ? `${fmtNum(pbv)}× is a normal premium to book for a profitable business.`
              : `${fmtNum(pbv)}× is a steep premium to book — justified only by durably high ROE.`,
      importance: 0.4,
      pillar: "valuation",
      sections: ["valuation/valuation", "financials/ratios", "financials/balance-sheet"],
      relatedIds: ["pe", "roe", "debt_equity"],
    });
  }

  const divYield = a?.dividendYield ?? null;
  if (divYield != null) {
    const grade: Grade = divYield >= 2.5 ? "good" : divYield > 0.5 ? "neutral" : "neutral";
    push({
      id: "dividend_yield",
      label: "Dividend yield",
      value: divYield,
      format: "percent",
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Annual dividends per share divided by price — the cash return paid to holders.",
      calculation: `Dividends per share ÷ price = ${fmtNum(divYield)}%.`,
      whyItMatters: "A direct read on how management returns cash; a well-covered yield cushions total return when multiples compress.",
      grade,
      reason:
        divYield >= 2.5
          ? `${fmtNum(divYield)}% is a meaningful cash return that supports total return through drawdowns.`
          : divYield > 0.5
            ? `${fmtNum(divYield)}% is modest — capital returns lean on buybacks or reinvestment instead.`
            : "Minimal dividend — returns depend almost entirely on price appreciation.",
      importance: 0.25,
      pillar: "valuation",
      sections: ["valuation/capital-allocation", "financials/cash-generation", "financials/ratios"],
      relatedIds: ["pe", "roe"],
    });
  }

  const mktCapValue = a?.marketCapValue ?? null;
  if (mktCapValue != null || a?.marketCap) {
    push({
      id: "market_cap",
      label: "Market capitalization",
      value: mktCapValue,
      format: "number",
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Total equity value at the current price — the size class of the company.",
      calculation: a?.marketCap ? `Classified ${a.marketCap} from scraped capitalization.` : "Shares outstanding × price.",
      whyItMatters: "Size sets liquidity, index membership, and how much institutional flow can move the name.",
      grade: "neutral",
      reason: `${a?.marketCap || "Capitalization"} profile — context for liquidity and flows rather than a directional signal.`,
      importance: 0.1,
      pillar: "valuation",
      sections: ["overview/summary", "structure/microstructure"],
      relatedIds: ["institutional_pct"],
    });
  }

  if (d?.narrative?.analystTargets?.median != null && price != null && price > 0) {
    const upside = round(((d.narrative.analystTargets.median - price) / price) * 100, 1);
    const grade: Grade = upside >= 10 ? "good" : upside >= -5 ? "neutral" : "bad";
    push({
      id: "analyst_upside",
      label: "Consensus target upside",
      value: upside,
      format: "signed",
      provenance: "estimated",
      source: SRC_DOSSIER,
      definition: "Distance from the current price to the sell-side median price target.",
      calculation: `(Median target ${fmtNum(d.narrative.analystTargets.median)} − price ${fmtNum(price)}) ÷ price = ${fmtNum(upside, 1)}%.`,
      whyItMatters: "Consensus targets are a noisy but market-moving anchor; large gaps in either direction get closed by revisions or by price.",
      grade,
      reason:
        upside >= 10
          ? `Street median sits ${fmtNum(upside, 1)}% above the price — revisions are a potential tailwind.`
          : upside >= -5
            ? "Price is roughly at consensus — the Street sees fair value here."
            : `Price sits ${fmtNum(Math.abs(upside), 1)}% above the Street median — de-rating risk if consensus holds.`,
      importance: 0.35,
      pillar: "valuation",
      sections: ["valuation/valuation", "intelligence/news"],
      relatedIds: ["pe", "news_sentiment"],
    });
  }

  /* ── Quality ────────────────────────────────────────────────── */

  const roe = a?.roe ?? null;
  if (roe != null) {
    const grade: Grade = roe >= 18 ? "good" : roe >= 8 ? "neutral" : "bad";
    push({
      id: "roe",
      label: "Return on equity",
      value: roe,
      format: "percent",
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Net income divided by shareholder equity — how much profit each unit of owners' capital produces.",
      calculation: `Net income ÷ shareholders' equity = ${fmtNum(roe, 1)}% (scraped fundamentals).`,
      whyItMatters: "Durably high ROE is the engine of compounding and the justification for premium multiples; read it against leverage.",
      grade,
      reason:
        roe >= 18
          ? `${fmtNum(roe, 1)}% is high-quality capital efficiency — comfortably above typical cost of equity (~10%).`
          : roe >= 8
            ? `${fmtNum(roe, 1)}% is near cost-of-equity — value creation is modest.`
            : `${fmtNum(roe, 1)}% is below any reasonable cost of equity — capital is being consumed, not compounded.`,
      importance: 0.9,
      pillar: "quality",
      sections: ["valuation/profitability", "financials/ratios", "financials/income-statement"],
      relatedIds: ["pbv", "debt_equity", "pe"],
    });
  }

  if (d?.signals?.competitiveMoat != null) {
    const moat = d.signals.competitiveMoat;
    const grade: Grade = moat >= 65 ? "good" : moat >= 40 ? "neutral" : "bad";
    push({
      id: "moat",
      label: "Competitive moat",
      value: moat,
      format: "score",
      provenance: "model",
      source: SRC_DOSSIER,
      definition: "Modeled strength of durable competitive advantage — market share, switching costs, IP and scale.",
      calculation: "Scored 0–100 by the dossier model from share, switching costs and IP, grounded in scraped data.",
      whyItMatters: "Moat width determines whether today's margins and returns persist long enough to justify the multiple.",
      grade,
      reason:
        moat >= 65
          ? `Scored ${moat}/100 — durable advantages support margin persistence.`
          : moat >= 40
            ? `Scored ${moat}/100 — some advantages, but competitive pressure is a live constraint.`
            : `Scored ${moat}/100 — weak differentiation; margins are contestable.`,
      importance: 0.6,
      pillar: "quality",
      sections: ["competition/landscape", "overview/summary"],
      relatedIds: ["roe", "segment_concentration"],
    });
  }

  const sharpe = a?.quantMetrics?.sharpe1y ?? (closes.length ? realizedSharpe(closes.slice(-252)) : null);
  if (sharpe != null) {
    const grade: Grade = sharpe >= 0.8 ? "good" : sharpe >= 0 ? "neutral" : "bad";
    push({
      id: "sharpe_1y",
      label: "Realized Sharpe (1y)",
      value: sharpe,
      format: "ratio",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Annualized return per unit of volatility over the trailing year — risk-adjusted performance.",
      calculation: `Mean daily return ÷ daily σ × √252 = ${fmtNum(sharpe)} over the trailing year.`,
      whyItMatters: "Separates names that went up calmly from names that went up violently — the latter give returns back faster in stress.",
      grade,
      reason:
        sharpe >= 0.8
          ? `${fmtNum(sharpe)} — the trailing year paid well for the risk taken.`
          : sharpe >= 0
            ? `${fmtNum(sharpe)} — positive but unremarkable risk-adjusted results.`
            : `${fmtNum(sharpe)} — holders were paid negatively for the risk over the last year.`,
      importance: 0.35,
      pillar: "quality",
      sections: ["valuation/historical-performance", "risk/risk-analysis"],
      relatedIds: ["volatility", "tsr_1y", "max_drawdown"],
    });
  }

  /* ── Growth / momentum ──────────────────────────────────────── */

  const tsr1y = closes.length ? trailingReturn(closes, 252) : null;
  if (tsr1y != null) {
    const grade: Grade = tsr1y >= 12 ? "good" : tsr1y >= -5 ? "neutral" : "bad";
    push({
      id: "tsr_1y",
      label: "Total return · 1y",
      value: tsr1y,
      format: "signed",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Price return over the trailing 252 sessions.",
      calculation: `(Last close − close 252 sessions ago) ÷ that close = ${fmtNum(tsr1y, 1)}%.`,
      whyItMatters: "The market's one-year verdict; persistent underperformance versus peers usually reflects a deteriorating fundamental story.",
      grade,
      reason:
        tsr1y >= 12
          ? `+${fmtNum(tsr1y, 1)}% over the year — the tape has rewarded the story.`
          : tsr1y >= -5
            ? `${fmtNum(tsr1y, 1)}% over the year — broadly flat; no verdict from the tape.`
            : `${fmtNum(tsr1y, 1)}% over the year — the market has been voting against this name.`,
      importance: 0.4,
      pillar: "growth",
      sections: ["valuation/historical-performance", "valuation/growth", "structure/technical"],
      history: priceHistory,
      percentiles: {},
      relatedIds: ["tsr_3m", "sharpe_1y", "max_drawdown"],
    });
  }

  const tsr3m = closes.length ? trailingReturn(closes, 63) : null;
  if (tsr3m != null) {
    const grade: Grade = tsr3m >= 6 ? "good" : tsr3m >= -6 ? "neutral" : "bad";
    push({
      id: "tsr_3m",
      label: "Total return · 3m",
      value: tsr3m,
      format: "signed",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Price return over the trailing 63 sessions.",
      calculation: `(Last close − close 63 sessions ago) ÷ that close = ${fmtNum(tsr3m, 1)}%.`,
      whyItMatters: "The near-term tape — where marginal flows are pushing the name right now.",
      grade,
      reason:
        tsr3m >= 6
          ? `+${fmtNum(tsr3m, 1)}% over three months — near-term flows are supportive.`
          : tsr3m >= -6
            ? `${fmtNum(tsr3m, 1)}% over three months — drifting, no directional pressure.`
            : `${fmtNum(tsr3m, 1)}% over three months — near-term distribution.`,
      importance: 0.25,
      pillar: "momentum",
      sections: ["valuation/historical-performance", "structure/technical"],
      relatedIds: ["tsr_1y", "trend_structure"],
    });
  }

  const momentum = a?.momentum ?? null;
  const trend: string | null = a?.technicals?.trend ?? null;
  if (trend != null || momentum != null) {
    const grade: Grade = trend === "bullish" ? "good" : trend === "bearish" ? "bad" : "neutral";
    push({
      id: "trend_structure",
      label: "Trend structure",
      value: momentum,
      format: "signed",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Price position versus its 20-day and 200-day averages — the medium-term trend state.",
      calculation: `Price vs 20-DMA = ${fmtNum(momentum, 1)}%; engine classifies the structure ${trend || "n/a"} (${a?.technicals?.maSignal || "no 200-DMA read"}).`,
      whyItMatters: "Fighting an established trend costs more than waiting for it to turn; trend state gates entry discipline.",
      grade,
      reason:
        trend === "bullish"
          ? "Price holds above its trend anchors — structure supports adding on discipline."
          : trend === "bearish"
            ? "Price is below its trend anchors — structure argues for patience or protection."
            : "Range-bound structure — neither side controls the tape.",
      importance: 0.5,
      pillar: "momentum",
      sections: ["structure/technical", "overview/summary"],
      relatedIds: ["rsi", "pos_52w", "support_distance"],
    });
  }

  const rsi = a?.technicals?.rsi ?? null;
  if (rsi != null) {
    const grade: Grade = rsi >= 70 ? "bad" : rsi <= 30 ? "neutral" : "neutral";
    push({
      id: "rsi",
      label: "RSI (14d)",
      value: rsi,
      format: "score",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Relative strength index over 14 sessions — short-term overbought/oversold positioning.",
      calculation: `Standard 14-session RSI = ${fmtNum(rsi, 0)}.`,
      whyItMatters: "Stretched readings mark poor entry points even in good names; they mean the easy part of the move already happened.",
      grade,
      reason:
        rsi >= 70
          ? `${fmtNum(rsi, 0)} is overbought — chasing here historically buys the local top.`
          : rsi <= 30
            ? `${fmtNum(rsi, 0)} is oversold — washed-out positioning, watch for stabilization.`
            : `${fmtNum(rsi, 0)} is mid-range — positioning is not the constraint.`,
      importance: 0.2,
      pillar: "momentum",
      sections: ["structure/technical"],
      relatedIds: ["trend_structure", "pos_52w"],
    });
  }

  const pos52 = closes.length ? positionIn52w(closes) : null;
  if (pos52 != null) {
    const grade: Grade = pos52 >= 92 ? "neutral" : pos52 >= 40 ? "good" : pos52 >= 15 ? "neutral" : "bad";
    push({
      id: "pos_52w",
      label: "52-week range position",
      value: pos52,
      format: "score",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Where the last close sits inside the trailing 52-week high–low range (0 = at the low, 100 = at the high).",
      calculation: `(Last close − 52w low) ÷ (52w high − 52w low) = ${fmtNum(pos52, 0)}.`,
      whyItMatters: "Leaders spend most of their time in the upper half of their range; names pinned to the lows are being repriced for a reason.",
      grade,
      reason:
        pos52 >= 92
          ? "Pressed against the 52-week high — strength, but entries here need wider stops."
          : pos52 >= 40
            ? "Upper half of the yearly range — the market treats this as a hold-or-better."
            : pos52 >= 15
              ? "Lower half of the yearly range — the tape is skeptical."
              : "Pinned near 52-week lows — the market is actively repricing this name down.",
      importance: 0.3,
      pillar: "momentum",
      sections: ["structure/technical", "valuation/historical-performance"],
      relatedIds: ["trend_structure", "max_drawdown"],
    });
  }

  const volTrend = bars ? volumeTrend(bars.volumes) : null;
  if (volTrend != null) {
    const grade: Grade = volTrend >= 1.4 ? "neutral" : volTrend <= 0.6 ? "neutral" : "neutral";
    push({
      id: "volume_trend",
      label: "Volume trend",
      value: volTrend,
      format: "ratio",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Average volume of the last 20 sessions relative to the prior 100-session average.",
      calculation: `20d avg volume ÷ prior 100d avg = ${fmtNum(volTrend)}×.`,
      whyItMatters: "Volume confirms moves: expansion validates the current trend, contraction says conviction is thin.",
      grade,
      reason:
        volTrend >= 1.4
          ? `${fmtNum(volTrend)}× — participation is expanding; the current move has sponsorship.`
          : volTrend <= 0.6
            ? `${fmtNum(volTrend)}× — participation is drying up; moves here carry less information.`
            : `${fmtNum(volTrend)}× — normal participation.`,
      importance: 0.15,
      pillar: "momentum",
      sections: ["structure/microstructure", "structure/technical"],
      relatedIds: ["trend_structure"],
    });
  }

  const support = a?.technicals?.support ?? null;
  const resistance = a?.technicals?.resistance ?? null;
  if (support != null && price != null && price > 0) {
    const dist = round(((price - support) / price) * 100, 1);
    const upDist = resistance != null ? round(((resistance - price) / price) * 100, 1) : null;
    const rr = upDist != null && dist > 0.5 ? round(upDist / dist, 1) : null;
    const grade: Grade = rr == null ? "neutral" : rr >= 1.5 ? "good" : rr >= 1 ? "neutral" : "bad";
    push({
      id: "support_distance",
      label: "Risk : reward structure",
      value: rr,
      format: "ratio",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Upside to resistance versus downside to support — the payoff shape of an entry at the current price.",
      calculation: `Upside to ${fmtNum(resistance)} (${fmtNum(upDist, 1)}%) ÷ downside to ${fmtNum(support)} (${fmtNum(dist, 1)}%) = ${rr == null ? "—" : `${fmtNum(rr, 1)}:1`}.`,
      whyItMatters: "Position entries live or die on payoff asymmetry; below 1.5:1 the desk's own discipline says pass.",
      grade,
      reason:
        rr == null
          ? "Price is sitting on support — the ratio is unstable at this level."
          : rr >= 1.5
            ? `${fmtNum(rr, 1)}:1 clears the 1.5:1 entry bar — asymmetry favors longs.`
            : rr >= 1
              ? `${fmtNum(rr, 1)}:1 is thin — payoff does not yet favor adding.`
              : `${fmtNum(rr, 1)}:1 — more room below than above; entries here are structurally poor.`,
      importance: 0.45,
      pillar: "momentum",
      sections: ["structure/technical", "risk/scenarios"],
      relatedIds: ["trend_structure", "monte_carlo_spread"],
    });
  }

  /* ── Health / risk ──────────────────────────────────────────── */

  const de = a?.debtToEquity ?? null;
  if (de != null) {
    const grade: Grade = de < 50 ? "good" : de <= 120 ? "neutral" : "bad";
    push({
      id: "debt_equity",
      label: "Debt / equity",
      value: de,
      format: "percent",
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Total debt as a percentage of shareholder equity — balance-sheet leverage.",
      calculation: `Total debt ÷ equity = ${fmtNum(de, 0)}% (scraped fundamentals).`,
      whyItMatters: "Leverage amplifies everything: it turns margin pressure into distress and rate cycles into refinancing risk.",
      grade,
      reason:
        de < 50
          ? `${fmtNum(de, 0)}% is conservative — the balance sheet is a shock absorber, not a risk.`
          : de <= 120
            ? `${fmtNum(de, 0)}% is manageable but real — coverage matters if margins compress.`
            : `${fmtNum(de, 0)}% is heavy leverage — equity holders sit behind a serious debt stack.`,
      importance: 0.7,
      pillar: "health",
      sections: ["financials/balance-sheet", "financials/health", "financials/ratios"],
      relatedIds: ["financial_risk", "roe", "volatility"],
    });
  }

  const finRisk = a?.riskBreakdown?.financialRisk ?? null;
  if (finRisk != null) {
    const grade: Grade = finRisk <= 35 ? "good" : finRisk <= 60 ? "neutral" : "bad";
    push({
      id: "financial_risk",
      label: "Financial risk score",
      value: finRisk,
      format: "score",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Composite balance-sheet risk from leverage and beta, scored 0–100 (higher is riskier).",
      calculation: `Engine composite of debt/equity and beta = ${fmtNum(finRisk, 0)}/100.`,
      whyItMatters: "Summarizes how much of the risk budget the balance sheet itself consumes before any market risk is taken.",
      grade,
      reason:
        finRisk <= 35
          ? `${fmtNum(finRisk, 0)}/100 — the balance sheet is not where this position's risk lives.`
          : finRisk <= 60
            ? `${fmtNum(finRisk, 0)}/100 — moderate structural risk; monitor coverage through the cycle.`
            : `${fmtNum(finRisk, 0)}/100 — the balance sheet itself is a primary risk factor.`,
      importance: 0.4,
      pillar: "health",
      sections: ["financials/health", "risk/risk-analysis"],
      relatedIds: ["debt_equity", "risk_composite"],
    });
  }

  const vol = a?.volatility ?? (closes.length ? annualizedVol(closes) : null);
  if (vol != null) {
    const volSeries = closes.length ? rollingVolSeries(closes) : [];
    const volPct = volSeries.length ? percentileOfLast(volSeries) : null;
    const grade: Grade = vol <= 25 ? "good" : vol <= 45 ? "neutral" : "bad";
    push({
      id: "volatility",
      label: "Realized volatility (ann.)",
      value: vol,
      format: "percent",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Annualized standard deviation of daily returns — how violently the name actually trades.",
      calculation: `Daily return σ × √252 = ${fmtNum(vol, 1)}%${volPct != null ? `; currently at the ${fmtNum(volPct, 0)}th percentile of its own 2y regime` : ""}.`,
      whyItMatters: "Volatility sets position size: the same conviction supports half the position at twice the vol.",
      grade,
      reason:
        vol <= 25
          ? `${fmtNum(vol, 1)}% annualized — calm regime, supportive of fuller sizing.`
          : vol <= 45
            ? `${fmtNum(vol, 1)}% annualized — normal single-name volatility; size accordingly.`
            : `${fmtNum(vol, 1)}% annualized — a high-vol regime that demands reduced sizing and wider stops.`,
      importance: 0.5,
      pillar: "risk",
      sections: ["risk/risk-analysis", "structure/technical", "risk/sensitivity", "structure/options"],
      percentiles: volPct != null ? { history: volPct } : {},
      relatedIds: ["beta", "max_drawdown", "sharpe_1y"],
    });
  }

  const beta = a?.beta ?? null;
  if (beta != null) {
    const grade: Grade = beta <= 0.9 ? "good" : beta <= 1.3 ? "neutral" : "bad";
    push({
      id: "beta",
      label: "Beta",
      value: beta,
      format: "ratio",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Sensitivity of this name's returns to the broad market's returns.",
      calculation: `Regression of daily returns on the index = ${fmtNum(beta)}.`,
      whyItMatters: "Beta is the portfolio question: high-beta names double as index bets and drag the whole book in drawdowns.",
      grade,
      reason:
        beta <= 0.9
          ? `${fmtNum(beta)} — carries less market risk than the index; diversifying in stress.`
          : beta <= 1.3
            ? `${fmtNum(beta)} — moves roughly with the market.`
            : `${fmtNum(beta)} — amplifies every market move; a levered index position in disguise.`,
      importance: 0.3,
      pillar: "risk",
      sections: ["risk/portfolio-impact", "risk/risk-analysis", "ecosystem/macro"],
      relatedIds: ["volatility", "macro_risk"],
    });
  }

  const mdd = a?.quantMetrics?.maxDrawdown ?? (closes.length ? maxDrawdown(closes) : null);
  if (mdd != null) {
    const grade: Grade = mdd >= -15 ? "good" : mdd >= -30 ? "neutral" : "bad";
    push({
      id: "max_drawdown",
      label: "Max drawdown (2y)",
      value: mdd,
      format: "signed",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Worst peak-to-trough decline over the trailing two years.",
      calculation: `Deepest peak-to-trough over the series = ${fmtNum(mdd, 1)}%.`,
      whyItMatters: "The realistic worst case holders actually lived through — the number to size against, not the average.",
      grade,
      reason:
        mdd >= -15
          ? `${fmtNum(mdd, 1)}% — shallow historical drawdowns; the name defends well.`
          : mdd >= -30
            ? `${fmtNum(mdd, 1)}% — standard single-name drawdown risk.`
            : `${fmtNum(mdd, 1)}% — this name has shown it can destroy a position; sizing must assume a repeat.`,
      importance: 0.4,
      pillar: "risk",
      sections: ["risk/stress", "valuation/historical-performance", "risk/risk-analysis"],
      relatedIds: ["volatility", "pos_52w"],
    });
  }

  const riskScore = a?.riskScore ?? null;
  if (riskScore != null) {
    const grade: Grade = riskScore <= 40 ? "good" : riskScore <= 65 ? "neutral" : "bad";
    push({
      id: "risk_composite",
      label: "Composite risk score",
      value: riskScore,
      format: "score",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Weighted composite of volatility, sector, regulatory, financial and macro risk (0–100, higher is riskier).",
      calculation: `Engine blend — vol ${fmtNum(a?.riskBreakdown?.volatilityRisk, 0)}, sector ${fmtNum(a?.riskBreakdown?.sectorRisk, 0)}, regulatory ${fmtNum(a?.riskBreakdown?.regulatoryRisk, 0)}, financial ${fmtNum(a?.riskBreakdown?.financialRisk, 0)}, macro ${fmtNum(a?.riskBreakdown?.macroRisk, 0)} → ${fmtNum(riskScore, 0)}/100.`,
      whyItMatters: "The single risk number the desk sizes against; its components tell you which risk to hedge first.",
      grade,
      reason:
        riskScore <= 40
          ? `${fmtNum(riskScore, 0)}/100 — a low-risk profile across the five factors.`
          : riskScore <= 65
            ? `${fmtNum(riskScore, 0)}/100 — moderate composite risk; watch the dominant component.`
            : `${fmtNum(riskScore, 0)}/100 — elevated across factors; this position taxes the risk budget.`,
      importance: 0.6,
      pillar: "risk",
      sections: ["risk/risk-analysis", "overview/summary", "risk/investment-risks"],
      relatedIds: ["volatility", "financial_risk", "macro_risk", "regulatory_risk_engine"],
    });
  }

  const macroRisk = a?.riskBreakdown?.macroRisk ?? null;
  if (macroRisk != null) {
    const grade: Grade = macroRisk <= 40 ? "good" : macroRisk <= 60 ? "neutral" : "bad";
    push({
      id: "macro_risk",
      label: "Macro sensitivity",
      value: macroRisk,
      format: "score",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "How exposed results are to macro variables — rates, cycles, FX — scored 0–100 from sector and beta.",
      calculation: `Engine macro component (sector ${a?.sector || "n/a"}, beta ${fmtNum(beta)}) = ${fmtNum(macroRisk, 0)}/100.`,
      whyItMatters: "Macro-sensitive names need a macro view to own; without one, the position is an unintended rates or cycle bet.",
      grade,
      reason:
        macroRisk <= 40
          ? `${fmtNum(macroRisk, 0)}/100 — results are mostly idiosyncratic; the thesis travels across regimes.`
          : macroRisk <= 60
            ? `${fmtNum(macroRisk, 0)}/100 — a real macro overlay; regime shifts move this name.`
            : `${fmtNum(macroRisk, 0)}/100 — heavily macro-driven; the cycle, not the company, sets returns here.`,
      importance: 0.35,
      pillar: "risk",
      sections: ["ecosystem/macro", "ecosystem/causal", "risk/risk-analysis"],
      relatedIds: ["beta", "sector_risk", "geo_concentration"],
    });
  }

  const sectorRisk = a?.riskBreakdown?.sectorRisk ?? null;
  if (sectorRisk != null) {
    const grade: Grade = sectorRisk <= 40 ? "good" : sectorRisk <= 60 ? "neutral" : "bad";
    push({
      id: "sector_risk",
      label: "Sector risk",
      value: sectorRisk,
      format: "score",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Risk contributed by the sector's own cyclicality and disruption profile, 0–100.",
      calculation: `Engine sector component for ${a?.sector || "the sector"} = ${fmtNum(sectorRisk, 0)}/100.`,
      whyItMatters: "Sector risk is undiversifiable within the name — it can only be sized or hedged at the book level.",
      grade,
      reason:
        sectorRisk <= 40
          ? `${fmtNum(sectorRisk, 0)}/100 — a structurally calmer sector.`
          : sectorRisk <= 60
            ? `${fmtNum(sectorRisk, 0)}/100 — normal sector cyclicality.`
            : `${fmtNum(sectorRisk, 0)}/100 — a structurally volatile or disruption-prone sector.`,
      importance: 0.25,
      pillar: "risk",
      sections: ["competition/peer-matrix", "risk/risk-analysis", "ecosystem/second-order"],
      relatedIds: ["macro_risk", "moat"],
    });
  }

  const regRiskEngine = a?.riskBreakdown?.regulatoryRisk ?? null;
  if (regRiskEngine != null) {
    const grade: Grade = regRiskEngine <= 35 ? "good" : regRiskEngine <= 60 ? "neutral" : "bad";
    push({
      id: "regulatory_risk_engine",
      label: "Regulatory pressure",
      value: regRiskEngine,
      format: "score",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Regulatory risk inferred from sector rules and live headline flow, 0–100.",
      calculation: `Engine regulatory component (sector + scanned headlines) = ${fmtNum(regRiskEngine, 0)}/100.`,
      whyItMatters: "Regulatory action reprices in gaps, not drifts — it is the classic overnight-risk factor.",
      grade,
      reason:
        regRiskEngine <= 35
          ? `${fmtNum(regRiskEngine, 0)}/100 — no active regulatory overhang detected.`
          : regRiskEngine <= 60
            ? `${fmtNum(regRiskEngine, 0)}/100 — background regulatory exposure worth a monitor.`
            : `${fmtNum(regRiskEngine, 0)}/100 — live regulatory pressure; assume headline gaps.`,
      importance: 0.35,
      pillar: "risk",
      sections: ["intelligence/filings", "risk/investment-risks", "ecosystem/second-order"],
      relatedIds: ["risk_composite", "news_pressure"],
    });
  }

  /* ── Flow / sentiment / dossier-derived ─────────────────────── */

  const sentiment = a?.overallSentiment ?? null;
  if (sentiment != null) {
    const grade: Grade = sentiment >= 15 ? "good" : sentiment >= -15 ? "neutral" : "bad";
    push({
      id: "news_pressure",
      label: "News sentiment & pressure",
      value: sentiment,
      format: "signed",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Net sentiment of recent real headlines, scored −100…+100, with short-horizon price pressure.",
      calculation: `Scored headline set (${(a?.news || []).length} items) → sentiment ${fmtNum(sentiment, 0)}, net pressure ${fmtNum(a?.totalPressure, 0)}%.`,
      whyItMatters: "Headline flow moves the next week; fundamentals move the next year. Both matter to entry timing.",
      grade,
      reason:
        sentiment >= 15
          ? "Headline flow is constructive — no near-term narrative headwind."
          : sentiment >= -15
            ? "Headline flow is balanced — the tape is trading structure, not stories."
            : "Headline flow is negative — expect the narrative to fight rallies near-term.",
      importance: 0.3,
      pillar: "momentum",
      sections: ["intelligence/news", "overview/summary", "intelligence/earnings-calls"],
      relatedIds: ["narrative_momentum", "regulatory_risk_engine"],
    });
  }

  if (d?.signals) {
    const s = d.signals;
    if (s.insiderConfidence != null) {
      const grade: Grade = s.insiderConfidence >= 60 ? "good" : s.insiderConfidence >= 40 ? "neutral" : "bad";
      push({
        id: "insider_confidence",
        label: "Insider confidence",
        value: s.insiderConfidence,
        format: "score",
        provenance: "model",
        source: SRC_DOSSIER,
        definition: "Net insider buying versus selling over recent quarters, scored 0–100.",
        calculation: "Dossier model over recent insider transactions and grants.",
        whyItMatters: "Insiders sell for many reasons but buy for one — clustered buying is among the most reliable single signals.",
        grade,
        reason:
          s.insiderConfidence >= 60
            ? `${s.insiderConfidence}/100 — the people with the most information are net accumulating.`
            : s.insiderConfidence >= 40
              ? `${s.insiderConfidence}/100 — routine insider activity, no signal either way.`
              : `${s.insiderConfidence}/100 — net insider distribution; management is reducing its own exposure.`,
        importance: 0.5,
        pillar: "quality",
        sections: ["structure/insider", "intelligence/management"],
        relatedIds: ["ownership_stability", "institutional_pct"],
      });
    }
    if (s.ownershipStability != null) {
      const grade: Grade = s.ownershipStability >= 60 ? "good" : s.ownershipStability >= 40 ? "neutral" : "bad";
      push({
        id: "ownership_stability",
        label: "Ownership stability",
        value: s.ownershipStability,
        format: "score",
        provenance: "model",
        source: SRC_DOSSIER,
        definition: "Stability of the institutional holder base — churn, concentration and holder-quality mix, 0–100.",
        calculation: "Dossier model over the top-holder register and its recent changes.",
        whyItMatters: "A stable, high-quality holder base dampens drawdowns; fast-money ownership amplifies them.",
        grade,
        reason:
          s.ownershipStability >= 60
            ? `${s.ownershipStability}/100 — a sticky holder base that buys dips rather than making them.`
            : s.ownershipStability >= 40
              ? `${s.ownershipStability}/100 — mixed holder quality.`
              : `${s.ownershipStability}/100 — an unstable register; expect exaggerated moves in both directions.`,
        importance: 0.35,
        pillar: "quality",
        sections: ["structure/ownership"],
        relatedIds: ["insider_confidence", "institutional_pct"],
      });
    }
    if (s.narrativeMomentum != null) {
      const grade: Grade = s.narrativeMomentum >= 60 ? "good" : s.narrativeMomentum >= 40 ? "neutral" : "bad";
      push({
        id: "narrative_momentum",
        label: "Narrative momentum",
        value: s.narrativeMomentum,
        format: "score",
        provenance: "model",
        source: SRC_DOSSIER,
        definition: "Direction and energy of the story being told about the company across news, analysts and social flow, 0–100.",
        calculation: "Dossier model over news sentiment, analyst tone and social velocity.",
        whyItMatters: "Multiples follow narratives before they follow numbers; a turning narrative is the earliest re-rating signal.",
        grade,
        reason:
          s.narrativeMomentum >= 60
            ? `${s.narrativeMomentum}/100 — the story is strengthening; flows tend to follow.`
            : s.narrativeMomentum >= 40
              ? `${s.narrativeMomentum}/100 — a stable narrative.`
              : `${s.narrativeMomentum}/100 — the story is deteriorating faster than the numbers.`,
        importance: 0.3,
        pillar: "momentum",
        sections: ["intelligence/news", "intelligence/alternative-data"],
        relatedIds: ["news_pressure", "social_sentiment"],
      });
    }
    if (s.supplyChainRisk != null) {
      const v = s.supplyChainRisk;
      const grade: Grade = v <= 35 ? "good" : v <= 60 ? "neutral" : "bad";
      push({
        id: "supply_chain_risk",
        label: "Supply chain risk",
        value: v,
        format: "score",
        provenance: "model",
        source: SRC_DOSSIER,
        definition: "Concentration and geographic fragility of the supplier and manufacturing base, 0–100 (higher is riskier).",
        calculation: "Dossier model over supplier concentration, single-source exposure and manufacturing geography.",
        whyItMatters: "Supply shocks hit revenue and margin simultaneously — the rare risk that breaks both sides of the P&L at once.",
        grade,
        reason:
          v <= 35
            ? `${v}/100 — a diversified, resilient chain.`
            : v <= 60
              ? `${v}/100 — identifiable choke points worth monitoring.`
              : `${v}/100 — concentrated dependencies; a single disruption propagates straight to results.`,
        importance: 0.4,
        pillar: "risk",
        sections: ["ecosystem/supply-chain", "ecosystem/suppliers", "ecosystem/second-order"],
        relatedIds: ["geo_concentration", "segment_concentration"],
      });
    }
    if (s.regulatoryRisk != null) {
      const v = s.regulatoryRisk;
      const grade: Grade = v <= 35 ? "good" : v <= 60 ? "neutral" : "bad";
      push({
        id: "regulatory_exposure",
        label: "Regulatory exposure",
        value: v,
        format: "score",
        provenance: "model",
        source: SRC_DOSSIER,
        definition: "Breadth and severity of active regulatory issues across operating regions, 0–100 (higher is riskier).",
        calculation: `Dossier model over ${d?.regulatoryExposure?.length ?? 0} tracked regulatory items.`,
        whyItMatters: "Regulation changes the business model itself, not just a quarter — it is thesis-level risk.",
        grade,
        reason:
          v <= 35
            ? `${v}/100 — a light regulatory footprint.`
            : v <= 60
              ? `${v}/100 — active items exist but none are existential.`
              : `${v}/100 — serious open regulatory exposure; outcomes can reshape the thesis.`,
        importance: 0.4,
        pillar: "risk",
        sections: ["intelligence/filings", "risk/investment-risks", "ecosystem/geographic"],
        relatedIds: ["regulatory_risk_engine", "geo_concentration"],
      });
    }
  }

  if (d?.ownership?.institutionalPct != null) {
    const v = d.ownership.institutionalPct;
    const grade: Grade = v >= 50 ? "good" : v >= 25 ? "neutral" : "neutral";
    push({
      id: "institutional_pct",
      label: "Institutional ownership",
      value: v,
      format: "percent",
      provenance: "estimated",
      source: SRC_DOSSIER,
      definition: "Share of the float held by institutions.",
      calculation: `Dossier register: institutional ${fmtNum(v, 0)}%, insider ${fmtNum(d.ownership.insiderPct, 0)}%, retail ${fmtNum(d.ownership.retailPct, 0)}%.`,
      whyItMatters: "Institutional sponsorship brings research coverage, index flows and price discipline — and crowded exits.",
      grade,
      reason:
        v >= 50
          ? `${fmtNum(v, 0)}% institutional — well-sponsored; the register validates the story.`
          : v >= 25
            ? `${fmtNum(v, 0)}% institutional — moderate sponsorship.`
            : `${fmtNum(v, 0)}% institutional — thinly sponsored; price discovery is retail-driven.`,
      importance: 0.25,
      pillar: "quality",
      sections: ["structure/ownership", "structure/microstructure"],
      relatedIds: ["ownership_stability", "market_cap"],
    });
  }

  if (Array.isArray(d?.insiderActivity) && d.insiderActivity.length > 0) {
    let buys = 0;
    let sells = 0;
    for (const t of d.insiderActivity) {
      if (t?.action === "buy") buys += t.shares || 0;
      else if (t?.action === "sell") sells += t.shares || 0;
    }
    const total = buys + sells;
    if (total > 0) {
      const netPct = round(((buys - sells) / total) * 100, 0);
      const grade: Grade = netPct >= 20 ? "good" : netPct >= -20 ? "neutral" : "bad";
      push({
        id: "insider_net_flow",
        label: "Insider net flow",
        value: netPct,
        format: "signed",
        provenance: "estimated",
        source: SRC_DOSSIER,
        definition: "Net insider buying minus selling as a share of total reported insider volume.",
        calculation: `(${buys.toLocaleString()} bought − ${sells.toLocaleString()} sold) ÷ ${total.toLocaleString()} total = ${fmtNum(netPct, 0)}%.`,
        whyItMatters: "The direction of aggregate insider flow is more informative than any single trade.",
        grade,
        reason:
          netPct >= 20
            ? "Insiders are net buyers — conviction from the inside."
            : netPct >= -20
              ? "Balanced insider flow — mostly routine compensation mechanics."
              : "Insiders are net sellers — at minimum, no urgency to own more.",
        importance: 0.35,
        pillar: "quality",
        sections: ["structure/insider"],
        relatedIds: ["insider_confidence"],
      });
    }
  }

  if (Array.isArray(d?.revenueSegments) && d.revenueSegments.length > 0) {
    const conc = concentrationIndex(d.revenueSegments.map((s) => s?.percentage ?? 0));
    if (conc != null) {
      const grade: Grade = conc <= 35 ? "good" : conc <= 55 ? "neutral" : "bad";
      const top = [...d.revenueSegments].sort((x, y) => (y?.percentage ?? 0) - (x?.percentage ?? 0))[0];
      push({
        id: "segment_concentration",
        label: "Revenue concentration",
        value: conc,
        format: "score",
        provenance: "estimated",
        source: SRC_DOSSIER,
        definition: "Herfindahl-style concentration of revenue across business segments (0 diversified → 100 single-line).",
        calculation: `Σ(segment share²) over ${d.revenueSegments.length} segments = ${fmtNum(conc, 0)}; largest: ${top?.segment ?? "n/a"} at ${fmtNum(top?.percentage, 0)}%.`,
        whyItMatters: "Concentrated revenue means one product cycle is the whole thesis; diversification buys the thesis time to be wrong.",
        grade,
        reason:
          conc <= 35
            ? "Well-diversified revenue — no single line can break the year."
            : conc <= 55
              ? `Meaningful reliance on ${top?.segment ?? "the lead segment"} — its cycle is the company's cycle.`
              : `Revenue is effectively a single bet on ${top?.segment ?? "one segment"}.`,
        importance: 0.35,
        pillar: "risk",
        sections: ["ecosystem/products-segments", "ecosystem/customers", "financials/income-statement"],
        relatedIds: ["geo_concentration", "moat"],
      });
    }
  }

  if (Array.isArray(d?.geographicRevenue) && d.geographicRevenue.length > 0) {
    const top = [...d.geographicRevenue].sort((x, y) => (y?.percentage ?? 0) - (x?.percentage ?? 0))[0];
    if (top?.percentage != null) {
      const v = round(top.percentage, 0);
      const grade: Grade = v <= 45 ? "good" : v <= 65 ? "neutral" : "bad";
      push({
        id: "geo_concentration",
        label: "Top-region revenue share",
        value: v,
        format: "percent",
        provenance: "estimated",
        source: SRC_DOSSIER,
        definition: "Share of revenue earned in the single largest region.",
        calculation: `Largest region ${top.region}: ${fmtNum(v, 0)}% of revenue across ${d.geographicRevenue.length} reported regions.`,
        whyItMatters: "Geographic concentration converts one region's politics, currency and demand cycle into company-level risk.",
        grade,
        reason:
          v <= 45
            ? `${top.region} at ${fmtNum(v, 0)}% — geographically balanced.`
            : v <= 65
              ? `${top.region} carries ${fmtNum(v, 0)}% of revenue — a real single-region dependency.`
              : `${top.region} is ${fmtNum(v, 0)}% of revenue — the thesis is hostage to one geography.`,
        importance: 0.3,
        pillar: "risk",
        sections: ["ecosystem/geographic", "ecosystem/macro", "ecosystem/causal"],
        relatedIds: ["supply_chain_risk", "macro_risk"],
      });
    }
  }

  if (d?.narrative?.socialSentiment != null) {
    const v = d.narrative.socialSentiment;
    const grade: Grade = v >= 15 ? "good" : v >= -15 ? "neutral" : "bad";
    push({
      id: "social_sentiment",
      label: "Social sentiment",
      value: v,
      format: "signed",
      provenance: "model",
      source: SRC_DOSSIER,
      definition: "Aggregate tone of retail and social discussion, scored −100…+100.",
      calculation: "Dossier model over social flow and community discussion.",
      whyItMatters: "Retail flow follows social tone with a short lag — an alternative-data early signal on marginal demand.",
      grade,
      reason:
        v >= 15
          ? "Social flow is constructive — marginal retail demand is a tailwind."
          : v >= -15
            ? "Neutral social tone — retail is not the marginal buyer or seller here."
            : "Negative social tone — retail flow is a headwind for rallies.",
      importance: 0.15,
      pillar: "momentum",
      sections: ["intelligence/alternative-data"],
      relatedIds: ["narrative_momentum", "news_pressure"],
    });
  }

  /* ── Monte Carlo / scenario spread from the engine's ranges ──── */

  const bull = Array.isArray(a?.bullRange) ? a.bullRange : null;
  const bear = Array.isArray(a?.bearRange) ? a.bearRange : null;
  if (bull && bear && price != null && price > 0) {
    const up = round(((bull[1] - price) / price) * 100, 1);
    const down = round(((bear[0] - price) / price) * 100, 1);
    const spread = round(up - down, 1);
    const skew = round(up + down, 1); // positive → upside-skewed distribution
    const grade: Grade = skew >= 5 ? "good" : skew >= -5 ? "neutral" : "bad";
    push({
      id: "monte_carlo_spread",
      label: "Simulated outcome skew",
      value: skew,
      format: "signed",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Asymmetry of the simulated 21-day outcome distribution: bull-tail upside plus bear-tail downside.",
      calculation: `Bull tail +${fmtNum(up, 1)}% (to ${fmtNum(bull[1])}), bear tail ${fmtNum(down, 1)}% (to ${fmtNum(bear[0])}); skew = ${fmtNum(skew, 1)}pp over a ${fmtNum(spread, 1)}pp spread.`,
      whyItMatters: "You are paid for asymmetry, not for being right — a distribution skewed up is worth owning even at coin-flip odds.",
      grade,
      reason:
        skew >= 5
          ? "The simulated distribution leans up — more room in the bull tail than the bear tail."
          : skew >= -5
            ? "A balanced distribution — outcomes hinge on catalysts, not structure."
            : "The distribution leans down — the bear tail is fatter than the bull tail.",
      importance: 0.45,
      pillar: "momentum",
      sections: ["risk/monte-carlo", "risk/scenarios", "risk/sensitivity"],
      relatedIds: ["support_distance", "volatility"],
    });
  }

  /* ── Engine verdict as corroborating model evidence ─────────── */

  if (a?.suggestion) {
    const sug = String(a.suggestion);
    const grade: Grade = sug === "Add" ? "good" : sug === "Exit" ? "bad" : "neutral";
    push({
      id: "engine_verdict",
      label: "Desk engine verdict",
      value: a?.confidence ?? null,
      format: "score",
      provenance: "model",
      source: SRC_ENGINE,
      definition: "The desk's own multi-factor engine call (Add / Hold / Skip / Exit) with its confidence.",
      calculation: `Confluence engine over trend, R:R, drift, risk and coverage → ${sug} at ${fmtNum(a?.confidence, 0)}% confidence.`,
      whyItMatters: "An independent second opinion from a differently-weighted model; agreement raises conviction, disagreement demands an explanation.",
      grade,
      reason: a?.verdict || `Engine reads the setup as ${sug}.`,
      importance: 0.5,
      pillar: "momentum",
      sections: ["overview/summary", "thesis/validation"],
      relatedIds: ["support_distance", "trend_structure", "risk_composite"],
    });
  }

  /* ── Assemble ───────────────────────────────────────────────── */

  const metrics: Record<string, EvidenceMetric> = {};
  const order: string[] = [];
  for (const n of nodes) {
    if (!metrics[n.id]) {
      metrics[n.id] = n;
      order.push(n.id);
    }
  }

  // Prune related ids that don't exist in this build.
  for (const id of order) {
    metrics[id].relatedIds = metrics[id].relatedIds.filter((r) => !!metrics[r]);
  }

  const sources = new Set<string>();
  let estimated = 0;
  for (const id of order) {
    sources.add(metrics[id].source);
    if (metrics[id].provenance === "estimated" || metrics[id].provenance === "model") estimated++;
  }

  return {
    ticker,
    currency,
    builtAt: Date.now(),
    metrics,
    order,
    coverage: { total: order.length, estimated, sources: [...sources] },
  };
}

/** All metrics tagged to a "workspaceId/sectionId" view, ordered by |weight|. */
export function metricsForSection(graph: EvidenceGraph, sectionKey: string): EvidenceMetric[] {
  return graph.order
    .map((id) => graph.metrics[id])
    .filter((m) => m.sections.includes(sectionKey))
    .sort((x, y) => Math.abs(y.thesisWeight) - Math.abs(x.thesisWeight));
}
