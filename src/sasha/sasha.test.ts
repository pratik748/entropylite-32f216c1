/**
 * SASHA (Structural Analysis & Synthesis Heuristic Agent) Tests
 *
 * Validates:
 *  1. Sub-100ms Heuristic Intent Routing (< 5ms deterministic resolution).
 *  2. Subset Portfolio Risk Engine (Ledoit–Wolf Covariance, Euler Risk Shares, CVaR95 Expected Shortfall, CLANK Constraints).
 *  3. Stock Comparison & Pairs Trading Engine (Correlation r, Beta, Engle-Granger Cointegration, OU Half-Life, Stat-Arb Verdict).
 *  4. Scenario Stress Testing Engine (Beta propagation, P&L drawdown, worst-hit absorption, recommended hedges).
 *  5. News & Macro Headwinds Ingestion Engine (1st/2nd order causal transmission, institutional veracity).
 *  6. Spoken Punchline Formatting (1-2 crisp, high-signal sentences with zero hallucination).
 *  7. Financial Phonetic Pronunciation Engine (NVDA -> NVIDIA, AAPL -> Apple, VaR -> V-A-R, bps -> basis points, etc.).
 */

import { describe, it, expect } from "vitest";
import { routeSashaIntent, matchSectorFromText, resolveSymbolCandidate } from "./intentRouter";
import {
  executeSubsetRisk,
  executeStockComparison,
  executeStressTest,
  executeNewsImpact,
  getAssetSector,
} from "./quantEngine";
import { toInstitutionalPhonetics } from "./sashaPhonetics";
import type { PortfolioPosition } from "@/foresight/types";

describe("SASHA Sub-100ms Heuristic Intent Router", () => {
  it("routes stock comparison queries instantly", () => {
    const t0 = performance.now();
    const intent1 = routeSashaIntent("Compare NVDA vs AMD");
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(10); // Under 10ms
    expect(intent1.type).toBe("stock_comparison");
    if (intent1.type === "stock_comparison") {
      expect(intent1.tickerA).toBe("NVDA");
      expect(intent1.tickerB).toBe("AMD");
    }

    const intent2 = routeSashaIntent("Compare Reliance and HDFC");
    expect(intent2.type).toBe("stock_comparison");
    if (intent2.type === "stock_comparison") {
      expect(intent2.tickerA).toBe("RELIANCE.NS");
      expect(intent2.tickerB).toBe("HDFCBANK.NS");
    }

    const intent3 = routeSashaIntent("Pairs trade GOOG vs META");
    expect(intent3.type).toBe("stock_comparison");
  });

  it("routes subset portfolio risk queries with sector recognition", () => {
    const intent1 = routeSashaIntent("Analyze my banking subset");
    expect(intent1.type).toBe("subset_risk");
    if (intent1.type === "subset_risk") {
      expect(intent1.subsetFilter.sector).toBe("banking");
    }

    const intent2 = routeSashaIntent("Stress test my high-beta positions");
    expect(intent2.type).toBe("subset_risk");
    if (intent2.type === "subset_risk") {
      expect(intent2.subsetFilter.betaThreshold).toBe("high");
    }

    const intent3 = routeSashaIntent("Analyze tech stocks risk");
    expect(intent3.type).toBe("subset_risk");
    if (intent3.type === "subset_risk") {
      expect(intent3.subsetFilter.sector).toBe("tech");
    }
  });

  it("routes arbitrary scenario stress tests with parameter extraction", () => {
    const intent1 = routeSashaIntent("What happens if oil spikes 15% and Nifty drops 2%?");
    expect(intent1.type).toBe("stress_test");
    if (intent1.type === "stress_test") {
      expect(intent1.commodityShockPct?.commodity).toBe("Brent Crude Oil");
      expect(intent1.commodityShockPct?.shockPct).toBe(15);
      expect(intent1.marketShockPct).toBe(-2);
    }

    const intent2 = routeSashaIntent("Stress test +20% VIX spike");
    expect(intent2.type).toBe("stress_test");
    if (intent2.type === "stress_test") {
      expect(intent2.vixShockPct).toBe(20);
    }

    const intent3 = routeSashaIntent("what happens in a oil shock ?");
    expect(intent3.type).toBe("stress_test");
    if (intent3.type === "stress_test") {
      expect(intent3.commodityShockPct?.commodity).toBe("Brent Crude Oil");
      expect(intent3.commodityShockPct?.shockPct).toBe(15);
      expect(intent3.marketShockPct).toBe(-2.5);
    }
  });

  it("routes news & macro ingestion queries", () => {
    const intent1 = routeSashaIntent("What's moving energy?");
    expect(intent1.type).toBe("news_impact");
    if (intent1.type === "news_impact") {
      expect(intent1.topicOrSector).toBe("energy");
    }

    const intent2 = routeSashaIntent("Summarize geopolitical headwinds");
    expect(intent2.type).toBe("news_impact");
  });
});

