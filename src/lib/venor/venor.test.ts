import { describe, it, expect } from "vitest";
import { calculateAlmgrenChriss, calculateKylesLambda, calculateRollEffectiveSpread, calculateAmihudIlliquidity } from "@/lib/quant/microstructure";
import { dynamicKalmanHedgeRatio, exactOUMLE } from "@/lib/quant/kalman";
import { calculateSpectralEntropy, calculateContinuousShannonEntropy, calculateTsallisEntropy, calculateTransferEntropyMatrix } from "@/lib/quant/entropy";
import { analyzeCausalShock } from "@/lib/quant/macro-shock";
import { TruthWeightedRealityDatabase } from "./twrd";
import { CrucibleEngine } from "./crucible";
import { VenorReasoningOrchestrator } from "./orchestrator";
import { VenorAlphaScanner, CandidateAssetData } from "./scanner";

describe("Phase 1: Market Microstructure & Optimal Execution", () => {
  it("computes Almgren-Chriss optimal liquidation trajectory satisfying boundary conditions", () => {
    const trajectory = calculateAlmgrenChriss({
      totalShares: 10000,
      horizonPeriods: 1.0,
      intervals: 10,
      dailyVolatility: 0.02,
      initialPrice: 100,
      permanentImpactGamma: 1e-6,
      temporaryImpactEta: 1e-5,
      riskAversionLambda: 1e-4,
    });

    expect(trajectory.holdingsRemaining.length).toBe(11);
    expect(trajectory.holdingsRemaining[0]).toBeCloseTo(10000, 0);
    expect(trajectory.holdingsRemaining[10]).toBeCloseTo(0, 0);
    expect(trajectory.tradeSizes.reduce((a, b) => a + b, 0)).toBeCloseTo(10000, 0);
    expect(trajectory.expectedCost).toBeGreaterThan(0);
    expect(trajectory.varianceOfCost).toBeGreaterThan(0);
    expect(trajectory.halfLifePeriods).toBeGreaterThan(0);
  });

  it("calculates Kyle's Lambda price impact correctly", () => {
    const dP = [0.1, -0.05, 0.2, -0.15, 0.3, -0.2, 0.25, -0.1, 0.15, -0.05];
    const Q = [1000, -500, 2000, -1500, 3000, -2000, 2500, -1000, 1500, -500];

    const kyle = calculateKylesLambda(dP, Q);
    expect(kyle).not.toBeNull();
    expect(kyle!.lambda).toBeGreaterThan(0);
    expect(kyle!.rSquared).toBeGreaterThan(0.9);
    expect(kyle!.marketDepthUnits).toBeGreaterThan(0);
  });

  it("estimates Roll's effective spread when autocovariance is negative", () => {
    const priceChanges = [0.5, -0.5, 0.4, -0.4, 0.6, -0.6, 0.5, -0.5, 0.4, -0.4];
    const roll = calculateRollEffectiveSpread(priceChanges);
    expect(roll.isValidCovariance).toBe(true);
    expect(roll.effectiveSpread).toBeGreaterThan(0);
  });

  it("calculates Amihud illiquidity ratio", () => {
    const returns = [0.01, -0.02, 0.015, -0.005, 0.03, -0.01];
    const dollarVolumes = [1e6, 2e6, 1.5e6, 8e5, 3e6, 1.2e6];
    const amihud = calculateAmihudIlliquidity(returns, dollarVolumes);
    expect(amihud).not.toBeNull();
    expect(amihud!.amihudRatio).toBeGreaterThan(0);
    expect(amihud!.illiquidityScore).toBeGreaterThanOrEqual(0);
    expect(amihud!.illiquidityScore).toBeLessThanOrEqual(100);
  });
});

describe("Phase 2: Kalman Dynamic Filter & Exact Continuous-Time OU MLE", () => {
  it("tracks dynamic hedge ratio using 2D state-space Kalman Filter", () => {
    const x = [100, 101, 102, 101, 103, 104, 102, 105, 106, 104, 107, 108];
    const y = x.map((v, i) => 2.0 * v + 5.0 + (i % 2 === 0 ? 0.2 : -0.2));

    const state = dynamicKalmanHedgeRatio(y, x);
    expect(state).not.toBeNull();
    expect(state!.beta.length).toBe(x.length);
    expect(state!.finalBeta).toBeCloseTo(2.0, 0);
    expect(state!.finalZScore).toBeDefined();
  });

  it("estimates exact continuous-time Ornstein-Uhlenbeck parameters via MLE without discretization bias", () => {
    // Generate a mean-reverting series around mean 50 with speed theta = 2.0
    const series = [50];
    const theta = 2.0;
    const mu = 50.0;
    const sigma = 2.0;
    const dt = 1 / 252;

    for (let i = 0; i < 250; i++) {
      const prev = series[i];
      const next = prev + theta * (mu - prev) * dt + sigma * Math.sqrt(dt) * (Math.sin(i * 0.5));
      series.push(next);
    }

    const mle = exactOUMLE(series, dt);
    expect(mle).not.toBeNull();
    expect(mle!.isStationary).toBe(true);
    expect(mle!.mu).toBeCloseTo(50, 0);
    expect(mle!.theta).toBeGreaterThan(0);
    expect(mle!.halfLife).toBeGreaterThan(0);
    expect(mle!.halfLifeCI95[0]).toBeLessThanOrEqual(mle!.halfLifeCI95[1]);
  });
});

