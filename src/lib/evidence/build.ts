/**
 * Evidence graph builder — turns raw inputs (desk analysis, price history,
 * AI dossier, live quote) into typed EvidenceMetric nodes. Everything
 * computable is computed here deterministically; model-derived figures are
 * labeled with `estimated` / `model` provenance so the analyst can always
 * tell a filed number from a modeled one.
 */

import type { EvidenceGraph, EvidenceMetric, Grade, HistoryPoint } from "./types";
import type { DeskAnalysis, Dossier, Financials, Quote } from "./inputs";
import { EVIDENCE_RELATIONS } from "./relations";
import {
  annualizedVol,
  clamp,
  concentrationIndex,
  dailyReturns,
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
import { sharpeWithSE, volWithSE, ANNUAL_RISK_FREE } from "@/lib/quant-engine";

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
  /** company-financials statements payload (deterministic pipeline). */
  financials?: Financials | null;
  /** Per-source fetch timestamps, for node-level last-update provenance. */
  fetchedAt?: {
    analysis?: number | null;
    bars?: number | null;
    dossier?: number | null;
    quote?: number | null;
    financials?: number | null;
  };
}

/** grade → contribution multiplier for thesis weight. */
const GRADE_SIGN: Record<Grade, number> = { good: 1, neutral: 0, bad: -1, unknown: 0 };

const SRC_PRICE = "price history · 2y daily";
const SRC_ENGINE = "analysis engine · live scrape";
const SRC_DOSSIER = "AI dossier · scrape-grounded";
const SRC_QUOTE = "live price feed";
const SRC_STMT = "financial statements · exchange data";

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
  updatedAt?: number | null;
  displayText?: string;
  uncertainty?: EvidenceMetric["uncertainty"];
}

/** Mechanical confidence: provenance base plus a small sample bonus. */
const PROVENANCE_CONFIDENCE = { reported: 0.9, computed: 0.85, estimated: 0.6, model: 0.5 } as const;

function makeNode(spec: NodeSpec): EvidenceMetric {
  const sampleBonus = Math.min(spec.history?.length ?? 0, 24) / 24 * 0.08;
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
    confidence: round(Math.min(0.95, PROVENANCE_CONFIDENCE[spec.provenance] + sampleBonus), 2),
    updatedAt: spec.updatedAt ?? null,
    displayText: spec.displayText,
    uncertainty: spec.uncertainty,
  };
}

