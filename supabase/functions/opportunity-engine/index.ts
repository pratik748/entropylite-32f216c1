// Opportunity Engine — the platform's single source of validated
// opportunities. Discover, Direct Profit, Desirable Assets, alerts and any
// future recommendation module consume the output of THIS pipeline; no
// module runs its own generation or ranking.
//
//   MacroContext            (macro.ts)      — rates, curve, dollar, VIX,
//                                             credit, sector leadership;
//                                             the environment is measured
//                                             BEFORE securities are scored
//   CandidateGenerator      (universe.ts)   — full exchange directory
//                                             (rotating whole-market shard),
//                                             attention screeners, coverage grid
//   EvidenceCollectors      (evidence.ts)   — price history, fundamentals,
//                                             news sentiment
//   IndependentScoringModels(models.ts)     — 13 models incl. causal chains,
//                                             each explains itself
//   ConfidenceEngine        (confidence.ts) — cross-bucket consensus with
//                                             outcome-derived model reputations,
//                                             calibrated probability, evidence-
//                                             completeness discount, CF-VaR
//   OpportunityValidator    (confidence.ts) — data / liquidity / agreement /
//                                             economic-viability gates with
//                                             machine-readable rejection codes
//   Ranking                                 — |edge| × confidence / risk,
//                                             × diversification vs portfolio
//
// There is deliberately NO LLM call and NO fallback list in this function.
// When nothing survives the gates the honest answer is an empty array.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { loadCalibration, logSignalOutcome } from "../_shared/calibration.ts";
import { tickerClass } from "../_shared/costs.ts";
import { generateUniverse, benchmarkSymbol } from "../_shared/opportunity/universe.ts";
import {
  collectPriceEvidence,
  enrichBundle,
  fetchDailyChart,
  pMap,
} from "../_shared/opportunity/evidence.ts";
import { collectMacroContext } from "../_shared/opportunity/macro.ts";
import { runAllModels } from "../_shared/opportunity/models.ts";
import { loadLearningHealth, loadReputation } from "../_shared/opportunity/reputation.ts";
import {
  buildPortfolioReturns,
  detectRegime,
  evaluateCandidate,
  rankOpportunities,
} from "../_shared/opportunity/confidence.ts";
import type {
  AssetClass,
  Candidate,
  EngineResponse,
  NearMiss,
  RejectionRecord,
  ValidatedOpportunity,
} from "../_shared/opportunity/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Pipeline size limits — bound wall-clock time, not opportunity quality:
// stage 1 (price history) runs on the whole capped universe; only the
// strongest preliminary signals earn the expensive stage-2 collectors.
const MAX_UNIVERSE = 110;
const FINALISTS = 20;
const MAX_PORTFOLIO_HOLDINGS = 8;
const DEFAULT_HORIZON_DAYS = 21;
const DEFAULT_MAX_RESULTS = 12;

interface EngineRequest {
  mode?: "discover" | "single";
  tickers?: string[];
  indiaMode?: boolean;
  horizonDays?: number;
  maxResults?: number;
  excludeSymbols?: string[];
  assetClasses?: AssetClass[];
  direction?: "long" | "short";
  minConfidence?: number;
  /** Existing holdings — enables correlation-aware ranking and qty sizing. */
  portfolio?: {
    positions?: Array<{ symbol: string; weight: number }>;
    value?: number;
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, corsHeaders);
    const body: EngineRequest = await req.json().catch(() => ({}));

    const mode = body.mode === "single" ? "single" : "discover";
    const indiaMode = Boolean(body.indiaMode);
    const horizonDays = Math.min(Math.max(Math.round(Number(body.horizonDays) || DEFAULT_HORIZON_DAYS), 5), 126);
    const maxResults = Math.min(Math.max(Math.round(Number(body.maxResults) || DEFAULT_MAX_RESULTS), 1), 30);

    // ── Environment first: benchmark, macro context, learning state ─
    const [benchmark, calibration, reputation] = await Promise.all([
      fetchDailyChart(benchmarkSymbol(indiaMode)),
      loadCalibration(),
      loadReputation(),
    ]);
    const [macro, learning] = await Promise.all([
      collectMacroContext(benchmark),
      loadLearningHealth(reputation.cells),
    ]);
    const regime = detectRegime(benchmark);

    // ── Portfolio context (optional) ────────────────────────────────
    const positions = (body.portfolio?.positions ?? [])
      .map((x) => ({ symbol: String(x?.symbol || "").toUpperCase(), weight: Number(x?.weight) || 0 }))
      .filter((x) => x.symbol && x.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_PORTFOLIO_HOLDINGS);
    let portfolioReturns: number[] | null = null;
    if (positions.length > 0) {
      const holdings = await pMap(positions, async (pos) => {
        const series = await fetchDailyChart(pos.symbol).catch(() => null);
        return series ? { series, weight: pos.weight } : null;
      }, 4);
      portfolioReturns = buildPortfolioReturns(holdings.filter((h): h is NonNullable<typeof h> => h != null));
    }
    const portfolioValue = Number(body.portfolio?.value) > 0 ? Number(body.portfolio!.value) : null;

    // ── CandidateGenerator ──────────────────────────────────────────
    let candidates: Candidate[];
    let universeSources: Record<string, number>;
    if (mode === "single") {
      const tickers = (body.tickers ?? []).map((t) => String(t).trim().toUpperCase()).filter(Boolean).slice(0, 10);
      candidates = tickers.map((symbol) => ({
        symbol,
        name: symbol,
        assetClass: "equity" as AssetClass,
        origin: { source: "user:request", reason: "Explicitly requested evaluation." },
      }));
      universeSources = { "user:request": candidates.length };
    } else {
      const universe = await generateUniverse({
        indiaMode,
        perScreener: 15,
        excludeSymbols: body.excludeSymbols,
      });
      candidates = universe.candidates.slice(0, MAX_UNIVERSE);
      universeSources = universe.sources;
    }