describe("Phase 3: Thermodynamic & Spectral Entropic Network Engine", () => {
  it("computes Von Neumann Spectral Entropy on RMT-filtered density matrix", () => {
    const seriesA = Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.1) * 0.02);
    const seriesB = Array.from({ length: 60 }, (_, i) => Math.cos(i * 0.1) * 0.02);
    const seriesC = Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.3) * 0.015);

    const spectral = calculateSpectralEntropy([seriesA, seriesB, seriesC]);
    expect(spectral).not.toBeNull();
    expect(spectral!.vonNeumannEntropy).toBeGreaterThan(0);
    expect(spectral!.diversificationRatio).toBeGreaterThanOrEqual(0);
    expect(spectral!.diversificationRatio).toBeLessThanOrEqual(1);
    expect(spectral!.spectralGap).toBeDefined();
    expect(spectral!.fragilityRegime).toBeDefined();
  });

  it("computes continuous Shannon entropy via KDE", () => {
    const series = Array.from({ length: 100 }, (_, i) => (Math.sin(i) * 0.02));
    const shannon = calculateContinuousShannonEntropy(series);
    expect(shannon).not.toBeNull();
    expect(shannon!.entropy).toBeDefined();
    expect(shannon!.bandwidth).toBeGreaterThan(0);
  });

  it("computes Tsallis q-entropy for fat-tailed distributions", () => {
    const probs = [0.7, 0.15, 0.1, 0.05];
    const tsallis = calculateTsallisEntropy(probs, 1.5);
    expect(tsallis).toBeGreaterThan(0);
  });

  it("evaluates directional Transfer Entropy causal propagation across assets", () => {
    // Driver series X, Follower series Y (lagged by 1)
    const seriesX = Array.from({ length: 80 }, (_, i) => (i % 4 === 0 ? 0.05 : -0.02));
    const seriesY = [0, ...seriesX.slice(0, 79)];

    const te = calculateTransferEntropyMatrix([seriesX, seriesY], 4);
    expect(te).not.toBeNull();
    expect(te!.matrix.length).toBe(2);
    expect(te!.netSourceScores.length).toBe(2);
    expect(te!.dominantDrivers).toBeDefined();
  });
});

describe("Phase 4 & 5: VENOR Architecture (TWRD -> Crucible -> Reasoning -> Gold Decision)", () => {
  it("executes the full VENOR pipeline and produces a verified, explainable Gold Decision", () => {
    // 1. TWRD Ingestion
    const twrd = new TruthWeightedRealityDatabase();
    const fact1 = twrd.ingest({
      id: "FACT-001",
      source: "market_data",
      timestamp: Date.now(),
      publisherOrFeed: "institutional_nyse_l3",
      rawConfidence: 0.95,
      payload: { targetAssetIndex: 0, expectedReturn: 0.12 },
    });
    const fact2 = twrd.ingest({
      id: "FACT-002",
      source: "financial_filings",
      timestamp: Date.now(),
      publisherOrFeed: "sec_edgar_10k",
      rawConfidence: 0.90,
      payload: { targetAssetIndex: 0, expectedReturn: 0.08 },
    });

    expect(fact1.provenance.verified).toBe(true);
    expect(fact1.provenance.verificationHash).toMatch(/^0x[0-9a-f]{8}$/);

    // 2. Crucible Synthesis
    const crucible = new CrucibleEngine();
    const seriesA = Array.from({ length: 60 }, (_, i) => Math.sin(i * 0.1) * 0.02);
    const seriesB = Array.from({ length: 60 }, (_, i) => Math.cos(i * 0.1) * 0.02);
    const worldState = crucible.synthesizeWorldState({
      assetTickers: ["NVDA", "MSFT"],
      returnSeries: [seriesA, seriesB],
      truthWeightedFacts: [fact1, fact2],
    });

    expect(worldState.activeRegime.name).toBeDefined();
    expect(worldState.spectralState.vonNeumannEntropy).toBeGreaterThan(0);
    expect(worldState.tailRiskState.cvar99).toBeGreaterThan(0);

    // 3. VENOR Orchestrated Reasoning
    const orchestrator = new VenorReasoningOrchestrator();
    const goldDecision = orchestrator.execute({
      assetTickers: ["NVDA", "MSFT"],
      worldState,
      facts: [fact1, fact2],
      targetSharesToTrade: 500,
    });

    expect(goldDecision.decisionId).toMatch(/^VENOR-GOLD-/);
    expect(goldDecision.confidenceScore).toBeGreaterThanOrEqual(10);
    expect(goldDecision.confidenceScore).toBeLessThanOrEqual(99);
    expect(goldDecision.actionableTarget.recommendedPosition).toBeDefined();
    expect(goldDecision.expectedOutcome.worstCaseLossBound99Pct).toBeGreaterThan(0);
    expect(goldDecision.executionPlan.method).toBe("ALMGREN_CHRISS_OPTIMAL");

    // 4. Zero-Download Deterministic Explanation Check
    expect(goldDecision.humanExplanation.executiveSummary.length).toBeGreaterThan(20);
    expect(goldDecision.humanExplanation.mathematicalRationale).toContain("Von Neumann entropy");
    expect(goldDecision.humanExplanation.mathematicalRationale).toContain("Almgren-Chriss");
    expect(goldDecision.humanExplanation.actionableDirectives.length).toBeGreaterThanOrEqual(3);

    // 5. Closed-loop Feedback Test
    twrd.updateFeedback("market_data", 0.99);
    expect(twrd.getSourceReliabilities()["market_data"]).toBeGreaterThan(0.95);
  });
});

