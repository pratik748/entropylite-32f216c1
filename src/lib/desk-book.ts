/**
 * Desk Book Analysis — pure, deterministic logic behind the Desk's
 * portfolio ("book") mode.
 * ─────────────────────────────────────────────────────────────────────
 * Doctrine (same spine as the evidence engine and institutional analytics):
 *  - every number derives from something the platform already measured or
 *    disclosed as an estimate; nothing is fabricated here;
 *  - three independent signal families are merged per position — the
 *    optimizer's target weight (quant), the desk verdict from analyze-stock
 *    (thesis), and the analysis-layer news pressure (narrative);
 *  - disagreement is SURFACED as a REVIEW directive naming both sides,
 *    never resolved by silent averaging;
 *  - news pressure alone never generates a trade directive — the platform's
 *    own disclaimer says those scores are not price predictions, so at most
 *    it corroborates or contests the other two families.
 */

// ── Thresholds (disclosed in the UI methodology footer) ─────────────

/** Weight drift vs optimizer target below this is noise, not a trade (percentage points). */
export const DRIFT_MATERIAL_PP = 2;
/** |analysis-layer news pressure| at or above this counts as a directional news signal. */
export const NEWS_PRESSURE_BAR = 2;

// ── Types ───────────────────────────────────────────────────────────

export interface BookNewsItemInput {
  headline?: string;
  category?: string;
  sentiment?: number;
  shortTermImpact?: number;
  longTermImpact?: number;
  confidence?: number;
  date?: string;
  explanation?: string;
}

export interface BookPositionInput {
  /** Display ticker (exchange suffix stripped) — keys the snapshot maps. */
  ticker: string;
  /** Exact ticker as held (with exchange suffix) — for host actions. */
  rawTicker: string;
  /** Current capital weight among analyzed positions, Σ = 1. */
  weight: number;
  valueBase: number;
  /** Current price converted to base currency (for whole-unit sizing). */
  priceBase: number;
  pnlPct: number;
  /** Desk verdict from analyze-stock: "Add" | "Hold" | "Exit" (loose). */
  suggestion?: string;
  /** Desk verdict confidence 0–100. */
  confidence?: number;
  news?: BookNewsItemInput[];
  /** Analysis-layer aggregate news pressure for the position. */
  totalPressure?: number;
  overallSentiment?: number;
  /** Euler share of portfolio variance (0..1); null without Σ coverage. */
  riskContribution?: number | null;
  /** Optimizer target weight; null when the asset lacks return history. */
  targetWeight?: number | null;
}

export type SignalVote = "add" | "trim" | "flat" | "na";
export type DirectiveAction = "ADD" | "TRIM" | "HOLD" | "REVIEW";
export type DirectiveAgreement = "aligned" | "conflict" | "single" | "quiet";

export interface BookDirective {
  ticker: string;
  rawTicker: string;
  action: DirectiveAction;
  agreement: DirectiveAgreement;
  currentWeight: number;
  targetWeight: number | null;
  /** target − current, percentage points; null without a target. */
  driftPp: number | null;
  /** Base-currency notional of the move toward target; null when unsized. */
  deltaValue: number | null;
  /** Whole units at the current base price; null when unsized. */
  deltaUnits: number | null;
  signals: { quant: SignalVote; verdict: SignalVote; news: SignalVote };
  rationale: string;
  verdictLabel: string | null;
  verdictConfidence: number | null;
  newsPressure: number | null;
  riskContribution: number | null;
  pnlPct: number;
}

export interface BookNewsRolled {
  /** Weight-averaged analysis-layer pressure over covered positions. */
  weightedPressure: number;
  /** Weight-averaged overall sentiment over covered positions. */
  weightedSentiment: number;
  /** Share of book weight with any news coverage (0..1). */
  coverageWeight: number;
  itemCount: number;
  /** Headlines ranked by |position weight × short-term impact|. */
  top: Array<{
    ticker: string;
    weight: number;
    headline: string;
    category: string;
    sentiment: number;
    shortTermImpact: number;
    confidence: number;
    date?: string;
    /** weight × shortTermImpact — the book-level pressure of this headline. */
    bookImpact: number;
  }>;
  /** Per-position pressure ranked by |weight × pressure|. */
  perPosition: Array<{ ticker: string; weight: number; pressure: number; itemCount: number }>;
}

