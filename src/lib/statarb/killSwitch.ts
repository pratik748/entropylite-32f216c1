/**
 * Kill-switch: gates trades that would fail in regimes the engine cannot
 * skill. Runs against the composed inputs — never the base signal — so
 * it's a pure overlay.
 */
import type {
  CointegrationResult,
  MCRobustness,
  OUParameters,
  RegimePosterior,
  KillSwitchVerdict,
} from "./types";

export interface KillSwitchInputs {
  cointegration: CointegrationResult;
  ou: OUParameters;
  mc: MCRobustness;
  regime: RegimePosterior;
  /** Δ in realised vol vs prior window, in vol-units (e.g. 0.5 = +50% vol). */
  volRegimeDelta?: number;
  /** Minimum acceptable MC reversion probability. Default 0.55. */
  minMcConfidence?: number;
}

export function evaluateKillSwitch(input: KillSwitchInputs): KillSwitchVerdict {
  const reasons: string[] = [];
  const minMc = input.minMcConfidence ?? 0.55;

  if (input.regime.state === "trending") {
    reasons.push("Regime is trending — mean-reversion edge is weak.");
  }
  if (input.regime.state === "broken") {
    reasons.push("Regime classified as structurally broken — relationship may be impaired.");
  }
  if (!input.cointegration.isCointegrated) {
    reasons.push(
      `Cointegration not significant (p=${input.cointegration.pValue.toFixed(2)}) — pair may have separated.`,
    );
  }
  if (!input.ou.isStationary) {
    reasons.push("OU fit non-stationary — half-life undefined or exceeds window.");
  } else if (input.ou.halfLife > 30) {
    reasons.push(`Half-life ${input.ou.halfLife.toFixed(1)}d exceeds typical execution window.`);
  }
  if (input.mc.pReversion < minMc) {
    reasons.push(
      `Monte Carlo reversion probability ${(input.mc.pReversion * 100).toFixed(0)}% below ${(minMc * 100).toFixed(0)}% threshold.`,
    );
  }
  if ((input.volRegimeDelta ?? 0) > 0.5) {
    reasons.push("Volatility regime has shifted materially — model assumptions may be stale.");
  }

  return { active: reasons.length > 0, reasons };
}
