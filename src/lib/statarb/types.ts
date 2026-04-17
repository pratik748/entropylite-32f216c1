/**
 * Shared types for the StatArb Intelligence Layer.
 * Pure types — no runtime dependencies.
 */

export type RegimeState = "mean-reverting" | "trending" | "volatile" | "broken";

export interface RegimePosterior {
  /** Most likely current state. */
  state: RegimeState;
  /** Posterior probability for each of the 4 states (sums to 1). */
  probabilities: Record<RegimeState, number>;
  /** 0..1 — 1 means current state has been stable; 0 means high entropy / flipping. */
  stability: number;
}

export interface CointegrationResult {
  /** OLS hedge ratio: y ≈ alpha + beta * x. */
  beta: number;
  alpha: number;
  /** Augmented Dickey-Fuller test statistic on residuals. */
  adfStat: number;
  /** Approximate p-value from MacKinnon critical-value lookup. */
  pValue: number;
  /** True if pValue < 0.05 (95% confidence cointegrated). */
  isCointegrated: boolean;
  /** Residual series (the spread). */
  residuals: number[];
}

export interface OUParameters {
  /** Mean-reversion speed. */
  theta: number;
  /** Long-term equilibrium of the spread. */
  mu: number;
  /** Stationary standard deviation of the spread. */
  sigmaEq: number;
  /** ln(2) / theta, in the same units as the input series. */
  halfLife: number;
  /** Vol-adjusted distance from equilibrium for the most recent point. */
  zScore: number;
  /** True if AR(1) coefficient is in (0, 1) and statistically reasonable. */
  isStationary: boolean;
}

export interface MCRobustness {
  /** Probability the spread crosses the equilibrium within the horizon. */
  pReversion: number;
  /** 5th percentile P&L (most adverse 5% of paths), expressed as fraction of |entry spread|. */
  tailRisk5: number;
  /** Expected max drawdown across all paths, fraction of |entry spread|. */
  expectedMaxDD: number;
  /** Path quantiles for visualisation. */
  pathsP5: number[];
  pathsP50: number[];
  pathsP95: number[];
}

export interface KillSwitchVerdict {
  active: boolean;
  reasons: string[];
}

export interface SignalGates {
  regimeFilter: number;          // 0..1
  reversionConfidence: number;   // 0..1
  monteCarloRobustness: number;  // 0..1
}

export interface IntelSignal {
  /** Untouched base signal in [-1, 1]. */
  sBase: number;
  /** Final scaled signal in [-1, 1]. NEVER overrides — only scales/gates. */
  sFinal: number;
  gates: SignalGates;
  /** Structured rationale fragments — UI composes the narrative. */
  why: {
    spreadDeviation: string;
    regimeAlignment: string;
    monteCarloConfidence: string;
    tailRisk: string;
  };
  halfLife: number;
  pReversion: number;
  tailRisk5: number;
  killSwitch: KillSwitchVerdict;
}

export interface ModelHealth {
  /** false → not enough history to fit reliably. */
  ready: boolean;
  /** Human-readable status: "ok" | "insufficient-history" | "stale-model" | "..." */
  status: string;
  /** Number of bars used to fit. */
  fitBars: number;
}