export interface BookSummary {
  adds: number;
  trims: number;
  reviews: number;
  holds: number;
  /** Largest sized move by |deltaValue|, if any directive is sized. */
  largestMove: BookDirective | null;
  headline: string;
}

// ── News roll-up ────────────────────────────────────────────────────

export function aggregateBookNews(positions: BookPositionInput[]): BookNewsRolled | null {
  const covered = positions.filter(
    (p) => (p.news && p.news.length > 0) || typeof p.totalPressure === "number",
  );
  if (covered.length === 0) return null;

  const coverageWeight = covered.reduce((s, p) => s + p.weight, 0);
  const wPress = covered.filter((p) => typeof p.totalPressure === "number");
  const wPressSum = wPress.reduce((s, p) => s + p.weight, 0);
  const weightedPressure = wPressSum > 0
    ? wPress.reduce((s, p) => s + p.weight * (p.totalPressure as number), 0) / wPressSum
    : 0;
  const wSent = covered.filter((p) => typeof p.overallSentiment === "number");
  const wSentSum = wSent.reduce((s, p) => s + p.weight, 0);
  const weightedSentiment = wSentSum > 0
    ? wSent.reduce((s, p) => s + p.weight * (p.overallSentiment as number), 0) / wSentSum
    : 0;

  const top: BookNewsRolled["top"] = [];
  let itemCount = 0;
  for (const p of covered) {
    for (const n of p.news ?? []) {
      if (!n.headline) continue;
      itemCount += 1;
      const st = typeof n.shortTermImpact === "number" ? n.shortTermImpact : 0;
      top.push({
        ticker: p.ticker,
        weight: p.weight,
        headline: n.headline,
        category: n.category ?? "Company",
        sentiment: typeof n.sentiment === "number" ? n.sentiment : 0,
        shortTermImpact: st,
        confidence: typeof n.confidence === "number" ? n.confidence : 0,
        date: n.date,
        bookImpact: p.weight * st,
      });
    }
  }
  top.sort((a, b) => Math.abs(b.bookImpact) - Math.abs(a.bookImpact));

  const perPosition = covered
    .map((p) => ({
      ticker: p.ticker,
      weight: p.weight,
      pressure: typeof p.totalPressure === "number" ? p.totalPressure : 0,
      itemCount: p.news?.length ?? 0,
    }))
    .sort((a, b) => Math.abs(b.weight * b.pressure) - Math.abs(a.weight * a.pressure));

  return { weightedPressure, weightedSentiment, coverageWeight, itemCount, top: top.slice(0, 6), perPosition };
}

// ── Signal extraction ───────────────────────────────────────────────

function quantVote(p: BookPositionInput): SignalVote {
  if (p.targetWeight == null) return "na";
  const driftPp = (p.targetWeight - p.weight) * 100;
  if (driftPp >= DRIFT_MATERIAL_PP) return "add";
  if (driftPp <= -DRIFT_MATERIAL_PP) return "trim";
  return "flat";
}

function verdictVote(p: BookPositionInput): SignalVote {
  const s = (p.suggestion ?? "").trim().toLowerCase();
  if (!s) return "na";
  if (s === "add" || s === "buy" || s === "accumulate") return "add";
  if (s === "exit" || s === "sell" || s === "reduce" || s === "trim") return "trim";
  return "flat";
}

function newsVote(p: BookPositionInput): SignalVote {
  if (typeof p.totalPressure !== "number") return "na";
  if (p.totalPressure >= NEWS_PRESSURE_BAR) return "add";
  if (p.totalPressure <= -NEWS_PRESSURE_BAR) return "trim";
  return "flat";
}

const SIGNAL_NAMES: Record<keyof BookDirective["signals"], string> = {
  quant: "optimizer",
  verdict: "desk verdict",
  news: "news pressure",
};

// ── Directive engine ────────────────────────────────────────────────

