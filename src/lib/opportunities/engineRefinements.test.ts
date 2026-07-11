// Tests for the architectural refinements: the Evidence Layer and the
// Market Context classifier. Both are pure and deterministic, so we assert
// structure, determinism, and — critically — that the market context tilts
// confidence WITHIN bounds and is exactly neutral (multiplier 1.0) when the
// environment is uninformative (behaviour-preservation guarantee).

import { describe, expect, it } from "vitest";
import {
  deriveEvidence,
  summarizeEvidence,
} from "../../../supabase/functions/_shared/opportunity/evidenceLayer.ts";
import {
  classifyMarketContext,
  contextConfidenceMultiplier,
} from "../../../supabase/functions/_shared/opportunity/marketContext.ts";
import type { MarketRegime } from "../../../supabase/functions/_shared/opportunity/models.ts";
import type { MacroContext } from "../../../supabase/functions/_shared/opportunity/macro.ts";
import type {
  EvidenceBundle,
  PriceFeatures,
} from "../../../supabase/functions/_shared/opportunity/types.ts";

function priceFeatures(overrides: Partial<PriceFeatures> = {}): PriceFeatures {
  return {
    bars: 250,
    lastClose: 110,
    currency: "USD",
    ret5d: 0.02,
    ret21d: 0.05,
    ret63d: 0.12,
    ret126d: 0.18,
    volAnnual: 0.22,
    volAnnualPrev: 0.2,
    maxDrawdown1y: 0.15,
    drawdownFromPeak: 0.05,
    rsi14: 58,
    sma50: 105,
    sma200: 100,
    pctFrom52wHigh: -0.04,
    pctFrom52wLow: 0.35,
    zScore50d: 0.8,
    volumeZ20: 0.5,
    avgDollarVolume20d: 50_000_000,
    skew: -0.2,
    excessKurt: 1.1,
    betaVsBenchmark: 1.05,
    relStrength63d: 0.03,
    closes: Array.from({ length: 250 }, (_, i) => 90 + i * 0.08),
    ...overrides,
  };
}

function bundle(price: PriceFeatures | null): EvidenceBundle {
  return {
    candidate: { symbol: "TEST", name: "Test", assetClass: "equity", origin: { source: "test", reason: "test" } },
    price,
    fundamentals: null,
    sentiment: null,
    items: [],
    missing: [],
  };
}

function regime(overrides: Partial<MarketRegime> = {}): MarketRegime {
  return {
    label: "neutral",
    benchmarkRet21d: 0,
    benchmarkVolAnnual: 0.18,
    benchmarkAboveSma200: true,
    evidence: [],
    ...overrides,
  };
}

const EMPTY_MACRO: MacroContext = {
  rates: { tenYearPct: null, threeMonthPct: null, curveSlopePct: null, tenYearChange63dPct: null },
  dollar: { ret63d: null },
  volatility: { vix: null, vixPercentile1y: null },
  credit: { highYieldRelStrength63d: null },
  sectors: { ranked: [], bySector: {} },
  evidence: [],
  missing: [],
};

describe("deriveEvidence (Evidence Layer)", () => {
  it("emits self-describing, well-formed evidence objects from price features", () => {
    const ev = deriveEvidence(bundle(priceFeatures()), EMPTY_MACRO, regime(), 21);
    expect(ev.length).toBeGreaterThan(0);
    for (const e of ev) {
      expect(e.id).toBeTruthy();
      expect(["A", "B", "C"]).toContain(e.bucket);
      expect(e.observation.length).toBeGreaterThan(0);
      expect(e.strength).toBeGreaterThanOrEqual(-1);
      expect(e.strength).toBeLessThanOrEqual(1);
      expect(e.freshness).toBeGreaterThanOrEqual(0);
      expect(e.freshness).toBeLessThanOrEqual(1);
      expect(e.confidence).toBeGreaterThanOrEqual(0);
      expect(e.confidence).toBeLessThanOrEqual(1);
      expect(typeof e.metrics).toBe("object");
    }
    // Momentum, trend, liquidity and tail evidence are always derivable from price.
    const ids = ev.map((e) => e.id);
    expect(ids).toContain("momentum");
    expect(ids).toContain("trend");
    expect(ids).toContain("liquidity");
    expect(ids).toContain("tail_risk");
  });

  it("is deterministic — identical inputs yield identical evidence", () => {
    const a = deriveEvidence(bundle(priceFeatures()), EMPTY_MACRO, regime(), 21);
    const b = deriveEvidence(bundle(priceFeatures()), EMPTY_MACRO, regime(), 21);
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });

  it("never invents evidence when data is missing", () => {
    const ev = deriveEvidence(bundle(null), null, regime(), 21);
    // No price, no macro, no fundamentals/sentiment → nothing to observe.
    expect(ev).toHaveLength(0);
  });

  it("reflects direction: a strong uptrend reads bullish momentum", () => {
    const up = deriveEvidence(bundle(priceFeatures({ ret63d: 0.3, volAnnual: 0.2 })), EMPTY_MACRO, regime(), 21);
    const down = deriveEvidence(bundle(priceFeatures({ ret63d: -0.3, volAnnual: 0.2 })), EMPTY_MACRO, regime(), 21);
    const upMom = up.find((e) => e.id === "momentum")!.strength;
    const downMom = down.find((e) => e.id === "momentum")!.strength;
    expect(upMom).toBeGreaterThan(0);
    expect(downMom).toBeLessThan(0);
  });

  it("summarizeEvidence rolls up buckets and net strength within bounds", () => {
    const ev = deriveEvidence(bundle(priceFeatures()), EMPTY_MACRO, regime(), 21);
    const s = summarizeEvidence(ev);
    expect(s.count).toBe(ev.length);
    expect(s.byBucket.A + s.byBucket.B + s.byBucket.C).toBe(ev.length);
    expect(s.netStrength).toBeGreaterThanOrEqual(-1);
    expect(s.netStrength).toBeLessThanOrEqual(1);
    expect(s.freshness).toBeGreaterThanOrEqual(0);
    expect(s.freshness).toBeLessThanOrEqual(1);
  });
});