/** Parse "$3.4T" / "620B" / "₹1,20,000 Cr" style capitalization strings. */
export function parseCapString(s: string | undefined | null): number | null {
  if (!s) return null;
  const m = String(s).replace(/,/g, "").match(/([\d.]+)\s*(t|tn|trillion|b|bn|billion|m|mn|million|cr|crore|l|lakh)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return null;
  const unit = m[2].toLowerCase();
  const mult = unit.startsWith("t") ? 1e12
    : unit.startsWith("b") ? 1e9
    : unit.startsWith("m") ? 1e6
    : unit.startsWith("c") ? 1e7
    : unit.startsWith("l") ? 1e5
    : null;
  return mult ? n * mult : null;
}

const fmtNum = (v: number | null | undefined, dp = 2) =>
  v == null || !Number.isFinite(v) ? "—" : String(round(v, dp));

export function buildEvidenceGraph(inputs: BuildInputs): EvidenceGraph {
  const { ticker, analysis: a, bars, dossier: d, quote, financials: f, fetchedAt } = inputs;
  const tsEngine = fetchedAt?.analysis ?? null;
  const tsPrice = fetchedAt?.bars ?? null;
  const tsDossier = fetchedAt?.dossier ?? null;
  const tsStmt = fetchedAt?.financials ?? null;
  const nodes: EvidenceMetric[] = [];
  const push = (spec: NodeSpec | null) => {
    if (spec) {
      if (spec.updatedAt === undefined) {
        spec.updatedAt =
          spec.source === SRC_PRICE ? tsPrice
            : spec.source === SRC_DOSSIER ? tsDossier
            : spec.source === SRC_STMT ? tsStmt
            : tsEngine;
      }
      nodes.push(makeNode(spec));
    }
  };
  const isFinancialSector = /financ|bank|insur/i.test(String(a?.sector ?? d?.sector ?? ""));

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

  const capText = a?.marketCap || (d as Dossier & { marketCap?: string })?.marketCap || null;
  const mktCapValue = a?.marketCapValue ?? f?.marketCap ?? parseCapString(capText);
  if (mktCapValue != null || capText) {
    push({
      id: "market_cap",
      label: "Market capitalization",
      value: mktCapValue,
      format: "number",
      displayText: mktCapValue == null && capText ? capText : undefined,
      provenance: "reported",
      source: SRC_ENGINE,
      definition: "Total equity value at the current price — the size class of the company.",
      calculation: capText ? `Classified ${capText} from scraped capitalization.` : "Shares outstanding × price.",
      whyItMatters: "Size sets liquidity, index membership, and how much institutional flow can move the name.",
      grade: "neutral",
      reason: `${capText || "Capitalization"} profile — context for liquidity and flows rather than a directional signal.`,
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
    // Uncertainty of the estimate itself (Lo 2002 SE) from the same window.
    const rfRate = a?.quantMetrics?.riskFree?.annualRate ?? ANNUAL_RISK_FREE;
    const sharpeU = closes.length ? sharpeWithSE(dailyReturns(closes.slice(-252)), rfRate) : null;
    push({
      id: "sharpe_1y",
      label: "Realized Sharpe (1y)",
      value: sharpe,
      format: "ratio",
      provenance: "computed",
      source: SRC_PRICE,
      definition: "Annualized return per unit of volatility over the trailing year — risk-adjusted performance.",
      calculation: (() => {
        const rf = a?.quantMetrics?.riskFree;
        const rfText = rf?.annualRate != null
          ? `rf = ${(rf.annualRate * 100).toFixed(2)}% (${rf.currency ?? "USD"} ${rf.tenor ?? "3M"} bill, ${rf.basis ?? "static_snapshot"} as of ${rf.asOf ?? "—"}${rf.fallbackFrom ? `, substituted for ${rf.fallbackFrom}` : ""})`
          : `rf = USD snapshot rate (see src/lib/riskFree.ts)`;
        return `(Mean daily return − rf/252) ÷ daily σ × √252 = ${fmtNum(sharpe)} over the trailing year; ${rfText}.`;
      })(),
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
      uncertainty: sharpeU
        ? {
            se: round(sharpeU.se, 2),
            ci95: [round(sharpeU.sharpe - 1.96 * sharpeU.se, 2), round(sharpeU.sharpe + 1.96 * sharpeU.se, 2)],
            n: sharpeU.n,
            method: sharpeU.method,
          }
        : undefined,
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
  // The upside target is the bull-case target when the engine produced one
  // (the same level the trade and the scenario cases use); resistance is the
  // conservative fallback. Using one target everywhere is what stops the
  // synthesis breaker from disagreeing with the R:R shown on the ticket.
  const rrTarget = (Array.isArray(a?.bullRange) ? a!.bullRange[1] : null) ?? resistance;
  if (support != null && price != null && price > 0) {
    const downPct = round(((price - support) / price) * 100, 1);
    const upPct = rrTarget != null ? round(((rrTarget - price) / price) * 100, 1) : null;
    // A risk leg tighter than 1.5% of price sits inside daily noise: any ratio
    // measured off it (a "23:1" off a 1%-away stop) is an artifact of the stop,
    // not an edge. We report the R:R as unstable rather than a headline number,
    // and cap the displayed ratio at 10:1 so a near-degenerate stop can never
    // masquerade as a spectacular payoff.
    const stableRisk = downPct >= 1.5;
    const rawRr = upPct != null && upPct > 0 && stableRisk ? upPct / downPct : null;
    const capped = rawRr != null && rawRr > 10;
    const rr = rawRr != null ? round(Math.min(rawRr, 10), 1) : null;
    const grade: Grade = rr == null ? "neutral" : rr >= 1.5 ? "good" : rr >= 1 ? "neutral" : "bad";
    push({
      id: "support_distance",
      label: "Risk : reward structure",
      value: rr,
      format: "ratio",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Upside to the bull target versus downside to support — the payoff shape of an entry at the current price.",
      calculation: stableRisk
        ? `Upside to ${fmtNum(rrTarget)} (${fmtNum(upPct, 1)}%) ÷ downside to ${fmtNum(support)} (${fmtNum(downPct, 1)}%) = ${rr == null ? "—" : `${capped ? "≥" : ""}${fmtNum(rr, 1)}:1`}.`
        : `Downside to support is only ${fmtNum(downPct, 1)}% — inside daily noise — so the ratio is unstable and no headline R:R is claimed. Wait for a defined stop.`,
      whyItMatters: "Position entries live or die on payoff asymmetry; below 1.5:1 the desk's own discipline says pass — and a stop inside the noise is not a stop.",
      grade,
      reason:
        rr == null
          ? `Risk leg only ${fmtNum(downPct, 1)}% from support — too tight to define a real R:R at this price.`
          : capped
            ? `≥10:1 — but that comes off a ${fmtNum(downPct, 1)}% stop; treat the headline ratio with caution, the stop is the binding constraint.`
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
    const grade: Grade = isFinancialSector
      ? "neutral"
      : de < 50 ? "good" : de <= 120 ? "neutral" : "bad";
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
      reason: isFinancialSector
        ? `${fmtNum(de, 0)}% — leverage is the business model for financials; judge it by capital ratios and funding stability, not the industrial D/E frame.`
        : de < 50
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
    // SE of the vol estimate over the same trailing window (percent units).
    const volU = closes.length ? volWithSE(dailyReturns(closes.slice(-61))) : null;
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
      uncertainty: volU
        ? {
            se: round(volU.se * 100, 1),
            ci95: [round((volU.vol - 1.96 * volU.se) * 100, 1), round((volU.vol + 1.96 * volU.se) * 100, 1)],
            n: volU.n,
            method: volU.method,
          }
        : undefined,
    });
  }

  const beta = a?.beta ?? null;
  if (beta != null) {
    const grade: Grade = beta <= 0.9 ? "good" : beta <= 1.3 ? "neutral" : "bad";
    const betaFromProvider = a?.betaSource !== "vol_heuristic";
    push({
      id: "beta",
      label: "Beta",
      value: beta,
      format: "ratio",
      provenance: betaFromProvider ? "reported" : "estimated",
      source: betaFromProvider ? "Yahoo Finance · published beta" : SRC_ENGINE,
      definition: "Sensitivity of this name's returns to the broad market's returns.",
      calculation: betaFromProvider
        ? `Provider-published beta (Yahoo Finance) = ${fmtNum(beta)}.`
        : `No published beta available — estimated from realized vol (σ/22, clamped 0.65–2.75) = ${fmtNum(beta)}. Treat as a rough proxy, not a regression.`,
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

  // Cross-source disagreement is evidence in its own right: when two
  // sources materially conflict on the same fact, the analyst sees the
  // conflict instead of a silently chosen winner.
  const conflicts = (a?.sourceConflicts ?? []).filter((c) => c?.field && (c.relDiffPct ?? 0) > 0);
  if (conflicts.length > 0) {
    const worst = conflicts.reduce((m, c) => Math.max(m, c.relDiffPct ?? 0), 0);
    push({
      id: "source_conflicts",
      label: "Data source conflicts",
      value: conflicts.length,
      format: "number",
      provenance: "computed",
      source: "cross-source comparison · screener.in vs yahoo",
      definition: "Count of facts where two data sources materially disagree (price >2%, P/E >20%, market cap >10%).",
      calculation: conflicts
        .map((c) => `${c.field}: ${(c.values ?? []).map((v) => `${v.source}=${v.value}`).join(" vs ")} (Δ${c.relDiffPct}%) — ${c.resolution ?? ""}`)
        .join(" · "),
      whyItMatters: "Disagreeing sources mean at least one is stale, uses a different definition, or covers a different venue — numbers built on the conflicted field inherit that uncertainty.",
      grade: worst > 15 ? "bad" : "neutral",
      reason: `${conflicts.length} conflicting field${conflicts.length === 1 ? "" : "s"}; largest gap ${worst.toFixed(1)}%. Figures derived from these fields carry extra uncertainty.`,
      importance: 0.3,
      pillar: "risk",
      sections: ["risk/risk-analysis", "overview/summary"],
      relatedIds: ["pe_ratio", "market_cap"],
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
    const newsCount = (a?.news || []).length;
    const pressure = a?.totalPressure ?? null;
    // The headline scorer is a keyword lexicon: it returns exactly 0 when no
    // directional words fire. A flat 0 with no news, or a 0 sentiment AND 0
    // pressure across a real headline set, is "nothing scored" — NOT a
    // measured neutral. Report it as no signal (value null, graded unknown so
    // it never inflates the momentum pillar) instead of a confident "0%".
    const noSignal = newsCount === 0 || (sentiment === 0 && (pressure == null || pressure === 0));
    const grade: Grade = noSignal ? "unknown" : sentiment >= 15 ? "good" : sentiment >= -15 ? "neutral" : "bad";
    push({
      id: "news_pressure",
      label: "News sentiment & pressure",
      value: noSignal ? null : sentiment,
      displayText: noSignal ? (newsCount === 0 ? "No recent headlines" : "No directional signal") : undefined,
      format: "signed",
      provenance: "computed",
      source: SRC_ENGINE,
      definition: "Net sentiment of recent real headlines, scored −100…+100, with short-horizon price pressure.",
      calculation: noSignal
        ? (newsCount === 0
            ? "No recent headlines retrieved for this name."
            : `${newsCount} headline${newsCount === 1 ? "" : "s"} retrieved, but the keyword scorer found no directional sentiment — no score is claimed (this is not a measured neutral).`)
        : `Scored headline set (${newsCount} items) → sentiment ${fmtNum(sentiment, 0)}, net pressure ${fmtNum(pressure, 0)}%.`,
      whyItMatters: "Headline flow moves the next week; fundamentals move the next year. Both matter to entry timing.",
      grade,
      reason: noSignal
        ? (newsCount === 0
            ? "No recent headline flow to read for this name."
            : "Headlines are present but none scored directionally — treated as no signal, not confirmed-neutral.")
        : sentiment >= 15
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


  /* ── Financial statements (deterministic pipeline) ──────────── */

  if (f) {
    const r = f.ratios ?? {};
    const income = (f.income ?? []).filter((row) => row.revenue != null);
    const cfRows = (f.cashflow ?? []).filter((row) => row.operatingCF != null);
    const balRows = f.balance ?? [];
    const latestInc = income[0] ?? null;
    const latestCf = cfRows[0] ?? null;
    const pct = (v: number | null | undefined) => (v == null ? null : round(v * 100, 1));
    const fyHistory = <T,>(rows: T[], value: (row: T) => number | null): HistoryPoint[] =>
      [...rows]
        .reverse()
        .flatMap((row) => {
          const v = value(row);
          const period = (row as { period?: string }).period ?? "FY";
          return v == null ? [] : [{ period, value: round(v, 2) }];
        });

    const revenue = latestInc?.revenue ?? null;
    if (revenue != null) {
      const growth = pct(r.revenueGrowth) ?? (income[1]?.revenue ? round(((revenue - income[1].revenue!) / Math.abs(income[1].revenue!)) * 100, 1) : null);
      push({
        id: "revenue",
        label: "Revenue (FY)",
        value: revenue,
        format: "number",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Total reported revenue for the latest fiscal year.",
        calculation: `Latest annual filing: ${fmtNum(revenue / 1e9, 1)}B ${f.currency ?? currency}${growth != null ? `; growth ${fmtNum(growth, 1)}%` : ""}.`,
        whyItMatters: "Everything downstream — margins, cash, the multiple — is a claim on this line growing or holding.",
        grade: growth == null ? "neutral" : growth >= 8 ? "good" : growth >= 0 ? "neutral" : "bad",
        reason:
          growth == null
            ? "Reported top line — growth read pending a second fiscal year."
            : growth >= 8
              ? `Top line compounding at ${fmtNum(growth, 1)}% — real growth, not price effects alone.`
              : growth >= 0
                ? `Top line roughly flat (${fmtNum(growth, 1)}%) — the thesis must rest on margins or capital returns.`
                : `Top line shrinking (${fmtNum(growth, 1)}%) — every other line is fighting gravity.`,
        importance: 0.5,
        pillar: "growth",
        sections: ["financials/income-statement", "valuation/growth"],
        history: fyHistory(income, (row) => (row.revenue == null ? null : row.revenue / 1e9)),
        relatedIds: ["gross_margin", "revenue_growth", "pe"],
      });
      if (growth != null) {
        push({
          id: "revenue_growth",
          label: "Revenue growth",
          value: growth,
          format: "signed",
          provenance: "reported",
          source: SRC_STMT,
          definition: "Year-over-year change in reported revenue.",
          calculation: r.revenueGrowth != null ? `Reported growth rate = ${fmtNum(growth, 1)}%.` : `(${fmtNum(revenue / 1e9, 1)}B − prior FY) ÷ prior FY = ${fmtNum(growth, 1)}%.`,
          whyItMatters: "Growth is what the multiple is paying for; without it a premium P/E is a countdown.",
          grade: growth >= 10 ? "good" : growth >= 2 ? "neutral" : "bad",
          reason:
            growth >= 10
              ? `${fmtNum(growth, 1)}% — genuine compounding that can carry a premium multiple.`
              : growth >= 2
                ? `${fmtNum(growth, 1)}% — positive but unremarkable; the multiple needs other support.`
                : `${fmtNum(growth, 1)}% — stalling top line; premium multiples de-rate on this.`,
          importance: 0.6,
          pillar: "growth",
          sections: ["valuation/growth", "financials/income-statement", "competition/peer-matrix"],
          relatedIds: ["revenue", "pe", "earnings_growth"],
        });
      }
    }

    const gm = pct(r.grossMargin) ?? (latestInc?.grossProfit != null && revenue ? round((latestInc.grossProfit / revenue) * 100, 1) : null);
    if (gm != null) {
      push({
        id: "gross_margin",
        label: "Gross margin",
        value: gm,
        format: "percent",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Gross profit as a share of revenue — pricing power and input-cost control before operating expenses.",
        calculation: `Gross profit ÷ revenue = ${fmtNum(gm, 1)}% (latest reported).`,
        whyItMatters: "The margin the moat defends; erosion here shows up quarters before it reaches EPS.",
        grade: gm >= 40 ? "good" : gm >= 20 ? "neutral" : "bad",
        reason:
          gm >= 40
            ? `${fmtNum(gm, 1)}% — pricing power; input costs are being passed through, not absorbed.`
            : gm >= 20
              ? `${fmtNum(gm, 1)}% — workable but competitive; watch the trend more than the level.`
              : `${fmtNum(gm, 1)}% — thin unit economics; scale or mix must do the heavy lifting.`,
        importance: 0.6,
        pillar: "quality",
        sections: ["financials/income-statement", "financials/ratios", "valuation/profitability"],
        history: fyHistory(income, (row) => (row.grossProfit != null && row.revenue ? (row.grossProfit / row.revenue) * 100 : null)),
        relatedIds: ["operating_margin", "moat", "roe"],
      });
    }

    const om = pct(r.operatingMargin) ?? (latestInc?.operatingIncome != null && revenue ? round((latestInc.operatingIncome / revenue) * 100, 1) : null);
    if (om != null) {
      push({
        id: "operating_margin",
        label: "Operating margin",
        value: om,
        format: "percent",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Operating income as a share of revenue — profitability after the full cost of running the business.",
        calculation: `Operating income ÷ revenue = ${fmtNum(om, 1)}%.`,
        whyItMatters: "This is where operating leverage lives: small revenue moves swing this line hardest.",
        grade: om >= 20 ? "good" : om >= 8 ? "neutral" : "bad",
        reason:
          om >= 20
            ? `${fmtNum(om, 1)}% — an efficient machine; incremental revenue is highly profitable.`
            : om >= 8
              ? `${fmtNum(om, 1)}% — ordinary operating economics.`
              : `${fmtNum(om, 1)}% — little cushion; any revenue softness reaches earnings immediately.`,
        importance: 0.5,
        pillar: "quality",
        sections: ["financials/income-statement", "financials/ratios", "valuation/profitability"],
        history: fyHistory(income, (row) => (row.operatingIncome != null && row.revenue ? (row.operatingIncome / row.revenue) * 100 : null)),
        relatedIds: ["gross_margin", "net_margin"],
      });
    }

    const nm = pct(r.netMargin) ?? (latestInc?.netIncome != null && revenue ? round((latestInc.netIncome / revenue) * 100, 1) : null);
    if (nm != null) {
      push({
        id: "net_margin",
        label: "Net margin",
        value: nm,
        format: "percent",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Net income as a share of revenue — what actually reaches shareholders per unit of sales.",
        calculation: `Net income ÷ revenue = ${fmtNum(nm, 1)}%.`,
        whyItMatters: "The bottom line the market caps; margin structure above decides whether it is durable.",
        grade: nm >= 15 ? "good" : nm >= 5 ? "neutral" : "bad",
        reason:
          nm >= 15
            ? `${fmtNum(nm, 1)}% — elite conversion of sales into profit.`
            : nm >= 5
              ? `${fmtNum(nm, 1)}% — ordinary profitability.`
              : `${fmtNum(nm, 1)}% — most of the revenue never reaches owners.`,
        importance: 0.45,
        pillar: "quality",
        sections: ["financials/income-statement", "financials/ratios", "valuation/profitability"],
        history: fyHistory(income, (row) => (row.netIncome != null && row.revenue ? (row.netIncome / row.revenue) * 100 : null)),
        relatedIds: ["operating_margin", "roe", "fcf_conversion"],
      });
    }

    const roa = pct(r.returnOnAssets);
    if (roa != null) {
      push({
        id: "roa",
        label: "Return on assets",
        value: roa,
        format: "percent",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Net income against the full asset base — capital efficiency before leverage flattering.",
        calculation: `Net income ÷ total assets = ${fmtNum(roa, 1)}%.`,
        whyItMatters: "ROE can be manufactured with debt; ROA cannot. The gap between them is the leverage story.",
        grade: roa >= 8 ? "good" : roa >= 3 ? "neutral" : "bad",
        reason:
          roa >= 8
            ? `${fmtNum(roa, 1)}% — the asset base itself earns well; ROE is not a leverage illusion.`
            : roa >= 3
              ? `${fmtNum(roa, 1)}% — ordinary asset productivity.`
              : `${fmtNum(roa, 1)}% — a heavy asset base earning little; check how much of ROE is leverage.`,
        importance: 0.4,
        pillar: "quality",
        sections: ["financials/ratios", "financials/balance-sheet", "valuation/profitability"],
        relatedIds: ["roe", "debt_equity"],
      });
    }

    const cr = r.currentRatio ?? null;
    if (cr != null) {
      push({
        id: "current_ratio",
        label: "Current ratio",
        value: round(cr, 2),
        format: "ratio",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Current assets over current liabilities — can the next twelve months be paid from what's on hand.",
        calculation: `Current assets ÷ current liabilities = ${fmtNum(cr, 2)}×.`,
        whyItMatters: "Liquidity is the difference between a bad quarter and a forced action.",
        grade: cr >= 1.5 ? "good" : cr >= 1 ? "neutral" : "bad",
        reason:
          cr >= 1.5
            ? `${fmtNum(cr, 2)}× — comfortable near-term liquidity.`
            : cr >= 1
              ? `${fmtNum(cr, 2)}× — adequate but tight; working capital discipline matters.`
              : `${fmtNum(cr, 2)}× — current liabilities exceed current assets; funding depends on cash flow staying healthy.`,
        importance: 0.35,
        pillar: "health",
        sections: ["financials/balance-sheet", "financials/ratios", "financials/health"],
        relatedIds: ["net_debt", "financial_risk"],
      });
    }

    const totalCash = r.totalCash ?? balRows[0]?.cash ?? null;
    const totalDebt = r.totalDebt ?? null;
    if (totalCash != null || totalDebt != null) {
      const netDebt = (totalDebt ?? 0) - (totalCash ?? 0);
      const ebitda = r.ebitda ?? null;
      const ndEbitda = ebitda && ebitda > 0 ? round(netDebt / ebitda, 2) : null;
      push({
        id: "net_debt",
        label: "Net debt",
        value: netDebt,
        format: "number",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Total debt minus cash — the balance sheet's true net obligation.",
        calculation: `Debt ${fmtNum((totalDebt ?? 0) / 1e9, 1)}B − cash ${fmtNum((totalCash ?? 0) / 1e9, 1)}B = ${fmtNum(netDebt / 1e9, 1)}B${ndEbitda != null ? ` (${fmtNum(ndEbitda, 1)}× EBITDA)` : ""}.`,
        whyItMatters: "Net cash buys time and options in a downturn; net debt sells them.",
        grade: netDebt <= 0 ? "good" : ndEbitda != null ? (ndEbitda <= 1.5 ? "neutral" : ndEbitda <= 3 ? "neutral" : "bad") : "neutral",
        reason:
          netDebt <= 0
            ? `Net cash position of ${fmtNum(Math.abs(netDebt) / 1e9, 1)}B — the balance sheet is an asset, not a constraint.`
            : ndEbitda == null
              ? `Net debt ${fmtNum(netDebt / 1e9, 1)}B — sized against earnings power once EBITDA reports.`
              : ndEbitda <= 3
                ? `${fmtNum(ndEbitda, 1)}× EBITDA — serviceable leverage at current earnings.`
                : `${fmtNum(ndEbitda, 1)}× EBITDA — leverage that owns the equity story in a downturn.`,
        importance: 0.5,
        pillar: "health",
        sections: ["financials/balance-sheet", "financials/health", "financials/cash-flow"],
        relatedIds: ["debt_equity", "current_ratio", "fcf"],
      });
    }

    const fcf = r.freeCashflow ?? latestCf?.freeCF ?? null;
    if (fcf != null) {
      push({
        id: "fcf",
        label: "Free cash flow",
        value: fcf,
        format: "number",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Operating cash flow minus capital expenditure — the cash the business actually throws off.",
        calculation: r.freeCashflow != null ? `Reported FCF = ${fmtNum(fcf / 1e9, 1)}B.` : `OCF ${fmtNum((latestCf?.operatingCF ?? 0) / 1e9, 1)}B − capex = ${fmtNum(fcf / 1e9, 1)}B.`,
        whyItMatters: "Earnings are an opinion; this is the cash. Everything returned to holders is paid from here.",
        grade: fcf > 0 ? "good" : "bad",
        reason:
          fcf > 0
            ? `${fmtNum(fcf / 1e9, 1)}B of genuine cash generation.`
            : `Negative free cash flow — the business consumes cash and must fund itself externally.`,
        importance: 0.6,
        pillar: "quality",
        sections: ["financials/cash-flow", "financials/cash-generation", "valuation/capital-allocation"],
        history: fyHistory(cfRows, (row) => (row.freeCF == null ? null : row.freeCF / 1e9)),
        relatedIds: ["fcf_conversion", "net_debt", "dividend_yield"],
      });

      if (revenue) {
        const fcfMargin = round((fcf / revenue) * 100, 1);
        push({
          id: "fcf_margin",
          label: "FCF margin",
          value: fcfMargin,
          format: "percent",
          provenance: "reported",
          source: SRC_STMT,
          definition: "Free cash flow as a share of revenue — how much of each sale becomes deployable cash.",
          calculation: `FCF ${fmtNum(fcf / 1e9, 1)}B ÷ revenue ${fmtNum(revenue / 1e9, 1)}B = ${fmtNum(fcfMargin, 1)}%.`,
          whyItMatters: "The cleanest single read on business model quality — hard to fake, hard to compete away quickly.",
          grade: fcfMargin >= 15 ? "good" : fcfMargin >= 5 ? "neutral" : "bad",
          reason:
            fcfMargin >= 15
              ? `${fmtNum(fcfMargin, 1)}% — a cash machine.`
              : fcfMargin >= 5
                ? `${fmtNum(fcfMargin, 1)}% — respectable cash economics.`
                : `${fmtNum(fcfMargin, 1)}% — revenue is not converting to deployable cash.`,
          importance: 0.5,
          pillar: "quality",
          sections: ["financials/cash-generation", "financials/ratios"],
          relatedIds: ["fcf", "net_margin"],
        });
      }

      const ni = latestCf?.netIncome ?? latestInc?.netIncome ?? null;
      if (ni != null && ni !== 0) {
        const conv = round((fcf / ni) * 100, 0);
        push({
          id: "fcf_conversion",
          label: "FCF conversion",
          value: conv,
          format: "percent",
          provenance: "reported",
          source: SRC_STMT,
          definition: "Free cash flow over net income — how much of reported profit is actual cash.",
          calculation: `FCF ${fmtNum(fcf / 1e9, 1)}B ÷ net income ${fmtNum(ni / 1e9, 1)}B = ${fmtNum(conv, 0)}%.`,
          whyItMatters: "The core earnings-quality test: profit that never becomes cash is accrual, not earnings.",
          grade: conv >= 90 ? "good" : conv >= 60 ? "neutral" : "bad",
          reason:
            conv >= 90
              ? `${fmtNum(conv, 0)}% — reported earnings are backed nearly one-for-one by cash. High quality.`
              : conv >= 60
                ? `${fmtNum(conv, 0)}% — a normal accrual gap; watch it, don't fear it.`
                : `${fmtNum(conv, 0)}% — a wide gap between profit and cash; interrogate the accruals.`,
          importance: 0.65,
          pillar: "quality",
          sections: ["financials/earnings-quality", "financials/cash-generation", "financials/cash-flow"],
          relatedIds: ["fcf", "net_margin", "roe"],
        });
      }

      const returned = Math.abs(latestCf?.dividendsPaid ?? 0) + Math.abs(latestCf?.buybacks ?? 0);
      if (returned > 0) {
        const payout = fcf > 0 ? round((returned / fcf) * 100, 0) : null;
        push({
          id: "capital_returned",
          label: "Capital returned",
          value: returned,
          format: "number",
          provenance: "reported",
          source: SRC_STMT,
          definition: "Dividends plus buybacks in the latest fiscal year — what management actually sent back.",
          calculation: `Dividends + repurchases = ${fmtNum(returned / 1e9, 1)}B${payout != null ? ` (${fmtNum(payout, 0)}% of FCF)` : ""}.`,
          whyItMatters: "Capital allocation is strategy made visible — the split between reinvestment and returns is the CEO's real forecast.",
          grade: payout == null ? "neutral" : payout <= 95 ? "good" : payout <= 130 ? "neutral" : "bad",
          reason:
            payout == null
              ? "Returns are running while FCF is negative — funded from the balance sheet."
              : payout <= 95
                ? `${fmtNum(payout, 0)}% of FCF returned — generous and fully funded.`
                : payout <= 130
                  ? `${fmtNum(payout, 0)}% of FCF — returns are outrunning cash generation; balance-sheet funded at the margin.`
                  : `${fmtNum(payout, 0)}% of FCF — unsustainable pace without new debt.`,
          importance: 0.45,
          pillar: "quality",
          sections: ["valuation/capital-allocation", "financials/cash-flow", "financials/cash-generation"],
          relatedIds: ["fcf", "dividend_yield", "net_debt"],
        });
      }
    }

    const capex = latestCf?.capex != null ? Math.abs(latestCf.capex) : null;
    if (capex != null && revenue) {
      const intensity = round((capex / revenue) * 100, 1);
      push({
        id: "capex_intensity",
        label: "Capex intensity",
        value: intensity,
        format: "percent",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Capital expenditure as a share of revenue — how much must be reinvested just to keep the machine running.",
        calculation: `Capex ${fmtNum(capex / 1e9, 1)}B ÷ revenue ${fmtNum(revenue / 1e9, 1)}B = ${fmtNum(intensity, 1)}%.`,
        whyItMatters: "Capital intensity is the tax on growth: it decides how much of the P&L ever becomes free cash.",
        grade: intensity <= 5 ? "good" : intensity <= 12 ? "neutral" : "bad",
        reason:
          intensity <= 5
            ? `${fmtNum(intensity, 1)}% — asset-light; growth is cheap to fund.`
            : intensity <= 12
              ? `${fmtNum(intensity, 1)}% — moderate reinvestment burden.`
              : `${fmtNum(intensity, 1)}% — capital-hungry; free cash arrives only after heavy reinvestment.`,
        importance: 0.35,
        pillar: "health",
        sections: ["financials/cash-flow", "valuation/capital-allocation"],
        relatedIds: ["fcf", "fcf_margin"],
      });
    }

    const eg = pct(r.earningsGrowth);
    if (eg != null) {
      push({
        id: "earnings_growth",
        label: "Earnings growth",
        value: eg,
        format: "signed",
        provenance: "reported",
        source: SRC_STMT,
        definition: "Year-over-year change in reported earnings.",
        calculation: `Reported earnings growth = ${fmtNum(eg, 1)}%.`,
        whyItMatters: "Multiples follow earnings revisions — this is the line the re-rating machine watches.",
        grade: eg >= 12 ? "good" : eg >= 0 ? "neutral" : "bad",
        reason:
          eg >= 12
            ? `${fmtNum(eg, 1)}% — earnings compounding fast enough to grow into the multiple.`
            : eg >= 0
              ? `${fmtNum(eg, 1)}% — positive but not multiple-expanding.`
              : `${fmtNum(eg, 1)}% — contracting earnings under a premium multiple is the classic de-rating setup.`,
        importance: 0.55,
        pillar: "growth",
        sections: ["valuation/growth", "financials/income-statement"],
        relatedIds: ["revenue_growth", "pe"],
      });
    }
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

  // Prune declared related ids, then union in the relationship web so every
  // node's neighbors reflect the live graph and navigation never dead-ends.
  for (const id of order) {
    const declared = metrics[id].relatedIds.filter((r) => !!metrics[r]);
    const fromEdges = EVIDENCE_RELATIONS.flatMap((e) =>
      e.from === id && metrics[e.to] ? [e.to] : e.to === id && metrics[e.from] ? [e.from] : [],
    );
    metrics[id].relatedIds = [...new Set([...declared, ...fromEdges])];
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
