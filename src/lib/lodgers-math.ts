/**
 * Lodgers Math
 * ─────────────
 * Pure, deterministic functions powering the Lodgers System / Intraday Compounding Mode.
 *
 * All inputs are real per-trade fingerprints; no fabricated data.
 * Conventions:
 *   - returns are arithmetic % (not log) since trades are short-horizon
 *   - σ here = stdev of trade-level returns
 *   - Sharpe annualized assuming ~252 trading days, scaled by avg trades/day
 */

export interface LodgerTrade {
  id?: string;
  ticker: string;
  side: "long" | "short";
  entry_ts: number;
  exit_ts: number;
  entry_px: number;
  exit_px: number;
  qty: number;
  pnl_pct: number;
  pnl_abs: number;
  expected_pct: number;
  expected_hold_min: number;
  actual_hold_min: number;
  regime: string;
  vol_at_entry: number;
  liquidity_score: number;
  reflex_score: number;
  exec_latency_ms: number;
  slippage_bps: number;
  realized_sharpe: number;
  divergence_pct: number;
  drawdown_elasticity: number;
  lesson?: string | null;
  tags?: string[];
  pattern_id?: string | null;
  created_at?: string;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
};

/** Rolling Sharpe over last N trades, annualized assuming `tradesPerDay` cadence. */
export function rollingSharpe(trades: LodgerTrade[], window = 30, tradesPerDay = 4): number {
  const recent = trades.slice(-window).map(t => t.pnl_pct / 100);
  if (recent.length < 3) return 0;
  const m = mean(recent);
  const s = stdev(recent);
  if (s === 0) return 0;
  // annualize: ~252 trading days × tradesPerDay observations
  return (m / s) * Math.sqrt(252 * Math.max(1, tradesPerDay));
}

export function rollingSortino(trades: LodgerTrade[], window = 30, tradesPerDay = 4): number {
  const recent = trades.slice(-window).map(t => t.pnl_pct / 100);
  if (recent.length < 3) return 0;
  const m = mean(recent);
  const downside = recent.filter(r => r < 0);
  if (downside.length === 0) return m > 0 ? 5 : 0;
  const dStd = Math.sqrt(mean(downside.map(d => d * d)));
  if (dStd === 0) return 0;
  return (m / dStd) * Math.sqrt(252 * Math.max(1, tradesPerDay));
}

/**
 * Drawdown elasticity = how quickly equity recovers from local peak draws.
 * Higher = more elastic / resilient. Range roughly [0, 1].
 */
export function drawdownElasticity(trades: LodgerTrade[]): number {
  if (trades.length < 5) return 0;
  let equity = 1;
  let peak = 1;
  let drawSum = 0;
  let recoverySum = 0;
  let inDraw = false;
  let drawDepth = 0;
  let drawTrades = 0;
  let recoveryTrades = 0;
  for (const t of trades) {
    equity *= 1 + t.pnl_pct / 100;
    if (equity > peak) {
      if (inDraw && drawDepth > 0) {
        drawSum += drawDepth;
        recoverySum += Math.max(1, recoveryTrades);
      }
      peak = equity;
      inDraw = false;
      drawDepth = 0;
      drawTrades = 0;
      recoveryTrades = 0;
    } else {
      const dd = (peak - equity) / peak;
      if (dd > drawDepth) drawDepth = dd;
      inDraw = true;
      drawTrades++;
      recoveryTrades++;
    }
  }
  if (drawSum === 0) return 0.85;
  // elasticity ~ avg drawdown depth / avg trades-to-recover, normalized
  const ratio = drawSum / Math.max(1, recoverySum);
  return Math.max(0, Math.min(1, 1 - ratio * 8));
}

/**
 * Edge decay regression: realized_return ~ a − b·log(1 + hold_min)
 * Returns { a, b, optimalHold } where optimalHold = argmax of fitted curve clipped to observed range.
 */