describe("Phase 6: Deterministic Geopolitical & Macro Shock Causal Propagation", () => {
  it("computes multi-order causal propagation for Middle East energy conflict without LLM calls", () => {
    const shock = analyzeCausalShock("Iran-Israel military escalation");
    expect(shock.source).toBe("INSTITUTIONAL_QUANT_CORE");
    expect(shock.first_order.length).toBeGreaterThanOrEqual(3);
    expect(shock.second_order.length).toBeGreaterThanOrEqual(2);
    expect(shock.third_order.length).toBeGreaterThanOrEqual(2);
    expect(shock.scar_tag).toContain("Energy Shock");

    // Verify scenario tree probability sums to 1.0 (100%)
    const totalProb = shock.scenario_tree.reduce((acc, s) => acc + s.probability, 0);
    expect(totalProb).toBeCloseTo(1.0, 5);

    // Verify commodity channel impact exists
    const crudeImpact = shock.first_order.find(n => n.asset_class === "commodities" && n.direction === "up");
    expect(crudeImpact).toBeDefined();
    expect(crudeImpact!.confidence).toBeGreaterThan(0.85);
  });

  it("evaluates semiconductor chokepoints and tech supply chain disruptions", () => {
    const shock = analyzeCausalShock("China Taiwan strait blockade");
    expect(shock.reflexivity_score).toBeGreaterThanOrEqual(80);
    expect(shock.first_order.some(n => n.asset_class === "equities" && n.direction === "down")).toBe(true);
    expect(shock.scenario_tree.length).toBe(4);
  });

  it("handles arbitrary macroeconomic queries with structural impulse fallbacks", () => {
    const shock = analyzeCausalShock("Unprecedented global cyberattack on clearing houses");
    expect(shock.source).toBe("INSTITUTIONAL_QUANT_CORE");
    expect(shock.first_order.length).toBeGreaterThan(0);
    expect(shock.scenario_tree.reduce((acc, s) => acc + s.probability, 0)).toBeCloseTo(1.0, 5);
  });
});

describe("Phase 7: VENOR Multi-Asset Alpha Scanner & Convexity Engine", () => {
  it("scans an asset universe and detects statistical arbitrage, lead-lag information flows, and tail convexity", () => {
    const T = 80;
    // Construct synthetic assets with cointegration dislocation
    const pricesNVDA = [100];
    const pricesMSFT = [300];
    const returnsNVDA = [0];
    const returnsMSFT = [0];

    for (let t = 1; t < T; t++) {
      const pN = pricesNVDA[t - 1] + (Math.sin(t * 0.2) * 1.5) + (t === T - 1 ? -12 : 0.2); // Sudden dislocation on last bar
      const pM = pricesMSFT[t - 1] + (Math.sin(t * 0.2) * 4.5);
      pricesNVDA.push(pN);
      pricesMSFT.push(pM);
      returnsNVDA.push((pN - pricesNVDA[t - 1]) / pricesNVDA[t - 1]);
      returnsMSFT.push((pM - pricesMSFT[t - 1]) / pricesMSFT[t - 1]);
    }

    const testAssets: CandidateAssetData[] = [
      { ticker: "NVDA", prices: pricesNVDA, returns: returnsNVDA },
      { ticker: "MSFT", prices: pricesMSFT, returns: returnsMSFT },
      {
        ticker: "AAPL",
        prices: Array.from({ length: T }, (_, i) => 150 + Math.cos(i * 0.1) * 5),
        returns: Array.from({ length: T }, (_, i) => Math.sin(i * 0.1) * 0.01),
      },
    ];

    const scanner = new VenorAlphaScanner();
    const result = scanner.scanUniverse(testAssets);

    expect(result.assetsScannedCount).toBe(3);
    expect(result.pairsEvaluatedCount).toBe(3);
    expect(result.marketWideSpectralState.vonNeumannEntropy).toBeGreaterThan(0);
    expect(result.scanDurationMs).toBeLessThan(100); // Super fast execution
  });
});