    // ── EvidenceCollectors (price history for everyone) ─────────────
    const bundles = await pMap(candidates, (c) => collectPriceEvidence(c, benchmark), 8);

    const rejections: RejectionRecord[] = [];
    const nearMisses: NearMiss[] = [];
    const usable = bundles.filter((b) => {
      if (!b.price) {
        rejections.push({ symbol: b.candidate.symbol, stage: "evidence", code: "no_price_history", reason: "No usable daily price history." });
        return false;
      }
      return true;
    });

    // ── Preliminary screen → finalists ──────────────────────────────
    // Price/flow + risk + macro models run on everyone (they only need
    // price evidence + macro context). The strongest absolute preliminary
    // signals — in either direction — earn the expensive fundamental/news
    // collectors. In single mode every requested ticker is a finalist.
    let finalists = usable;
    if (mode === "discover" && usable.length > FINALISTS) {
      const scored = usable.map((b) => {
        const models = runAllModels(b, regime, horizonDays, macro);
        const active = models.filter((m) => m.hasSignal && m.direction !== 0);
        const signed = active.reduce((s, m) => s + m.direction * m.confidence, 0);
        return { bundle: b, strength: Math.abs(signed) };
      });
      scored.sort((a, b) => b.strength - a.strength);
      finalists = scored.slice(0, FINALISTS).map((s) => s.bundle);
      for (const s of scored.slice(FINALISTS)) {
        rejections.push({
          symbol: s.bundle.candidate.symbol,
          stage: "validation",
          code: "preliminary_signal_too_weak",
          reason: "Preliminary cross-model signal too weak to justify deep evidence collection this run.",
          details: { preliminaryStrength: Number(s.strength.toFixed(3)) },
        });
      }
    }

    // ── Enrich finalists (fundamentals + news sentiment) ────────────
    const enriched = await pMap(finalists, (b) => enrichBundle(b), 5);

    // ── Score → cross-validate → validate ──────────────────────────
    const opportunities: ValidatedOpportunity[] = [];
    for (const bundle of enriched) {
      const models = runAllModels(bundle, regime, horizonDays, macro);
      const result = evaluateCandidate({
        bundle,
        models,
        regime,
        horizonDays,
        calibration,
        reputation,
        portfolioReturns,
        portfolioValue,
      });
      if (result.ok) opportunities.push(result.opportunity);
      else {
        rejections.push(result.rejection);
        if (result.nearMiss) nearMisses.push(result.nearMiss);
      }
    }

    // ── Rank + user filters ─────────────────────────────────────────
    let ranked = rankOpportunities(opportunities);
    if (body.assetClasses && body.assetClasses.length > 0) {
      const allowed = new Set(body.assetClasses);
      ranked = ranked.filter((o) => allowed.has(o.assetClass));
    }
    if (body.direction) ranked = ranked.filter((o) => o.direction === body.direction);
    if (Number.isFinite(Number(body.minConfidence))) {
      ranked = ranked.filter((o) => o.confidence >= Number(body.minConfidence));
    }
    ranked = ranked.slice(0, maxResults);

    // Fire-and-forget: log validated signals so the nightly calibration
    // job can mark them to market, refit the Platt constants, and update
    // per-model reliabilities — the loop that keeps confidence honest.
    for (const o of ranked) {
      logSignalOutcome({
        source: "opportunity-engine",
        ticker: o.symbol,
        tickerClass: tickerClass(o.symbol),
        regime: regime.label,
        action: o.direction === "long" ? "BUY" : "SELL",
        ensembleScore: o.consensus.agreement * (o.direction === "long" ? 1 : -1),
        agreement: o.consensus.agreement,
        calibratedProb: o.consensus.calibratedProb,
        expectedR: o.consensus.expectedR,
        bucketADir: o.consensus.bucketDirs.A,
        bucketBDir: o.consensus.bucketDirs.B,
        bucketCDir: o.consensus.bucketDirs.C,
        engines: o.models.map((m) => ({ id: m.id, direction: m.direction, confidence: m.confidence })),
        entryPrice: o.price,
        costHaircut: o.costHaircutPct / 100,
        userId: auth.user.id,
      }).catch(() => { /* diagnostics only */ });
    }

    const rejectionSummary: Record<string, number> = {};
    for (const r of rejections) rejectionSummary[r.code] = (rejectionSummary[r.code] ?? 0) + 1;
    nearMisses.sort((a, b) => b.calibratedProb - a.calibratedProb);

    const response: EngineResponse = {
      asOf: new Date().toISOString(),
      executionVenue: "edge",
      regime: { label: regime.label, evidence: regime.evidence },
      macro: {
        rates: macro.rates,
        dollar: macro.dollar,
        volatility: macro.volatility,
        credit: macro.credit,
        sectors: { ranked: macro.sectors.ranked },
        evidence: macro.evidence,
        missing: macro.missing,
      },
      learning,
      opportunities: ranked,
      diagnostics: {
        universeSize: candidates.length,
        universeSources,
        evidenceCollected: usable.length,
        scored: enriched.length,
        validated: opportunities.length,
        rejections: rejections.slice(0, 200),
        rejectionSummary,
        nearMisses: nearMisses.slice(0, 8),
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("opportunity-engine error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Opportunity engine failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
