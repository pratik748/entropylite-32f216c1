import { describe, it, expect } from "vitest";
import {
  parseRiskReward,
  formatRiskReward,
  normalizeRiskRewardText,
  riskRewardFromLevels,
  RR_ENTRY_BAR,
} from "./riskReward";

describe("parseRiskReward", () => {
  it("parses plain numbers and numeric strings", () => {
    expect(parseRiskReward(2.5)).toBe(2.5);
    expect(parseRiskReward("2.5")).toBe(2.5);
  });

  it("parses multiplier and R notation", () => {
    expect(parseRiskReward("2.5x")).toBe(2.5);
    expect(parseRiskReward("3R")).toBe(3);
  });

  it("reads risk-first pairs (AI engine format)", () => {
    expect(parseRiskReward("1:2.5")).toBe(2.5);
    expect(parseRiskReward("1:1.5")).toBe(1.5);
  });

  it("reads reward-first pairs (evidence engine format)", () => {
    expect(parseRiskReward("2.5:1")).toBe(2.5);
    expect(parseRiskReward("1.5:1")).toBe(1.5);
  });

  it("reads non-unit pairs as risk:reward", () => {
    expect(parseRiskReward("2:5")).toBe(2.5);
  });

  it("returns null for missing or degenerate input — no fabricated default", () => {
    expect(parseRiskReward(null)).toBeNull();
    expect(parseRiskReward(undefined)).toBeNull();
    expect(parseRiskReward("")).toBeNull();
    expect(parseRiskReward("—")).toBeNull();
    expect(parseRiskReward(0)).toBeNull();
    expect(parseRiskReward(-1.2)).toBeNull();
    expect(parseRiskReward("0:1")).toBeNull();
    expect(parseRiskReward("garbage")).toBeNull();
    expect(parseRiskReward(NaN)).toBeNull();
  });
});

describe("formatRiskReward", () => {
  it("formats canonically as reward:1", () => {
    expect(formatRiskReward(2.5)).toBe("2.5:1");
    expect(formatRiskReward(1.5)).toBe("1.5:1");
    expect(formatRiskReward(2.5178, 2)).toBe("2.52:1");
  });

  it("renders an em dash for null/degenerate", () => {
    expect(formatRiskReward(null)).toBe("—");
    expect(formatRiskReward(undefined)).toBe("—");
    expect(formatRiskReward(0)).toBe("—");
  });
});

describe("normalizeRiskRewardText", () => {
  it("gives every upstream convention the same reading direction", () => {
    // The disagreement this module exists to end: all of these are the SAME trade.
    expect(normalizeRiskRewardText("1:2.5")).toBe("2.5:1");
    expect(normalizeRiskRewardText("2.5:1")).toBe("2.5:1");
    expect(normalizeRiskRewardText("2.5x")).toBe("2.5:1");
    expect(normalizeRiskRewardText(2.5)).toBe("2.5:1");
  });
});

describe("riskRewardFromLevels", () => {
  it("computes long structures", () => {
    expect(riskRewardFromLevels({ entry: 100, target: 125, stop: 90 })).toBe(2.5);
  });

  it("computes short structures", () => {
    expect(riskRewardFromLevels({ entry: 100, target: 80, stop: 110 })).toBe(2);
  });

  it("rejects degenerate structures instead of taking absolute values", () => {
    expect(riskRewardFromLevels({ entry: 100, target: 90, stop: 80 })).toBeNull();
    expect(riskRewardFromLevels({ entry: 100, target: 125, stop: 100 })).toBeNull();
    expect(riskRewardFromLevels({ entry: 0, target: 125, stop: 90 })).toBeNull();
  });
});

describe("RR_ENTRY_BAR", () => {
  it("matches the evidence engine's 1.5:1 entry discipline", () => {
    expect(RR_ENTRY_BAR).toBe(1.5);
  });
});
