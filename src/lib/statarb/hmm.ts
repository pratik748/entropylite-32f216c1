/**
 * 4-state Hidden Markov Model for regime detection.
 * States: mean-reverting | trending | volatile | broken
 * Emissions: 2-D Gaussian on (log-return, realised-vol).
 *
 * Server runs Baum-Welch (training); client runs the forward-filter and
 * Viterbi decode for live updates (cheap, O(N · K²) per step).
 */
import type { RegimeState, RegimePosterior } from "./types";

export const REGIMES: RegimeState[] = ["mean-reverting", "trending", "volatile", "broken"];

export interface HMMModel {
  /** π — initial state distribution. */
  initial: number[];
  /** A — K×K transition matrix. */
  transitions: number[][];
  /** Per-state emission means [K][2]. */
  emissionMeans: number[][];
  /** Per-state emission std-devs [K][2] (diagonal covariance). */
  emissionStds: number[][];
}

const EPS = 1e-12;

function gaussianPdf(x: number, mu: number, sigma: number): number {
  const s = Math.max(sigma, 1e-6);
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
}

function emissionProb(model: HMMModel, k: number, obs: [number, number]): number {
  return (
    gaussianPdf(obs[0], model.emissionMeans[k][0], model.emissionStds[k][0]) *
    gaussianPdf(obs[1], model.emissionMeans[k][1], model.emissionStds[k][1])
  );
}

/** Build the 2-D observation series (log-return, rolling 10-bar realised vol). */
export function buildObservations(prices: number[], volWindow = 10): [number, number][] {
  const out: [number, number][] = [];
  if (prices.length < volWindow + 2) return out;
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    rets.push(Math.log(prices[i] / prices[i - 1]));
  }
  for (let i = volWindow; i < rets.length; i++) {
    const win = rets.slice(i - volWindow, i);
    const m = win.reduce((s, v) => s + v, 0) / win.length;
    const v = win.reduce((s, x) => s + (x - m) ** 2, 0) / win.length;
    out.push([rets[i], Math.sqrt(v)]);
  }
  return out;
}

/**
 * Sensible default model when there is no fitted one yet — built from
 * empirical means/stds. Lets the client compute a posterior even before
 * the server returns.
 */
export function defaultModel(observations: [number, number][]): HMMModel {
  const n = Math.max(1, observations.length);
  const meanRet = observations.reduce((s, o) => s + o[0], 0) / n;
  const meanVol = observations.reduce((s, o) => s + o[1], 0) / n;
  const stdRet = Math.sqrt(
    observations.reduce((s, o) => s + (o[0] - meanRet) ** 2, 0) / n,
  ) || 0.01;
  const stdVol = Math.sqrt(
    observations.reduce((s, o) => s + (o[1] - meanVol) ** 2, 0) / n,
  ) || 0.005;
  return {
    initial: [0.4, 0.3, 0.2, 0.1],
    transitions: [
      [0.85, 0.07, 0.05, 0.03],
      [0.07, 0.85, 0.05, 0.03],
      [0.10, 0.10, 0.75, 0.05],
      [0.05, 0.05, 0.10, 0.80],
    ],
    emissionMeans: [
      [meanRet * 0.2,        meanVol * 0.6],  // mean-reverting: low drift, low vol
      [meanRet * 1.5,        meanVol * 0.9],  // trending:       higher drift
      [meanRet,              meanVol * 1.6],  // volatile:       high vol
      [meanRet - 2 * stdRet, meanVol * 2.4],  // broken:         tail / regime shift
    ],
    emissionStds: [
      [stdRet * 0.6, stdVol * 0.6],
      [stdRet * 1.0, stdVol * 0.8],
      [stdRet * 1.4, stdVol * 1.2],
      [stdRet * 2.0, stdVol * 1.8],
    ],
  };
}

