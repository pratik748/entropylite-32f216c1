// Opportunity Engine — HTTP handler for the Supabase edge function.
//
// ONE implementation of the request → pipeline → response flow. Venue
// specifics (auth, learning-table access, chart loading) are injected via
// `EngineLoaders`, and a wall-clock `EnginePerfProfile` bounds the run;
// the models, gates, ranking and response schema are fixed. The handler
// uses nothing but Web APIs (Request/Response/fetch), so it is host-
// agnostic if the engine ever needs to run somewhere other than Supabase.

import { tickerClass } from "../costs.ts";
import type { CalibrationParams } from "../ensemble.ts";
import {
  generateUniverse,
  coverageCandidates,
  liquidLeaders,
  benchmarkSymbol,
} from "./universe.ts";
import {
  buildPriceBundle,
  enrichBundle,
  fetchDailyChart,
  pMap,
  type ChartSeries,
} from "./evidence.ts";
import { buildMacroContext, macroSymbols } from "./macro.ts";
import { classifyMarketContext } from "./marketContext.ts";
import { runAllModels } from "./models.ts";
import type { LearningHealth, ReputationBook } from "./reputationCore.ts";
import {
  buildPortfolioReturns,
  detectRegime,
  evaluateCandidate,
  rankOpportunities,
} from "./confidence.ts";
import type {
  AssetClass,
  Candidate,
  EngineResponse,
  NearMiss,
  RejectionRecord,
  ValidatedOpportunity,
} from "./types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_HORIZON_DAYS = 21;
const DEFAULT_MAX_RESULTS = 12;
const MAX_PORTFOLIO_HOLDINGS = 8;

export interface SignalLogPayload {
  ticker: string;
  tickerClass: string;
  regime: string;
  action: string;
  ensembleScore: number;
  agreement: number;
  calibratedProb: number;
  expectedR: number;
  bucketADir: number;
  bucketBDir: number;
  bucketCDir: number;
  engines: Array<{ id: string; direction: number; confidence: number }>;
  entryPrice: number;
  costHaircut: number;
  userId: string | null;
}

export interface ChartLoadOptions {
  timeoutMs: number;
  concurrency: number;
}

/** Venue-specific capabilities, injected by each host adapter. */
export interface EngineLoaders {
  /** Validate the caller; return the user id, or throw a Response(401). */
  requireUser(req: Request): Promise<{ id: string }>;
  /** Fetch daily chart series for every symbol. `req` is the incoming
   *  request so proxy-based loaders can forward the caller's own JWT. */
  loadCharts(symbols: string[], opts: ChartLoadOptions, req: Request): Promise<Map<string, ChartSeries | null>>;
  loadCalibration(): Promise<CalibrationParams>;
  loadReputation(): Promise<ReputationBook>;
  loadLearningHealth(reputationCells: number): Promise<LearningHealth>;
  /** Best-effort outcome logging for the nightly calibration refit. */
  logSignal?: (payload: SignalLogPayload) => Promise<void>;
}

/** Default chart loader: Yahoo directly. Works from Deno Deploy egress
 *  (the Supabase venue) and local dev; NOT from AWS-Lambda-style egress. */
export async function directChartLoader(
  symbols: string[],
  opts: ChartLoadOptions,
  _req: Request,
): Promise<Map<string, ChartSeries | null>> {
  const out = new Map<string, ChartSeries | null>();
  await pMap(
    symbols,
    async (s) => {
      out.set(s, await fetchDailyChart(s, opts.timeoutMs).catch(() => null));
    },
    opts.concurrency,
  );
  return out;
}

/**
 * Wall-clock budget knobs. Two profiles trade universe breadth for speed;
 * the models, consensus gates and ranking are byte-identical between them.
 *   RELIABLE  — coverage grid + liquid single-name leaders (+ holdings),
 *               stage-2 fundamentals/news skipped and recorded as `missing`
 *               (completeness discount applies). Empirically ~2s / 30-40
 *               validated names against live data; the default so the board
 *               populates on first deploy.
 *   EDGE      — whole-market directory shard + screeners + trending, with
 *               stage-2 enrichment. Heavier; enable once deploy timing is
 *               confirmed on the live project.
 */
