# StatArb Intelligence Layer — Full Build

**Contract**
- Hybrid: heavy compute (cointegration, HMM training over price history) on the server; OU bands, Monte Carlo sampling, "Why this trade" narrative on the client.
- **Pure overlay**: never mutates `S_base`. Existing StatArb engine output is rendered alongside the new gated/scaled `S_final` and a count of suppressed trades.
- Probabilistic language only. No "guaranteed", no "always", no "risk-free".

---

## Phase 1 — Math foundations (client-side, `src/lib/statarb/`)

New pure-TS modules, unit-testable, zero UI:

- **`hmm.ts`** — 4-state Hidden Markov Model (mean-reverting / trending / volatile / structurally-broken). Gaussian emissions on log-returns + realized-vol features. Baum-Welch fit (server) + Viterbi decode (client). Outputs `regime_state`, `P(regime)`, `regime_stability_score` (entropy of last-N posterior).
- **`cointegration.ts`** — Engle-Granger two-step: OLS hedge ratio β, ADF on residuals, p-value lookup table. Returns `{ beta, isCointegrated, adfStat, pValue }`.
- **`ou.ts`** — fit Ornstein-Uhlenbeck via AR(1) regression. Outputs `theta` (speed), `mu` (equilibrium), `sigma_eq`, `halfLife = ln(2)/theta`, current `zScore`.
- **`mcRobustness.ts`** — N≈2000 spread paths under OU + vol shocks + slippage + execution lag. Outputs `pReversion`, `tailRisk5`, `drawdownDist`, `pathsP50/P5/P95`.
- **`signalCompose.ts`** — implements `S_final = S_base × Regime_Filter × Reversion_Confidence × MonteCarlo_Robustness` with explicit gates and a structured `why` object.
- **`killSwitch.ts`** — boolean predicates: regime===trending, cointegration broken, MC confidence < threshold, vol regime shift detected.

Vitest coverage for each module (synthetic series with known ground truth).

## Phase 2 — Server compute (`supabase/functions/statarb-intelligence/`)

Single edge function, JWT-protected. Input: pair of tickers + lookback. Pulls historical bars via existing `historical-prices`, runs:

1. Cointegration test on full window.
2. HMM Baum-Welch (50 iters) → emission params + transition matrix.
3. Returns serialized model + regime posterior to the client. Client does the cheap real-time work (Viterbi step, OU fit on rolling window, MC).

Cached 5 min per `(pairKey, lookback)` via `apiGovernor`.

## Phase 3 — Frontend hook (`src/hooks/useStatArbIntelligence.ts`)

Combines server model + client live computation. Exposes:
```ts
{ baseSignals, intelSignals, suppressed, regime, modelHealth, isLoading }
```
where `intelSignals[i]` carries `{ s_base, s_final, gates, why, halfLife, pReversion, tailRisk5, killReasons }`.

## Phase 4 — Decision Cockpit UI (`src/components/sandbox/StatArbEngine.tsx` overlay)

Add a new section "Intelligence Overlay" (does not replace existing view — pure overlay):

1. **Signal Card** — Trade Intent / Confidence / Regime / Time Horizon / Drivers / Risk Flags.
2. **Why-this-trade panel** — auto-generated narrative from the gates object.
3. **Kill-Switch banner** — red strip when active, lists reasons, shows count of suppressed trades.
4. **Regime chip strip** — current HMM state + stability score, colored.
5. **Suppressed-trades drawer** — list with reason chips so the user can audit what was filtered.

## Phase 5 — Visuals (`src/components/statarb/`)

Three new compact, semantic-token-based charts:

- **`OUBandChart.tsx`** — spread vs. equilibrium with ±1σ / ±2σ bands, current point.
- **`ProbabilityCone.tsx`** — Monte Carlo spread paths fan, P5/P50/P95 envelope.
- **`RegimeTimeline.tsx`** — last-N HMM states as colored ribbon with stability sparkline.

All charts: Recharts, semantic tokens only (`hsl(var(--gain))` etc.), responsive, no raw model dumps.

## Phase 6 — Learning loop (lightweight, local-first)

New table `statarb_outcomes` (user-scoped, RLS): `pair, regime_at_entry, s_final, expected_half_life, actual_outcome (reverted|did_not_revert|regime_flipped), pnl_bps, closed_at`. Auto-logged when a StatArb signal closes. New `LearningLoopPanel.tsx` shows win rate by regime + model-confidence vs realized accuracy.

## Phase 7 — UX polish

- Strip every certainty-language phrase from existing StatArb labels.
- Density: compact terminal-style cards, no indicator spam, every number has a tooltip explaining what it means.
- Mobile: cockpit stacks vertically; charts get `aspect-[16/9]`.

---

## What I will NOT touch
- Existing `S_base` computation in `StatArbEngine` / `useFutureGraphMachine` — overlay only.
- Currency / portfolio normalization layer.
- Other sandbox modules (Causal, Crown, Aftermath, etc.).

## Risks / open questions
- HMM convergence on short histories (<200 bars): show a `model-health = insufficient-history` chip and gate the overlay rather than emit weak signals.
- Cost of MC on every render: throttled to ~1/sec via `useDeferredValue` + batched in microtasks (target <30ms for 2000 paths).

## Execution order
On approval I'll execute **Phase 1 + 2 first** (math + server), then check in before Phase 3–7.