/** Forward-filter: returns scaled α[t][k] = P(state_t = k | obs_1..t). */
export function forward(model: HMMModel, obs: [number, number][]): number[][] {
  const T = obs.length;
  const K = REGIMES.length;
  const alpha: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));
  if (T === 0) return alpha;

  // Init
  for (let k = 0; k < K; k++) {
    alpha[0][k] = model.initial[k] * emissionProb(model, k, obs[0]);
  }
  let s = alpha[0].reduce((a, b) => a + b, 0) || EPS;
  for (let k = 0; k < K; k++) alpha[0][k] /= s;

  // Recurse
  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let acc = 0;
      for (let j = 0; j < K; j++) acc += alpha[t - 1][j] * model.transitions[j][k];
      alpha[t][k] = acc * emissionProb(model, k, obs[t]);
    }
    s = alpha[t].reduce((a, b) => a + b, 0) || EPS;
    for (let k = 0; k < K; k++) alpha[t][k] /= s;
  }
  return alpha;
}

/** Viterbi: most-likely state path. */
export function viterbi(model: HMMModel, obs: [number, number][]): RegimeState[] {
  const T = obs.length;
  const K = REGIMES.length;
  if (T === 0) return [];
  const logA = model.transitions.map((row) => row.map((p) => Math.log(p + EPS)));
  const delta: number[][] = Array.from({ length: T }, () => new Array(K).fill(-Infinity));
  const psi: number[][] = Array.from({ length: T }, () => new Array(K).fill(0));

  for (let k = 0; k < K; k++) {
    delta[0][k] = Math.log(model.initial[k] + EPS) + Math.log(emissionProb(model, k, obs[0]) + EPS);
  }
  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let best = -Infinity, arg = 0;
      for (let j = 0; j < K; j++) {
        const v = delta[t - 1][j] + logA[j][k];
        if (v > best) { best = v; arg = j; }
      }
      delta[t][k] = best + Math.log(emissionProb(model, k, obs[t]) + EPS);
      psi[t][k] = arg;
    }
  }
  // Back-trace
  let last = 0, bestEnd = -Infinity;
  for (let k = 0; k < K; k++) if (delta[T - 1][k] > bestEnd) { bestEnd = delta[T - 1][k]; last = k; }
  const path: RegimeState[] = new Array(T);
  path[T - 1] = REGIMES[last];
  for (let t = T - 2; t >= 0; t--) {
    last = psi[t + 1][last];
    path[t] = REGIMES[last];
  }
  return path;
}

/**
 * Stability: 1 - normalised entropy of the latest posterior.
 * Returns a value in [0, 1] where 1 = single dominant state, 0 = uniform.
 */
function posteriorStability(p: number[]): number {
  const K = p.length;
  let h = 0;
  for (let k = 0; k < K; k++) if (p[k] > 0) h -= p[k] * Math.log(p[k]);
  const hMax = Math.log(K);
  return hMax > 0 ? 1 - h / hMax : 1;
}

/** Convenience: run the forward filter and return a typed posterior on the last step. */
export function decodeRegime(model: HMMModel, prices: number[]): RegimePosterior {
  const obs = buildObservations(prices);
  const alpha = forward(model, obs);
  if (alpha.length === 0) {
    return {
      state: "mean-reverting",
      probabilities: { "mean-reverting": 0.25, trending: 0.25, volatile: 0.25, broken: 0.25 },
      stability: 0,
    };
  }
  const last = alpha[alpha.length - 1];
  let bestK = 0;
  for (let k = 1; k < REGIMES.length; k++) if (last[k] > last[bestK]) bestK = k;
  const probs: Record<RegimeState, number> = {
    "mean-reverting": last[0],
    trending: last[1],
    volatile: last[2],
    broken: last[3],
  };
  return {
    state: REGIMES[bestK],
    probabilities: probs,
    stability: posteriorStability(last),
  };
}

/**
 * Baum-Welch EM training. Used by the server only; the client receives the
 * fitted model and reuses it. Caps iterations and uses scaling to stay
 * numerically stable.
 */
