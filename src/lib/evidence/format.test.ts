import { describe, it, expect } from "vitest";
import { formatMetricValue } from "./format";
import type { EvidenceMetric } from "./types";

const m = (over: Partial<EvidenceMetric>): EvidenceMetric => ({
  id: "x", label: "X", value: null, format: "number", provenance: "computed",
  source: "engine", definition: "", calculation: "", whyItMatters: "", grade: "neutral",
  importance: 0, pillar: "momentum", sections: [], relatedIds: [],
  ...over,
} as EvidenceMetric);

describe("formatMetricValue · risk/reward", () => {
  it("renders the rr format reward-first as X:1 — not 2.5× or a bare number", () => {
    // The exact bug: the reward-to-risk node used to render '2.5×' here and
    // '2.50' on the desk while the workstation text said '2.5:1'. One node,
    // three renderings, and a label that read risk-first. Now it is one form.
    expect(formatMetricValue(m({ value: 2.5, format: "rr" }), "USD")).toBe("2.5:1");
    expect(formatMetricValue(m({ value: 1.5, format: "rr" }), "USD")).toBe("1.5:1");
  });

  it("still renders a genuine ratio with the × suffix", () => {
    expect(formatMetricValue(m({ value: 1.4, format: "ratio" }), "USD")).toBe("1.4×");
  });

  it("degenerate rr shows an em dash, never a fabricated ratio", () => {
    expect(formatMetricValue(m({ value: null, format: "rr" }), "USD")).toBe("—");
    expect(formatMetricValue(m({ value: 0, format: "rr" }), "USD")).toBe("—");
  });
});
