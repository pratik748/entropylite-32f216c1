// EngineLoaders backed by plain Supabase REST calls: calibration params,
// per-model reliabilities and the own-distribution maturity gate, using
// the shared shrinkage/health rules in reputationCore.ts — fetch-only, no
// Deno-specific client. Charts are loaded directly from Yahoo (Supabase
// edge egress reaches it — the deployed historical-prices function proves
// this), so no proxy hop is needed.
//
// The URL and anon key are the project's PUBLIC client credentials (they
// ship in the browser bundle and in the committed .env) — no secret is
// embedded here. Auth is enforced by validating the caller's own JWT
// against Supabase Auth, exactly like the edge function's requireAuth.

import type { CalibrationParams } from "../ensemble.ts";
import {
  buildLearningHealth,
  buildReputationBook,
  DEFAULT_LEARNING_HEALTH,
  EMPTY_BOOK,
  type CalibrationRow,
  type LearningHealth,
  type ReliabilityRow,
  type ReputationBook,
} from "./reputationCore.ts";
import { directChartLoader, type EngineLoaders } from "./handler.ts";

export const SUPABASE_URL = "https://reprphurmjtveejeqejn.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJlcHJwaHVybWp0dmVlamVxZWpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4NjMxMTksImV4cCI6MjA4NzQzOTExOX0.uMlwSCcAwvKnA5vX3zo1R-bn3zIshFq9vSZeM4ni1eU";

const DEFAULT_CALIBRATION: CalibrationParams = { alpha: 3.2, beta: 1.4, gamma: -0.7 };

async function restSelect<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function loadCalibrationRow(): Promise<CalibrationRow | null> {
  const rows = await restSelect<CalibrationRow[]>(
    "calibration_params?select=alpha,beta,gamma,n_samples,brier_score,fit_at&id=eq.1&limit=1",
  );
  return rows && rows.length > 0 ? rows[0] : null;
}

// ── Own-distribution maturity gate ──────────────────────────────────
// The nightly job fits calibration + model reliabilities on ALL settled
// signals — historically the OLD engines' outcomes. A mapping fitted on a
// different signal distribution must not be applied to this engine (the
// live row, fitted on old-engine losses, degenerates every new score to
// p≈0.5 and empties the board). We therefore adopt the learned fit and
// reputation book only once ≥30 of THIS engine's own signals have settled;
// until then the documented default priors apply.
const MATURITY_MIN_SETTLED = 30;
let maturityCache: { count: number; at: number } | null = null;
const MATURITY_TTL_MS = 10 * 60 * 1000;

async function ownSettledCount(): Promise<number> {
  if (maturityCache && Date.now() - maturityCache.at < MATURITY_TTL_MS) return maturityCache.count;
  const rows = await restSelect<Array<{ id: string }>>(
    `signal_outcomes?select=id&source=eq.opportunity-engine&outcome_won=not.is.null&limit=${MATURITY_MIN_SETTLED}`,
  );
  const count = rows ? rows.length : 0;
  maturityCache = { count, at: Date.now() };
  return count;
}

export function restLoaders(): EngineLoaders {
  return {
    loadCharts: directChartLoader,

    async requireUser(req: Request): Promise<{ id: string }> {
      const authHeader = req.headers.get("authorization");
      const unauthorized = (msg: string) =>
        new Response(JSON.stringify({ error: msg }), {
          status: 401,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      if (!authHeader?.startsWith("Bearer ")) throw unauthorized("Unauthorized");
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: authHeader },
      });
      if (!res.ok) throw unauthorized("Invalid or expired token");
      const user = await res.json().catch(() => null);
      if (!user?.id) throw unauthorized("Invalid or expired token");
      return { id: String(user.id) };
    },

    async loadCalibration(): Promise<CalibrationParams> {
      if ((await ownSettledCount()) < MATURITY_MIN_SETTLED) return DEFAULT_CALIBRATION;
      const row = await loadCalibrationRow();
      if (!row) return DEFAULT_CALIBRATION;
      return {
        alpha: Number(row.alpha) || DEFAULT_CALIBRATION.alpha,
        beta: Number(row.beta) || DEFAULT_CALIBRATION.beta,
        gamma: Number(row.gamma) ?? DEFAULT_CALIBRATION.gamma,
      };
    },

    async loadReputation(): Promise<ReputationBook> {
      if ((await ownSettledCount()) < MATURITY_MIN_SETTLED) return EMPTY_BOOK;
      const rows = await restSelect<ReliabilityRow[]>(
        "engine_reliability?select=engine_id,ticker_class,regime,n,hit_rate&limit=2000",
      );
      return rows ? buildReputationBook(rows) : EMPTY_BOOK;
    },

    async loadLearningHealth(reputationCells: number): Promise<LearningHealth> {
      const own = await ownSettledCount();
      if (own < MATURITY_MIN_SETTLED) {
        // This engine's learning loop hasn't matured — report it as warming
        // up with ITS OWN sample count, not the legacy engines' fit.
        return {
          ...DEFAULT_LEARNING_HEALTH,
          calibration: { ...DEFAULT_LEARNING_HEALTH.calibration, nSamples: own },
          reputationCells,
          drift: "unfit",
        };
      }
      const row = await loadCalibrationRow();
      if (!row) return { ...DEFAULT_LEARNING_HEALTH, reputationCells };
      return buildLearningHealth(row, reputationCells);
    },

    // Signal logging needs the service role (RLS); the edge venue owns it.
  };
}
