# Discovery v2 — Implemented TRUTH Integrations

What actually shipped from the TRUTH → EntropyLite analysis
(`docs/TRUTH_TO_ENTROPYLITE_MAP.md`, spec in `docs/DISCOVERY_ENGINE_V2_SPEC.md`).
Everything below is implemented, tested (24 seeded tests in
`src/lib/discovery/discovery.test.ts`; full suite 94/94), lint- and
typecheck-clean.

## Decision table

| TRUTH concept | Verdict | Where |
|---|---|---|
| Simulation-grounded admission (§5.3) | ✅ shipped | `src/lib/discovery/admission.ts`, `supabase/functions/_shared/twrd/admission.ts`, wired into `twrd-ingest` |
| Sybil-resistant dedup + claim novelty (§6.2) | ✅ shipped | `src/lib/discovery/novelty.ts`, Deno twin in `_shared/twrd/admission.ts` |
| Epistemic momentum ∂T/∂t (§6.4) | ✅ shipped | `src/lib/discovery/momentum.ts` |
| Regime/change-point detection | ✅ shipped | `src/lib/discovery/changepoint.ts` (CUSUM + 3-state Gaussian HMM) |
| Truth-Crucible robustness (FSS over constraint-feasible futures) | ✅ shipped | `src/lib/discovery/robustness.ts` |
| Scan-level multiple-testing control (spec §2.3) | ✅ shipped | `robustness.ts` (`bhQValues`, `pRealFromScan`) |
| Opportunity Score (multiplicative gates, log-space) | ✅ shipped | `src/lib/discovery/scoring.ts` |
| Cascade vulnerability / load-bearing input (§11.1) | ✅ reduced | `scoring.ts` `bottleneck` output |
| Scar Memory consequence scoring (§8) | ✅ shipped (realized-outcome form) | `src/lib/discovery/learning.ts` + scar columns in migration |
| Per-(engine × regime) reliability | ✅ shipped | `learning.ts` + `engine_regime_stats` table |
| Aftermath k-order propagation (§11) | ✅ reduced to k≤2 | `src/lib/discovery/propagate.ts` + `asset_graph_edges` table |
| Causal discovery | ✅ replaced | PC algorithm **rejected** (faithfulness violated in markets); HAC lead–lag + FDR instead: `src/lib/discovery/leadlag.ts` |
| PC algorithm, Datalog TEL, polytope LP geodesics, Scar Resonance, Collective Scar Networks, POMDP planner, tensor networks, scaling laws, simulated ∂O/∂m, BOCPD | ❌ rejected | reasons in `TRUTH_TO_ENTROPYLITE_MAP.md` #10, #11, #13, #14, #16, #23, #25, #27, #29 |

## Files

### Created
```
src/lib/discovery/types.ts          shared interfaces
src/lib/discovery/changepoint.ts    robustZ, cusum, gaussianHMM (K-state, scaled Baum–Welch)
src/lib/discovery/admission.ts      admitBar, admitNumericClaim, DEFAULT_RELATION_BOUNDS
src/lib/discovery/novelty.ts        tokenSet, jaccard, claimNovelty, sybilDedup
src/lib/discovery/momentum.ts       epistemicMomentum (EW least-squares slope of T)
src/lib/discovery/leadlag.ts        grangerLite (Newey–West HAC), leadLagScan (BH-FDR gated)
src/lib/discovery/propagate.ts      propagateImpact (k-hop, ρ-attenuated, weight-floored)
src/lib/discovery/robustness.ts     bhQValues, pRealFromScan, futureSurvivalScore, regimeStability
src/lib/discovery/scoring.ts        blendForecasts, expectedEdge, payoffAsymmetry, timeliness,
                                    liquidityFactor, confidenceFactor, opportunityScore, publishGate
src/lib/discovery/learning.ts       newReliabilityCell, updateReliability, reliabilityEstimate,
                                    scarScore, shouldScar, quantileOf
src/lib/discovery/index.ts          barrel
src/lib/discovery/discovery.test.ts 24 deterministic tests (seeded mulberry32)
supabase/functions/_shared/twrd/admission.ts   Deno twin: admitClaim(s), sybilDedupEvidence
supabase/migrations/20260705093000_discovery_v2_foundation.sql
```

### Modified
```
supabase/functions/twrd-ingest/index.ts   admission gate + sybil dedup before scoreAndStore;
                                          response now reports rejected/rejectionReasons/evidenceDeduped
```

All `src/lib/discovery` modules are pure and dependency-free except two
imports from the audited quant library (`benjaminiHochberg` from
`quant/validation`, `betaUpdate`/`betaMean` from `quant/calibration`). They
run unchanged in browser, Web Worker, or (copied) Deno edge.

