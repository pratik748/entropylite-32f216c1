import { describe, it, expect } from "vitest";
import {
  evaluateAdmissionGate,
  computeTruthScore,
  jaccardSimilarity,
  deduplicateSybilClaims,
  updateSourceCredibility,
  DEFAULT_SOURCE_CREDIBILITY,
} from "./twrd";
import {
  garchForecast,
  classifyRegime,
  buildPolyhedralConstraints,
  computeFragilityIndex,
  runPolyhedralMonteCarlo,
  propagateAftermathCascade,
} from "./crucible";
import {
  fuseOrthogonalEvidence,
  runAdversarialAudit,
  computeCascadeVulnerability,
  calculateScarScore,
} from "./reasoning";
import { synthesizeGoldDecision } from "./goldDecision";
import { executeVenorPipeline } from "./index";
import type { ClaimRecord, OrthogonalSignal, CausalEdge } from "./types";

describe("VENOR Architecture: Stage 1 & 2 - TWRD & Physical Admission Gate", () => {
  it("rejects claims violating physical conservation boundaries", () => {
    const invalidPriceClaim: ClaimRecord = {
      id: "c1",
      entity: "AAPL",
      relation: "PRICE_TARGET",
      objectValue: 300,
      source: "unverified_blog",
      timestamp: Date.now(),
      piHatPrior: 0.8,
      admissionStatus: 1,
    };

    // Extreme jump ln(Pt/Pt-1) > 0.40
    const admission = evaluateAdmissionGate(invalidPriceClaim, {
      price: 150,
      prevClose: 80, // >60% jump in 1 day
      volume: 1000000,
    });

    expect(admission).toBe(0);
  });

  it("admits physically sound claims with valid market continuity", () => {
    const validClaim: ClaimRecord = {
      id: "c2",
      entity: "NVDA",
      relation: "GUIDANCE_REVENUE",
      objectValue: 38000000000,
      source: "sec_10q",
      timestamp: Date.now(),
      piHatPrior: 0.92,
      admissionStatus: 1,
      category: "FUNDAMENTAL",
    };

    const admission = evaluateAdmissionGate(validClaim, {
      price: 135,
      prevClose: 134.2,
      volume: 45000000,
    });

    expect(admission).toBe(1);
  });

  it("calculates Jaccard similarity and eliminates sybil echo chambers", () => {
    const s1 = "NVIDIA reports record quarterly revenue driven by data center demand";
    const s2 = "NVIDIA reports record quarterly revenue powered by data center demand";
    const s3 = "Crude oil tankers divert from Red Sea corridor amid geopolitical tensions";

    const sim12 = jaccardSimilarity(s1, s2);
    const sim13 = jaccardSimilarity(s1, s3);

    expect(sim12).toBeGreaterThan(0.75);
    expect(sim13).toBeLessThan(0.2);

    const sybilClaims: ClaimRecord[] = [
      { id: "s1", entity: "NVDA", relation: "REVENUE", objectValue: s1, source: "feed1", timestamp: 1, piHatPrior: 0.8, admissionStatus: 1 },
      { id: "s2", entity: "NVDA", relation: "REVENUE", objectValue: s2, source: "feed2", timestamp: 2, piHatPrior: 0.8, admissionStatus: 1 },
      { id: "s3", entity: "OIL", relation: "SHIPPING", objectValue: s3, source: "feed3", timestamp: 3, piHatPrior: 0.7, admissionStatus: 1 },
    ];

    const clusters = deduplicateSybilClaims(sybilClaims, 0.7);
    expect(clusters.length).toBe(2); // s1 and s2 clustered into 1
  });

  it("computes epistemic truth score T(x,t) and momentum μ(x,t)", () => {
    const claim: ClaimRecord = {
      id: "claim-alpha",
      entity: "TSM",
      relation: "CAPACITY_UTILIZATION",
      objectValue: 0.98,
      source: "bloomberg_terminal",
      timestamp: Date.now(),
      piHatPrior: 0.85,
      admissionStatus: 1,
      category: "FUNDAMENTAL",
    };

    const res = computeTruthScore(claim, 0.9, [], [], 0.65, 2);
    expect(res.score).toBeGreaterThan(0.5);
    expect(res.score).toBeLessThanOrEqual(1.0);
    expect(typeof res.epistemicMomentum).toBe("number");
  });

  it("updates source Beta-posterior credibility with decay parameter λ=0.98", () => {
    const updated = updateSourceCredibility(DEFAULT_SOURCE_CREDIBILITY, true, 0.98);
    expect(updated.alpha).toBeGreaterThan(DEFAULT_SOURCE_CREDIBILITY.alpha * 0.98);
    expect(updated.credibilityMean).toBeGreaterThan(0.5);
  });
});

