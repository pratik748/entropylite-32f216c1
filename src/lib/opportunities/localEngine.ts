// Local execution venue for the shared Opportunity Engine.
//
// This is NOT a second engine. It imports the exact same pipeline modules
// the `opportunity-engine` edge function runs (models, causal chains,
// macro builder, consensus, validator, ranking — single source of truth in
// supabase/functions/_shared/opportunity/) and executes them in the
// browser when that function isn't deployed yet.
//
// Differences are data-access only, and every one is reported honestly:
//   • Charts come through the already-deployed `historical-prices`
//     function (the browser can't reach Yahoo directly due to CORS).
//   • The universe is reduced to the asset-class coverage grid + the
//     user's holdings (no whole-market shard scan without the edge
//     venue) — labeled in universeSources as local:*.
//   • Fundamentals and news collectors are unavailable, so bundles carry
//     them in `missing` and the evidence-completeness discount lowers
//     confidence exactly as designed.
//   • Calibration and model-reputation rows are read from the same tables
//     with the app's Supabase client.
//
// The response is marked executionVenue: "local_fallback" so the UI can
// say so. When the edge function deploys, the repository stops calling
// this automatically.

import { governedInvoke } from "@/lib/apiGovernor";
import { supabase } from "@/integrations/supabase/client";
import {
  coverageCandidates,
  benchmarkSymbol,
} from "../../../supabase/functions/_shared/opportunity/universe.ts";
import {
  computePriceFeatures,
  type ChartSeries,
} from "../../../supabase/functions/_shared/opportunity/evidence.ts";
import {
  buildMacroContext,
  macroSymbols,
} from "../../../supabase/functions/_shared/opportunity/macro.ts";
import { runAllModels } from "../../../supabase/functions/_shared/opportunity/models.ts";
import {
  buildPortfolioReturns,
  detectRegime,
  evaluateCandidate,
  rankOpportunities,
} from "../../../supabase/functions/_shared/opportunity/confidence.ts";
import {
  buildLearningHealth,
  buildReputationBook,
  EMPTY_BOOK,
  type CalibrationRow,
  type ReliabilityRow,
  type ReputationBook,
} from "../../../supabase/functions/_shared/opportunity/reputationCore.ts";
import type {
  Candidate,
  EvidenceBundle,
  EngineResponse as PipelineResponse,
  NearMiss,
  RejectionRecord,
  ValidatedOpportunity,
} from "../../../supabase/functions/_shared/opportunity/types.ts";
import type { EngineResponse } from "./types";

interface Bars { closes: number[]; volumes: number[] }

async function fetchCharts(symbols: string[]): Promise<Map<string, ChartSeries | null>> {
  const out = new Map<string, ChartSeries | null>();
  const { data, error } = await governedInvoke<{ data: Record<string, Bars> }>("historical-prices", {
    body: { tickers: symbols, range: "1y", interval: "1d" },
    cacheKey: `opp-local|${symbols.slice().sort().join(",")}`,
  });
  if (error || !data?.data) {
    for (const s of symbols) out.set(s, null);
    return out;
  }
  for (const s of symbols) {
    const bars = data.data[s];
    out.set(
      s,
      bars && Array.isArray(bars.closes) && bars.closes.length >= 2
        // The proxy doesn't return chart currency; infer INR from the
        // listing suffix so liquidity floors use the right denomination.
        ? { closes: bars.closes, volumes: bars.volumes ?? [], currency: /\.(NS|BO)$/i.test(s) ? "INR" : undefined }
        : null,
    );
  }
  return out;
}

async function loadLearningTables(): Promise<{ reputation: ReputationBook; calibrationRow: CalibrationRow | null }> {
  try {
    const [rel, cal] = await Promise.all([
      supabase.from("engine_reliability").select("engine_id,ticker_class,regime,n,hit_rate").limit(2000),
      supabase.from("calibration_params").select("alpha,beta,gamma,n_samples,brier_score,fit_at").eq("id", 1).maybeSingle(),
    ]);
    return {
      reputation: rel.data ? buildReputationBook(rel.data as ReliabilityRow[]) : EMPTY_BOOK,
      calibrationRow: (cal.data as CalibrationRow | null) ?? null,
    };
  } catch {
    return { reputation: EMPTY_BOOK, calibrationRow: null };
  }
}

export interface LocalEngineParams {
  indiaMode: boolean;
  horizonDays: number;
  portfolio?: { positions: Array<{ symbol: string; weight: number }>; value?: number; currency?: string } | null;
}

