// Opportunity Engine — Supabase edge-function venue.
//
// The entire request → pipeline → response flow lives in the shared,
// runtime-agnostic handler (_shared/opportunity/handler.ts); this file
// only supplies venue specifics: Deno auth, service-role signal logging,
// and the full-universe performance profile. Calibration/reputation come
// from the same maturity-gated REST loaders every venue uses (the learned
// fit is only adopted once ≥30 of THIS engine's own signals have settled).
// The same handler also powers the Netlify/Vercel /api/opportunity-engine
// venues, so every host runs byte-identical models, gates and ranking.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { logSignalOutcome } from "../_shared/calibration.ts";
import {
  createEngineHandler,
  directChartLoader,
  EDGE_PROFILE,
  type EngineLoaders,
} from "../_shared/opportunity/handler.ts";
import { restLoaders } from "../_shared/opportunity/restLoaders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const loaders: EngineLoaders = {
  ...restLoaders(),
  // Deno Deploy egress reaches Yahoo directly — no proxy hop needed.
  loadCharts: directChartLoader,
  async requireUser(req) {
    const auth = await requireAuth(req, corsHeaders);
    return { id: auth.user.id };
  },
  logSignal: (p) =>
    logSignalOutcome({
      source: "opportunity-engine",
      ticker: p.ticker,
      tickerClass: p.tickerClass,
      regime: p.regime,
      action: p.action,
      ensembleScore: p.ensembleScore,
      agreement: p.agreement,
      calibratedProb: p.calibratedProb,
      expectedR: p.expectedR,
      bucketADir: p.bucketADir,
      bucketBDir: p.bucketBDir,
      bucketCDir: p.bucketCDir,
      engines: p.engines,
      entryPrice: p.entryPrice,
      costHaircut: p.costHaircut,
      userId: p.userId,
    }),
};

serve(createEngineHandler(loaders, EDGE_PROFILE));
