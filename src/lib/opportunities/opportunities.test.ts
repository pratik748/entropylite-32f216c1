import { beforeEach, describe, expect, it } from "vitest";
import { filterOpportunities, newOpportunities } from "./view";
import { getLifecycleMap, recentlyInvalidated, updateLifecycle } from "./lifecycle";
import type { EngineResponse, ValidatedOpportunity } from "./types";

function opp(overrides: Partial<ValidatedOpportunity>): ValidatedOpportunity {
  return {
    symbol: "TEST",
    name: "Test Asset",
    assetClass: "equity",
    currency: "USD",
    price: 100,
    direction: "long",
    horizonDays: 21,
    confidence: 0.65,
    confidenceDrivers: [],
    expectedEdgePct: 0.03,
    downsideRiskPct: 0.06,
    riskAdjustedScore: 0.325,
    sizing: {
      kellyFraction: 0.2,
      fractionalKellyPct: 5,
      volTargetWeightPct: 8,
      suggestedWeightPct: 5,
      basis: "fractional_kelly",
      estMaxLossPct: 0.3,
    },
    models: [],
    consensus: {
      decision: "BUY",
      calibratedProb: 0.65,
      agreement: 0.7,
      engineCount: 6,
      consensusLabel: "MAJORITY",
      expectedR: 0.4,
      bucketDirs: { A: 1, B: 1, C: 0 },
      bucketConsensus: "TWO_OF_3",
    },
    supportingEvidence: [],
    contradictingEvidence: [],
    recentChange: "",
    invalidation: [],
    origin: { source: "screener:most_actives", reason: "test" },
    liquidityTier: "us_largecap",
    costHaircutPct: 0.1,
    avgDollarVolume20d: 50_000_000,
    dataQuality: { priceBars: 250, collectors: ["price_history"], missing: [] },
    asOf: new Date().toISOString(),
    ...overrides,
  };
}

describe("filterOpportunities", () => {
  const slate = [
    opp({ symbol: "A", riskAdjustedScore: 0.5, assetClass: "equity", confidence: 0.7 }),
    opp({ symbol: "B", riskAdjustedScore: 0.9, assetClass: "etf", confidence: 0.6 }),
    opp({ symbol: "C", riskAdjustedScore: 0.2, assetClass: "equity", direction: "short", confidence: 0.62 }),
  ];

  it("sorts by expected risk-adjusted edge, descending", () => {
    const out = filterOpportunities(slate, {});
    expect(out.map((o) => o.symbol)).toEqual(["B", "A", "C"]);
  });

  it("filters by asset class without changing ranking", () => {
    const out = filterOpportunities(slate, { assetClasses: ["equity"] });
    expect(out.map((o) => o.symbol)).toEqual(["A", "C"]);
  });

  it("filters by direction and min confidence", () => {
    expect(filterOpportunities(slate, { direction: "short" }).map((o) => o.symbol)).toEqual(["C"]);
    expect(filterOpportunities(slate, { minConfidence: 0.65 }).map((o) => o.symbol)).toEqual(["A"]);
  });

  it("caps results after ranking", () => {
    const out = filterOpportunities(slate, { maxResults: 1 });
    expect(out.map((o) => o.symbol)).toEqual(["B"]);
  });
});

describe("newOpportunities", () => {
  it("returns only opportunities absent from the previous slate", () => {
    const latest = [opp({ symbol: "A" }), opp({ symbol: "B" })];
    expect(newOpportunities(["a"], latest).map((o) => o.symbol)).toEqual(["B"]);
    expect(newOpportunities([], latest)).toHaveLength(2);
    expect(newOpportunities(["A", "B"], latest)).toHaveLength(0);
  });
});

describe("opportunity lifecycle", () => {
  beforeEach(() => localStorage.clear());

  const response = (opps: ValidatedOpportunity[], asOf = new Date().toISOString()): EngineResponse => ({
    asOf,
    regime: { label: "neutral", evidence: [] },
    macro: {
      rates: { tenYearPct: null, threeMonthPct: null, curveSlopePct: null, tenYearChange63dPct: null },
      dollar: { ret63d: null },
      volatility: { vix: null, vixPercentile1y: null },
      credit: { highYieldRelStrength63d: null },
      sectors: { ranked: [] },
      evidence: [],
      missing: [],
    },
    learning: {
      calibration: { alpha: 3.2, beta: 1.4, gamma: -0.7, nSamples: 0, brierScore: 0.25, fitAt: null },
      reputationCells: 0,
      drift: "unfit",
    },
    opportunities: opps,
    diagnostics: {
      universeSize: 1, universeSources: {}, evidenceCollected: 1, scored: 1,
      validated: opps.length, rejections: [], rejectionSummary: {}, nearMisses: [],
    },
  });

  it("promotes new → active across consecutive runs and detects weakening", () => {
    updateLifecycle(response([opp({ symbol: "A", confidence: 0.68 })]));
    expect(getLifecycleMap()["A"].state).toBe("validated");

    updateLifecycle(response([opp({ symbol: "A", confidence: 0.69 })]));
    expect(getLifecycleMap()["A"].state).toBe("active");

    updateLifecycle(response([opp({ symbol: "A", confidence: 0.60 })]));
    expect(getLifecycleMap()["A"].state).toBe("weakening");
  });

  it("flags high conviction on strong confidence with full bucket agreement", () => {
    const strong = opp({ symbol: "B", confidence: 0.8 });
    strong.consensus = { ...strong.consensus, bucketConsensus: "ALL_3" };
    updateLifecycle(response([strong]));
    expect(getLifecycleMap()["B"].state).toBe("high_conviction");
  });

  it("invalidates opportunities that drop out of the slate", () => {
    updateLifecycle(response([opp({ symbol: "C" })]));
    updateLifecycle(response([]));
    expect(getLifecycleMap()["C"].state).toBe("invalidated");
    expect(recentlyInvalidated().map((e) => e.symbol)).toEqual(["C"]);
  });
});