/** Run the shared pipeline in the browser. Same models, same gates, same ranking. */
export async function runLocalEngine(params: LocalEngineParams): Promise<EngineResponse> {
  const { indiaMode, horizonDays } = params;
  const bench = benchmarkSymbol(indiaMode);

  // Reduced universe: coverage grid + user's holdings.
  const holdings = (params.portfolio?.positions ?? []).slice(0, 8);
  const candidates: Candidate[] = [...coverageCandidates(indiaMode)];
  const seen = new Set(candidates.map((c) => c.symbol));
  for (const h of holdings) {
    const symbol = h.symbol.toUpperCase();
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    candidates.push({
      symbol,
      name: symbol,
      assetClass: "equity",
      origin: { source: "local:holdings", reason: "User holding evaluated by the local venue's reduced universe." },
    });
  }

  const allSymbols = Array.from(new Set([bench, ...macroSymbols(indiaMode), ...candidates.map((c) => c.symbol)]));
  const [charts, learningTables] = await Promise.all([fetchCharts(allSymbols), loadLearningTables()]);
  const { reputation, calibrationRow } = learningTables;

  const benchmark = charts.get(bench) ?? null;
  const macro = buildMacroContext(charts, benchmark, indiaMode);
  const regime = detectRegime(benchmark);
  const learning = buildLearningHealth(calibrationRow, reputation.cells);
  const calibration = {
    alpha: learning.calibration.alpha,
    beta: learning.calibration.beta,
    gamma: learning.calibration.gamma,
  };

  // Portfolio composite for diversification-aware ranking.
  const portfolioReturns = holdings.length > 0
    ? buildPortfolioReturns(
      holdings
        .map((h) => ({ series: charts.get(h.symbol.toUpperCase()), weight: h.weight }))
        .filter((h): h is { series: ChartSeries; weight: number } => h.series != null),
    )
    : null;
  const portfolioValue = params.portfolio?.value && params.portfolio.value > 0 ? params.portfolio.value : null;
  const portfolioCurrency = params.portfolio?.currency ? params.portfolio.currency.toUpperCase() : null;

  const asOf = new Date().toISOString();
  const rejections: RejectionRecord[] = [];
  const nearMisses: NearMiss[] = [];
  const opportunities: ValidatedOpportunity[] = [];
  const universeSources: Record<string, number> = {};
  let evidenceCollected = 0;

  for (const candidate of candidates) {
    universeSources[candidate.origin.source] = (universeSources[candidate.origin.source] ?? 0) + 1;
    const series = charts.get(candidate.symbol);
    if (!series) {
      rejections.push({ symbol: candidate.symbol, stage: "evidence", code: "no_price_history", reason: "No usable daily price history from the data proxy." });
      continue;
    }
    evidenceCollected++;
    const price = computePriceFeatures(series, benchmark);
    // Fundamentals/news collectors are edge-only; record them as missing so
    // the completeness discount applies (equities miss both, others miss news).
    const missing = candidate.assetClass === "equity" ? ["yahoo_summary", "gdelt_news"] : ["gdelt_news"];
    const bundle: EvidenceBundle = {
      candidate,
      price,
      fundamentals: null,
      sentiment: null,
      items: [
        { collector: "price_history", key: "ret_63d", value: price.ret63d, statement: `63-day return ${(price.ret63d * 100).toFixed(1)}%`, asOf },
        { collector: "price_history", key: "vol_annual", value: price.volAnnual, statement: `Realized volatility ${(price.volAnnual * 100).toFixed(1)}% annualized`, asOf },
      ],
      missing,
    };
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
      portfolioCurrency,
    });
    if (result.ok) {
      opportunities.push(result.opportunity);
    } else {
      // Explicit extract: this tsconfig runs without strictNullChecks, where
      // negative narrowing of boolean discriminants doesn't apply.
      const failed = result as { ok: false; rejection: RejectionRecord; nearMiss?: NearMiss };
      rejections.push(failed.rejection);
      if (failed.nearMiss) nearMisses.push(failed.nearMiss);
    }
  }

  const ranked = rankOpportunities(opportunities).slice(0, 12);
  const rejectionSummary: Record<string, number> = {};
  for (const r of rejections) rejectionSummary[r.code] = (rejectionSummary[r.code] ?? 0) + 1;
  nearMisses.sort((a, b) => b.calibratedProb - a.calibratedProb);

  const response: PipelineResponse = {
    asOf,
    executionVenue: "local_fallback",
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
      evidenceCollected,
      scored: evidenceCollected,
      validated: opportunities.length,
      rejections: rejections.slice(0, 200),
      rejectionSummary,
      nearMisses: nearMisses.slice(0, 8),
    },
  };

  // The pipeline types are the canonical schema; the client mirror in
  // ./types is structurally identical.
  return response as unknown as EngineResponse;
}
