// IndependentScoringModels — each model reads a different slice of the
// evidence and votes independently. Models must:
//   • derive every number from the evidence bundle (no invented values),
//   • explain themselves in `rationale` with the observed figures,
//   • abstain (hasSignal=false) when their inputs are missing, rather
//     than guessing.
//
// Cross-validation happens later in the ConfidenceEngine: models are
// grouped into orthogonal information buckets (price/flow, fundamental,
// risk/regime — see _shared/buckets.ts) and conflicting evidence lowers
// the calibrated confidence.

import { mertonProxy, walkForwardEdge } from "../mathEdge.ts";
import type { EvidenceBundle, ModelScore } from "./types.ts";
import { causalModel } from "./causal.ts";
import type { MacroContext } from "./macro.ts";

export interface MarketRegime {
  label: "risk-on" | "neutral" | "risk-off";
  benchmarkRet21d: number;
  benchmarkVolAnnual: number;
  benchmarkAboveSma200: boolean | null;
  evidence: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function abstain(id: string, label: string, why: string): ModelScore {
  return { id, label, direction: 0, confidence: 0, score: 0, rationale: [why], hasSignal: false };
}

function toDirection(score: number, deadzone: number): -1 | 0 | 1 {
  if (!Number.isFinite(score) || Math.abs(score) < deadzone) return 0;
  return score > 0 ? 1 : -1;
}

function finish(id: string, label: string, score: number, rationale: string[], deadzone = 0.12): ModelScore {
  const s = clamp(score, -1, 1);
  const direction = toDirection(s, deadzone);
  return {
    id,
    label,
    direction,
    confidence: direction === 0 ? 0 : clamp(Math.abs(s), 0.05, 1),
    score: Number(s.toFixed(3)),
    rationale,
    hasSignal: true,
  };
}

// ── Bucket A: price / flow ──────────────────────────────────────────

export function momentumModel(b: EvidenceBundle): ModelScore {
  const p = b.price;
  if (!p || p.bars < 70) return abstain("momentum", "Momentum", "Insufficient price history for multi-window momentum (need 70+ bars).");
  // Volatility-scaled momentum: return over window divided by the vol
  // expected over that window; a t-statistic-like measure so a +10% move
  // in a 15%-vol name counts more than +10% in a 60%-vol name.
  const sigma63 = Math.max(p.volAnnual * Math.sqrt(63 / 252), 0.01);
  const sigma21 = Math.max(p.volAnnual * Math.sqrt(21 / 252), 0.01);
  const t63 = p.ret63d / sigma63;
  const t21 = p.ret21d / sigma21;
  // Weight the longer window 2:1 — less noise, and 12-1 style momentum
  // literature favors the multi-month signal. Scale /2 maps a 2-sigma
  // vol-adjusted move to full score.
  const score = (2 * t63 + t21) / 3 / 2;
  return finish("momentum", "Momentum", score, [
    `63-day return ${pct(p.ret63d)} = ${t63.toFixed(2)}× its expected volatility over that window.`,
    `21-day return ${pct(p.ret21d)} (${t21.toFixed(2)}× expected vol).`,
    `126-day return ${pct(p.ret126d)} for context.`,
  ]);
}

export function meanReversionModel(b: EvidenceBundle): ModelScore {
  const p = b.price;
  if (!p || p.bars < 60) return abstain("mean_reversion", "Mean reversion", "Insufficient price history for oscillator readings.");
  const rationale: string[] = [
    `RSI(14) ${p.rsi14.toFixed(0)}; price is ${p.zScore50d.toFixed(1)}σ from its 50-day mean.`,
  ];
  // Only speaks at extremes — mid-range oscillators carry no information.
  let score = 0;
  if (p.rsi14 <= 30 && p.zScore50d <= -1.5) {
    score = clamp((30 - p.rsi14) / 20 + (-p.zScore50d - 1.5) / 2, 0, 1) * 0.8;
    rationale.push("Oversold extreme: stretched below its own trading range, historical base rates favor a bounce.");
  } else if (p.rsi14 >= 75 && p.zScore50d >= 2) {
    score = -clamp((p.rsi14 - 75) / 15 + (p.zScore50d - 2) / 2, 0, 1) * 0.8;
    rationale.push("Overbought extreme: stretched above its own trading range, vulnerable to give-back.");
  } else {
    rationale.push("No extreme reading — model abstains in the middle of the range.");
  }
  return finish("mean_reversion", "Mean reversion", score, rationale, 0.1);
}

export function trendModel(b: EvidenceBundle): ModelScore {
  const p = b.price;
  if (!p || p.bars < 60) return abstain("trend", "Trend structure", "Insufficient history to establish trend structure.");
  const aboveSma50 = p.lastClose > p.sma50;
  const sma50AboveSma200 = p.sma200 != null ? p.sma50 > p.sma200 : null;
  const rationale: string[] = [
    `Close ${aboveSma50 ? "above" : "below"} 50-day average${sma50AboveSma200 == null ? "" : `; 50-day ${sma50AboveSma200 ? "above" : "below"} 200-day`}.`,
    `${pct(Math.abs(p.pctFrom52wHigh))} below 52-week high, ${pct(p.pctFrom52wLow)} above 52-week low.`,
  ];
  let score = 0;
  score += aboveSma50 ? 0.35 : -0.35;
  if (sma50AboveSma200 != null) score += sma50AboveSma200 ? 0.35 : -0.35;
  // Proximity to 52w high (within 5%) confirms an established uptrend;
  // deep drawdown (>30% off high) confirms a broken one.
  if (p.pctFrom52wHigh > -0.05) { score += 0.2; rationale.push("Trading within 5% of its 52-week high — trend intact."); }
  else if (p.drawdownFromPeak > 0.30) { score -= 0.2; rationale.push(`Deep drawdown (${pct(p.drawdownFromPeak)} off peak) — structure broken.`); }
  return finish("trend", "Trend structure", score, rationale);
}

export function volumeModel(b: EvidenceBundle): ModelScore {
  const p = b.price;
  if (!p || p.bars < 30) return abstain("volume", "Volume anomaly", "Insufficient volume history.");
  const rationale: string[] = [
    `Latest volume ${p.volumeZ20.toFixed(1)}σ vs its 20-day average; 5-day return ${pct(p.ret5d)}.`,
  ];
  // Volume only matters as confirmation of a concurrent move; an anomaly
  // without direction carries no directional information.
  let score = 0;
  if (Math.abs(p.volumeZ20) >= 2 && Math.abs(p.ret5d) >= 0.01) {
    score = Math.sign(p.ret5d) * clamp(Math.abs(p.volumeZ20) / 4, 0, 0.7);
    rationale.push(`Abnormal participation confirms the ${p.ret5d > 0 ? "advance" : "decline"} — moves on heavy volume persist more often than quiet ones.`);
  } else {
    rationale.push("No abnormal participation — model abstains.");
  }
  return finish("volume", "Volume anomaly", score, rationale, 0.1);
}

export function walkForwardModel(b: EvidenceBundle, horizonDays: number): ModelScore {
  const p = b.price;
  if (!p || p.closes.length < horizonDays + 40) {
    return abstain("walkforward", "Walk-forward edge", "Not enough history for walk-forward evaluation at this horizon.");
  }
  const wf = walkForwardEdge(p.closes, horizonDays);
  if (wf.n < 60) return abstain("walkforward", "Walk-forward edge", `Only ${wf.n} overlapping windows — sample too small.`);
  const rationale = [
    `Historically, holding ${horizonDays} days won ${(wf.hitRate * 100).toFixed(0)}% of the time with mean forward return ${pct(wf.meanFwd)} (n=${wf.n}).`,
    `Forward-return Sharpe ${wf.fwdSharpe.toFixed(2)}.`,
  ];
  // Require a real historical edge; |Sharpe| < 0.4 is noise.
  const score = Math.abs(wf.fwdSharpe) < 0.4 ? 0 : clamp(wf.fwdSharpe / 2, -1, 1);
  if (score === 0) rationale.push("No statistically meaningful historical edge at this horizon — abstaining.");
  return finish("walkforward", "Walk-forward edge", score, rationale, 0.1);
}

// ── Bucket B: fundamental / intel / sentiment ───────────────────────

export function valueModel(b: EvidenceBundle): ModelScore {
  const f = b.fundamentals;
  if (!f || (f.trailingPE == null && f.forwardPE == null && f.priceToBook == null)) {
    return abstain("value", "Value", "No valuation data available for this instrument.");
  }
  const rationale: string[] = [];
  let score = 0, inputs = 0;
  const pe = f.forwardPE ?? f.trailingPE;
  if (pe != null && pe > 0) {
    // Map P/E through wide, defensible bands: <12 cheap, 12–25 fair, >40 rich.
    const s = pe < 12 ? 0.6 : pe < 18 ? 0.3 : pe <= 25 ? 0 : pe <= 40 ? -0.3 : -0.6;
    score += s; inputs++;
    rationale.push(`${f.forwardPE != null ? "Forward" : "Trailing"} P/E ${pe.toFixed(1)} (${s > 0 ? "inexpensive" : s < 0 ? "rich" : "fair"}).`);
  } else if (pe != null && pe <= 0) {
    score -= 0.5; inputs++;
    rationale.push("Negative earnings — no valuation support.");
  }
  if (f.pegRatio != null && f.pegRatio > 0) {
    const s = f.pegRatio < 1 ? 0.4 : f.pegRatio <= 2 ? 0 : -0.4;
    score += s; inputs++;
    rationale.push(`PEG ${f.pegRatio.toFixed(2)} (${s > 0 ? "growth cheaper than average" : s < 0 ? "paying up for growth" : "fair"}).`);
  }
  if (f.priceToBook != null && f.priceToBook > 0 && f.priceToBook < 1) {
    score += 0.3; inputs++;
    rationale.push(`Price-to-book ${f.priceToBook.toFixed(2)} — below book value.`);
  }
  if (inputs === 0) return abstain("value", "Value", "Valuation inputs unusable.");
  return finish("value", "Value", score / Math.max(1, inputs * 0.8), rationale);
}

export function qualityModel(b: EvidenceBundle): ModelScore {
  const f = b.fundamentals;
  if (!f || (f.profitMargins == null && f.returnOnEquity == null && f.debtToEquity == null)) {
    return abstain("quality", "Quality", "No profitability / balance-sheet data available.");
  }
  const rationale: string[] = [];
  let score = 0, inputs = 0;
  if (f.profitMargins != null) {
    const s = f.profitMargins > 0.15 ? 0.4 : f.profitMargins > 0.05 ? 0.15 : f.profitMargins > 0 ? 0 : -0.5;
    score += s; inputs++;
    rationale.push(`Profit margin ${pct(f.profitMargins)}${f.profitMargins <= 0 ? " — loss-making" : ""}.`);
  }
  if (f.returnOnEquity != null) {
    const s = f.returnOnEquity > 0.18 ? 0.35 : f.returnOnEquity > 0.08 ? 0.1 : f.returnOnEquity > 0 ? 0 : -0.35;
    score += s; inputs++;
    rationale.push(`Return on equity ${pct(f.returnOnEquity)}.`);
  }
  if (f.debtToEquity != null) {
    // Yahoo reports D/E as a percentage (e.g. 150 = 1.5×).
    const de = f.debtToEquity > 10 ? f.debtToEquity / 100 : f.debtToEquity;
    const s = de < 0.5 ? 0.2 : de <= 1.5 ? 0 : -0.3;
    score += s; inputs++;
    rationale.push(`Debt-to-equity ${de.toFixed(2)}×.`);
  }
  if (inputs === 0) return abstain("quality", "Quality", "Quality inputs unusable.");
  return finish("quality", "Quality", score / Math.max(1, inputs * 0.7), rationale);
}

export function growthModel(b: EvidenceBundle): ModelScore {
  const f = b.fundamentals;
  if (!f || (f.revenueGrowth == null && f.earningsGrowth == null)) {
    return abstain("growth", "Growth", "No revenue / earnings growth data available.");
  }
  const rationale: string[] = [];
  let score = 0, inputs = 0;
  if (f.revenueGrowth != null) {
    score += clamp(f.revenueGrowth / 0.30, -1, 1) * 0.5; inputs++;
    rationale.push(`Revenue growth ${pct(f.revenueGrowth)} YoY.`);
  }
  if (f.earningsGrowth != null) {
    score += clamp(f.earningsGrowth / 0.40, -1, 1) * 0.5; inputs++;
    rationale.push(`Earnings growth ${pct(f.earningsGrowth)} YoY.`);
  }
  if (inputs === 0) return abstain("growth", "Growth", "Growth inputs unusable.");
  return finish("growth", "Growth", score, rationale);
}

export function analystModel(b: EvidenceBundle): ModelScore {
  const f = b.fundamentals;
  const p = b.price;
  if (!f || !p || (f.recommendationKey == null && f.targetMeanPrice == null)) {
    return abstain("analyst", "Analyst consensus", "No analyst coverage data available.");
  }
  const rationale: string[] = [];
  let score = 0, inputs = 0;
  const recMap: Record<string, number> = {
    strong_buy: 0.7, buy: 0.45, overweight: 0.35, hold: 0, neutral: 0,
    underweight: -0.35, underperform: -0.45, sell: -0.6, strong_sell: -0.7,
  };
  if (f.recommendationKey && f.recommendationKey in recMap) {
    score += recMap[f.recommendationKey]; inputs++;
    rationale.push(`Street consensus "${f.recommendationKey.replace(/_/g, " ")}" across ${f.numberOfAnalystOpinions ?? "?"} analysts.`);
  }
  if (f.targetMeanPrice != null && p.lastClose > 0) {
    const upside = (f.targetMeanPrice - p.lastClose) / p.lastClose;
    score += clamp(upside / 0.30, -1, 1) * 0.5; inputs++;
    rationale.push(`Mean price target implies ${pct(upside)} from last close.`);
  }
  if (inputs === 0) return abstain("analyst", "Analyst consensus", "Analyst inputs unusable.");
  // Thin coverage (<4 analysts) halves conviction — one analyst isn't a consensus.
  const coverageScale = (f.numberOfAnalystOpinions ?? 0) >= 4 ? 1 : 0.5;
  if (coverageScale < 1) rationale.push("Coverage is thin (<4 analysts) — conviction halved.");
  return finish("analyst", "Analyst consensus", (score / Math.max(1, inputs)) * coverageScale, rationale);
}

export function sentimentModel(b: EvidenceBundle): ModelScore {
  const s = b.sentiment;
  if (!s || s.articleCount === 0) return abstain("sentiment", "News sentiment", "No recent news flow found for this name.");
  // GDELT tone is roughly −10..+10; lexical score roughly −3..+3.
  const score = clamp(s.avgTone / 6 + s.lexicalScore / 4, -1, 1) * clamp(s.articleCount / 12, 0.3, 1);
  const rationale = [
    `Average news tone ${s.avgTone.toFixed(1)} over ${s.articleCount} recent articles; headline keyword balance ${s.lexicalScore.toFixed(1)}.`,
  ];
  if (s.topHeadline) rationale.push(`Latest: "${s.topHeadline}"`);
  return finish("sentiment", "News sentiment", score, rationale);
}

// ── Bucket C: risk / regime ─────────────────────────────────────────

export function regimeModel(b: EvidenceBundle, regime: MarketRegime): ModelScore {
  const p = b.price;
  if (!p) return abstain("regime", "Macro regime alignment", "No price data to relate to the market regime.");
  const beta = p.betaVsBenchmark;
  const rationale: string[] = [
    `Market regime: ${regime.label} (benchmark 21d ${pct(regime.benchmarkRet21d)}, vol ${pct(regime.benchmarkVolAnnual)}).`,
  ];
  if (beta == null) {
    rationale.push("Beta vs benchmark unavailable — abstaining.");
    return abstain("regime", "Macro regime alignment", rationale.join(" "));
  }
  rationale.push(`Beta vs benchmark ${beta.toFixed(2)}.`);
  let score = 0;
  if (regime.label === "risk-on") {
    // Risk-on rewards market-sensitive assets; defensives get no tailwind.
    score = beta >= 0.8 ? 0.4 : beta >= 0.3 ? 0.15 : 0;
  } else if (regime.label === "risk-off") {
    // Risk-off penalizes high beta and rewards defensive / inverse-beta assets.
    score = beta >= 1.2 ? -0.5 : beta >= 0.7 ? -0.25 : beta <= 0.1 ? 0.3 : 0;
  }
  if (score > 0) rationale.push("Current regime is a tailwind for this beta profile.");
  else if (score < 0) rationale.push("Current regime is a headwind for this beta profile.");
  else rationale.push("Regime roughly neutral for this beta profile.");
  return finish("regime", "Macro regime alignment", score, rationale, 0.1);
}

export function tailRiskModel(b: EvidenceBundle): ModelScore {
  const p = b.price;
  if (!p || p.bars < 60) return abstain("tail_risk", "Tail risk / structure", "Insufficient history for tail statistics.");
  const trendSlope = p.lastClose - p.sma50;
  const merton = mertonProxy({ sigmaAnnual: p.volAnnual, drawdownPct: p.drawdownFromPeak, trendSlope });
  const rationale: string[] = [
    `Drawdown from peak ${pct(p.drawdownFromPeak)} at ${pct(p.volAnnual)} annual vol → structural distance ${merton.dd} (${merton.severity}).`,
    `Return skew ${p.skew.toFixed(2)}, excess kurtosis ${p.excessKurt.toFixed(2)}.`,
  ];
  let score = 0;
  if (merton.severity === "DISTRESS") {
    score = -0.7;
    rationale.push("Price has fallen far in volatility units with no trend support — structural stress veto.");
  } else if (merton.severity === "STRESS") {
    score = -0.35;
    rationale.push("Elevated structural stress — treated as contradicting evidence for longs.");
  } else if (merton.signal === 1) {
    score = 0.25;
    rationale.push("Healthy distance from stress with trend support.");
  }
  // Fat left tail (negative skew + fat kurtosis) shaves any bullish tilt.
  if (p.skew < -0.8 && p.excessKurt > 2 && score > 0) {
    score *= 0.5;
    rationale.push("Fat left tail halves the bullish reading.");
  }
  return finish("tail_risk", "Tail risk / structure", score, rationale, 0.1);
}

// ── Runner ──────────────────────────────────────────────────────────

/** Run every independent model against a bundle. Order is stable for the UI. */
export function runAllModels(
  bundle: EvidenceBundle,
  regime: MarketRegime,
  horizonDays: number,
  macro: MacroContext,
): ModelScore[] {
  return [
    momentumModel(bundle),
    meanReversionModel(bundle),
    trendModel(bundle),
    volumeModel(bundle),
    walkForwardModel(bundle, horizonDays),
    valueModel(bundle),
    qualityModel(bundle),
    growthModel(bundle),
    analystModel(bundle),
    sentimentModel(bundle),
    regimeModel(bundle, regime),
    tailRiskModel(bundle),
    causalModel(bundle, macro),
  ];
}