export interface EnginePerfProfile {
  id: "edge" | "serverless";
  fullUniverse: boolean;      // directory shard + screeners + trending
  maxUniverse: number;
  finalists: number;
  chartConcurrency: number;
  chartTimeoutMs: number;
  enrich: boolean;            // stage-2: fundamentals + news sentiment
}

export const EDGE_PROFILE: EnginePerfProfile = {
  id: "edge",
  fullUniverse: true,
  maxUniverse: 140,
  finalists: 20,
  chartConcurrency: 8,
  chartTimeoutMs: 8000,
  enrich: true,
};

// The reliable default (see index.ts). Named SERVERLESS_PROFILE for history.
export const SERVERLESS_PROFILE: EnginePerfProfile = {
  id: "serverless",
  fullUniverse: false,
  maxUniverse: 80,
  finalists: 80,              // no stage-2 cost, so no preliminary cut needed
  chartConcurrency: 16,
  chartTimeoutMs: 8000,
  enrich: false,
};

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
  portfolio?: {
    positions?: Array<{ symbol: string; weight: number }>;
    value?: number;
    /** Currency `value` is denominated in (e.g. "INR" for India-mode users). */
    currency?: string;
  };
}

export function createEngineHandler(
  loaders: EngineLoaders,
  profile: EnginePerfProfile,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    try {
      const user = await loaders.requireUser(req);
      const body: EngineRequest = await req.json().catch(() => ({}));

      const mode = body.mode === "single" ? "single" : "discover";
      const indiaMode = Boolean(body.indiaMode);
      const horizonDays = Math.min(Math.max(Math.round(Number(body.horizonDays) || DEFAULT_HORIZON_DAYS), 5), 126);
      const maxResults = Math.min(Math.max(Math.round(Number(body.maxResults) || DEFAULT_MAX_RESULTS), 1), 30);

      // ── CandidateGenerator ──────────────────────────────────────────
      let candidates: Candidate[];
      let universeSources: Record<string, number>;
      const positions = (body.portfolio?.positions ?? [])
        .map((x) => ({ symbol: String(x?.symbol || "").toUpperCase(), weight: Number(x?.weight) || 0 }))
        .filter((x) => x.symbol && x.weight > 0)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, MAX_PORTFOLIO_HOLDINGS);

      if (mode === "single") {
        const tickers = (body.tickers ?? []).map((t) => String(t).trim().toUpperCase()).filter(Boolean).slice(0, 10);
        candidates = tickers.map((symbol) => ({
          symbol,
          name: symbol,
          assetClass: "equity" as AssetClass,
          origin: { source: "user:request", reason: "Explicitly requested evaluation." },
        }));
        universeSources = { "user:request": candidates.length };
      } else if (profile.fullUniverse) {
        const universe = await generateUniverse({
          indiaMode,
          perScreener: 15,
          excludeSymbols: body.excludeSymbols,
        });
        candidates = universe.candidates.slice(0, profile.maxUniverse);
        universeSources = universe.sources;
      } else {
        // Budget-constrained venues: coverage grid + liquid single-name
        // leaders + the caller's holdings. Everything still earns its way
        // through the same evidence, consensus and validation gates.
        const excluded = new Set((body.excludeSymbols ?? []).map((s) => String(s).toUpperCase()));
        const seen = new Set<string>();
        candidates = [];
        universeSources = {};
        const push = (c: Candidate) => {
          if (seen.has(c.symbol) || excluded.has(c.symbol)) return;
          seen.add(c.symbol);
          candidates.push(c);
          universeSources[c.origin.source] = (universeSources[c.origin.source] ?? 0) + 1;
        };
        for (const c of coverageCandidates(indiaMode)) push(c);
        for (const c of liquidLeaders(indiaMode)) push(c);
        for (const pos of positions) {
          push({
            symbol: pos.symbol,
            name: pos.symbol,
            assetClass: "equity",
            origin: { source: "portfolio:holding", reason: "Caller's holding, evaluated alongside the universe." },
          });
        }
        candidates = candidates.slice(0, profile.maxUniverse);
      }

      // ── Data collection: ONE batched chart load for everything ──────
      const bench = benchmarkSymbol(indiaMode);
      const allSymbols = Array.from(new Set([
        bench,
        ...macroSymbols(indiaMode),
        ...candidates.map((c) => c.symbol),
        ...positions.map((p) => p.symbol),
      ]));
      const [charts, calibration, reputation] = await Promise.all([
        loaders.loadCharts(allSymbols, { timeoutMs: profile.chartTimeoutMs, concurrency: profile.chartConcurrency }, req),
        loaders.loadCalibration(),
        loaders.loadReputation(),
      ]);
      const learning = await loaders.loadLearningHealth(reputation.cells);

      const benchmark = charts.get(bench) ?? null;
      const macro = buildMacroContext(charts, benchmark, indiaMode);
      const regime = detectRegime(benchmark);
      // Classify the environment ONCE for the whole run (trend / vol / risk).
      const marketContext = classifyMarketContext(macro, regime);

      // ── Portfolio composite (optional) ──────────────────────────────
      let portfolioReturns: number[] | null = null;
      if (positions.length > 0) {
        portfolioReturns = buildPortfolioReturns(
          positions
            .map((pos) => ({ series: charts.get(pos.symbol), weight: pos.weight }))
            .filter((h): h is { series: ChartSeries; weight: number } => h.series != null),
        );
      }
      const portfolioValue = Number(body.portfolio?.value) > 0 ? Number(body.portfolio!.value) : null;
      const portfolioCurrency = body.portfolio?.currency ? String(body.portfolio.currency).toUpperCase() : null;

      // ── Price evidence (pure, from the charts map) ──────────────────
      const bundles = candidates.map((c) => buildPriceBundle(c, charts.get(c.symbol) ?? null, benchmark));

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
      if (mode === "discover" && profile.enrich && usable.length > profile.finalists) {
        const scored = usable.map((b) => {
          const models = runAllModels(b, regime, horizonDays, macro);
          const active = models.filter((m) => m.hasSignal && m.direction !== 0);
          const signed = active.reduce((s, m) => s + m.direction * m.confidence, 0);
          return { bundle: b, strength: Math.abs(signed) };
        });
        scored.sort((a, b) => b.strength - a.strength);
        finalists = scored.slice(0, profile.finalists).map((s) => s.bundle);
        for (const s of scored.slice(profile.finalists)) {
          rejections.push({
            symbol: s.bundle.candidate.symbol,
            stage: "validation",
            code: "preliminary_signal_too_weak",
            reason: "Preliminary cross-model signal too weak to justify deep evidence collection this run.",
            details: { preliminaryStrength: Number(s.strength.toFixed(3)) },
          });
        }
      }

      // ── Stage-2 collectors (fundamentals + news sentiment) ──────────
      let enriched = finalists;
      if (profile.enrich) {
        enriched = await pMap(finalists, (b) => enrichBundle(b), 5);
      } else {
        // Skipped on budget venues — record the collectors as missing so
        // the evidence-completeness discount lowers confidence honestly.
        enriched = finalists.map((b) => ({
          ...b,
          missing: [
            ...b.missing,
            ...(b.candidate.assetClass === "equity" ? ["yahoo_summary", "gdelt_news"] : ["gdelt_news"]),
          ],
        }));
      }

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
          macro,
          marketContext,
          portfolioReturns,
          portfolioValue,
          portfolioCurrency,
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
      if (loaders.logSignal) {
        for (const o of ranked) {
          loaders.logSignal({
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
            userId: user.id,
          }).catch(() => { /* diagnostics only */ });
        }
      }

      const rejectionSummary: Record<string, number> = {};
      for (const r of rejections) rejectionSummary[r.code] = (rejectionSummary[r.code] ?? 0) + 1;
      nearMisses.sort((a, b) => b.calibratedProb - a.calibratedProb);

      const response: EngineResponse = {
        asOf: new Date().toISOString(),
        executionVenue: "edge",
        regime: { label: regime.label, evidence: regime.evidence },
        marketContext,
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
  };
}
