# TRUTH → EntropyLite Integration Map (v1)

Analysis of the TRUTH v1/v2 manuscripts ("Structural Reality Architecture,"
Sehwag 2026) against the EntropyLite codebase, produced as the research input
to `docs/DISCOVERY_ENGINE_V2_SPEC.md`. The mandate: identify which TRUTH
concepts *materially* improve opportunity discovery, robustness, forecasting,
uncertainty estimation, causal reasoning, regime detection and adaptive
learning inside a React + TypeScript + Supabase, browser-first platform — and
reject everything else.

Ground rule applied throughout: **a concept is only "implement now" if it has
a concrete mathematical formulation, runs within browser/edge compute, and has
a measurable acceptance metric.** Concepts that are AGI-scaffolding
(Operational Intelligence's physical execution, Collective Scar Networks
across organizations, Roadmap-to-AGI staging) are marked unsuitable regardless
of elegance.

---

## 0. Where EntropyLite already implements TRUTH

This matters because the manuscripts' most valuable ideas are *already
partially live* in this repo. The integration job is to complete and connect
them, not to introduce them:

| TRUTH module | Existing EntropyLite implementation | Completeness |
|---|---|---|
| TWRD scoring `T(x,t) = σ(w₁S + w₂A + w₃D − w₄B − w₅C + b)` | `supabase/functions/_shared/twrd/truth.ts` (exact formula), `twrd-ingest`, `twrd-query`, `twrd-feedback`, tables `twrd_claims`, `twrd_sources`, `twrd_weights` | ~80% — missing online weight learning and epistemic momentum |
| Source credibility (Beta posterior) | `sourceCredibility()` in `twrd/truth.ts`; decayed Beta in `src/lib/quant/calibration.ts` (`betaUpdate`, λ=0.98) | ~90% |
| Noisy-OR agreement | `agreement()`, `updateAgreement()` in `twrd/truth.ts` | done; sybil dedup partial |
| Claim Record / SEL cleaners | `twrd/types.ts` (`ClaimTriple`, `RawClaim` with `piHatCap`), `twrd/cleaners/` | ~50% — one pathway, no simulation-grounded admission |
| Scar Memory (concept) | `scar_memory` table, `src/lib/odg-validator.ts` (`ScarRecord`, `validateTrade`, severity-weighted hazard `exp(−W/τ)`), `useOutcomeGradient` profit field | ~60% — no formal scar score, no consequence gradient |
| Constraint graph G_K | `src/lib/clank-engine.ts` (`CONSTRAINT_REGISTRY`, `evaluateConstraints`, `simulateCascade`) | ~50% — constraints exist, not wired into simulation admission or scenario filtering |
| Aftermath cascade | `simulateCascade()` in clank-engine | first-order only, static registry |
| Consequence feedback loop | `signal_outcomes`, `engine_reliability`, `calibration_params` tables; `_shared/ensemble.ts` reliability priors; nightly `calibration-fit` | ~70% — per-engine, not per-(engine × regime) |
| Ensemble information aggregation | `_shared/ensemble.ts` + `_shared/buckets.ts` (3 orthogonal buckets, ≥2-bucket gate) | done — this is TRUTH's mutual-information-superadditivity argument in working form |
| Hierarchical simulation (Truth Crucible funnel) | partial: `desirable-assets` does screen → AI → consensus, but with no formal cost/depth staging | ~40% |

---

## 1. Concept-by-concept mapping table

Legend — **Verdict:** ✅ implement now · 🧪 experimental (behind flag, measure before promoting) · ❌ unsuitable.
**Benefit** and **Complexity** are relative to this codebase (Low/Med/High).

