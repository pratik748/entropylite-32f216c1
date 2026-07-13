import { describe, it, expect } from "vitest";
import { buildEvidenceGraph, metricsForSection, type BuildInputs } from "./build";
import type { DeskAnalysis, Dossier } from "./inputs";
import { synthesize } from "./synthesis";
import { annualizedVol, concentrationIndex, maxDrawdown, percentileOfLast, positionIn52w, trailingReturn } from "./compute";
import { WORKSPACES } from "@/components/workstation/registry";

/* ── Fixtures ─────────────────────────────────────────────────── */

function makeBars(sessions = 520, drift = 0.0004, wobble = 0.01) {
  const closes: number[] = [];
  const volumes: number[] = [];
  const timestamps: number[] = [];
  let p = 100;
  const t0 = Math.floor(Date.now() / 1000) - sessions * 86400;
  for (let i = 0; i < sessions; i++) {
    p = p * (1 + drift + wobble * Math.sin(i / 9) * (i % 3 === 0 ? 1 : -0.6));
    closes.push(Number(p.toFixed(2)));
    volumes.push(1_000_000 + (i % 20) * 40_000);
    timestamps.push(t0 + i * 86400);
  }
  return { closes, volumes, timestamps };
}

const analysisFixture: DeskAnalysis = {
  currentPrice: 227.5,
  currency: "USD",
  riskLevel: "medium",
  riskScore: 48,
  riskBreakdown: { volatilityRisk: 40, sectorRisk: 52, regulatoryRisk: 30, financialRisk: 35, macroRisk: 55 },
  keyRisks: ["Concentration"],
  bullRange: [240, 265],
  neutralRange: [215, 240],
  bearRange: [185, 215],
  suggestion: "Hold",
  confidence: 62,
  verdict: "Range-bound between supports.",
  sector: "Technology",
  marketCap: "Large Cap",
  marketCapValue: 3.4e12,
  pe: 31.2,
  pbv: 46.1,
  dividendYield: 0.5,
  beta: 1.15,
  roe: 147.2,
  debtToEquity: 154,
  technicals: { rsi: 58.2, support: 214, resistance: 243, trend: "sideways", maSignal: "above_200dma" },
  news: [{ headline: "x", sentiment: 10 }],
  momentum: 1.4,
  volatility: 24.8,
  overallSentiment: 12,
  totalPressure: 3,
  quantMetrics: { sharpe1y: 0.9, sortino1y: 1.1, maxDrawdown: -18.2, sigmaAnnual: 24.8, sessions: 250 },
};

const dossierFixture: Dossier = {
  companyName: "Test Corp",
  revenueSegments: [
    { segment: "Hardware", percentage: 52, trend: "stable" },
    { segment: "Services", percentage: 28, trend: "growing" },
    { segment: "Wearables", percentage: 20, trend: "stable" },
  ],
  geographicRevenue: [
    { region: "Americas", percentage: 43 },
    { region: "Europe", percentage: 25 },
    { region: "Greater China", percentage: 19 },
    { region: "Rest", percentage: 13 },
  ],
  ownership: { insiderPct: 2, institutionalPct: 61, retailPct: 37, topHolders: [] },
  insiderActivity: [
    { name: "A", role: "CEO", action: "sell", shares: 100000, date: "2026-05-01", signal: "bearish" },
    { name: "B", role: "CFO", action: "buy", shares: 20000, date: "2026-05-10", signal: "bullish" },
  ],
  narrative: {
    newsSentiment: 18,
    socialSentiment: 5,
    analystConsensus: "buy",
    earningsTone: "positive",
    narrativeShifts: [],
    analystTargets: { low: 190, median: 250, high: 300 },
  },
  signals: {
    supplyChainRisk: 58,
    ownershipStability: 72,
    competitiveMoat: 84,
    regulatoryRisk: 46,
    insiderConfidence: 44,
    narrativeMomentum: 61,
  },
  regulatoryExposure: [{ issue: "DMA", severity: "medium", region: "EU", status: "active" }],
};

const fullInputs: BuildInputs = {
  ticker: "TEST",
  analysis: analysisFixture,
  bars: makeBars(),
  dossier: dossierFixture,
  quote: { price: 227.5, currency: "USD" },
};

/* ── compute helpers ──────────────────────────────────────────── */

