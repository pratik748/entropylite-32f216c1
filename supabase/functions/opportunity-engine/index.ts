// Opportunity Engine — Supabase edge function.
//
// This is the ONE backend venue. entropylite.in (Lovable Cloud) already
// talks to this Supabase project for every other function; Lovable deploys
// this function from the repo on sync. The whole request → pipeline →
// response flow lives in the shared handler (_shared/opportunity/
// handler.ts); this file supplies only the venue specifics: Deno auth,
// service-role signal logging, chart loading, and the performance profile.
//
// Calibration/reputation come from the maturity-gated REST loaders (the
// nightly learned fit — trained on the legacy engines' outcomes — is only
// adopted once ≥30 of THIS engine's own signals have settled; until then
// the documented default priors apply, which is what makes the board
// populate on day one instead of collapsing every score to p≈0.5).
//
// Profile: RELIABLE_PROFILE (coverage grid + liquid single-name leaders +
// the caller's holdings; stage-2 fundamentals/news skipped and recorded as
// missing so the completeness discount applies). This is the profile
// empirically verified to complete in ~2s and validate 30-40 real names
// per run against live data in both US and India modes — chosen so the
// board "just works" on first deploy. The heavier whole-market EDGE_PROFILE
// remains available in handler.ts to switch on once deploy timing is
// confirmed on the live project.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { logSignalOutcome } from "../_shared/calibration.ts";
import {
  createEngineHandler,
  SERVERLESS_PROFILE,
  type EngineLoaders,
} from "../_shared/opportunity/handler.ts";
import { restLoaders } from "../_shared/opportunity/restLoaders.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const loaders: EngineLoaders = {
  ...restLoaders(), // loadCharts (direct Yahoo) + calibration/reputation/maturity gate
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

serve(createEngineHandler(loaders, SERVERLESS_PROFILE));