export function baumWelch(
  obs: [number, number][],
  iterations = 25,
  seed?: HMMModel,
): HMMModel {
  if (obs.length < 20) return seed ?? defaultModel(obs);
  let model = seed ?? defaultModel(obs);
  const K = REGIMES.length;
  const T = obs.length;

  for (let iter = 0; iter < iterations; iter++) {
    // ── Forward / backward (scaled) ──
    const c = new Array(T).fill(0);
    const alpha = Array.from({ length: T }, () => new Array(K).fill(0));
    const beta = Array.from({ length: T }, () => new Array(K).fill(0));

    for (let k = 0; k < K; k++) alpha[0][k] = model.initial[k] * emissionProb(model, k, obs[0]);
    c[0] = alpha[0].reduce((a, b) => a + b, 0) || EPS;
    for (let k = 0; k < K; k++) alpha[0][k] /= c[0];

    for (let t = 1; t < T; t++) {
      for (let k = 0; k < K; k++) {
        let acc = 0;
        for (let j = 0; j < K; j++) acc += alpha[t - 1][j] * model.transitions[j][k];
        alpha[t][k] = acc * emissionProb(model, k, obs[t]);
      }
      c[t] = alpha[t].reduce((a, b) => a + b, 0) || EPS;
      for (let k = 0; k < K; k++) alpha[t][k] /= c[t];
    }

    for (let k = 0; k < K; k++) beta[T - 1][k] = 1;
    for (let t = T - 2; t >= 0; t--) {
      for (let k = 0; k < K; k++) {
        let acc = 0;
        for (let j = 0; j < K; j++) {
          acc += model.transitions[k][j] * emissionProb(model, j, obs[t + 1]) * beta[t + 1][j];
        }
        beta[t][k] = acc / (c[t + 1] || EPS);
      }
    }

    // ── E-step: gamma, xi ──
    const gamma = Array.from({ length: T }, () => new Array(K).fill(0));
    const xiSum = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (let k = 0; k < K; k++) { gamma[t][k] = alpha[t][k] * beta[t][k]; s += gamma[t][k]; }
      if (s > 0) for (let k = 0; k < K; k++) gamma[t][k] /= s;
    }
    for (let t = 0; t < T - 1; t++) {
      let s = 0;
      const tmp = Array.from({ length: K }, () => new Array(K).fill(0));
      for (let i = 0; i < K; i++) {
        for (let j = 0; j < K; j++) {
          tmp[i][j] = alpha[t][i] * model.transitions[i][j] * emissionProb(model, j, obs[t + 1]) * beta[t + 1][j];
          s += tmp[i][j];
        }
      }
      if (s > 0) {
        for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xiSum[i][j] += tmp[i][j] / s;
      }
    }

    // ── M-step ──
    const newInitial = gamma[0].slice();
    const newTrans = Array.from({ length: K }, () => new Array(K).fill(0));
    const gammaSum = new Array(K).fill(0);
    for (let t = 0; t < T - 1; t++) for (let k = 0; k < K; k++) gammaSum[k] += gamma[t][k];
    for (let i = 0; i < K; i++) {
      const denom = gammaSum[i] || EPS;
      for (let j = 0; j < K; j++) newTrans[i][j] = xiSum[i][j] / denom;
    }
    const newMeans = Array.from({ length: K }, () => [0, 0]);
    const newStds = Array.from({ length: K }, () => [0, 0]);
    const fullGammaSum = new Array(K).fill(0);
    for (let t = 0; t < T; t++) for (let k = 0; k < K; k++) fullGammaSum[k] += gamma[t][k];
    for (let k = 0; k < K; k++) {
      const denom = fullGammaSum[k] || EPS;
      for (let t = 0; t < T; t++) {
        newMeans[k][0] += gamma[t][k] * obs[t][0];
        newMeans[k][1] += gamma[t][k] * obs[t][1];
      }
      newMeans[k][0] /= denom; newMeans[k][1] /= denom;
      for (let t = 0; t < T; t++) {
        newStds[k][0] += gamma[t][k] * (obs[t][0] - newMeans[k][0]) ** 2;
        newStds[k][1] += gamma[t][k] * (obs[t][1] - newMeans[k][1]) ** 2;
      }
      newStds[k][0] = Math.sqrt(Math.max(1e-10, newStds[k][0] / denom));
      newStds[k][1] = Math.sqrt(Math.max(1e-10, newStds[k][1] / denom));
    }

    model = { initial: newInitial, transitions: newTrans, emissionMeans: newMeans, emissionStds: newStds };
  }
  return model;
}
