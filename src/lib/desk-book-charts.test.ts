import { describe, it, expect } from "vitest";
import {
  buildGrowthSeries, rollingVolSeries, riskWeightRows, driftRows,
  liquidityLadderPoints, factorBarRows,
} from "./desk-book-charts";
import { buildBookDirectives, type BookPositionInput } from "./desk-book";

describe("buildGrowthSeries", () => {
  it("compounds log returns into growth-of-1 with drawdown ≤ 0", () => {
    // +10% then −10% in log space returns exactly to 1.0
    const pts = buildGrowthSeries([0.1, -0.1, 0.05], null);
    expect(pts).toHaveLength(3);
    expect(pts[0].book).toBeCloseTo(Math.exp(0.1), 10);
    expect(pts[1].book).toBeCloseTo(1, 10);
    expect(pts[1].drawdown).toBeCloseTo(1 / Math.exp(0.1) - 1, 10);
    expect(pts.every((p) => p.drawdown <= 0)).toBe(true);
    expect(pts.every((p) => p.bench === null)).toBe(true);
  });

  it("tail-aligns a shorter benchmark and indexes both to 1.0", () => {
    const pts = buildGrowthSeries([0.01, 0.01, 0.01, 0.01], [0.02, 0.02]);
    expect(pts[0].bench).toBeNull();
    expect(pts[1].bench).toBeNull();
    // Benchmark starts compounding from its own first aligned session.
    expect(pts[2].bench).toBeCloseTo(Math.exp(0.02), 10);
    expect(pts[3].bench).toBeCloseTo(Math.exp(0.04), 10);
  });

  it("returns empty for degenerate input", () => {
    expect(buildGrowthSeries([0.01], null)).toEqual([]);
  });
});

describe("rollingVolSeries", () => {
  it("annualizes a constant-vol series correctly", () => {
    // Alternating ±1% daily: sd = 1% (sample), annualized ≈ 15.87%
    const rets = Array.from({ length: 100 }, (_, t) => (t % 2 === 0 ? 0.01 : -0.01));
    const series = rollingVolSeries(rets, 60);
    expect(series.length).toBe(41);
    expect(series[0].volPct).toBeCloseTo(0.01 * Math.sqrt(252) * 100, 0);
  });

  it("requires window + 2 observations", () => {
    expect(rollingVolSeries([0.01, 0.02], 60)).toEqual([]);
  });
});

describe("riskWeightRows", () => {
  it("sorts by risk contribution and drops rows without Σ coverage", () => {
    const rows = riskWeightRows([
      { ticker: "A", weight: 0.5, riskContributionPct: 0.3 },
      { ticker: "B", weight: 0.2, riskContributionPct: 0.6 },
      { ticker: "C", weight: 0.3, riskContributionPct: null },
    ]);
    expect(rows.map((r) => r.ticker)).toEqual(["B", "A"]);
    expect(rows[0].riskPct).toBeCloseTo(60);
    expect(rows[0].weightPct).toBeCloseTo(20);
  });
});

describe("driftRows", () => {
  it("keeps only targeted rows, sorted by |drift|", () => {
    const base = (over: Partial<BookPositionInput>): BookPositionInput => ({
      ticker: "X", rawTicker: "X", weight: 0.5, valueBase: 1, priceBase: 1, pnlPct: 0, ...over,
    });
    const ds = buildBookDirectives(
      [
        base({ ticker: "A", rawTicker: "A", weight: 0.30, targetWeight: 0.35 }),
        base({ ticker: "B", rawTicker: "B", weight: 0.50, targetWeight: 0.30 }),
        base({ ticker: "C", rawTicker: "C", weight: 0.20, targetWeight: null }),
      ],
      1000,
    );
    const rows = driftRows(ds);
    expect(rows.map((r) => r.ticker)).toEqual(["B", "A"]);
    expect(rows[0].currentPct).toBeCloseTo(50);
    expect(rows[0].targetPct).toBeCloseTo(30);
  });
});

describe("liquidityLadderPoints", () => {
  it("builds a cumulative step curve over covered value", () => {
    const pts = liquidityLadderPoints([
      { ticker: "FAST", valueBase: 600, adv20: 1, daysToExit: 0.5, advMultiple: 1 },
      { ticker: "SLOW", valueBase: 400, adv20: 1, daysToExit: 10, advMultiple: 10 },
      { ticker: "NA", valueBase: 500, adv20: null, daysToExit: null, advMultiple: null },
    ]);
    const at = (day: number) => pts.find((p) => p.day === day)?.cumPct;
    expect(at(0.25)).toBeCloseTo(0);
    expect(at(1)).toBeCloseTo(60);
    expect(at(10)).toBeCloseTo(100);
    // Monotone non-decreasing by construction
    for (let i = 1; i < pts.length; i++) expect(pts[i].cumPct).toBeGreaterThanOrEqual(pts[i - 1].cumPct);
  });

  it("returns empty when nothing is covered", () => {
    expect(liquidityLadderPoints([
      { ticker: "NA", valueBase: 500, adv20: null, daysToExit: null, advMultiple: null },
    ])).toEqual([]);
  });
});

describe("factorBarRows", () => {
  it("orders by |β| and maps labels", () => {
    const rows = factorBarRows(
      [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }],
      { a: 0.2, b: -0.9, c: 0.5 },
    );
    expect(rows.map((r) => r.label)).toEqual(["B", "C", "A"]);
    expect(rows[0].beta).toBeCloseTo(-0.9);
  });
});