/**
 * Merge the three signal families into one directive per position.
 *
 * Rules (deterministic, in order):
 *  1. Any add-side signal together with any trim-side signal → REVIEW,
 *     naming both sides. Conflicts are shown, never averaged away.
 *  2. Two or more signals on the same side → ADD/TRIM ("aligned"), but a
 *     verdict+news pair without the optimizer only trades when no target
 *     exists — if the optimizer holds the position at target, weight is
 *     already right and the row HOLDs with the thesis noted.
 *  3. A lone optimizer signal → mechanical ADD/TRIM ("single") — a
 *     rebalance, labeled as such.
 *  4. A lone desk verdict → ADD/TRIM ("single") — thesis-driven, unsized
 *     when no target exists.
 *  5. A lone news signal → HOLD ("single") — news scores are not price
 *     predictions and never trade on their own.
 *  6. Nothing fires → HOLD ("quiet").
 */
export function buildBookDirectives(
  positions: BookPositionInput[],
  totalValueBase: number,
): BookDirective[] {
  return positions.map((p) => {
    const signals = { quant: quantVote(p), verdict: verdictVote(p), news: newsVote(p) };
    const driftPp = p.targetWeight != null ? (p.targetWeight - p.weight) * 100 : null;

    const sides = (side: SignalVote) =>
      (Object.keys(signals) as Array<keyof typeof signals>).filter((k) => signals[k] === side);
    const adds = sides("add");
    const trims = sides("trim");

    const sizeToTarget = (): { deltaValue: number | null; deltaUnits: number | null } => {
      if (p.targetWeight == null || totalValueBase <= 0) return { deltaValue: null, deltaUnits: null };
      const deltaValue = (p.targetWeight - p.weight) * totalValueBase;
      // Epsilon guards the floor against FP error losing a whole unit
      // (e.g. (0.5−0.4)×10000 = 999.999… must size 10 units, not 9).
      const deltaUnits = p.priceBase > 0 ? Math.floor(Math.abs(deltaValue) / p.priceBase + 1e-9) : null;
      return { deltaValue, deltaUnits };
    };

    const fmtPp = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}pp`;
    const conf = p.confidence != null ? ` (${Math.round(p.confidence)}%)` : "";

    let action: DirectiveAction;
    let agreement: DirectiveAgreement;
    let rationale: string;
    let sized: { deltaValue: number | null; deltaUnits: number | null } = { deltaValue: null, deltaUnits: null };

    if (adds.length > 0 && trims.length > 0) {
      action = "REVIEW";
      agreement = "conflict";
      rationale = `${adds.map((k) => SIGNAL_NAMES[k]).join(" + ")} lean add, but ${trims
        .map((k) => SIGNAL_NAMES[k])
        .join(" + ")} lean${trims.length > 1 ? "" : "s"} trim${
        driftPp != null ? ` (drift ${fmtPp(driftPp)}` : ""
      }${driftPp != null && p.suggestion ? `, verdict ${p.suggestion}${conf})` : driftPp != null ? ")" : ""} — resolve manually, the desk does not average away disagreement.`;
    } else if (adds.length >= 2 || trims.length >= 2) {
      const side: "add" | "trim" = adds.length >= 2 ? "add" : "trim";
      const members = side === "add" ? adds : trims;
      if (signals.quant === side) {
        action = side === "add" ? "ADD" : "TRIM";
        agreement = "aligned";
        sized = sizeToTarget();
        rationale = `${members.map((k) => SIGNAL_NAMES[k]).join(" + ")} agree: move ${fmtPp(driftPp as number)} toward target${
          p.suggestion ? ` with desk verdict ${p.suggestion}${conf}` : ""
        }.`;
      } else if (signals.quant === "na") {
        action = side === "add" ? "ADD" : "TRIM";
        agreement = "aligned";
        rationale = `${members.map((k) => SIGNAL_NAMES[k]).join(" + ")} agree; no optimizer target exists for this asset (insufficient return history) — size manually.`;
      } else {
        // verdict + news agree but the optimizer holds the position at target.
        action = "HOLD";
        agreement = "aligned";
        rationale = `Desk verdict${conf} and news pressure agree ${side === "add" ? "positively" : "negatively"}, but weight is already within ${DRIFT_MATERIAL_PP}pp of target — thesis noted, no size change.`;
      }
    } else if (signals.quant === "add" || signals.quant === "trim") {
      action = signals.quant === "add" ? "ADD" : "TRIM";
      agreement = "single";
      sized = sizeToTarget();
      rationale = `Mechanical rebalance: ${fmtPp(driftPp as number)} drift vs target with no thesis or news signal.`;
    } else if (signals.verdict === "add" || signals.verdict === "trim") {
      action = signals.verdict === "add" ? "ADD" : "TRIM";
      agreement = "single";
      if (signals.quant === "flat") {
        // Verdict fires while weight sits at target — the optimizer assumes
        // continued holding, so the thesis signal still leads, unsized.
        rationale = `Desk verdict ${p.suggestion}${conf} with weight at target — thesis-driven, size manually.`;
      } else {
        rationale = `Desk verdict ${p.suggestion}${conf}; no optimizer target (insufficient history) — thesis-driven, size manually.`;
      }
    } else if (signals.news === "add" || signals.news === "trim") {
      action = "HOLD";
      agreement = "single";
      rationale = `News pressure ${(p.totalPressure as number) >= 0 ? "+" : ""}${(p.totalPressure as number).toFixed(1)} is directional but news scores are not price predictions — watch, no trade on news alone.`;
    } else {
      action = "HOLD";
      agreement = "quiet";
      rationale = driftPp != null
        ? `Within ${DRIFT_MATERIAL_PP}pp of target, verdict ${p.suggestion ?? "Hold"}, news quiet.`
        : `No optimizer target (insufficient history); verdict ${p.suggestion ?? "Hold"}, news quiet.`;
    }

    return {
      ticker: p.ticker,
      rawTicker: p.rawTicker,
      action,
      agreement,
      currentWeight: p.weight,
      targetWeight: p.targetWeight ?? null,
      driftPp,
      deltaValue: sized.deltaValue,
      deltaUnits: sized.deltaUnits,
      signals,
      rationale,
      verdictLabel: p.suggestion ?? null,
      verdictConfidence: p.confidence ?? null,
      newsPressure: typeof p.totalPressure === "number" ? p.totalPressure : null,
      riskContribution: p.riskContribution ?? null,
      pnlPct: p.pnlPct,
    };
  });
}

const ACTION_ORDER: Record<DirectiveAction, number> = { REVIEW: 0, TRIM: 1, ADD: 2, HOLD: 3 };

/** Sort for display: conflicts first, then trims/adds by |notional|, holds last. */
export function sortDirectives(ds: BookDirective[]): BookDirective[] {
  return [...ds].sort((a, b) => {
    const byAction = ACTION_ORDER[a.action] - ACTION_ORDER[b.action];
    if (byAction !== 0) return byAction;
    return Math.abs(b.deltaValue ?? 0) - Math.abs(a.deltaValue ?? 0);
  });
}

export function summarizeBook(directives: BookDirective[]): BookSummary {
  const adds = directives.filter((d) => d.action === "ADD").length;
  const trims = directives.filter((d) => d.action === "TRIM").length;
  const reviews = directives.filter((d) => d.action === "REVIEW").length;
  const holds = directives.filter((d) => d.action === "HOLD").length;
  const sizedMoves = directives.filter((d) => d.deltaValue != null && d.action !== "HOLD");
  const largestMove = sizedMoves.length > 0
    ? sizedMoves.reduce((m, d) => (Math.abs(d.deltaValue as number) > Math.abs(m.deltaValue as number) ? d : m))
    : null;

  const parts: string[] = [];
  if (reviews > 0) parts.push(`${reviews} conflict${reviews > 1 ? "s" : ""} need${reviews > 1 ? "" : "s"} review`);
  if (trims > 0) parts.push(`${trims} trim${trims > 1 ? "s" : ""}`);
  if (adds > 0) parts.push(`${adds} add${adds > 1 ? "s" : ""}`);
  if (parts.length === 0) parts.push(`book at target — ${holds} position${holds !== 1 ? "s" : ""} holding`);
  return { adds, trims, reviews, holds, largestMove, headline: parts.join(" · ") };
}