| # | TRUTH concept | Problem it solves | Can it improve EntropyLite? | Benefit | Complexity | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Claim Record as primitive** (7-tuple: entity, relation, object, source, t, π̂, V) | Unstructured news → un-scoreable, un-learnable evidence | Yes — already the `twrd_claims` schema; extend with `V` (admission status) and entity→ticker links | High | Low | ✅ |
| 2 | **SEL Pathway 1 (DSE)** — deterministic extraction from structured feeds | Wasting LLM calls on data that is already structured | Yes — OHLCV, ETF flows, macro calendar, filings metadata should become Claim Records *without* `callAI` | High (cost ↓, reliability ↑) | Low | ✅ |
| 3 | **SEL Pathway 4 (SigE)** — social/sentiment as *Signal Records*, never facts | Sentiment polluting the fact base | Yes — formalizes what `sentiment-intel` already half-does; social gets `piHatCap ≤ 0.45`, never scar-eligible | Med | Low | ✅ |
| 4 | **SEL Pathways 2–3 (GIE/TBE, grammar/template IE without LLM)** | LLM dependency for text | Partially — full dependency parsing in Deno edge is heavy; keyword/template extraction for earnings headlines is realistic; keep `callAI` as *optional* enrichment | Med | Med | 🧪 |
| 5 | **Simulation-grounded admission** `V(CR)=0` for physically impossible claims | Garbage/adversarial data entering the belief base | Yes — cheap range/identity checks (price > 0, |daily move| sanity vs halt rules, flow conservation) at ingest; rejects bad ticks and hallucinated numbers before they reach any engine | High (silent data corruption is the #1 real failure mode) | Low | ✅ |
| 6 | **TWRD online weight learning** (OGD on logistic loss, `Reg_T ≤ D·√T`; FTRL w/ forgetting for drift) | Hand-tuned truth weights never improve | Yes — `OnlineLogit` already exists in `src/lib/quant/calibration.ts`; wire it to `twrd-feedback` outcomes. The regret bound is honest: no i.i.d. assumption, matches market non-stationarity | Med–High | Low | ✅ |
| 7 | **Epistemic momentum** μ(x,t) = finite-difference ∂T/∂t | Detecting *changing* consensus, not just level | Yes — this is exactly "narrative momentum" for the News/Narrative engines: store T history per claim/theme, compute EWMA slope | High for narrative detection | Low | ✅ |
| 8 | **Sybil-resistant dedup** (Jaccard > 0.9 on canonical triples ⇒ one source) | Syndicated news counted as independent confirmation | Yes — wire into `agreement()`; churnalism is rampant in free news feeds | Med | Low | ✅ |
| 9 | **Reality Database: six-graph world model** (G_E, G_R, G_T, G_C, G_K, G_S) | Fragmented knowledge | Partially — a full six-graph store is over-engineering here. Map to: Postgres tables (already exist for claims/scars/constraints) + **one new `asset_graph_edges` table** (sector membership, supply-chain, cointegration, lead-lag edges) queried into a browser adjacency structure | Med | Med | ✅ (reduced form) |
| 10 | **Causal graph via PC algorithm** | Correlation ≠ causation in the asset graph | Weakly — PC's faithfulness/Markov assumptions are badly violated in markets (hidden confounders everywhere; the manuscript itself concedes this, §19.3). Pairwise **Granger/lead-lag with FDR control** delivers 80% of the value at 5% of the complexity and is honest about being predictive, not causal | Low–Med | High (PC) / Low (Granger) | 🧪 PC ❌ / ✅ lagged-predictive edges |
| 11 | **Intervention-based causal identification** (do-calculus from own actions) | Observational ambiguity | No — EntropyLite's "actions" (user trades) don't move markets; there is no intervention signal. Keep outcome attribution instead | — | — | ❌ |
| 12 | **Scar Memory: consequence-weighted retention** (Scar Score, permanence threshold) | Frequency-based memory forgets rare, expensive lessons | Yes — upgrade `scar_memory` + `odg-validator` with a formal scar score `Sc(m) = α·impact² + β·infoDensity + γ·corroboration − δ·decay` where *impact* = realized PnL error attributable to the belief (not simulated ∂O/∂m — see #13) | High | Low–Med | ✅ |
| 13 | **Simulation-based outcome gradient** \|∂O/∂m\|² via 2d finite-difference runs over a domain model F_D | "Which belief, if wrong, costs the most?" | Partially — full parameter-space sensitivity over a VAR/GARCH world model is feasible *in a Web Worker for small d* (d ≤ 20 parameters, 2d GBM/OU re-simulations via `future-graph-machine`), but marginal vs. simply attributing realized forecast error. Ship realized-error attribution now; finite-difference sensitivity behind a flag | Med | Med | ✅ (realized) / 🧪 (simulated) |
| 14 | **Scar Resonance** (co-activation boost, ρ ≤ 0.15, DAG-only, renormalized) | Related lessons reinforcing each other | Marginal — the stability machinery (renormalization, cycle detection) costs more than the benefit at EntropyLite's scar counts (~10²–10³). Revisit at 10⁴+ scars | Low | Med | ❌ (for now) |
| 15 | **Lyapunov/contraction convergence of scoring weights** | Guarantees learning doesn't diverge | Yes as a *design constraint*, not code: bounded features, L2, small η — `OnlineLogit` already enforces this. Adopt as spec requirement + test | Med (safety) | Low | ✅ |
| 16 | **Feasibility polytope P_K = {s : Ks ≤ k}** (polyhedral, not Riemannian) | Simulated futures that violate physical/market constraints | Yes, reduced: **constraint-filtered Monte Carlo** — clank-engine constraints become per-path rejection/clamping rules in `runMonteCarlo`/`runFGM` (circuit-breaker bounds, non-negative prices, vol regime bounds). Full LP path-planning over the polytope is unnecessary | Med | Low | ✅ (filtering) / ❌ (LP geodesics) |
| 17 | **Constraint activity κ_K(s)** (count of near-binding constraints = fragility) | Detecting structurally fragile states | Yes — `computeClankScore` is already a weighted version of this; expose it as the **Fragility** input to opportunity scoring and regime engine | Med | Low | ✅ |
| 18 | **Truth Crucible: hierarchical simulation funnel** (coarse k=1 on all → medium on survivors → deep on finalists, with explicit per-stage cost budget) | Can't deep-simulate everything | Yes — this is *the* correct architecture for a browser-constrained universe scan: cheap features on ~500 symbols → medium scoring on ~50 → deep MC + validation battery on ~10. Directly shapes `discovery/funnel.ts` | **Very high** | Low–Med | ✅ |
| 19 | **Future Survival Score (FSS)** — fraction/quality of simulated futures in which the thesis survives constraints | Point forecasts hide path risk | Yes — compute per finalist: share of constraint-filtered MC paths where the trade thesis holds (hits target before stop, respects constraints). Becomes the *Robustness* factor | High | Low (MC engine exists) | ✅ |
| 20 | **Competitive Entropy Minimization / EFE ambiguity term** | Preferring futures that resolve uncertainty | Marginal for discovery — we rank opportunities, we don't act to gather information. A reduced form is useful: penalize candidates whose MC outcome distribution is high-entropy relative to edge (uncertainty-adjusted edge). Fold into scoring, skip the active-inference frame | Low–Med | Low | ✅ (as penalty term) / ❌ (as framework) |
| 21 | **Aftermath Simulation: k-order consequence propagation on causal DAG, provenance-weighted edges (intervention 1.0 / co-occurrence 0.4)** | First-order-only thinking about news | Yes, bounded k=2: propagate event impact over `asset_graph_edges` with edge-confidence discount `ρ^k · w_edge` — "TSMC guidance cut → semis → AAPL suppliers." Provenance weighting maps to edge-type weights (membership 1.0, cointegration 0.7, lead-lag 0.4) | High (second-order effects are the stated goal) | Med | ✅ |
| 22 | **Cascade Vulnerability CV(a) = max (1−T)·\|∂Aftermath/∂T\|** | Single weak belief underpinning a big conclusion | Yes — per opportunity, identify the *load-bearing claim*: the input whose falsity flips the score most. Report it ("this trade dies if X is wrong"). Cheap: re-score with each top input zeroed | High (decision support) | Low | ✅ |
| 23 | **Budget-concave POMDP (Operational Intelligence)** | Optimal budget allocation across independent components | Reduced form only — the concavity theorem justifies **greedy marginal-value allocation**, which is exactly what `apiGovernor.ts` needs for allocating API calls/LLM budget across engines. Full POMDP: no | Med | Low (greedy) | ✅ (greedy allocator) / ❌ (POMDP) |
| 24 | **Human oversight thresholds by reversibility** | Autonomy safety | Yes as product rule: EntropyLite is *advisory-only* (TRUTH-0/1 "advisory mode" maps exactly); confidence tiers gate how assertively an opportunity is presented, never auto-execution | Med (trust, compliance) | Low | ✅ |
| 25 | **Collective Scar Networks** (cross-node scar sharing, BFT, trust weights) | Distributed learning | No for external networks. A *degenerate internal* form is already right: all engines share one `signal_outcomes`/`scar_memory` store, so the News engine learns from Quant engine failures in the same regime. Cross-*user* aggregation raises privacy/regulatory issues; defer | Low | High | ❌ (external) / ✅ (shared internal ledger — exists) |
| 26 | **Mutual information superadditivity** (complementary domains ⇒ information surplus) | Why combine orthogonal evidence | Already embodied: `buckets.ts` requires ≥2 orthogonal buckets. Extension worth shipping: **correlation-adjusted effective evidence count** — downweight within-bucket agreement by average pairwise signal correlation (Kish effective sample size) | Med | Low | ✅ |
| 27 | **TEL / Horn-clause Datalog** | Decidable temporal belief logic | No — a Datalog engine is infrastructure without measurable benefit here. TEL-2 (decay monotonicity) and TEL-3 (confirmation boost) are already implemented as `decay()` and feedback updates; keep those two axioms as invariants, skip the logic engine | Low | High | ❌ (engine) / ✅ (the 2 axioms as invariants) |
| 28 | **REALITY benchmark suite** (RT-score, FC/Brier, CPA-k, adversarial robustness) | "Is the system actually getting better?" | Yes — reduced to a **Discovery Scoreboard**: Brier + reliability curve per engine (exists in `calibration.ts`), hit-rate CIs (Wilson), decile-lift of opportunity score vs realized forward return, and CPA-1 (did predicted second-order effects materialize) | High (keeps everyone honest) | Low | ✅ |
| 29 | **Scaling laws (scar density, veracity, network exponents)** | Predicting intelligence growth | No — the manuscript itself labels every exponent "not yet measured." Nothing actionable | — | — | ❌ |
| 30 | **Anti-fabrication discipline of TRUTH v2** (every quantity computable, every claim falsifiable, empirical status disclosed) | Fake math | Yes — adopted as spec policy: every score in Discovery v2 has a formula, units, and an acceptance test; anything not yet validated ships labeled `experimental` in the UI | High (meta) | — | ✅ (policy) |

---

## 2. Recommended integrations (what actually ships)

Distilled from the table, in order of edge-per-unit-effort:

1. **Hierarchical discovery funnel** (#18) — the Truth Crucible staging becomes the scan architecture. Biggest structural win; makes a 500-symbol universe tractable in a browser worker + cron edge function.
2. **Robustness gate = FSS × validation battery** (#19, #16, #17) — constraint-filtered MC survival fraction, multiplied by the already-existing `validateStrategyBattery` (PSR/DSR/PBO/Reality-Check) for systematic signals, with **Benjamini–Hochberg FDR across each day's candidate set** (the scan is a massive multiple-testing problem; `benjaminiHochberg()` exists and is currently unused at the scan level).
3. **Claims + epistemic momentum as the narrative substrate** (#1, #2, #7, #8) — DSE for structured feeds, momentum of T-scores per theme = narrative momentum, sybil dedup for churnalism. Converts the existing TWRD store from a passive fact base into a *leading-indicator generator*.
4. **Second-order propagation on a typed asset graph** (#9, #21, #22) — one new table + bounded k=2 traversal + load-bearing-claim report.
5. **Consequence-weighted learning loop** (#12, #6, #15, #28) — formal scar score on realized PnL attribution, per-(engine × regime) Beta reliability with empirical-Bayes shrinkage (`shrunkProportion` exists), `OnlineLogit` meta-calibration, Discovery Scoreboard.
6. **Simulation-grounded admission + greedy budget allocator** (#5, #23) — data-quality hard gate at ingest; marginal-value API budget allocation in `apiGovernor`.

Everything else: 🧪 items go behind feature flags with named acceptance metrics; ❌ items are documented here so they aren't relitigated.

## 3. Expected benefits (falsifiable targets)

| Integration | Metric | Baseline → Target |
|---|---|---|
| Funnel + robustness gate | Precision of surfaced opportunities (hit-rate of top-decile score, 20-day horizon) | measure current `desirable-assets` hit-rate → +10pp with CI excluding 0 |
| FDR across scan | Fraction of surfaced signals that are noise (via forward outcomes) | uncontrolled → posterior FDR ≤ 25% |
| Narrative momentum | Lead time of theme surfacing vs. peak news volume | 0 (reactive) → surfaces ≥ 1 day before volume peak on ≥ 40% of themes |
| Second-order propagation | CPA-1: correlation of predicted linked-asset moves with realized | undefined → > 0.15 (any positive, stable value is real edge) |
| Learning loop | Brier score of published opportunity probabilities | current calibration → −15% Brier, reliability curve within ±5pp per bin |
| Admission gate | Bad-tick / impossible-claim incidents reaching engines | unmeasured → 0, with rejection log |

## 4. Risks and failure modes

- **Overfitting the meta-learner**: `OnlineLogit` on few outcomes will chase noise → bounded learning rate, L2, empirical-Bayes shrinkage to engine priors, and a minimum-sample gate (Wilson lower bound) before learned weights override priors.
- **FDR gate too aggressive early on**: with short histories almost nothing passes → run gate in "label" mode first (show pass/fail without filtering), tighten after scoreboard confirms.
- **Asset-graph staleness**: supply-chain/sector edges rot → every edge carries `as_of` + decay; edges below confidence floor are pruned from propagation.
- **Narrative false positives from correlated sources**: mitigated by sybil dedup, but coordinated social pumps remain — SigE records are capped (π̂ ≤ 0.45) and can never reach scar status, per TRUTH's own rule.
- **Compute creep**: every stage of the funnel has a hard per-stage budget (ms and API calls); the greedy allocator enforces it; degradation is graceful (fewer finalists, never a frozen tab).
- **LLM cost regression**: DSE pathway must *reduce* `callAI` volume; track calls/scan as a scoreboard metric.

---

*Full mathematical formulations, TypeScript architecture, file-by-file plan,
complexity/feasibility analysis, migrations and roadmap: see
`docs/DISCOVERY_ENGINE_V2_SPEC.md`.*