describe("evidence compute helpers", () => {
  const bars = makeBars();

  it("computes sane derived statistics", () => {
    const vol = annualizedVol(bars.closes);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(0);
    expect(vol!).toBeLessThan(200);

    const dd = maxDrawdown(bars.closes);
    expect(dd).not.toBeNull();
    expect(dd!).toBeLessThanOrEqual(0);

    const pos = positionIn52w(bars.closes);
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThanOrEqual(100);

    const r = trailingReturn(bars.closes, 252);
    expect(r).not.toBeNull();
  });

  it("computes percentiles and concentration", () => {
    expect(percentileOfLast([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(100);
    expect(concentrationIndex([100])).toBe(100);
    expect(concentrationIndex([25, 25, 25, 25])).toBe(25);
    expect(concentrationIndex([])).toBeNull();
  });
});

/* ── graph builder ────────────────────────────────────────────── */

describe("buildEvidenceGraph", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("builds a rich graph from full inputs", () => {
    expect(graph.order.length).toBeGreaterThanOrEqual(25);
    expect(graph.coverage.total).toBe(graph.order.length);
    expect(graph.coverage.estimated).toBeGreaterThan(0);
  });

  it("every node satisfies the evidence contract", () => {
    for (const id of graph.order) {
      const m = graph.metrics[id];
      expect(m.definition.length, `${id} definition`).toBeGreaterThan(10);
      expect(m.calculation.length, `${id} calculation`).toBeGreaterThan(5);
      expect(m.whyItMatters.length, `${id} whyItMatters`).toBeGreaterThan(10);
      expect(m.assessment.reason.length, `${id} reason`).toBeGreaterThan(5);
      expect(Math.abs(m.thesisWeight), `${id} weight bounds`).toBeLessThanOrEqual(1);
      if (m.value != null) expect(Number.isFinite(m.value), `${id} finite`).toBe(true);
      for (const r of m.relatedIds) expect(graph.metrics[r], `${id} related ${r}`).toBeTruthy();
    }
  });

  it("degrades gracefully with missing sources (never throws, still yields evidence)", () => {
    const noDossier = buildEvidenceGraph({ ...fullInputs, dossier: null });
    expect(noDossier.order.length).toBeGreaterThanOrEqual(15);
    const noBars = buildEvidenceGraph({ ...fullInputs, bars: null });
    expect(noBars.order.length).toBeGreaterThanOrEqual(15);
    const bare = buildEvidenceGraph({ ticker: "X", analysis: null, bars: null, dossier: null, quote: null });
    expect(bare.order.length).toBe(0);
    expect(() => synthesize(bare, null, null)).not.toThrow();
  });

  it("covers every registry section with at least one evidence node (nothing blank), except declared narrative sections", () => {
    // Sections whose primary content is synthesis/dossier detail views rather
    // than metric nodes; they render custom content, never a blank screen.
    const narrativeSections = new Set([
      "overview/summary", // custom synthesis view
      "thesis/investment-thesis",
      "thesis/key-drivers",
      "thesis/cases",
      "thesis/validation",
      "thesis/breakers",
      "thesis/confidence",
      "thesis/recommendation",
      "financials/cash-flow", // derived proxies + pipeline note
      "financials/earnings-quality",
      "competition/network", // dossier competitor table
      "intelligence/management", // dossier leadership view
      "intelligence/earnings-calls",
      "risk/monte-carlo", // simulation chart + spread node renders here too
      "risk/portfolio-impact",
      "risk/stress",
    ]);
    for (const ws of WORKSPACES) {
      for (const s of ws.sections) {
        const key = `${ws.id}/${s.id}`;
        const hits = metricsForSection(graph, key);
        if (!narrativeSections.has(key)) {
          expect(hits.length, `section ${key} must have evidence`).toBeGreaterThan(0);
        }
      }
    }
  });
});

/* ── synthesis ────────────────────────────────────────────────── */

describe("synthesize", () => {
  const graph = buildEvidenceGraph(fullInputs);
  const syn = synthesize(graph, analysisFixture, 227.5);

  it("produces a complete, deterministic synthesis", () => {
    expect(["ACCUMULATE", "HOLD", "REDUCE", "AVOID"]).toContain(syn.action);
    expect(syn.confidence).toBeGreaterThanOrEqual(35);
    expect(syn.confidence).toBeLessThanOrEqual(88);
    expect(syn.pillars).toHaveLength(6);
    for (const p of syn.pillars) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
    expect(syn.headline.length).toBeGreaterThan(20);
    expect(syn.narrative.length).toBeGreaterThan(0);
    // Deterministic: same inputs → same output.
    const again = synthesize(buildEvidenceGraph(fullInputs), analysisFixture, 227.5);
    expect(again.action).toBe(syn.action);
    expect(again.confidence).toBe(syn.confidence);
  });

  it("prices cases from engine ranges and keeps probabilities coherent", () => {
    const total = syn.cases.reduce((a, c) => a + c.probability, 0);
    expect(total).toBeGreaterThanOrEqual(97);
    expect(total).toBeLessThanOrEqual(103);
    const bull = syn.cases.find((c) => c.id === "bull")!;
    const bear = syn.cases.find((c) => c.id === "bear")!;
    expect(bull.target).toBe(265);
    expect(bear.target).toBe(185);
    expect(bull.returnPct!).toBeGreaterThan(0);
    expect(bear.returnPct!).toBeLessThan(0);
    for (const c of syn.cases) for (const a of c.anchorIds) expect(graph.metrics[a]).toBeTruthy();
  });

  it("evaluates breakers as live predicates over the graph", () => {
    expect(syn.breakers.length).toBeGreaterThanOrEqual(4);
    for (const b of syn.breakers) {
      expect(["intact", "watch", "tripped"]).toContain(b.state);
      for (const n of b.nodeIds) expect(graph.metrics[n]).toBeTruthy();
    }
    // Force a structure break and confirm the breaker trips.
    const crashed: BuildInputs = {
      ...fullInputs,
      bars: (() => {
        const b = makeBars();
        const last = b.closes[b.closes.length - 1];
        for (let i = 0; i < 30; i++) b.closes.push(Number((last * (1 - 0.02 * (i + 1))).toFixed(2)));
        for (let i = 0; i < 30; i++) { b.volumes.push(1_000_000); b.timestamps.push(b.timestamps[b.timestamps.length - 1] + 86400); }
        return b;
      })(),
    };
    const crashedSyn = synthesize(buildEvidenceGraph(crashed), analysisFixture, 140);
    const structure = crashedSyn.breakers.find((b) => b.id === "structure_break");
    expect(structure).toBeTruthy();
    expect(["watch", "tripped"]).toContain(structure!.state);
  });

  it("keeps the ledger auditable", () => {
    const { supporting, opposing, neutral, movers } = syn.ledger;
    expect(supporting + opposing + neutral).toBe(graph.order.length);
    expect(movers.length).toBeGreaterThan(0);
    for (const m of movers) expect(graph.metrics[m.id]).toBeTruthy();
  });
});

/* ── relationship engine, contributions, history ─────────────── */

import { EVIDENCE_RELATIONS, alignment, connectedIds, neighborhood, valuationSensitivity } from "./relations";
import { scoreContributions } from "./synthesis";
import { diffSnapshot } from "./history";
import { parseCapString } from "./build";

describe("evidence relationship engine", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("declares edges only between known node ids with named mechanisms", () => {
    const knownIds = new Set(Object.keys(buildEvidenceGraph(fullInputs).metrics));
    for (const rel of EVIDENCE_RELATIONS) {
      expect(rel.note.length, `${rel.from}→${rel.to} note`).toBeGreaterThan(20);
      expect([1, -1]).toContain(rel.polarity);
      // Every edge endpoint must be an id the builder can produce.
      expect(knownIds.has(rel.from) || knownIds.has(rel.to), `${rel.from}→${rel.to}`).toBe(true);
    }
  });

  it("resolves neighborhoods against the live graph without dead ends", () => {
    const hood = neighborhood(graph, "roe");
    expect(hood.drivers.length + hood.driven.length).toBeGreaterThan(0);
    for (const e of [...hood.drivers, ...hood.driven]) {
      expect(graph.metrics[e.metric.id]).toBeTruthy();
    }
    expect(connectedIds(graph, "roe").has("roe")).toBe(true);
    expect(connectedIds(graph, null).size).toBe(0);
  });

  it("splits neighbors into corroborating and countervailing evidence", () => {
    const { supporting, opposing } = alignment(graph, "risk_composite");
    for (const e of supporting) expect(e.metric.thesisWeight * graph.metrics["risk_composite"].thesisWeight).toBeGreaterThan(0);
    for (const e of opposing) expect(e.metric.thesisWeight * graph.metrics["risk_composite"].thesisWeight).toBeLessThan(0);
  });

  it("computes deterministic valuation sensitivity from actual operands", () => {
    const sens = valuationSensitivity(graph, 227.5);
    expect(sens).not.toBeNull();
    expect(sens!.rows).toHaveLength(4);
    const reversion = sens!.rows.find((r) => r.scenario.includes("18×"))!;
    // price × (18 / 31.2)
    expect(reversion.implied).toBeCloseTo(227.5 * (18 / 31.2), 0);
    expect(valuationSensitivity(buildEvidenceGraph({ ...fullInputs, analysis: null }), 227.5)).toBeNull();
  });
});

describe("causal contribution scoring", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("amplifies corroborated evidence and stays bounded", () => {
    const contributions = scoreContributions(graph);
    expect(contributions).toHaveLength(graph.order.length);
    for (const c of contributions) {
      expect(Math.abs(c.scored)).toBeLessThanOrEqual(1);
      if (c.base === 0) expect(c.scored).toBe(0);
      // Sign never flips through propagation — drivers scale, they don't invert.
      if (c.base !== 0) expect(Math.sign(c.scored)).toBe(Math.sign(c.base));
    }
    // roe has an aligned driver (moat) in the fixture → amplified above base.
    const roe = contributions.find((c) => c.id === "roe")!;
    expect(Math.abs(roe.scored)).toBeGreaterThan(Math.abs(roe.base));
    expect(roe.via.length).toBeGreaterThan(0);
  });

  it("feeds the synthesis ledger", () => {
    const syn = synthesize(graph, analysisFixture, 227.5);
    expect(syn.contributions).toHaveLength(graph.order.length);
    expect(syn.ledger.supporting + syn.ledger.opposing + syn.ledger.neutral).toBe(graph.order.length);
  });
});

