import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { veracityGate, aggregateVeracity } from "../_shared/twrd/gate.ts";
import type { RawSignal } from "../_shared/twrd/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, vix, marketRegime } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const holdings = portfolio.map((s: any) => ({
      ticker: String(s.ticker || "").toUpperCase(),
      qty: Number(s.quantity || 0),
      buyPrice: Number(s.buyPrice || 0),
      currentPrice: Number(s.currentPrice || s.buyPrice || 0),
      risk: Number(s.riskScore || 40),
      beta: Number(s.beta || 1),
      sector: String(s.sector || "Unknown"),
      pe: Number(s.pe || 0),
      marketCap: String(s.marketCap || "Unknown"),
    })).filter((h: any) => h.qty > 0 && h.currentPrice > 0);

    const totalValue = holdings.reduce((sum: number, h: any) => sum + h.currentPrice * h.qty, 0);
    const weights = holdings.map((h: any) => totalValue > 0 ? (h.currentPrice * h.qty) / totalValue : 0);
    const avgBeta = holdings.reduce((sum: number, h: any, i: number) => sum + h.beta * weights[i], 0);
    const avgRisk = holdings.reduce((sum: number, h: any, i: number) => sum + h.risk * weights[i], 0);
    const topWeight = weights.length > 0 ? Math.max(...weights) : 0;
    const concentrationPenalty = 1 + topWeight * 0.9 + weights.reduce((sum: number, w: number) => sum + w * w, 0) * 0.8;
    const hhi = weights.reduce((sum: number, w: number) => sum + w * w, 0);

    const sectorWeights = new Map<string, number>();
    for (let i = 0; i < holdings.length; i++) {
      sectorWeights.set(holdings[i].sector, (sectorWeights.get(holdings[i].sector) || 0) + weights[i]);
    }
    const topSector = [...sectorWeights.entries()].sort((a, b) => b[1] - a[1])[0];

    let truthRisk = 0;
    let truthMeanT = 0.7;
    let truthFalseConsensus = false;
    try {
      const nowIso = new Date().toISOString();
      const sigs: RawSignal[] = holdings.map((p: any, i: number): RawSignal => ({
        id: `hold-${i}-${p.ticker}`,
        value: 1,
        claim: { subject: p.ticker, relation: "fundamentals_belief", object: p.sector || "Unknown" },
        domain: "financial",
        evidence: [{ source_id: "yahoo-finance", ts: nowIso }],
      }));
      const weighted = await veracityGate(sigs);
      const agg = aggregateVeracity(weighted);
      truthMeanT = agg.meanT;
      truthRisk = agg.truthRisk;
      truthFalseConsensus = agg.falseConsensus;
    } catch (e) {
      console.warn("TWRD risk gate skipped:", (e as Error).message);
    }

    const inferredVix = Number.isFinite(Number(vix)) && Number(vix) > 0
      ? Number(vix)
      : avgRisk < 35
        ? 14
        : avgRisk < 50
          ? 19
          : avgRisk < 70
            ? 25
            : 32;

    const regime = inferredVix < 15 ? "LOW" : inferredVix < 22 ? "NORMAL" : inferredVix < 32 ? "HIGH" : "CRISIS";
    const sigmaDaily = clamp((inferredVix / 100 / Math.sqrt(252)) * (0.65 + avgBeta * 0.45) * (0.7 + avgRisk / 100), 0.004, 0.09);
    const truthPenalty = 1 + Math.max(0, 0.6 - truthMeanT) * 0.9;

    const var95 = totalValue * sigmaDaily * 1.645 * concentrationPenalty * truthPenalty;
    const var99 = totalValue * sigmaDaily * 2.326 * concentrationPenalty * truthPenalty;
    const cvar95 = var95 * (1.24 + sigmaDaily * 4);
    const cvar99 = var99 * (1.18 + sigmaDaily * 3.2);
    const liquidityVar = var95 * (1.18 + topWeight * 0.9 + (regime === "CRISIS" ? 0.25 : regime === "HIGH" ? 0.12 : 0));

    const largeCapWeight = holdings.reduce((sum: number, h: any, i: number) => sum + (h.marketCap === "Large Cap" ? weights[i] : 0), 0);
    const avgPE = mean(holdings.filter((h: any) => h.pe > 0).map((h: any) => h.pe));
    const momentumProxy = mean(holdings.map((h: any) => ((h.currentPrice - h.buyPrice) / Math.max(h.buyPrice, 1))));
    const qualityProxy = clamp(1 - avgRisk / 100, 0, 1);

    const factorExposure = [
      { factor: "Market β", exposure: round(avgBeta, 2), contribution: Math.round(avgBeta * 28) },
      { factor: "Size (SMB)", exposure: round((1 - largeCapWeight) * 0.9 - 0.2, 2), contribution: Math.round(((1 - largeCapWeight) * 0.9 - 0.2) * 16) },
      { factor: "Value (HML)", exposure: round(avgPE > 0 ? (avgPE < 15 ? 0.45 : avgPE < 25 ? 0.1 : -0.35) : 0, 2), contribution: Math.round((avgPE > 0 ? (avgPE < 15 ? 0.45 : avgPE < 25 ? 0.1 : -0.35) : 0) * 14) },
      { factor: "Momentum", exposure: round(clamp(momentumProxy * 2.2, -0.7, 0.7), 2), contribution: Math.round(clamp(momentumProxy * 2.2, -0.7, 0.7) * 15) },
      { factor: "Quality", exposure: round(qualityProxy * 0.8 - 0.1, 2), contribution: Math.round((qualityProxy * 0.8 - 0.1) * 12) },
      { factor: "Low Vol", exposure: round(annualizedFromDaily(sigmaDaily) < 18 ? 0.35 : annualizedFromDaily(sigmaDaily) < 28 ? 0.05 : -0.3, 2), contribution: Math.round((annualizedFromDaily(sigmaDaily) < 18 ? 0.35 : annualizedFromDaily(sigmaDaily) < 28 ? 0.05 : -0.3) * 10) },
    ];

    const sectorBias = (name: string) => {
      const lower = name.toLowerCase();
      if (/technology|software/.test(lower)) return 1.15;
      if (/bank|financial/.test(lower)) return 1.05;
      if (/energy|metal|power|infrastructure|capital goods/.test(lower)) return 1.2;
      if (/consumer|pharma|health/.test(lower)) return 0.9;
      return 1;
    };

    const dominantSectorBias = topSector ? sectorBias(topSector[0]) : 1;
    const scenario = (label: string, shock: number, recovery: string, multiplier = 1) => {
      const impact = -Math.abs(shock * (0.65 + avgBeta * 0.35) * concentrationPenalty * dominantSectorBias * multiplier);
      return {
        scenario: label,
        impact: round(impact, 1),
        recovery,
        pnlLoss: round(totalValue * Math.abs(impact) / 100, 0),
      };
    };

    const stressScenarios = [
      scenario("2008 GFC Replay", 20, "12-18 months", 1.3),
      scenario("COVID-2020 Crash", 16, "4-7 months", 1.15),
      scenario("Rate Shock +200bps", 7.5, "4-8 months", topSector && /technology|consumer|financial/i.test(topSector[0]) ? 1.15 : 1),
      scenario("Crude Oil Spike", 8.5, "3-6 months", topSector && /energy/i.test(topSector[0]) ? 0.75 : 1.08),
      scenario("FII Outflow / EM Stress", 10.5, "5-9 months", 1.12),
      scenario("USD/INR Currency Shock", 6.2, "2-5 months", topSector && /import|consumer|financial|technology/i.test(topSector[0]) ? 1.08 : 0.98),
    ];

    const riskBreakdown = {
      volatility: clamp(Math.round(annualizedFromDaily(sigmaDaily) * 2.1), 12, 95),
      sector: clamp(Math.round((topSector?.[1] || 0) * 100 * 0.9 + 18), 10, 95),
      regulatory: clamp(Math.round(20 + holdings.filter((h: any) => /energy|bank|infrastructure|utilities|telecom/i.test(h.sector)).length / holdings.length * 45), 10, 95),
      financial: clamp(Math.round(avgRisk * 0.88), 10, 95),
      macro: clamp(Math.round((regime === "CRISIS" ? 70 : regime === "HIGH" ? 56 : regime === "NORMAL" ? 38 : 24) + avgBeta * 10), 10, 95),
    };

    const portfolioRiskScore = clamp(Math.round(
      riskBreakdown.volatility * 0.28 +
      riskBreakdown.sector * 0.16 +
      riskBreakdown.regulatory * 0.16 +
      riskBreakdown.financial * 0.2 +
      riskBreakdown.macro * 0.2
    ), 0, 100);

    const topRisks = [
      topWeight > 0.25 ? `${holdings[weights.indexOf(topWeight)].ticker} is ${Math.round(topWeight * 100)}% of the book, making idiosyncratic loss non-linear.` : `Top single-name weight is ${Math.round(topWeight * 100)}%, so idiosyncratic concentration is contained.`,
      topSector ? `${topSector[0]} is ${Math.round(topSector[1] * 100)}% of exposure, creating cluster sensitivity.` : "Sector concentration is diversified.",
      `Beta-weighted daily sigma is ${round(sigmaDaily * 100, 2)}% in a ${regime} volatility regime.`,
      truthMeanT < 0.4 ? `Truth confidence is weak at ${round(truthMeanT, 2)}, so position sizing should be cut.` : `Truth confidence is ${round(truthMeanT, 2)}, which does not currently force a size haircut.`,
    ];

    const hedgingRecommendations = [
      topWeight > 0.25
        ? `Trim or overlay the largest name (${holdings[weights.indexOf(topWeight)].ticker}) to reduce single-name convexity.`
        : `Use index downside protection sized to ${Math.round(var95 / Math.max(totalValue, 1) * 100)}% 1-day VaR.` ,
      regime === "HIGH" || regime === "CRISIS"
        ? `Add convex volatility hedge or protective index put spreads while regime remains ${regime}.`
        : `Keep a light index hedge only; current regime does not justify heavy convex premium burn.`,
      topSector
        ? `Neutralise ${topSector[0]} cluster risk with a sector-level hedge if dispersion collapses.`
        : `Sector hedging can remain secondary to broad-market protection.`,
      truthMeanT < 0.4
        ? `Reduce gross exposure by ${Math.round((1 - Math.max(0.3, truthMeanT / 0.4)) * 100)}% until truth confidence improves.`
        : `No truth-driven gross reduction required at current veracity levels.`,
    ];

    return new Response(JSON.stringify({
      var95: round(var95, 0),
      var99: round(var99, 0),
      cvar95: round(cvar95, 0),
      cvar99: round(cvar99, 0),
      liquidityVar: round(liquidityVar, 0),
      portfolioRiskScore,
      volatilityRegime: regime,
      riskBreakdown,
      factorExposure,
      stressScenarios,
      correlationInsight: topSector
        ? `${topSector[0]} is the main cluster, with concentration amplified by HHI ${Math.round(hhi * 10000)}.`
        : `Cross-holding correlation is moderate, with HHI ${Math.round(hhi * 10000)}.`,
      regimeAnalysis: `Portfolio beta ${round(avgBeta, 2)} and ${Math.round(topWeight * 100)}% top-name weight imply ${regime.toLowerCase()} regime fragility ${regime === "CRISIS" || regime === "HIGH" ? "above" : "below"} average.`,
      topRisks,
      hedgingRecommendations,
      twrd: {
        meanTruthConfidence: truthMeanT,
        truthRisk,
        falseConsensus: truthFalseConsensus,
        sizeMultiplier: truthMeanT < 0.4 ? Math.max(0.3, truthMeanT / 0.4) : 1,
        hedgeBias: truthMeanT < 0.4 ? Math.min(0.35, 0.4 - truthMeanT) : 0,
        note: truthMeanT < 0.4
          ? "Truth confidence below 0.4, reduce position size and increase hedge weight."
          : "Truth confidence acceptable.",
      },
      source: "deterministic",
      marketRegimeInput: marketRegime || null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("risk-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Risk intelligence failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function annualizedFromDaily(sigmaDaily: number) {
  return sigmaDaily * Math.sqrt(252) * 100;
}