describe("VENOR Architecture: Stage 3 & 4 - Crucible Polyhedral Simulation & Modeled Reality", () => {
  it("computes GARCH(1,1) conditional volatility step correctly", () => {
    const returns = [0.01, -0.015, 0.02, -0.005, 0.012, -0.018, 0.005];
    const vol = garchForecast(returns);
    expect(vol).toBeGreaterThan(0.005);
    expect(vol).toBeLessThan(0.1);
  });

  it("classifies volatility regimes via 3-State Gaussian HMM criteria", () => {
    const lowVolCloses = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
    const lowVol = classifyRegime(lowVolCloses, 14);
    expect(lowVol.regime).toBe("LOW_VOL_TREND");

    const highVolCloses = [100, 85, 110, 78, 105, 72, 108, 65, 95, 60, 92];
    const crisis = classifyRegime(highVolCloses, 35);
    expect(crisis.regime).toBe("HIGH_VOL_CRISIS");
  });

  it("constructs Polyhedral constraints and computes Fragility Index κ_K(s)", () => {
    const constraints = buildPolyhedralConstraints(150, 140, 165, 22);
    expect(constraints.length).toBeGreaterThanOrEqual(4);

    const fragility = computeFragilityIndex(constraints);
    expect(fragility).toBeGreaterThanOrEqual(0.0);
    expect(fragility).toBeLessThanOrEqual(1.0);
  });

  it("runs Polyhedral Monte Carlo, producing FSS, CVaR 95%, Omega, and Deflated Sharpe", () => {
    const constraints = buildPolyhedralConstraints(100, 92, 115, 20);
    const mc = runPolyhedralMonteCarlo(
      {
        currentPrice: 100,
        targetPrice: 115,
        stopLoss: 92,
        horizonDays: 21,
        annualizedVolPct: 20,
        driftAnnualPct: 10,
        numPaths: 1000,
        seed: 12345,
      },
      constraints
    );

    expect(mc.totalPaths).toBe(1000);
    expect(mc.polyhedralFeasiblePaths).toBeGreaterThan(800);
    expect(mc.fss).toBeGreaterThanOrEqual(0);
    expect(mc.fss).toBeLessThanOrEqual(1);
    expect(mc.expectedShortfall95).toBeGreaterThan(0);
    expect(mc.asymmetryOmega).toBeGreaterThan(0);
    expect(mc.deflatedSharpeRatio).toBeGreaterThanOrEqual(0);
  });

  it("propagates 2nd-order aftermath shock cascade through typed causal DAG", () => {
    const edges: CausalEdge[] = [
      { sourceTicker: "NVDA", targetTicker: "TSM", weight: 0.65, lagDays: 1, fdrSignificant: true, pValue: 0.001 },
      { sourceTicker: "TSM", targetTicker: "ASML", weight: 0.50, lagDays: 2, fdrSignificant: true, pValue: 0.004 },
      { sourceTicker: "NVDA", targetTicker: "MSFT", weight: 0.40, lagDays: 1, fdrSignificant: false, pValue: 0.15 },
    ];

    const cascade = propagateAftermathCascade("NVDA", -10, edges, 2, 0.75);
    expect(cascade["NVDA"]).toBe(-10);
    expect(cascade["TSM"]).toBeLessThan(0); // Transmitted shock
    expect(cascade["ASML"]).toBeLessThan(0); // 2nd order shock
    expect(cascade["MSFT"]).toBeUndefined(); // FDR non-significant edge skipped
  });
});