## Mathematics (one line each; formulas in the module headers)

- **Admission**: hard constraint gates (V(CR)=0 rejection) — price positivity,
  OHLC ordering, |log return| bounds, relation-pattern value bounds,
  future-timestamp rejection. No probability can override a hard constraint.
- **Sybil dedup**: Jaccard > 0.9 on token sets ⇒ one source in Noisy-OR
  agreement (syndication ≠ corroboration).
- **Epistemic momentum**: exponentially-weighted least-squares slope of TWRD
  score vs time (finite-difference, per the manuscript's own correction).
- **CUSUM**: Page's two-sided scheme on robust z (k=½σ, h=5σ — textbook
  ARL≈370 design). **HMM**: scaled Baum–Welch, states ordered by σ,
  `pChange = Σ_k γ_T(k)(1−A_kk)`.
- **Lead–lag**: y_t = b0 + b1·y_{t−1} + b2·x_{t−1}; HAC (Newey–West 1994
  plug-in lag) t-stat on b2; scan admitted only through Benjamini–Hochberg;
  weight capped at 0.4 (provenance discount). Labelled *predictive, not causal*.
- **P(real)**: BH q-values → clip(1−q, 0.05, 0.95) — bounded honesty in both
  directions.
- **FSS**: fraction of constraint-feasible Monte-Carlo paths where target is
  touched before stop. Feasibility = positivity + per-step |log move| bound
  (+ optional price bounds) — the polytope idea in its cheap correct form.
- **Edge**: inverse-variance blend (normal–normal posterior mean), then
  κ-shrinkage toward zero (κ from historical realized-edge dispersion; 0.25
  prior when unknown), then cost haircut on magnitude.
- **Opportunity Score**: OS = E_net·R·C·Y·τ·L·N·Q computed in log space;
  factors are gates; `bottleneck` = the factor costing the most log-score
  (reduced cascade-vulnerability report). OS is a ranking statistic — label
  it so in UI.
- **Reliability**: decayed Beta (λ=0.98, effective memory ≈ 50 outcomes) per
  engine × regime, empirical-Bayes shrunk to the engine marginal.
- **Scar**: Sc = 0.5·min(1,|PnLerr|/ref)² + 0.2·novelty + 0.2·min(1,corr/3)
  − 0.1·(1−2^(−age/90d)); permanence iff Sc ≥ 0.85-quantile AND ≥2
  independent failures in the same context bucket. Consequence dominates.

## Migration steps

1. Apply `20260705093000_discovery_v2_foundation.sql` (additive only:
   3 new market-level tables with authed read / service-role write,
   1 outcomes table, 3 new columns + 1 index on `scar_memory`).
2. Deploy edge functions (`twrd-ingest` picks up the admission gate;
   response shape is backward-compatible — new fields only).
3. No frontend change required; new modules are consumed via
   `import { … } from "@/lib/discovery"`.

Rollback: revert the `twrd-ingest` import + call (2 hunks); new tables/columns
are inert if unused.

## Wiring guide (next integration points, in order)

1. `desirable-assets`: pass each candidate's test p-values through
   `pRealFromScan`, its MC paths through `futureSurvivalScore`, and gate with
   `publishGate` before returning; persist rejects to `opportunities`
   (`published=false`, `reject_reasons`).
2. `_shared/ensemble.ts`: replace static per-engine `reliability` priors with
   `reliabilityEstimate(cell, marginal)` reads from `engine_regime_stats`.
3. `useMarketRegime`: upgrade `hmmRegimeDetect` call to `gaussianHMM(K=3)`
   and surface `pChange` + `cusum` alarms as regime-shift conditions.
4. `useOutcomeGradient` / trade-lesson flow: compute `scarScore` +
   `shouldScar` on material failures; write `scar_score/permanent/
   corroboration`; `odg-validator`'s existing hazard then reads formally
   scored scars.
5. Weekly cron: `leadLagScan` over the cross-asset watchlist →
   `asset_graph_edges`; news events → `propagateImpact` for second-order
   candidates.

## Tests

`npx vitest run src/lib/discovery/discovery.test.ts` — 24 tests: CUSUM
detects an injected break promptly and stays quiet on noise; HMM recovers 3
planted vol states with valid posteriors; admission rejects impossible
bars/claims with named reasons; syndicated copies collapse to one source;
planted lead–lag found while ≥90% of noise is FDR-rejected; propagation
attenuates as ρ^hop·Πw and respects floors; FSS separates up/down drift and
excludes infeasible paths; scoring is monotone, gated, bottleneck-aware;
reliability shrinks to prior at low n and adapts at high n; scar permanence
requires corroboration. Full suite: 94/94.
