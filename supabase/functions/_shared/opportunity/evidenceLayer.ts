// Evidence Layer — the intermediate stage between raw collection and the
// scoring models / confidence engine.
//
//   Candidates → Evidence Collection → EVIDENCE OBJECTS → Independent Models
//   → Confidence → Validation → Ranking
//
// `deriveEvidence` normalizes everything the collectors gathered (price
// features, fundamentals, news, macro) into a single, uniform, self-
// describing list of `Evidence` objects. Each object states what was
// observed, how strong and fresh it is, where it came from, and how much it
// should be trusted — so downstream stages (confidence, diagnostics,
// explainability) consume ONE structured representation instead of each
// re-reading raw features in its own ad-hoc way.
//
// Design rules:
//   • Pure and deterministic — same bundle in, same evidence out. No I/O.
//   • Computed ONCE per candidate and reused everywhere (dedup / perf).
//   • Never invents a value: an object is emitted only when its underlying
//     datum exists. Missing collectors simply produce fewer objects.
//   • `strength` is descriptive (what the evidence says), not a verdict —
//     the independent models remain the scorers. Buckets mirror the
//     consensus buckets so evidence and votes speak the same language.

import { bucketOf, type Bucket } from "../buckets.ts";
import type { Evidence, EvidenceBundle, EvidenceCategory } from "./types.ts";
import type { MacroContext } from "./macro.ts";
import type { MarketRegime } from "./models.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Knowledge-based freshness/reliability priors per collector. Freshness is
// how recent the underlying datum is (daily prices are today's; fundamentals
// are quarterly); source confidence is how much weight the collector's
// reading deserves before direction is considered. These are fixed economic
// priors, not tuned parameters.
const SOURCE_META: Record<string, { source: string; freshness: number; confidence: number }> = {
  price_history: { source: "price_history", freshness: 1.0, confidence: 0.90 },
  yahoo_summary: { source: "yahoo_summary", freshness: 0.5, confidence: 0.75 },
  gdelt_news: { source: "gdelt_news", freshness: 0.85, confidence: 0.55 },
  macro: { source: "macro", freshness: 0.9, confidence: 0.80 },
};

function make(
  id: string,
  category: EvidenceCategory,
  source: keyof typeof SOURCE_META,
  observation: string,
  strength: number,
  metrics: Record<string, number>,
  confidenceScale = 1,
): Evidence {
  const meta = SOURCE_META[source];
  return {
    id,
    category,
    bucket: bucketOf(id) as Bucket,
    observation,
    strength: Number(clamp(strength, -1, 1).toFixed(3)),
    freshness: meta.freshness,
    source: meta.source,
    confidence: Number(clamp(meta.confidence * confidenceScale, 0, 1).toFixed(3)),
    metrics,
  };
}

/**
 * Normalize a collected bundle (+ macro/regime context) into structured
 * Evidence objects. `macro` may be null (e.g. macro instruments unavailable);
 * the macro/regime evidence is then simply omitted.
 */