describe("SASHA Financial Phonetic Pronunciation Engine", () => {
  it("translates financial tickers to natural spoken names", () => {
    expect(toInstitutionalPhonetics("NVDA")).toBe("NVIDIA");
    expect(toInstitutionalPhonetics("AAPL")).toBe("Apple");
    expect(toInstitutionalPhonetics("MSFT")).toBe("Microsoft");
    expect(toInstitutionalPhonetics("JPM")).toBe("J-P Morgan");
    expect(toInstitutionalPhonetics("XOM")).toBe("ExxonMobil");
    expect(toInstitutionalPhonetics("RELIANCE.NS")).toBe("Reliance");
    expect(toInstitutionalPhonetics("HDFCBANK.NS")).toBe("H-D-F-C Bank");
  });

  it("translates financial and mathematical jargon to institutional phonetic text", () => {
    const raw = "Technology represents 58% of your book with 24.8% σ. NVDA 1d CVaR95 is -3.4% with a 50 bps spread.";
    const spoken = toInstitutionalPhonetics(raw);

    expect(spoken).toContain("NVIDIA");
    expect(spoken).toContain("sigma");
    expect(spoken).toContain("one day");
    expect(spoken).toContain("C-V-A-R ninety-five");
    expect(spoken).toContain("50 basis points");
    expect(spoken).toContain("minus 3.4 percent");
  });
});

