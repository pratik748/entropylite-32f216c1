// Reputation core — pure, runtime-agnostic. Both execution venues use
// these builders: the edge function loads rows with its Deno Supabase
// client (reputation.ts), the browser fallback loads the same tables with
// the app's Supabase client. One shrinkage rule, one drift rule.

const PRIOR = 0.55;
const FULL_WEIGHT_N = 50;
const MIN_RELIABILITY = 0.35;
const MAX_RELIABILITY = 0.80;

export interface ReliabilityRow {
  engine_id: string;
  ticker_class: string;
  regime: string;
  n: number;
  hit_rate: number;
}

export interface ReputationBook {
  /** Reliability for a model in the given context; null → use ensemble default. */
  lookup(modelId: string, tickerClass: string, regime: string): number | null;
  /** Number of (model, class, regime) cells backed by settled outcomes. */
  cells: number;
}

export const EMPTY_BOOK: ReputationBook = { lookup: () => null, cells: 0 };

/** Shrink a hit rate toward the 0.55 prior by sample size (full at 50+). */
function shrink(hitRate: number, n: number): number {
  const w = Math.min(1, n / FULL_WEIGHT_N);
  const shrunk = PRIOR + (hitRate - PRIOR) * w;
  return Math.max(MIN_RELIABILITY, Math.min(MAX_RELIABILITY, shrunk));
}

export function buildReputationBook(rows: ReliabilityRow[]): ReputationBook {
  const exact = new Map<string, { n: number; hit: number }>();
  const byModel = new Map<string, { n: number; wins: number }>();
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const hit = Number(r.hit_rate) || 0;
    if (n <= 0) continue;
    exact.set(`${r.engine_id}|${r.ticker_class}|${r.regime}`, { n, hit });
    const agg = byModel.get(r.engine_id) ?? { n: 0, wins: 0 };
    agg.n += n;
    agg.wins += hit * n;
    byModel.set(r.engine_id, agg);
  }
  return {
    cells: exact.size,
    lookup(modelId: string, tickerClass: string, regime: string): number | null {
      const hit = exact.get(`${modelId}|${tickerClass}|${regime}`);
      if (hit) return shrink(hit.hit, hit.n);
      const agg = byModel.get(modelId);
      if (agg && agg.n >= 10) return shrink(agg.wins / agg.n, agg.n);
      return null;
    },
  };
}

// ── Calibration / learning health ───────────────────────────────────

export interface CalibrationRow {
  alpha: number;
  beta: number;
  gamma: number;
  n_samples: number;
  brier_score: number;
  fit_at: string | null;
}

export interface LearningHealth {
  calibration: {
    alpha: number;
    beta: number;
    gamma: number;
    nSamples: number;
    brierScore: number;
    fitAt: string | null;
  };
  reputationCells: number;
  /** Brier ≥ 0.28 on a real sample means the calibrated probabilities have
   *  drifted from realized hit rates — surfaced so users see degradation. */
  drift: "healthy" | "degrading" | "unfit";
}

export const DEFAULT_LEARNING_HEALTH: LearningHealth = {
  calibration: { alpha: 3.2, beta: 1.4, gamma: -0.7, nSamples: 0, brierScore: 0.25, fitAt: null },
  reputationCells: 0,
  drift: "unfit",
};

export function buildLearningHealth(row: CalibrationRow | null, reputationCells: number): LearningHealth {
  if (!row) return { ...DEFAULT_LEARNING_HEALTH, reputationCells };
  const nSamples = Number(row.n_samples) || 0;
  const brier = Number(row.brier_score) || 0.25;
  return {
    calibration: {
      alpha: Number(row.alpha) || 3.2,
      beta: Number(row.beta) || 1.4,
      gamma: Number(row.gamma) ?? -0.7,
      nSamples,
      brierScore: brier,
      fitAt: row.fit_at ? String(row.fit_at) : null,
    },
    reputationCells,
    drift: nSamples < 30 ? "unfit" : brier >= 0.28 ? "degrading" : "healthy",
  };
}