describe("classifyMarketContext (Market Context)", () => {
  it("is neutral (multiplier exactly 1.0) in a flat, normal-vol, neutral regime", () => {
    const ctx = classifyMarketContext(EMPTY_MACRO, regime({ label: "neutral", benchmarkRet21d: 0, benchmarkVolAnnual: 0.18 }));
    expect(ctx.longConfidenceMultiplier).toBe(1);
    expect(ctx.shortConfidenceMultiplier).toBe(1);
    expect(ctx.risk).toBe("neutral");
  });

  it("keeps both multipliers within [0.90, 1.06] across environments", () => {
    const envs: MacroContext[] = [
      { ...EMPTY_MACRO, volatility: { vix: 32, vixPercentile1y: 0.9 }, credit: { highYieldRelStrength63d: -0.03 } },
      { ...EMPTY_MACRO, volatility: { vix: 12, vixPercentile1y: 0.1 }, credit: { highYieldRelStrength63d: 0.03 } },
    ];
    const regimes = [
      regime({ label: "risk-on", benchmarkRet21d: 0.04, benchmarkAboveSma200: true }),
      regime({ label: "risk-off", benchmarkRet21d: -0.05, benchmarkAboveSma200: false }),
    ];
    for (const m of envs) {
      for (const r of regimes) {
        const ctx = classifyMarketContext(m, r);
        for (const mult of [ctx.longConfidenceMultiplier, ctx.shortConfidenceMultiplier]) {
          expect(mult).toBeGreaterThanOrEqual(0.9);
          expect(mult).toBeLessThanOrEqual(1.06);
        }
      }
    }
  });

  it("classifies a low-vol risk-on uptrend and favours longs over shorts", () => {
    const macro: MacroContext = { ...EMPTY_MACRO, volatility: { vix: 12, vixPercentile1y: 0.15 } };
    const ctx = classifyMarketContext(macro, regime({ label: "risk-on", benchmarkRet21d: 0.04, benchmarkAboveSma200: true }));
    expect(ctx.risk).toBe("risk_on");
    expect(ctx.volatility).toBe("low_vol");
    expect(ctx.trend).toBe("trending");
    expect(contextConfidenceMultiplier(ctx, "long")).toBeGreaterThan(contextConfidenceMultiplier(ctx, "short"));
  });

  it("classifies high volatility from the VIX percentile", () => {
    const macro: MacroContext = { ...EMPTY_MACRO, volatility: { vix: 34, vixPercentile1y: 0.85 } };
    const ctx = classifyMarketContext(macro, regime({ label: "risk-off", benchmarkRet21d: -0.04, benchmarkAboveSma200: false }));
    expect(ctx.volatility).toBe("high_vol");
    expect(ctx.risk).toBe("risk_off");
    // Risk-off + high-vol dampens long conviction below neutral.
    expect(contextConfidenceMultiplier(ctx, "long")).toBeLessThan(1);
  });

  it("is deterministic", () => {
    const m: MacroContext = { ...EMPTY_MACRO, volatility: { vix: 20, vixPercentile1y: 0.5 } };
    const a = classifyMarketContext(m, regime());
    const b = classifyMarketContext(m, regime());
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