describe("SASHA Quantitative Execution Engines", () => {
  const samplePositions: PortfolioPosition[] = [
    { id: "1", ticker: "NVDA", buyPrice: 100, quantity: 40, currentPrice: 125 },
    { id: "2", ticker: "AAPL", buyPrice: 180, quantity: 30, currentPrice: 220 },
    { id: "3", ticker: "MSFT", buyPrice: 380, quantity: 20, currentPrice: 410 },
    { id: "4", ticker: "JPM", buyPrice: 190, quantity: 25, currentPrice: 205 },
    { id: "5", ticker: "XOM", buyPrice: 110, quantity: 35, currentPrice: 118 },
  ];

  it("computes subset risk with Euler risk shares, Expected Shortfall, and receipts", async () => {
    const intent = routeSashaIntent("Analyze my tech subset");
    expect(intent.type).toBe("subset_risk");

    if (intent.type === "subset_risk") {
      const result = await executeSubsetRisk(intent, samplePositions);

      expect(result.cardType).toBe("subset_risk");
      expect(result.spokenPunchline).toBeDefined();
      expect(result.spokenPunchline.length).toBeGreaterThan(20);
      expect(result.phoneticSpokenText).toBeDefined();
      expect(result.receipts.length).toBeGreaterThan(0);

      // Spoken punchline format check: 1 to 2 crisp sentences
      const sentences = result.spokenPunchline.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      expect(sentences.length).toBeLessThanOrEqual(2);

      const data = result.cardData as any;
      expect(data.annualizedVolPct).toBeGreaterThan(0);
      expect(data.cvar95DailyPct).toBeGreaterThan(0);
      expect(data.eulerRiskShares).toHaveLength(data.tickers.length);
      expect(data.clankConstraints.length).toBeGreaterThan(0);

      // Sum of Euler risk shares should be approx 100%
      const totalEuler = data.eulerRiskShares.reduce((s: number, r: any) => s + r.eulerRiskSharePct, 0);
      expect(totalEuler).toBeGreaterThan(95);
      expect(totalEuler).toBeLessThan(105);

      // Spoken punchline must contain key numbers (zero hallucination)
      expect(result.spokenPunchline).toContain(data.annualizedVolPct.toString());
      expect(result.spokenPunchline).toContain(data.dominantRiskTicker);
    }
  });

  it("executes stock comparison with cointegration, beta regression, and stat-arb verdict", async () => {
    const intent = routeSashaIntent("Compare NVDA vs AMD");
    expect(intent.type).toBe("stock_comparison");

    if (intent.type === "stock_comparison") {
      const result = await executeStockComparison(intent);

      expect(result.cardType).toBe("stock_comparison");
      expect(result.receipts.length).toBeGreaterThan(0);

      const data = result.cardData as any;
      expect(data.correlation).toBeDefined();
      expect(data.betaRegression.beta).toBeDefined();
      expect(data.betaRegression.rSquared).toBeGreaterThanOrEqual(0);
      expect(data.cointegration.adfStat).toBeDefined();
      expect(data.cointegration.halfLifeDays).toBeGreaterThan(0);
      expect(data.cointegration.spreadVerdict).toBeDefined();
      expect(data.spreadSparkline.length).toBeGreaterThan(0);

      // Punchline verification
      expect(result.spokenPunchline).toContain("NVDA");
      expect(result.spokenPunchline).toContain("AMD");
      expect(result.spokenPunchline).toContain(data.correlation.toString());
    }
  });

  it("executes scenario stress testing with worst-hit absorption, Causal DAG, and hedge recommendation", async () => {
    const intent = routeSashaIntent("What happens if oil spikes 15% and Nifty drops 2%?");
    expect(intent.type).toBe("stress_test");

    if (intent.type === "stress_test") {
      const result = await executeStressTest(intent, samplePositions);

      expect(result.cardType).toBe("stress_test");
      expect(result.receipts.length).toBeGreaterThan(0);

      const data = result.cardData as any;
      expect(data.portfolioDrawdownPct).toBeDefined();
      expect(data.estimatedLossBase).toBeGreaterThanOrEqual(0);
      expect(data.worstHitAssets.length).toBeGreaterThan(0);
      expect(data.resilienceGrade).toBeDefined();
      expect(data.recommendedHedge).toBeDefined();
      expect(data.recommendedHedge.structure).toBeDefined();

      // Causal Transmission DAG verification
      expect(data.dag).toBeDefined();
      expect(data.dag.nodes.length).toBeGreaterThan(0);
      expect(data.dag.edges.length).toBeGreaterThan(0);

      // Punchline verification
      expect(result.spokenPunchline).toContain("%");
      expect(result.spokenPunchline).toContain("draws down");
    }
  });

  it("handles qualitative macro shock query 'what happens in a oil shock ?'", async () => {
    const intent = routeSashaIntent("what happens in a oil shock ?");
    expect(intent.type).toBe("stress_test");

    if (intent.type === "stress_test") {
      const result = await executeStressTest(intent, samplePositions);
      expect(result.cardType).toBe("stress_test");
      const data = result.cardData as any;
      expect(data.portfolioDrawdownPct).toBeDefined();
      expect(data.dag.nodes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("executes news & causal impact extraction with institutional veracity scoring and DAG", async () => {
    const intent = routeSashaIntent("What's moving energy?");
    expect(intent.type).toBe("news_impact");

    if (intent.type === "news_impact") {
      const result = await executeNewsImpact(intent, samplePositions);

      expect(result.cardType).toBe("news_impact");
      expect(result.receipts.length).toBeGreaterThan(0);

      const data = result.cardData as any;
      expect(data.signalToNoiseScore).toBeGreaterThanOrEqual(70);
      expect(data.veracityScore).toBeGreaterThanOrEqual(70);
      expect(data.firstOrderMacro).toBeDefined();
      expect(data.secondOrderTransmission).toBeDefined();
      expect(data.articles.length).toBeGreaterThan(0);
      expect(data.dag).toBeDefined();
      expect(data.dag.nodes.length).toBeGreaterThan(0);
    }
  });
});