export function deriveEvidence(
  bundle: EvidenceBundle,
  macro: MacroContext | null,
  regime: MarketRegime,
  horizonDays: number,
): Evidence[] {
  const out: Evidence[] = [];
  const p = bundle.price;

  // ── Price / flow (bucket A) ──────────────────────────────────────
  if (p) {
    // Momentum: return over a window scaled by the volatility expected over
    // that window (a t-statistic-like reading) — the same volatility-scaled
    // idea the momentum model uses, expressed as evidence.
    const sigma63 = Math.max(p.volAnnual * Math.sqrt(63 / 252), 0.01);
    const t63 = p.ret63d / sigma63;
    out.push(make(
      "momentum", "momentum", "price_history",
      `63-day return ${pct(p.ret63d)} = ${t63.toFixed(2)}× its expected volatility over that window.`,
      clamp(t63 / 2, -1, 1),
      { ret63d: Number(p.ret63d.toFixed(4)), ret21d: Number(p.ret21d.toFixed(4)), volAnnual: Number(p.volAnnual.toFixed(4)) },
    ));

    // Trend structure vs moving averages.
    const aboveSma50 = p.lastClose > p.sma50;
    const sma50AboveSma200 = p.sma200 != null ? p.sma50 > p.sma200 : null;
    let trendStrength = aboveSma50 ? 0.4 : -0.4;
    if (sma50AboveSma200 != null) trendStrength += sma50AboveSma200 ? 0.3 : -0.3;
    out.push(make(
      "trend", "trend", "price_history",
      `Close ${aboveSma50 ? "above" : "below"} the 50-day average${sma50AboveSma200 == null ? "" : `; 50-day ${sma50AboveSma200 ? "above" : "below"} the 200-day`}; ${pct(Math.abs(p.pctFrom52wHigh))} below the 52-week high.`,
      trendStrength,
      { pctFrom52wHigh: Number(p.pctFrom52wHigh.toFixed(4)), zScore50d: Number(p.zScore50d.toFixed(2)) },
    ));

    // Mean reversion — only speaks at oscillator extremes.
    if (p.rsi14 <= 30 || p.rsi14 >= 75) {
      const mr = p.rsi14 <= 30 ? clamp((30 - p.rsi14) / 25, 0, 0.8) : -clamp((p.rsi14 - 75) / 20, 0, 0.8);
      out.push(make(
        "mean_reversion", "mean_reversion", "price_history",
        `RSI(14) ${p.rsi14.toFixed(0)} — ${p.rsi14 <= 30 ? "oversold" : "overbought"} extreme at ${p.zScore50d.toFixed(1)}σ from the 50-day mean.`,
        mr,
        { rsi14: Number(p.rsi14.toFixed(1)), zScore50d: Number(p.zScore50d.toFixed(2)) },
      ));
    }

    // Volume confirmation of a concurrent move.
    if (Math.abs(p.volumeZ20) >= 2 && Math.abs(p.ret5d) >= 0.01) {
      out.push(make(
        "volume", "volume", "price_history",
        `Latest volume ${p.volumeZ20.toFixed(1)}σ above its 20-day norm, confirming a ${p.ret5d > 0 ? "+" : ""}${pct(p.ret5d)} 5-day move.`,
        Math.sign(p.ret5d) * clamp(Math.abs(p.volumeZ20) / 4, 0, 0.7),
        { volumeZ20: Number(p.volumeZ20.toFixed(2)), ret5d: Number(p.ret5d.toFixed(4)) },
      ));
    }

    // Liquidity — context, not directional (strength 0). Feeds the floor gate.
    out.push(make(
      "liquidity", "liquidity", "price_history",
      `20-day average traded value ${Math.round(p.avgDollarVolume20d).toLocaleString()} ${p.currency ?? ""}.`.trim(),
      0,
      { avgDollarVolume20d: Math.round(p.avgDollarVolume20d), bars: p.bars },
    ));

    // Tail / structure — drawdown, vol, skew, kurtosis (bucket C).
    const tail = -clamp(p.drawdownFromPeak * 1.5, 0, 0.9) + (p.skew < -0.8 && p.excessKurt > 2 ? -0.15 : 0);
    out.push(make(
      "tail_risk", "tail_risk", "price_history",
      `Drawdown ${pct(p.drawdownFromPeak)} from the 1-year peak at ${pct(p.volAnnual)} annual vol; return skew ${p.skew.toFixed(2)}, excess kurtosis ${p.excessKurt.toFixed(2)}.`,
      tail,
      { drawdownFromPeak: Number(p.drawdownFromPeak.toFixed(4)), skew: Number(p.skew.toFixed(2)), excessKurt: Number(p.excessKurt.toFixed(2)) },
    ));
  }

  // ── Fundamental / intel (bucket B) ───────────────────────────────
  const f = bundle.fundamentals;
  if (f) {
    const peRaw = f.forwardPE ?? f.trailingPE;
    if (peRaw != null && peRaw > 0) {
      const s = peRaw < 12 ? 0.6 : peRaw < 18 ? 0.3 : peRaw <= 25 ? 0 : peRaw <= 40 ? -0.3 : -0.6;
      out.push(make("value", "valuation", "yahoo_summary",
        `${f.forwardPE != null ? "Forward" : "Trailing"} P/E ${peRaw.toFixed(1)} (${s > 0 ? "inexpensive" : s < 0 ? "rich" : "fair"}).`,
        s, { pe: Number(peRaw.toFixed(2)) }));
    }
    if (f.returnOnEquity != null || f.profitMargins != null) {
      const roe = f.returnOnEquity ?? 0, pm = f.profitMargins ?? 0;
      const s = clamp((roe > 0.18 ? 0.35 : roe > 0.08 ? 0.1 : roe > 0 ? 0 : -0.35) + (pm > 0.15 ? 0.2 : pm > 0 ? 0 : -0.3), -1, 1);
      out.push(make("quality", "quality", "yahoo_summary",
        `Return on equity ${f.returnOnEquity != null ? pct(f.returnOnEquity) : "n/a"}, profit margin ${f.profitMargins != null ? pct(f.profitMargins) : "n/a"}.`,
        s, { returnOnEquity: Number((f.returnOnEquity ?? 0).toFixed(4)), profitMargins: Number((f.profitMargins ?? 0).toFixed(4)) }));
    }
    if (f.revenueGrowth != null || f.earningsGrowth != null) {
      const s = clamp((f.revenueGrowth != null ? clamp(f.revenueGrowth / 0.3, -1, 1) * 0.5 : 0) + (f.earningsGrowth != null ? clamp(f.earningsGrowth / 0.4, -1, 1) * 0.5 : 0), -1, 1);
      out.push(make("growth", "growth", "yahoo_summary",
        `Revenue growth ${f.revenueGrowth != null ? pct(f.revenueGrowth) : "n/a"}, earnings growth ${f.earningsGrowth != null ? pct(f.earningsGrowth) : "n/a"} YoY.`,
        s, { revenueGrowth: Number((f.revenueGrowth ?? 0).toFixed(4)), earningsGrowth: Number((f.earningsGrowth ?? 0).toFixed(4)) }));
    }
    if (f.targetMeanPrice != null && p && p.lastClose > 0) {
      const upside = (f.targetMeanPrice - p.lastClose) / p.lastClose;
      const coverageScale = (f.numberOfAnalystOpinions ?? 0) >= 4 ? 1 : 0.5;
      out.push(make("analyst", "analyst", "yahoo_summary",
        `Mean analyst target implies ${pct(upside)} vs last close across ${f.numberOfAnalystOpinions ?? "?"} analysts.`,
        clamp(upside / 0.3, -1, 1) * 0.6, { analystUpside: Number(upside.toFixed(4)), analysts: f.numberOfAnalystOpinions ?? 0 }, coverageScale));
    }
  }

  // ── Sentiment / news (bucket B) ──────────────────────────────────
  const s = bundle.sentiment;
  if (s && s.articleCount > 0) {
    const strength = clamp(s.avgTone / 6 + s.lexicalScore / 4, -1, 1);
    // Thin coverage → lower confidence in the reading.
    const coverageScale = clamp(s.articleCount / 12, 0.3, 1);
    out.push(make("sentiment", "sentiment", "gdelt_news",
      `News tone ${s.avgTone.toFixed(1)} across ${s.articleCount} recent articles; headline keyword balance ${s.lexicalScore.toFixed(1)}.${s.topHeadline ? ` Latest: "${s.topHeadline}"` : ""}`,
      strength, { avgTone: Number(s.avgTone.toFixed(2)), articleCount: s.articleCount }, coverageScale));
  }

  // ── Macro / regime (bucket C) — context, strength stays near 0 ────
  if (macro) {
    const bits: string[] = [];
    if (macro.rates.tenYearPct != null) bits.push(`10y yield ${macro.rates.tenYearPct}%${macro.rates.curveSlopePct != null ? `, 10y−3m curve ${macro.rates.curveSlopePct >= 0 ? "+" : ""}${macro.rates.curveSlopePct}pt` : ""}`);
    if (macro.volatility.vix != null) bits.push(`VIX ${macro.volatility.vix.toFixed(1)}${macro.volatility.vixPercentile1y != null ? ` (${Math.round(macro.volatility.vixPercentile1y * 100)}th pct)` : ""}`);
    if (macro.credit.highYieldRelStrength63d != null) bits.push(`HY−IG credit ${macro.credit.highYieldRelStrength63d >= 0 ? "+" : ""}${pct(macro.credit.highYieldRelStrength63d)}/63d`);
    if (bits.length > 0) {
      out.push(make("regime", "macro", "macro",
        `Macro backdrop (${regime.label}): ${bits.join("; ")}.`,
        0, { horizonDays }));
    }
  }

  return out;
}

export interface EvidenceSummary {
  count: number;
  /** Count of evidence objects per bucket. */
  byBucket: { A: number; B: number; C: number };
  /** Confidence-weighted net directional strength across all evidence, [-1,1]. */
  netStrength: number;
  /** Mean freshness across collected evidence, 0..1. */
  freshness: number;
}

/** Compact, machine-readable roll-up of an evidence set (for diagnostics). */
export function summarizeEvidence(evidence: Evidence[]): EvidenceSummary {
  const byBucket = { A: 0, B: 0, C: 0 };
  let wSum = 0, sSum = 0, fSum = 0;
  for (const e of evidence) {
    byBucket[e.bucket]++;
    const w = e.confidence;
    wSum += w;
    sSum += w * e.strength;
    fSum += e.freshness;
  }
  return {
    count: evidence.length,
    byBucket,
    netStrength: wSum > 0 ? Number((sSum / wSum).toFixed(3)) : 0,
    freshness: evidence.length > 0 ? Number((fSum / evidence.length).toFixed(3)) : 0,
  };
}
