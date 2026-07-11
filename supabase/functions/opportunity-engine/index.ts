// Opportunity Engine — the platform's single source of validated
// opportunities. Discover, Direct Profit, Desirable Assets, alerts and any
// future recommendation module consume the output of THIS pipeline; no
// module runs its own generation or ranking.
//
//   CandidateGenerator      (universe.ts)   — market-activity screeners +
//                                             asset-class coverage grid
//   EvidenceCollectors      (evidence.ts)   — price history, fundamentals,
//                                             news sentiment
//   IndependentScoringModels(models.ts)     — 12 models, each explains itself
//   ConfidenceEngine        (confidence.ts) — cross-bucket consensus,
//                                             calibrated probability,
//                                             CF-VaR downside
//   OpportunityValidator    (confidence.ts) — data / liquidity / agreement /
//                                             economic-viability gates
//   Ranking                                 — |edge| × confidence / risk
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
import { runAllModels } from "../_shared/opportunity/models.ts";
import {
  detectRegime,
  evaluateCandidate,
  rankOpportunities,
} from "../_shared/opportunity/confidence.ts";
import type {
  AssetClass,
  Candidate,
  EngineResponse,
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
const MAX_UNIVERSE = 90;
const FINALISTS = 20;
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

    // ── Shared context: benchmark + regime + calibration ───────────
    const [benchmark, calibration] = await Promise.all([
      fetchDailyChart(benchmarkSymbol(indiaMode)),
      loadCalibration(),
    ]);
    const regime = detectRegime(benchmark);

    // ── Stage 1: CandidateGenerator ────────────────────────────────
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
        perScreener: 20,
        excludeSymbols: body.excludeSymbols,
      });
      candidates = universe.candidates.slice(0, MAX_UNIVERSE);
      universeSources = universe.sources;
    }

    // ── Stage 2: EvidenceCollectors (price history for everyone) ───
    const bundles = await pMap(candidates, (c) => collectPriceEvidence(c, benchmark), 8);

    const rejections: RejectionRecord[] = [];
    const usable = bundles.filter((b) => {
      if (!b.price) {
        rejections.push({ symbol: b.candidate.symbol, stage: "evidence", reason: "no_price_history" });
        return false;
      }
      return true;
    });

    // ── Stage 3: preliminary screen → finalists ────────────────────
    // Price/flow + risk models run on everyone (they only need price
    // evidence). The strongest absolute preliminary signals — in either
    // direction — earn the expensive fundamental/news collectors. In
    // single mode every requested ticker is a finalist.
    let finalists = usable;
    if (mode === "discover" && usable.length > FINALISTS) {
      const scored = usable.map((b) => {
        const models = runAllModels(b, regime, horizonDays);
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
          reason: "preliminary_signal_too_weak",
        });
      }
    }

    // ── Stage 4: enrich finalists (fundamentals + news sentiment) ──
    const enriched = await pMap(finalists, (b) => enrichBundle(b), 5);

    // ── Stage 5: score → cross-validate → validate ────────────────
    const opportunities: ValidatedOpportunity[] = [];
    for (const bundle of enriched) {
      const models = runAllModels(bundle, regime, horizonDays);
      const result = evaluateCandidate({ bundle, models, regime, horizonDays, calibration });
      if (result.ok) opportunities.push(result.opportunity);
      else rejections.push(result.rejection);
    }

    // ── Stage 6: rank + user filters ───────────────────────────────
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
    // job can mark them to market and refit the Platt constants.
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
    for (const r of rejections) rejectionSummary[r.reason] = (rejectionSummary[r.reason] ?? 0) + 1;

    const response: EngineResponse = {
      asOf: new Date().toISOString(),
      regime: { label: regime.label, evidence: regime.evidence },
      opportunities: ranked,
      diagnostics: {
        universeSize: candidates.length,
        universeSources,
        evidenceCollected: usable.length,
        scored: enriched.length,
        validated: opportunities.length,
        rejections: rejections.slice(0, 200),
        rejectionSummary,
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
