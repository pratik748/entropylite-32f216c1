import { describe, it, expect } from "vitest";
import {
  aggregateBookNews,
  buildBookDirectives,
  sortDirectives,
  summarizeBook,
  DRIFT_MATERIAL_PP,
  NEWS_PRESSURE_BAR,
  type BookPositionInput,
} from "./desk-book";

const base = (over: Partial<BookPositionInput>): BookPositionInput => ({
  ticker: "AAPL",
  rawTicker: "AAPL",
  weight: 0.5,
  valueBase: 5000,
  priceBase: 100,
  pnlPct: 0,
  ...over,
});

describe("buildBookDirectives", () => {
  it("ADD when optimizer drift and desk verdict agree, sized to target in whole units", () => {
    const [d] = buildBookDirectives(
      [base({ weight: 0.4, targetWeight: 0.5, suggestion: "Add", confidence: 70 })],
      10_000,
    );
    expect(d.action).toBe("ADD");
    expect(d.agreement).toBe("aligned");
    expect(d.driftPp).toBeCloseTo(10);
    expect(d.deltaValue).toBeCloseTo(1000);
    expect(d.deltaUnits).toBe(10); // 1000 / priceBase 100
  });

  it("REVIEW when optimizer wants more but the desk verdict says Exit — conflict named, not averaged", () => {
    const [d] = buildBookDirectives(
      [base({ weight: 0.4, targetWeight: 0.5, suggestion: "Exit", confidence: 65 })],
      10_000,
    );
    expect(d.action).toBe("REVIEW");
    expect(d.agreement).toBe("conflict");
    expect(d.rationale).toContain("optimizer");
    expect(d.rationale).toContain("desk verdict");
    expect(d.deltaValue).toBeNull(); // conflicts are never auto-sized
  });

  it("news pressure alone never trades — HOLD with a watch rationale", () => {
    const [d] = buildBookDirectives(
      [base({ targetWeight: 0.5, totalPressure: NEWS_PRESSURE_BAR + 1 })],
      10_000,
    );
    expect(d.action).toBe("HOLD");
    expect(d.agreement).toBe("single");
    expect(d.rationale).toContain("not price predictions");
  });

  it("lone optimizer drift is a mechanical rebalance", () => {
    const [d] = buildBookDirectives(
      [base({ weight: 0.6, targetWeight: 0.5, suggestion: "Hold" })],
      10_000,
    );
    expect(d.action).toBe("TRIM");
    expect(d.agreement).toBe("single");
    expect(d.rationale).toContain("Mechanical rebalance");
    expect(d.deltaValue).toBeCloseTo(-1000);
  });

  it("desk Exit without an optimizer target still trims, unsized", () => {
    const [d] = buildBookDirectives(
      [base({ targetWeight: null, suggestion: "Exit", confidence: 80 })],
      10_000,
    );
    expect(d.action).toBe("TRIM");
    expect(d.deltaValue).toBeNull();
    expect(d.rationale).toContain("size manually");
  });

  it("verdict + news agreeing while weight sits at target HOLDs — weight is already right", () => {
    const [d] = buildBookDirectives(
      [base({ weight: 0.5, targetWeight: 0.5, suggestion: "Add", totalPressure: 3 })],
      10_000,
    );
    expect(d.action).toBe("HOLD");
    expect(d.agreement).toBe("aligned");
    expect(d.rationale).toContain("already within");
  });

  it("sub-threshold drift is noise, not a trade", () => {
    const [d] = buildBookDirectives(
      [base({ weight: 0.5, targetWeight: 0.5 + (DRIFT_MATERIAL_PP - 0.5) / 100, suggestion: "Hold" })],
      10_000,
    );
    expect(d.action).toBe("HOLD");
    expect(d.agreement).toBe("quiet");
  });
});

describe("sortDirectives / summarizeBook", () => {
  it("orders conflicts first and summarizes counts", () => {
    const ds = buildBookDirectives(
      [
        base({ ticker: "A", rawTicker: "A", weight: 0.3, targetWeight: 0.5, suggestion: "Add" }),
        base({ ticker: "B", rawTicker: "B", weight: 0.4, targetWeight: 0.2, suggestion: "Add" }),
        base({ ticker: "C", rawTicker: "C", weight: 0.3, targetWeight: 0.3, suggestion: "Hold" }),
      ],
      10_000,
    );
    const sorted = sortDirectives(ds);
    expect(sorted[0].action).toBe("REVIEW"); // B: optimizer trim vs verdict add
    const s = summarizeBook(ds);
    expect(s.reviews).toBe(1);
    expect(s.adds).toBe(1);
    expect(s.holds).toBe(1);
    expect(s.largestMove?.ticker).toBe("A");
    expect(s.headline).toContain("review");
  });
});

describe("aggregateBookNews", () => {
  it("returns null when nothing is covered", () => {
    expect(aggregateBookNews([base({})])).toBeNull();
  });

  it("weight-averages pressure over covered positions and ranks headlines by book impact", () => {
    const rolled = aggregateBookNews([
      base({
        ticker: "A", weight: 0.6, totalPressure: 4, overallSentiment: 2,
        news: [{ headline: "Big beat", category: "Company", sentiment: 5, shortTermImpact: 6, confidence: 80 }],
      }),
      base({
        ticker: "B", weight: 0.2, totalPressure: -6, overallSentiment: -3,
        news: [{ headline: "Downgrade", category: "Sector", sentiment: -4, shortTermImpact: -8, confidence: 60 }],
      }),
      base({ ticker: "C", weight: 0.2 }), // uncovered
    ]);
    expect(rolled).not.toBeNull();
    // (0.6·4 + 0.2·(−6)) / 0.8 = 1.5
    expect(rolled!.weightedPressure).toBeCloseTo(1.5);
    expect(rolled!.coverageWeight).toBeCloseTo(0.8);
    expect(rolled!.itemCount).toBe(2);
    // |0.6×6| = 3.6 beats |0.2×−8| = 1.6
    expect(rolled!.top[0].headline).toBe("Big beat");
    expect(rolled!.perPosition[0].ticker).toBe("A");
  });
});
