/**
 * Monte Carlo robustness check on an OU spread under realistic frictions:
 * volatility shocks, slippage, and execution lag.
 *
 * Returns reversion probability, tail risk, drawdown distribution,
 * and quantile envelopes for the probability cone.
 */
import type { OUParameters, MCRobustness } from "./types";

function gaussian(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export interface MCConfig {
  paths?: number;          // default 2000
  horizon?: number;        // bars to simulate, default 30
  volShockProb?: number;   // per-bar prob of a vol jump, default 0.03
  volShockMult?: number;   // multiplier on σ when shock fires, default 2.0
  slippageBps?: number;    // bps subtracted from each path's terminal P&L, default 5
  executionLagBars?: number; // bars to skip before "entry" effective, default 1
}

export function runMCRobustness(
  spread: number[],
  ou: OUParameters,
  cfg: MCConfig = {},
): MCRobustness {
  const paths = cfg.paths ?? 2000;
  const horizon = cfg.horizon ?? 30;
  const volShockProb = cfg.volShockProb ?? 0.03;
  const volShockMult = cfg.volShockMult ?? 2.0;
  const slippage = (cfg.slippageBps ?? 5) / 10_000;
  const lag = Math.max(0, cfg.executionLagBars ?? 1);

  if (spread.length === 0 || ou.sigmaEq <= 0 || !ou.isStationary) {
    return {
      pReversion: 0,
      tailRisk5: 0,
      expectedMaxDD: 0,
      pathsP5: new Array(horizon).fill(0),
      pathsP50: new Array(horizon).fill(0),
      pathsP95: new Array(horizon).fill(0),
    };
  }

  const x0 = spread[spread.length - 1];
  const direction = x0 > ou.mu ? -1 : 1; // expected reversion direction
  const entryDistance = Math.abs(x0 - ou.mu) || ou.sigmaEq * 0.1;

  // Discrete OU step constants
  const b = Math.exp(-ou.theta);
  const a = ou.mu * (1 - b);
  // Variance of one-step shock
  const stepVar = (ou.sigmaEq * ou.sigmaEq) * (1 - b * b);
  const stepStd = Math.sqrt(Math.max(0, stepVar));

  let reverted = 0;
  const tailPnL: number[] = [];
  const drawdowns: number[] = [];
  const allPaths: number[][] = [];

  for (let p = 0; p < paths; p++) {
    let x = x0;
    let entered = false;
    let entryPrice = x0;
    let pnl = 0;
    let peak = 0;
    let maxDD = 0;
    const path = new Array(horizon).fill(x);

    for (let t = 0; t < horizon; t++) {
      const sigma = stepStd * (Math.random() < volShockProb ? volShockMult : 1);
      x = a + b * x + sigma * gaussian();
      path[t] = x;

      if (!entered && t >= lag) {
        entered = true;
        entryPrice = x;
      }
      if (entered) {
        // P&L of a long-spread (direction = +1) or short-spread (direction = -1) position
        pnl = direction * (x - entryPrice) - slippage * Math.abs(entryDistance);
        if (pnl > peak) peak = pnl;
        const dd = peak - pnl;
        if (dd > maxDD) maxDD = dd;
        // Reversion event: spread crosses equilibrium
        if ((x0 > ou.mu && x <= ou.mu) || (x0 < ou.mu && x >= ou.mu)) {
          reverted++;
          break;
        }
      }
    }

    tailPnL.push(pnl);
    drawdowns.push(maxDD / entryDistance);
    allPaths.push(path);
  }

  const sortedPnL = [...tailPnL].sort((a, b) => a - b);
  const tailRisk5 = -percentile(sortedPnL, 5) / entryDistance; // positive = bad
  const expectedMaxDD =
    drawdowns.reduce((s, v) => s + v, 0) / Math.max(1, drawdowns.length);

  // Quantile envelopes per bar
  const pathsP5: number[] = [];
  const pathsP50: number[] = [];
  const pathsP95: number[] = [];
  for (let t = 0; t < horizon; t++) {
    const slice = allPaths.map((p) => p[t]).sort((a, b) => a - b);
    pathsP5.push(percentile(slice, 5));
    pathsP50.push(percentile(slice, 50));
    pathsP95.push(percentile(slice, 95));
  }

  return {
    pReversion: reverted / paths,
    tailRisk5,
    expectedMaxDD,
    pathsP5,
    pathsP50,
    pathsP95,
  };
}
