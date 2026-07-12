// Opportunity Engine — Netlify Functions venue.
//
// Deploys automatically with the site on every push (no tokens, no extra
// infra) and serves the SAME shared handler as the Supabase edge function
// at /api/opportunity-engine on this origin. Uses the serverless perf
// profile (coverage grid + liquid leaders + holdings; stage-2 collectors
// skipped and recorded as missing) to fit Netlify's ~10s budget — models,
// gates and ranking are identical to every other venue.

import {
  createEngineHandler,
  SERVERLESS_PROFILE,
} from "../../supabase/functions/_shared/opportunity/handler.ts";
import { restLoaders } from "../../supabase/functions/_shared/opportunity/restLoaders.ts";

const handler = createEngineHandler(restLoaders(), SERVERLESS_PROFILE);

export default (req: Request) => handler(req);

export const config = {
  path: "/api/opportunity-engine",
};
