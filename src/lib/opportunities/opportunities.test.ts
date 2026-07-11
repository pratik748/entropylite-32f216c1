import { describe, expect, it } from "vitest";
import { filterOpportunities, newOpportunities } from "./view";
import type { ValidatedOpportunity } from "./types";

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
    expectedEdgePct: 0.03,
    downsideRiskPct: 0.06,
    riskAdjustedScore: 0.325,
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