describe("VENOR Architecture: Stage 5 - Orchestrated Reasoning Core (Zero-LLM)", () => {
  it("combines 4-bucket orthogonal evidence with Kish Effective Sample Size N_eff", () => {
    const signals: OrthogonalSignal[] = [
      { bucket: "QUANT_STATARB", name: "Z-Score", directionalBias: 0.4, confidence: 0.8, evidenceWeight: 1.0 },
      { bucket: "QUANT_STATARB", name: "Momentum", directionalBias: 0.5, confidence: 0.7, evidenceWeight: 1.0 },
      { bucket: "FUNDAMENTAL", name: "EV Margin", directionalBias: 0.3, confidence: 0.85, evidenceWeight: 1.1 },
      { bucket: "MICROSTRUCTURE", name: "VPIN", directionalBias: 0.6, confidence: 0.75, evidenceWeight: 1.2 },
      { bucket: "MACRO_GEO", name: "Yield Curve", directionalBias: -0.2, confidence: 0.6, evidenceWeight: 0.9 },
    ];

    const kish = fuseOrthogonalEvidence(signals);
    expect(kish.rawSignalCount).toBe(5);
    expect(kish.kishEffectiveN).toBeGreaterThan(1.0);
    expect(kish.kishEffectiveN).toBeLessThanOrEqual(5.0);
    expect(kish.orthogonalConsensusBias).toBeGreaterThan(0.1);
  });

  it("runs Adversarial Audits with Benjamini-Hochberg FDR control at q=0.05", () => {
    const audit = runAdversarialAudit({
      ticker: "NVDA",
      consensusBias: 0.45,
      vix: 16.5,
      fragilityIndex: 0.3,
      gammaPinRisk: false,
      liquidityRatio: 1.1,
      candidatePValues: [0.005, 0.012, 0.025, 0.045],
    });

    expect(audit.passed).toBe(true);
    expect(audit.fdrControlPassed).toBe(true);
    expect(audit.testsFailed).toBe(0);
  });

  it("calculates Cascade Vulnerability Matrix CV(a) and extracts single load-bearing claim", () => {
    const claims: ClaimRecord[] = [
      { id: "c1", entity: "AMD", relation: "GPU_ALLOCATION", objectValue: "40%", source: "analyst", timestamp: 1, piHatPrior: 0.6, admissionStatus: 1, category: "ALTERNATIVE" },
      { id: "c2", entity: "AMD", relation: "REVENUE_GUIDANCE", objectValue: "$6.8B", source: "10Q", timestamp: 1, piHatPrior: 0.9, admissionStatus: 1, category: "FUNDAMENTAL" },
    ];

    const cv = computeCascadeVulnerability(
      claims,
      [
        { claimId: "c1", score: 0.55, epistemicMomentum: 0, agreementFactor: 0.5, sourceCredibility: 0.6, isLoadBearingCandidate: false },
        { claimId: "c2", score: 0.92, epistemicMomentum: 0, agreementFactor: 0.9, sourceCredibility: 0.9, isLoadBearingCandidate: true },
      ],
      0.35
    );

    expect(cv.loadBearingClaimId).toBeDefined();
    expect(cv.vulnerabilityScore).toBeGreaterThanOrEqual(0);
    expect(cv.preMortemInvalidationScenario).toContain("falsified");
  });

  it("computes consequence-weighted Scar Score Sc(m) for adaptive memory", () => {
    const scar = calculateScarScore(0.08, 1.2, 5);
    expect(scar).toBeGreaterThan(0);
  });
});

describe("VENOR Architecture: Stage 6 - Gold Decision & Master Pipeline", () => {
  it("synthesizes deterministic Gold Decision with Fractional-Kelly safety boundary", () => {
    const decision = executeVenorPipeline({
      ticker: "NVDA",
      currentPrice: 140,
      prevClose: 139,
      closes: [130, 133, 136, 138, 140],
      vix: 17,
      volume: 50000000,
      avgVolume: 42000000,
      support: 132,
      resistance: 155,
    });

    expect(decision.ticker).toBe("NVDA");
    expect(["STRONG_LONG", "ACCUMULATE", "NEUTRAL", "HEDGE", "EXIT"]).toContain(decision.action);
    expect(["UP", "DOWN", "SIDEWAYS"]).toContain(decision.direction);
    expect(decision.confidence).toBeGreaterThanOrEqual(30);
    expect(decision.confidence).toBeLessThanOrEqual(95);
    expect(decision.positionSizing.fractionalKelly).toBeLessThanOrEqual(0.25); // Hard institutional safety limit
    expect(decision.preMortemTriggers.length).toBeGreaterThanOrEqual(2);
    expect(decision.proofCard.proofId).toMatch(/^VENOR-[A-F0-9]{8}$/);
    expect(decision.proofCard.auditTrail.length).toBeGreaterThanOrEqual(5);
  });

  it("guarantees 100% deterministic reproducibility under identical inputs", () => {
    const p1 = executeVenorPipeline({ ticker: "AAPL", currentPrice: 220 });
    const p2 = executeVenorPipeline({ ticker: "AAPL", currentPrice: 220 });

    expect(p1.action).toBe(p2.action);
    expect(p1.confidence).toBe(p2.confidence);
    expect(p1.quantScore).toBe(p2.quantScore);
    expect(p1.targetPrice).toBe(p2.targetPrice);
    expect(p1.stopLoss).toBe(p2.stopLoss);
    expect(p1.futureSurvivalScore).toBe(p2.futureSurvivalScore);
    expect(p1.positionSizing.fractionalKelly).toBe(p2.positionSizing.fractionalKelly);
    expect(p1.proofCard.deterministicHash).toBe(p2.proofCard.deterministicHash);
  });
});