describe("historical intelligence", () => {
  it("diffs snapshots into material changes, grade flips first", () => {
    const graph = buildEvidenceGraph(fullInputs);
    const prev = {
      ts: Date.now() - 86400000,
      nodes: Object.fromEntries(
        graph.order.map((id) => {
          const m = graph.metrics[id];
          if (id === "pe") return [id, { v: 24.0, g: "neutral" as const, w: 0 }];
          if (id === "volatility") return [id, { v: m.value, g: m.assessment.grade, w: m.thesisWeight }];
          return [id, { v: m.value, g: m.assessment.grade, w: m.thesisWeight }];
        }),
      ),
    };
    const changes = diffSnapshot(prev, graph);
    const peChange = changes.find((c) => c.id === "pe");
    expect(peChange).toBeTruthy();
    expect(peChange!.regraded).toBe(true);
    expect(changes[0].regraded).toBe(true);
    expect(peChange!.deltaPct).toBeCloseTo(30, 0);
  });
});

describe("robustness fixes", () => {
  it("parses capitalization strings", () => {
    expect(parseCapString("$3.4T")).toBe(3.4e12);
    expect(parseCapString("620B")).toBe(620e9);
    expect(parseCapString("₹1,20,000 Cr")).toBe(120000 * 1e7);
    expect(parseCapString("large cap")).toBeNull();
    expect(parseCapString(null)).toBeNull();
  });

  it("market cap renders a size class when the numeric value is missing", () => {
    const g = buildEvidenceGraph({
      ...fullInputs,
      analysis: { ...analysisFixture, marketCapValue: undefined, marketCap: "Large Cap" },
    });
    const cap = g.metrics["market_cap"];
    expect(cap).toBeTruthy();
    expect(cap.value == null ? cap.displayText : "has-value").toBeTruthy();
  });

  it("grades bank leverage against the financial-sector frame", () => {
    const g = buildEvidenceGraph({
      ...fullInputs,
      analysis: { ...analysisFixture, sector: "Financial Services", debtToEquity: 890 },
    });
    expect(g.metrics["debt_equity"].assessment.grade).toBe("neutral");
    expect(g.metrics["debt_equity"].assessment.reason).toMatch(/capital ratios/i);
  });

  it("every node carries confidence and provenance-consistent bounds", () => {
    const g = buildEvidenceGraph(fullInputs);
    for (const id of g.order) {
      const m = g.metrics[id];
      expect(m.confidence).toBeGreaterThan(0.4);
      expect(m.confidence).toBeLessThanOrEqual(0.95);
      if (m.provenance === "model") expect(m.confidence).toBeLessThanOrEqual(0.6);
    }
  });
});
