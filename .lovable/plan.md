# Deterministic Core: removing the language models from the engines

## First: what Claude's desirable-assets work actually was

It was never a `desirable-assets` function. It was a **library** (`src/lib/discovery/`, 1,645 lines, 24 seeded tests) built from `docs/TRUTH_TO_ENTROPYLITE_MAP.md`, and then never imported by any running code. Twelve modules:

| Module | What it computes | Status |
|---|---|---|
| `robustness.ts` | BH q-values, P(real)=clip(1-q,.05,.95), future-survival score | **now live** (ported last turn) |
| `changepoint.ts` | Page's CUSUM on robust z + 3-state Gaussian HMM (scaled Baum-Welch) | not wired |
| `scoring.ts` | inverse-variance forecast blend, expected edge, payoff asymmetry, timeliness, liquidity, multiplicative `opportunityScore`, `publishGate` | not wired |
| `leadlag.ts` | Newey-West HAC lead-lag scan, BH-gated, weight capped at 0.4 | not wired (needs `asset_graph_edges`) |
| `learning.ts` | per-(engine x regime) Beta reliability, scar scoring | not wired (needs `engine_regime_stats`) |
| `admission.ts` + `novelty.ts` | hard constraint gates, Jaccard sybil dedup | live, but only in `twrd-ingest` |
| `momentum.ts`, `propagate.ts` | epistemic momentum, k<=2 impact propagation | not wired |

It also explicitly **rejected** the PC causal-discovery algorithm, POMDP planning, BOCPD and tensor networks with written reasons. That rejection log is the useful part: it is the same judgment call this plan needs.

The reason the library matters now is that `scoring.ts` + `changepoint.ts` + `learning.ts` are exactly the deterministic replacements for what the models are currently doing by vibe.

## The actual problem

24 edge functions call a model. They fall into three very different classes, and only one of them is legitimately a model's job.

**Class A - the model is inventing numbers that should be measured.** This is the real defect and the reason Direct Profit and the causal engine feel fake.
`monte-carlo-intelligence` (asks a model for GBM drift/vol/jump params), `continuous-simulation` (asks for a Markov transition matrix), `clank-detection` (asks which mechanical constraints are active), `deep-intelligence` (asks for 1-100 scores on management/flow/narrative/structure), `geopolitical-data` (asks for conflict lat/lng and severity), `derivatives-intelligence`, `fortress-intelligence`, `crown-intelligence`, `flow-intelligence`, `portfolio-intelligence`, `causal-effects`, `reflexivity-engine`, `strategy-evolution`, `direct-profit`, `desirable-assets`.

**Class B - the model is writing prose over numbers that are already real.** `market-data` morning commentary, `entropy-brief`, `trade-lesson`, `analyze-stock` narrative fields, the reflexivity thesis voice.

**Class C - the model is parsing unstructured text.** `company-intelligence`, `geo-events`, news sentiment. There is no closed-form substitute for reading a filing; the deterministic answer here is a lexicon + rules, which is weaker but auditable.

Aladdin has no Class A. Every number is measured, calibrated, or explicitly a scenario input a human set.

## Plan

### Stage 1 - Kill Class A in the two engines the user watches (this stage)
- `monte-carlo-intelligence`: replace model-supplied params with MLE from real return history: drift = mean log return, vol = EWMA(lambda=0.94) + Student-t df fit, jumps via Lee-Mykland jump test on the actual series, correlation from Ledoit-Wolf shrunk covariance (`src/lib/quant/covariance.ts` already has this). Scenario overlays become named deterministic shocks, not model prose.
- `continuous-simulation`: regime transition matrix estimated from the 3-state Gaussian HMM in `changepoint.ts` (Baum-Welch on real index returns), not asked for.
- `clank-detection`: constraints become **rules with dates**: index-rebalance calendars, F&O expiry, lock-in expiry, circuit limits, ADR/ADV thresholds. A constraint is active or it is not; no model opinion.
- `direct-profit`: decision comes from the ensemble + `opportunityScore` + the Stage 3.8 robustness layer already deployed; action/confidence/target/stop are computed, and the model is removed from the decision path entirely.

### Stage 2 - Wire the rest of Claude's library as the scoring spine
`scoring.ts` (multiplicative `opportunityScore` + `publishGate`) becomes the single ranking function shared by `desirable-assets`, `direct-profit` and `crown-intelligence`, so the three engines stop contradicting each other. Add the two missing tables (`asset_graph_edges`, `engine_regime_stats`) so `leadlag.ts` and `learning.ts` can run, giving per-(engine x regime) reliability weights that are learned from realized outcomes rather than asserted.

### Stage 3 - Class A elimination across the remaining engines
`causal-effects` becomes an impulse-response over the estimated lead-lag graph (`propagate.ts`, k<=2, rho-attenuated). `fortress`/`crown`/`flow`/`portfolio` become factor/liquidity/crowding computations over the real book. `deep-intelligence` scores become z-scores against sector peers from real fundamentals.

### Stage 4 - Class B: prose or nothing
Each remaining narrative call gets a deterministic template driven by the computed numbers. Where a template reads badly, the section is deleted rather than model-filled. Class C keeps a model but is labelled as text extraction, never as a number source.

## Technical notes
- No stage adds a fallback. If real data is missing, the panel says the input is unavailable, which is the current standing rule.
- Every replaced engine keeps its exact response shape so no frontend component breaks; only the provenance of the numbers changes.
- Each engine gets deterministic unit tests (seeded, no network), which is only possible once the model is out of the path.
- `callAI.ts` stays for Class C, but Class A/B removals delete their call sites so a model cannot silently return.
