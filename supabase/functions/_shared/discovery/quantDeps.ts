// Deno twin of the two audited quant helpers the discovery library needs.
// Copied verbatim in behaviour from src/lib/quant/{validation,calibration}.ts
// so the browser and the edge produce identical numbers.

export interface BetaState { alpha: number; beta: number; }

/** Decayed Beta-Bernoulli update. lambda<1 forgets old regimes. */
export function betaUpdate(state: BetaState, y: number, lambda = 0.98): BetaState {
  const yc = Math.min(Math.max(y, 0), 1);
  return { alpha: lambda * state.alpha + yc, beta: lambda * state.beta + (1 - yc) };
}

export function betaMean(state: BetaState): number {
  const d = state.alpha + state.beta;
  return d > 0 ? state.alpha / d : 0.5;
}

/** Benjamini-Hochberg step-up rejection mask at FDR level q. */
export function benjaminiHochberg(pValues: number[], q = 0.1): boolean[] {
  const n = pValues.length;
  if (n === 0) return [];
  const order = pValues.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  let kMax = -1;
  for (let k = 0; k < n; k++) {
    if (order[k][0] <= ((k + 1) / n) * q) kMax = k;
  }
  const rejected = new Array<boolean>(n).fill(false);
  for (let k = 0; k <= kMax; k++) rejected[order[k][1]] = true;
  return rejected;
}
