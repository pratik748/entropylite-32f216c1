/**
 * Non-destructive signal composition.
 *
 *     S_final = S_base × Regime_Filter × Reversion_Confidence × MonteCarlo_Robustness
 *
 * S_base is NEVER mutated. Each filter is in [0, 1] and only attenuates
 * (or hard-zeros via the kill-switch) the base signal.
 */
import type {
  IntelSignal,
  CointegrationResult,
  OUParameters,
  MCRobustness,
  RegimePosterior,
} from "./types";
import { evaluateKillSwitch, type KillSwitchInputs } from "./killSwitch";

export interface ComposeInputs {
  sBase: number; // in [-1, 1]
  cointegration: CointegrationResult;
  ou: OUParameters;
  mc: MCRobustness;
  regime: RegimePosterior;
  volRegimeDelta?: number;
}

/** Map regime state → multiplier on the base signal (probabilistic gate). */
function regimeMultiplier(regime: RegimePosterior): number {
  // Weight by posterior so a 60/40 mean-reverting/trending split scales smoothly.
  const mr = regime.probabilities["mean-reverting"];
  const tr = regime.probabilities.trending;
  const vo = regime.probabilities.volatile;
  const br = regime.probabilities.broken;
  // Mean-reverting helps, trending hurts, volatile partly, broken zeros.
  const raw = 1.0 * mr + 0.2 * tr + 0.5 * vo + 0.0 * br;
  // Stability boost
  return Math.max(0, Math.min(1, raw * (0.6 + 0.4 * regime.stability)));
}

/** Reversion-confidence multiplier from OU + cointegration. */
function reversionMultiplier(ou: OUParameters, coint: CointegrationResult): number {
  if (!ou.isStationary || !coint.isCointegrated) return 0;
  const zStrength = Math.min(1, Math.abs(ou.zScore) / 2.5); // saturates at |z|=2.5
  const halfLifeFit = ou.halfLife > 0 && ou.halfLife <= 20 ? 1 : Math.max(0, 1 - (ou.halfLife - 20) / 20);
  return Math.max(0, Math.min(1, zStrength * halfLifeFit));
}

/** Monte Carlo robustness multiplier. */
function mcMultiplier(mc: MCRobustness): number {
  const conf = Math.max(0, Math.min(1, mc.pReversion));
  const tailPenalty = Math.max(0, 1 - mc.tailRisk5); // tailRisk5 already a fraction
  return Math.max(0, Math.min(1, conf * tailPenalty));
}

export function composeSignal(input: ComposeInputs): IntelSignal {
  const regimeFilter = regimeMultiplier(input.regime);
  const reversionConfidence = reversionMultiplier(input.ou, input.cointegration);
  const monteCarloRobustness = mcMultiplier(input.mc);

  const killInputs: KillSwitchInputs = {
    cointegration: input.cointegration,
    ou: input.ou,
    mc: input.mc,
    regime: input.regime,
    volRegimeDelta: input.volRegimeDelta,
  };
  const killSwitch = evaluateKillSwitch(killInputs);

  const composite = regimeFilter * reversionConfidence * monteCarloRobustness;
  const sFinal = killSwitch.active ? 0 : input.sBase * composite;

  return {
    sBase: input.sBase,
    sFinal,
    gates: { regimeFilter, reversionConfidence, monteCarloRobustness },
    why: {
      spreadDeviation: `Spread is ${Math.abs(input.ou.zScore).toFixed(2)}σ from equilibrium.`,
      regimeAlignment: `Current regime: ${input.regime.state} (stability ${(input.regime.stability * 100).toFixed(0)}%).`,
      monteCarloConfidence: `${(input.mc.pReversion * 100).toFixed(0)}% probability of reversion within the simulated horizon.`,
      tailRisk: `Tail risk (5% worst case) ≈ ${(input.mc.tailRisk5 * 100).toFixed(1)}% of entry distance; expected max DD ≈ ${(input.mc.expectedMaxDD * 100).toFixed(1)}%.`,
    },
    halfLife: input.ou.halfLife,
    pReversion: input.mc.pReversion,
    tailRisk5: input.mc.tailRisk5,
    killSwitch,
  };
}
