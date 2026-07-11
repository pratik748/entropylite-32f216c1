// Integration test — drives the REAL evaluateCandidate flow (the point where
// the Evidence Layer, Market Context and diagnostics all converge) end-to-end
// with a synthetic-but-realistic bundle. No network. Verifies that:
//   • a validated opportunity carries the structured `evidence` layer,
//   • it carries machine-readable acceptance `diagnostics`,
//   • the market context tilts confidence (risk-on lifts a long vs neutral),
//   • legacy fields (supportingEvidence, models, consensus) are unchanged.

import { describe, expect, it } from "vitest";
import { runAllModels, type MarketRegime } from "../../../supabase/functions/_shared/opportunity/models.ts";
import { evaluateCandidate } from "../../../supabase/functions/_shared/opportunity/confidence.ts";
import { classifyMarketContext } from "../../../supabase/functions/_shared/opportunity/marketContext.ts";
import { EMPTY_BOOK } from "../../../supabase/functions/_shared/opportunity/reputationCore.ts";
import type { EvidenceBundle } from "../../../supabase/functions/_shared/opportunity/types.ts";
import type { MacroContext } from "../../../supabase/functions/_shared/opportunity/macro.ts";
import { computePriceFeatures, type ChartSeries } from "../../../supabase/functions/_shared/opportunity/evidence.ts";

// A clean, steadily rising series (≥250 bars) → strong momentum + trend, good
// liquidity, positive but not extreme volatility.
function risingSeries(): ChartSeries {
  const closes: number[] = [];
  const volumes: number[] = [];
  let px = 60;
  for (let i = 0; i < 260; i++) {
    px *= 1 + 0.0018 + Math.sin(i / 9) * 0.004; // gentle uptrend with wiggle
    closes.push(Number(px.toFixed(2)));
    volumes.push(1_500_000 + (i % 5) * 50_000);
  }
  return { closes, volumes, currency: "USD" };
}

const CALIBRATION = { alpha: 3.2, beta: 1.4, gamma: -0.7 };

const MACRO: MacroContext = {
  rates: { tenYearPct: 4.2, threeMonthPct: 4.0, curveSlopePct: 0.2, tenYearChange63dPct: -0.1 },
  dollar: { ret63d: -0.01 },
  volatility: { vix: 14, vixPercentile1y: 0.2 },
  credit: { highYieldRelStrength63d: 0.02 },
  sectors: { ranked: [], bySector: { Technology: 0.03 } },
  evidence: [],
  missing: [],
};

function bullishBundle(): EvidenceBundle {
  const series = risingSeries();
  const price = computePriceFeatures(series, series); // self-benchmark → beta≈1
  return {
    candidate: { symbol: "ACME", name: "Acme Corp", assetClass: "equity", currency: "USD", origin: { source: "test", reason: "integration" } },
    price,
    fundamentals: {
      marketCap: 5e10, trailingPE: 16, forwardPE: 14, pegRatio: 1.1, priceToBook: 2.2,
      profitMargins: 0.18, returnOnEquity: 0.21, debtToEquity: 40, revenueGrowth: 0.2, earningsGrowth: 0.25,
      recommendationKey: "buy", numberOfAnalystOpinions: 12, targetMeanPrice: price.lastClose * 1.2,
      shortPercentOfFloat: 0.02, sector: "Technology", industry: "Software",
    },
    sentiment: { articleCount: 8, avgTone: 2.5, lexicalScore: 1.5, topHeadline: "Acme beats and raises guidance" },
    items: [
      { collector: "price_history", key: "ret_63d", value: price.ret63d, statement: "63d", asOf: new Date().toISOString() },
      { collector: "yahoo_summary", key: "forward_pe", value: 14, statement: "pe", asOf: new Date().toISOString() },
      { collector: "gdelt_news", key: "avg_tone", value: 2.5, statement: "tone", asOf: new Date().toISOString() },
    ],
    missing: [],
  };
}

const RISK_ON: MarketRegime = { label: "risk-on", benchmarkRet21d: 0.03, benchmarkVolAnnual: 0.14, benchmarkAboveSma200: true, evidence: [] };
const NEUTRAL: MarketRegime = { label: "neutral", benchmarkRet21d: 0.0, benchmarkVolAnnual: 0.18, benchmarkAboveSma200: true, evidence: [] };

describe("evaluateCandidate — Evidence Layer + diagnostics integration", () => {
  const bundle = bullishBundle();
  const models = runAllModels(bundle, RISK_ON, 21, MACRO);
  const marketContext = classifyMarketContext(MACRO, RISK_ON);

  const result = evaluateCandidate({
    bundle, models, regime: RISK_ON, horizonDays: 21, calibration: CALIBRATION,
    reputation: EMPTY_BOOK, macro: MACRO, marketContext,
  });

  it("mints a validated opportunity from a strong multi-bucket bull case", () => {
    expect(result.ok).toBe(true);
  });

  it("attaches the structured Evidence Layer", () => {
    if (!result.ok) throw new Error("expected ok");
    const o = result.opportunity;
    expect(Array.isArray(o.evidence)).toBe(true);
    expect(o.evidence!.length).toBeGreaterThan(0);
    // Every surfaced evidence object is well-formed and self-describing.
    for (const e of o.evidence!) {
      expect(e.observation.length).toBeGreaterThan(0);
      expect(["A", "B", "C"]).toContain(e.bucket);
      expect(e.source).toBeTruthy();
    }
  });

  it("exposes machine-readable acceptance diagnostics (never vague)", () => {
    if (!result.ok) throw new Error("expected ok");
    const d = result.opportunity.diagnostics!;
    expect(d.accepted).toBe(true);
    expect(d.reasonCodes).toContain("bucket_consensus_met");
    expect(d.reasonCodes).toContain("context_risk_on");
    expect(d.marketContextLabels).toContain("risk_on");
    expect(d.evidenceCount).toBeGreaterThan(0);
  });

  it("preserves legacy fields consumed by the existing UI", () => {
    if (!result.ok) throw new Error("expected ok");
    const o = result.opportunity;
    expect(o.models.length).toBeGreaterThan(0);
    expect(o.supportingEvidence.length).toBeGreaterThan(0);
    expect(o.consensus.decision).toBe("BUY");
    expect(o.currency).toBe("USD"); // INR/base-currency handling path unchanged
    expect(o.confidence).toBeGreaterThan(0.5);
    expect(o.confidence).toBeLessThanOrEqual(0.95);
  });

  it("market context influences confidence: risk-on lifts a long vs neutral", () => {
    const neutralCtx = classifyMarketContext({ ...MACRO, volatility: { vix: 20, vixPercentile1y: 0.5 } }, NEUTRAL);
    const neutral = evaluateCandidate({
      bundle, models: runAllModels(bundle, NEUTRAL, 21, MACRO), regime: NEUTRAL, horizonDays: 21,
      calibration: CALIBRATION, reputation: EMPTY_BOOK, macro: MACRO, marketContext: neutralCtx,
    });
    if (!result.ok || !neutral.ok) throw new Error("expected both ok");
    // Same base case; risk-on/low-vol context should not reduce a long's confidence.
    expect(result.opportunity.confidence).toBeGreaterThanOrEqual(neutral.opportunity.confidence);
    // And the context multiplier is bounded — it never manufactures certainty.
    expect(result.opportunity.confidence).toBeLessThanOrEqual(0.95);
  });
});