export function edgeDecayFit(trades: LodgerTrade[]): { a: number; b: number; optimalHold: number; rSquared: number } {
  const pts = trades
    .filter(t => t.actual_hold_min > 0 && Number.isFinite(t.pnl_pct))
    .map(t => ({ x: Math.log(1 + t.actual_hold_min), y: t.pnl_pct }));
  if (pts.length < 5) return { a: 0, b: 0, optimalHold: 15, rSquared: 0 };
  const xs = pts.map(p => p.x);
  const ys = pts.map(p => p.y);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0, den = 0;
  for (let i = 0; i < pts.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  // r² on the regression
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  let ssRes = 0;
  for (let i = 0; i < pts.length; i++) {
    const yh = intercept + slope * xs[i];
    ssRes += (ys[i] - yh) ** 2;
  }
  const rSquared = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  // optimal hold: if slope < 0 → shortest holds win → recommend 25th percentile of observed
  // if slope > 0 → longer holds win → recommend 75th percentile
  const holds = trades.map(t => t.actual_hold_min).filter(h => h > 0).sort((a, b) => a - b);
  const q = (p: number) => holds[Math.max(0, Math.min(holds.length - 1, Math.floor(p * holds.length)))] || 15;
  const optimalHold = slope < 0 ? q(0.25) : slope > 0 ? q(0.75) : q(0.5);
  return { a: intercept, b: -slope, optimalHold, rSquared };
}

/** Build a histogram of hold-time minutes. */
export function holdTimeHistogram(trades: LodgerTrade[], buckets = 8): { range: string; count: number; midMin: number; avgPnl: number }[] {
  const holds = trades.filter(t => t.actual_hold_min > 0);
  if (holds.length === 0) return [];
  const max = Math.max(...holds.map(t => t.actual_hold_min));
  const step = Math.max(1, max / buckets);
  const out: { range: string; count: number; midMin: number; avgPnl: number; _pnls: number[] }[] = [];
  for (let i = 0; i < buckets; i++) {
    const lo = i * step;
    const hi = (i + 1) * step;
    out.push({ range: `${Math.round(lo)}–${Math.round(hi)}m`, count: 0, midMin: (lo + hi) / 2, avgPnl: 0, _pnls: [] });
  }
  for (const t of holds) {
    const idx = Math.min(buckets - 1, Math.floor(t.actual_hold_min / step));
    out[idx].count++;
    out[idx]._pnls.push(t.pnl_pct);
  }
  return out.map(b => ({ range: b.range, count: b.count, midMin: b.midMin, avgPnl: mean(b._pnls) }));
}

/**
 * Overtrading inflection: bin trades by "trades that day" and compute avg pnl per bin.
 * Returns the trades-per-day value where avg pnl flips negative (or marginal).
 */
export function overtradingInflection(trades: LodgerTrade[]): { byCount: { tradesPerDay: number; avgPnl: number; n: number }[]; inflection: number } {
  if (trades.length === 0) return { byCount: [], inflection: 0 };
  // group by date
  const byDay: Record<string, LodgerTrade[]> = {};
  for (const t of trades) {
    const d = new Date(t.entry_ts).toISOString().slice(0, 10);
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(t);
  }
  const byCountMap: Record<number, number[]> = {};
  for (const day of Object.keys(byDay)) {
    const ts = byDay[day];
    const cnt = ts.length;
    if (!byCountMap[cnt]) byCountMap[cnt] = [];
    for (const t of ts) byCountMap[cnt].push(t.pnl_pct);
  }
  const byCount = Object.keys(byCountMap)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(k => ({ tradesPerDay: k, avgPnl: mean(byCountMap[k]), n: byCountMap[k].length }));
  // inflection = first count where avgPnl ≤ 0 after a positive count
  let inflection = 0;
  let sawPositive = false;
  for (const row of byCount) {
    if (row.avgPnl > 0) sawPositive = true;
    else if (sawPositive && row.avgPnl <= 0) {
      inflection = row.tradesPerDay;
      break;
    }
  }
  if (inflection === 0 && byCount.length > 0) {
    // fallback: last count
    inflection = byCount[byCount.length - 1].tradesPerDay + 1;
  }
  return { byCount, inflection };
}

/** Compounding equity curve (multiplicative). Returns base 100 series. */
export function compoundingEquity(trades: LodgerTrade[]): { idx: number; equity: number; date: string }[] {
  const out: { idx: number; equity: number; date: string }[] = [];
  let eq = 100;
  trades.forEach((t, i) => {
    eq *= 1 + t.pnl_pct / 100;
    out.push({ idx: i + 1, equity: Math.round(eq * 100) / 100, date: new Date(t.exit_ts || t.entry_ts).toISOString().slice(0, 10) });
  });
  return out;
}

/**
 * Daily compounding curve targets — base 100, per trading day.
 * Returns `target1`, `target2`, `ruin` envelopes for next `days` days from base 100.
 */
export function targetEnvelopes(days: number, baseEquity = 100): { day: number; target1: number; target2: number; ruin: number }[] {
  const out: { day: number; target1: number; target2: number; ruin: number }[] = [];
  for (let d = 0; d <= days; d++) {
    out.push({
      day: d,
      target1: Math.round(baseEquity * 1.01 ** d * 100) / 100,
      target2: Math.round(baseEquity * 1.02 ** d * 100) / 100,
      ruin: Math.round(baseEquity * 0.99 ** d * 100) / 100,
    });
  }
  return out;
}

/**
 * Kelly-capped sizing under a daily-loss budget.
 *   pHit       — probability the trade hits its target (from sim)
 *   payoff     — expected return % if hit
 *   loss       — expected loss % if it fails (positive number)
 *   capital    — account capital (in any currency, used proportionally)
 *   stopPct    — distance to stop in %
 *   dailyBudget— remaining daily-loss tolerance in % of capital
 *   scarPenalty— 0..1 reduction from ScarMemory
 */
export function kellySize(opts: {
  pHit: number;
  payoff: number;
  loss: number;
  capital: number;
  stopPct: number;
  dailyBudgetPct: number;
  scarPenalty: number;
}): { sizePct: number; capitalAtRisk: number; reasoning: string } {
  const { pHit, payoff, loss, capital, stopPct, dailyBudgetPct, scarPenalty } = opts;
  const b = Math.max(0.01, payoff / Math.max(0.01, loss)); // payoff:loss ratio
  const p = Math.max(0, Math.min(1, pHit));
  const q = 1 - p;
  const kellyRaw = (b * p - q) / b;
  const kellyFraction = Math.max(0, kellyRaw) * 0.25; // quarter-Kelly
  // budget cap: position can lose at most (dailyBudget / stopPct) of capital
  const budgetCap = stopPct > 0 ? dailyBudgetPct / stopPct : 0;
  const scarCap = 1 - Math.max(0, Math.min(0.5, scarPenalty));
  const sizePct = Math.max(0, Math.min(kellyFraction, budgetCap, 0.25)) * scarCap;
  const capitalAtRisk = capital * sizePct;
  let reasoning = "";
  if (sizePct === 0) reasoning = "Kelly negative — edge insufficient.";
  else if (sizePct === budgetCap * scarCap) reasoning = "Capped by remaining daily-loss budget.";
  else if (scarPenalty > 0.1) reasoning = `Quarter-Kelly with ${(scarPenalty * 100).toFixed(0)}% scar penalty.`;
  else reasoning = "Quarter-Kelly within budget.";
  return { sizePct, capitalAtRisk, reasoning };
}

/**
 * Discipline Governor — soft circuit breakers.
 * Returns blocked=true when entries should be paused.
 */
export function disciplineState(trades: LodgerTrade[], opts: {
  dailyLossCapPct: number;       // e.g. 2 (=2% of capital)
  consecutiveLossLimit: number;  // e.g. 3
  overtradeLimit: number;        // trades-per-day inflection
  postWinCooloffMin: number;     // minutes to cool off after a winning trade
}): {
  blocked: boolean;
  reasons: string[];
  todayPnlPct: number;
  todayCount: number;
  consecutiveLosses: number;
  residualBudgetPct: number;
  postWinCoolingUntil: number | null;
} {
  const today = new Date().toISOString().slice(0, 10);
  const todayTrades = trades.filter(t => new Date(t.entry_ts).toISOString().slice(0, 10) === today);
  const todayPnlPct = todayTrades.reduce((s, t) => s + t.pnl_pct, 0);
  const todayCount = todayTrades.length;
  // consecutive losses (from end)
  let consecutiveLosses = 0;
  for (let i = trades.length - 1; i >= 0; i--) {
    if (trades[i].pnl_pct < 0) consecutiveLosses++;
    else break;
  }
  const reasons: string[] = [];
  let blocked = false;
  if (todayPnlPct <= -opts.dailyLossCapPct) {
    blocked = true;
    reasons.push(`Daily loss cap hit (${todayPnlPct.toFixed(2)}% ≤ −${opts.dailyLossCapPct}%).`);
  }
  if (consecutiveLosses >= opts.consecutiveLossLimit) {
    blocked = true;
    reasons.push(`${consecutiveLosses} consecutive losses — cool-off active.`);
  }
  if (todayCount >= opts.overtradeLimit && opts.overtradeLimit > 0) {
    blocked = true;
    reasons.push(`Overtrade lockout (${todayCount} ≥ ${opts.overtradeLimit} inflection).`);
  }
  // post-win cool-off: last trade was a win in the last N minutes
  let postWinCoolingUntil: number | null = null;
  if (trades.length > 0) {
    const last = trades[trades.length - 1];
    if (last.pnl_pct > 0 && opts.postWinCooloffMin > 0) {
      const until = (last.exit_ts || last.entry_ts) + opts.postWinCooloffMin * 60_000;
      if (Date.now() < until) {
        postWinCoolingUntil = until;
        const remaining = Math.ceil((until - Date.now()) / 60_000);
        reasons.push(`Post-win cool-off: ${remaining}m remaining.`);
        // soft, not blocking — keep as advisory
      }
    }
  }
  const residualBudgetPct = Math.max(0, opts.dailyLossCapPct + Math.min(0, todayPnlPct));
  return { blocked, reasons, todayPnlPct, todayCount, consecutiveLosses, residualBudgetPct, postWinCoolingUntil };
}

/**
 * Probability the day hits 1–2% target band given today's drift μ_d, vol σ_d,
 * trades remaining n_left and historical edge.
 * Uses a simple normal approximation of cumulative daily returns.
 */
export function dailyTargetProbability(opts: {
  todayPnlPct: number;
  avgPnlPerTrade: number;       // historical, %
  sigmaPerTrade: number;        // historical, %
  tradesRemaining: number;
}): { pHitMin: number; pHitMax: number; pRuin: number; expected: number } {
  const { todayPnlPct, avgPnlPerTrade, sigmaPerTrade, tradesRemaining } = opts;
  if (tradesRemaining <= 0) {
    const inBand = todayPnlPct >= 1 && todayPnlPct <= 2;
    return { pHitMin: inBand ? 1 : 0, pHitMax: inBand ? 1 : 0, pRuin: todayPnlPct <= -2 ? 1 : 0, expected: todayPnlPct };
  }
  const expectedAdd = avgPnlPerTrade * tradesRemaining;
  const sigmaTotal = sigmaPerTrade * Math.sqrt(tradesRemaining);
  const expected = todayPnlPct + expectedAdd;
  const phi = (z: number) => {
    // normal CDF approximation (Abramowitz-Stegun)
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const sign = z < 0 ? -1 : 1;
    const x = Math.abs(z) / Math.SQRT2;
    const t = 1 / (1 + p * x);
    const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 + sign * y);
  };
  const z = (target: number) => sigmaTotal === 0 ? 0 : (target - expected) / sigmaTotal;
  const pHitMin = Math.max(0, Math.min(1, 1 - phi(z(1.0))));
  const pHitMax = Math.max(0, Math.min(1, 1 - phi(z(2.0))));
  const pRuin = Math.max(0, Math.min(1, phi(z(-2.0))));
  return { pHitMin, pHitMax, pRuin, expected };
}