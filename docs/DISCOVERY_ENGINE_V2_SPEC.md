# EntropyLite Opportunity Discovery Engine v2 — Specification

Design target: evolve the existing discovery stack (`desirable-assets`,
`_shared/ensemble.ts`, TWRD, `odg-validator`, `src/lib/quant/*`) into a
continuously running multi-engine discovery platform — equities, ETFs,
sectors, factors, volatility, macro, cross-asset, sentiment, narratives,
alternative data — under hard platform constraints: React + TypeScript +
Supabase, browser-first, edge functions for I/O and cron work, no compute
cluster, no paid tick data, no HFT.

Companion document: `docs/TRUTH_TO_ENTROPYLITE_MAP.md` (which TRUTH-manuscript
concepts are adopted, reduced, or rejected, with verdicts). This spec only
uses the ✅ items from that map.

Non-negotiable policies (adopted from the TRUTH v2 discipline and from
`docs/QUANT_UPGRADE_SPEC.md` precedent):

1. Every score has a formula, a domain, and an acceptance test. No invented
   constants without a stated calibration path.
2. Every published probability is calibrated and scoreboard-tracked (Brier +
   reliability curve). No promised returns, ever — outputs are probabilities,
   intervals, and ranked candidates.
3. The scan is a multiple-testing problem and is treated as one (FDR control).
4. Advisory only. Nothing in this system executes trades.
5. Graceful degradation: every stage has a hard compute/API budget; when the
   budget is hit, the funnel narrows — the tab never freezes.

---

## 1. System architecture

### 1.1 The funnel (Truth-Crucible staging)

The core structural decision. A browser cannot deep-analyze 500+ symbols, and
it doesn't need to — cheap statistics eliminate most of the universe. Three
stages with explicit budgets:

```
STAGE 0  Universe features (edge cron, hourly/daily)
         ~500 symbols × incremental features. O(1) update per bar per feature.
         Output: discovery_features rows.                    Budget: edge cron.

STAGE 1  Coarse screen (browser worker or edge)             k=1, all symbols
         Robust z-scores on all features; anomaly + dislocation flags.
         Cost ≈ O(N·F), N=500, F≈25 → <10 ms.               Survivors: ~50.

STAGE 2  Engine scoring (browser worker)                    k=3, survivors
         All 9 discovery engines emit EngineSignal per survivor;
         bucketed consensus (`runConsensus`); preliminary OpportunityScore.
         Cost ≈ 50 × ~2 ms.                                  Survivors: ~10–15.

STAGE 3  Deep evaluation (browser worker + selective edge)  k=H, finalists
         Constraint-filtered Monte Carlo (FSS), validation battery
         (PSR/DSR/PBO where a backtestable rule exists), payoff asymmetry,
         load-bearing-claim analysis, final calibrated probability.
         Cost ≈ 10 × ~50–150 ms.                             Output: 3–10 published opportunities.
```

Total browser cost per scan: well under 2 s in a Web Worker; the UI thread
never blocks. Stage 0 runs server-side on cron so the app opens onto fresh
features.

### 1.2 Engines and data flow

```
                       ┌────────────────────────────────────────────┐
   market data ──DSE──▶│ twrd_claims / discovery_features (Supabase)│
   news feeds ──GIE/──▶│  + admission gate V(CR)                    │
   social ─────SigE──▶ └───────────────┬────────────────────────────┘
                                       │
        ┌──────────────┬───────────────┼────────────────┬─────────────┐
        ▼              ▼               ▼                ▼             ▼
   1 Quant        2 News Intel    3 Narrative     4 Regime      5 Cross-Asset
   6 Crowd        7 Anomaly       8 StatArb       9 Macro       (each = pure
   Positioning    Detection       Discovery       Opportunity    lib module)
        │              │               │                │             │
        └──────────────┴───────┬───────┴────────────────┴─────────────┘
                               ▼
                     EngineSignal[] per candidate
                               ▼
                 runConsensus (buckets A/B/C, exists)
                               ▼
                 OpportunityScore + Robustness gate (FDR, FSS)
                               ▼
                 opportunities table → UI (Discovery page)
                               ▼
                 outcomes tracked → 10 Continuous Learning Engine
                 (scar memory, per-engine×regime reliability,
                  OnlineLogit meta-calibration, Scoreboard)
```

All 9 signal engines are **pure, dependency-free TypeScript modules** (same
discipline as `src/lib/quant/*`): deterministic given inputs, unit-testable,
runnable in browser, worker, or Deno edge without modification. Engine 10
(learning) is a closed loop over Supabase tables.

### 1.3 Where code runs

| Concern | Location | Why |
|---|---|---|
| Feature ingestion, claim ingestion, admission gate | Edge functions (cron) | needs API keys, runs while user away |
| All engine math | `src/lib/discovery/*` pure modules | testable, shared browser/edge |
| Scan orchestration | Web Worker (`discovery.worker.ts`) | keep UI thread free |
| Persistence, learning state | Supabase tables (RLS per user where user-scoped; global for market-level facts) | incremental, cheap |
| LLM usage | Only: narrative labeling, thesis text, GIE fallback for unstructured headlines | DSE removes the bulk of current `callAI` volume |

---

## 2. Mathematical specification

Notation: r_t log returns; σ̂ via GARCH(1,1) (`garch11`) or EWMA; Φ standard
normal CDF (`normCDF`); all z-scores are **robust** unless stated:
z(x) = (x − median)/ (1.4826·MAD).

### 2.1 Opportunity Score

The mandated multiplicative form, made mathematically honest. Each factor is
defined, bounded, and estimated; the product is computed in log space.

```
OS = E_net · R · C · Y · τ · L · N · Q
```

| Factor | Definition | Domain | Estimator |
|---|---|---|---|
| **E_net** Expected edge | shrunken expected excess return over horizon h, net of costs | ℝ (gate: E_net > 0) | inverse-variance blend of engine forecasts (§2.2), minus `costHaircut` round-trip |
| **R** Robustness | P(signal is real), §2.3 | [0,1] | FDR-adjusted posterior × FSS |
| **C** Conviction | calibrated P(direction correct) mapped to [0,1] | [0,1] | `runConsensus().calibratedProb`, recalibrated by learning engine (§2.10) |
| **Y** Payoff asymmetry | bounded odds of up-tail vs down-tail | [0,2] | Y = 2·Ω/(1+Ω), Ω = omega ratio at threshold 0 from Stage-3 MC path returns (`omegaRatio` exists); Y=1 symmetric |
| **τ** Timeliness | freshness of the driving evidence | (0,1] | exp(−λ_c · age), λ_c = ln2 / halfLife(signalClass); half-lives from Table 2.1 |
| **L** Liquidity | capacity to act without impact | (0,1] | L = min(1, ADV$ / ADV$_ref) with ADV$_ref = $5M default; refined by Almgren-Chriss impact (`almgrenChrissImpact`) for large ADV |
| **N** Novelty | 1 − crowding | [0,1] | §2.7 crowding score |
| **Q** Confidence | uncertainty haircut | (0,1] | Q = 1/(1 + IQR(E_boot)/|E_net|): stationary-bootstrap CI of edge (`stationaryBootstrapIndices`) — wide interval relative to edge ⇒ small Q |

Computed as `log OS = log E_net + Σ log(factor)` with floors at 1e−6 for
numerical safety; OS is a **ranking statistic**, not a return forecast, and
the UI must label it as such. Rationale for the multiplicative form: each
factor is a *gate* — an opportunity with zero robustness or zero liquidity is
worthless regardless of edge; multiplication (log-additivity) encodes exactly
that, and the factors are approximately independent by construction (they
draw on the orthogonal buckets A/B/C).

Uncertainty on OS: delta method in log space,
Var(log OS) ≈ Σ Var(log fᵢ) (independence by construction), with per-factor
variances from their estimators; report OS with a 68% interval.

**Table 2.1 — signal-class half-lives** (initial priors; refit quarterly from
`opportunity_outcomes` realized decay):

| Class | halfLife (days) |
|---|---|
| earnings/news event | 2 |
| anomaly (volume/vol) | 3 |
| mean reversion | half-life from OU fit (`meanReversionHalfLife`), capped [2, 30] |
| momentum dislocation | 15 |
| cointegration pair | 20 |
| narrative | fitted per theme from momentum decay |
| macro/regime | 30 |

### 2.2 Expected edge (E_net)

Each engine e producing a return forecast emits (μ_e, s_e²) over horizon h.
Blend by precision (this is the Bayesian normal-normal update, and the
Black-Litterman machinery in `allocation.ts` is its portfolio-level twin):

```
μ_blend = ( Σ μ_e / s_e² ) / ( Σ 1/s_e² ),   s_blend² = 1 / Σ 1/s_e²
```

Then shrink toward zero with empirical-Bayes (James-Stein-style) using the
engine class's historical realized edge distribution:

```
E = κ · μ_blend,   κ = max(0, 1 − s_blend² / (s_blend² + Var_hist(μ_realized)))
E_net = E − costHaircut(tickerClass)          // exists in _shared/costs.ts
```

Fresh engines with no history get κ = 0.25 prior (conservative), migrating to
the estimated κ as `opportunity_outcomes` accumulates. This is the formal
version of "never promise returns": the shrinkage prior is *the market is
efficient*; evidence has to overcome it.

### 2.3 Robustness R (the aggressive rejection layer)

R = P_real × FSS, both in [0,1].

**(a) P_real — probability the signal is not a statistical artifact.**
The daily scan tests hundreds of hypotheses; uncorrected, most "discoveries"
are noise. Per candidate i with test statistic p-value p_i (from the relevant
test: OU t-stat, Engle-Granger ADF, anomaly tail probability, factor-residual
t-stat):

1. Collect the day's candidate p-values {p_i}.
2. Benjamini–Hochberg at q = 0.10 (`benjaminiHochberg`, exists) → pass flag.
3. Convert to a posterior via local FDR approximation:
   `P_real,i ≈ 1 − min(1, q · rank_i / (n · p_(i)))^+` clipped to [0.05, 0.95]
   — a monotone, honest transform; exact lfdr is overkill at these n.
4. For strategy-shaped signals (a rule that can be walk-forward tested on
   history — stat-arb pairs, mean reversion), multiply by the battery
   survival from `validateStrategyBattery` (exists):
   `P_real ← P_real · 1{DSR > 0} · (1 − PBO)`.

**(b) FSS — Future Survival Score** (TRUTH's Truth Crucible, reduced).
Run n = 500–2000 Monte Carlo paths at Stage 3 (engine chosen by signal class:
`gbmPath`, `jumpDiffusionPath`, `ouSimPaths`, or `runFGM` hybrid), **filtered
by the constraint registry**: paths violating hard constraints (price ≤ 0,
moves beyond circuit-breaker bounds, vol outside regime envelope from
`regimeEVT`) are rejected/clamped — this is the feasibility-polytope idea in
its cheap, correct form. Then:

```
FSS = (1/n) Σ 1{ path j hits target before stop within horizon h }
```

weighted variant: paths drawn under the *current HMM regime's* (μ, σ)
(`hmmRegimeDetect` posterior state) — the survival score is
regime-conditional, which is the regime-stability score the platform is asked
for.

**Rejection rule:** publish only if `P_real ≥ 0.4 ∧ FSS ≥ 0.45 ∧ E_net > 0`,
plus consensus gate (≥2 orthogonal buckets, exists). Everything else is
visible only in a "rejected candidates" debug view with the reason — the
system should be seen to reject aggressively.

**(c) Regime stability score** (reported per opportunity):
`RS = 1 − dispersion of signal-class hit-rate across HMM states`
(from `engine_regime_stats`, §2.10), i.e. RS = 1 − (max_s HR_s − min_s HR_s).

**(d) Load-bearing claim** (TRUTH's cascade vulnerability, reduced): re-score
the opportunity k times, each time neutralizing one top input (claim T-score
→ 0.5, engine signal → 0); the input with max |ΔOS| is reported:
*"thesis depends most on: ‹X›; if wrong, score drops by Δ."* Cost: k ≈ 6
re-scores of a pure function — microseconds.

### 2.4 Engine 1 — Quant Discovery

All per-symbol, incremental, O(T) with T ≤ 504 daily bars. Emits
`EngineSignal`s (bucket A) + forecast tuples (μ, s²).

| Detector | Statistic | Existing primitive |
|---|---|---|
| Momentum dislocation | z of (r_21d − β·r_sector,21d) — idiosyncratic momentum vs sector; flag when \|z\| > 2 with Hurst > 0.55 (trending) | `beta`, `hurstRS` |
| Mean reversion | OU fit → half-life ∈ [2,30]d, entry \|z\| ≥ 2, P(snap-back) | `estimateOU`, `zScore`, `snapBackProbability` |
| Volatility opportunity | vol-risk premium proxy: z of (σ_GARCH,forecast − σ_realized,10d); if IV available: z of (IV − σ_GARCH) | `garch11`, `impliedVol` |
| Correlation breakdown | DCC-lite pairwise ρ_t vs 1y median; flag \|Δρ\| > 0.4 sustained 5d | `dccLite` |
| Regime shift | HMM posterior state-change prob + CUSUM on returns mean/vol (new, §3) | `hmmRegimeDetect` + `cusum()` (new) |
| Abnormal returns | t-stat of 5-factor residual mean over trailing 63d | `famaFrenchRegression` |
| Unusual flows | structural flow detector | `detectStructuralFlows` |
| Structural change | CUSUM + Bayesian online change-point lite on σ (new, §3) | new `changepoint.ts` |
| Factor rotation | cross-sectional: rank-IC drift of factor returns (momentum/value/quality composites over the universe), z of 21d factor return vs 3y | `factorRegression` on factor portfolios |

Forecast mapping (example, mean reversion): μ = (μ_OU − p_t)·(1 − e^{−θh}) / p_t,
s² from OU stationary variance — both from `estimateOU` outputs. Every
detector has an analogous explicit mapping (documented in code, tested).

### 2.5 Engine 2 — News Intelligence

Operates on Claim/Signal Records (TWRD store), not raw text.

- **Novelty** of claim c: `nov(c) = 1 − max_{c' ∈ base, age<90d} J(c, c')`
  where J is Jaccard similarity over canonical (subject, relation, object)
  token sets. Computed at ingest against a per-entity recent-claims index —
  O(k) per claim, k = recent claims for that entity. Doubles as the sybil
  dedup (J > 0.9 ⇒ same source content).
- **Information surprise**: for claims with numeric objects (guidance,
  actuals), `surprise = |x − E[x]| / σ_x` where E[x], σ_x come from the claim
  base (consensus claims) or trailing distribution. For categorical events:
  `−log₂ p̂(event class | entity, 2y base rate)`.
- **Epistemic momentum** (TRUTH §6.4): store T-score history per claim
  cluster; `μ_T = EWMA slope of T over 5 snapshots`. Rising T on a bearish
  claim cluster = deteriorating reality before price reflects it.
- **Asset linkage**: entity → ticker via `symbolDirectory` + `twrd_claims`
  subject IDs; **second-order** via asset-graph propagation (§2.6).
- **Why it matters / duration / confidence** outputs: impact class from
  relation ontology (guidance_cut → fundamental, halfLife 2d; rating_action →
  flow, 5d; litigation → tail, 30d), confidence = T(claim) × extractor π̂.

Emits bucket-B signals: `news`, `sentiment` (SigE-derived, capped), and
`narrative` handoffs to Engine 3.

### 2.6 Engine 3 — Narrative Engine (+ asset graph)

**Asset graph** `asset_graph_edges (src, dst, type, weight w∈[0,1], as_of)`:
- `sector_member` (static, w=1.0), `supply_chain` (curated + filings
  co-mentions, w=0.6 default), `cointegrated` (from Engine 8, w=ρ̂ quality),
  `lead_lag` (Granger-lite: OLS of r_dst,t on r_src,t−1 with HAC t-stat,
  admitted only after BH-FDR across all tested pairs, w = |t|-scaled ≤ 0.4),
  `claim_link` (entities co-asserted in claims, w = T·count-scaled).

**Theme detection without embeddings** (TRUTH SEL discipline): build the
entity co-occurrence multigraph over trailing-14d claims; run label
propagation (O(E) per iteration, ≤ 10 iterations) → connected communities =
themes. Optional single `callAI` per *new* theme to produce a human label.

**Narrative state machine** per theme θ:
```
volume_z   = z(claims/day)                     breadth  = #distinct entities
momentum_m = EWMA slope of Σ T(c) over theme   crowd    = crowding score (§2.7)
state: EMERGING    volume_z>1 ∧ momentum>0 ∧ crowd<0.3
       ACCELERATING momentum rising ∧ breadth rising
       CROWDED     crowd>0.7                   DECAYING momentum<0 sustained 5d
```
EMERGING and early-ACCELERATING themes generate opportunity candidates on the
theme's top-linked liquid tickers; CROWDED themes generate *contrarian
watch* flags. **Second-order effects**: impact vector propagated k=2 hops:
`impact(dst) = Σ_paths ρ^k · Π w_edge · impact(src)` with ρ = 0.6; only edges
with w ≥ 0.3; complexity O(d²) per source with average degree d ≈ 10.

### 2.7 Engine 6 — Crowd Positioning (defined here for §2.1's N factor)

Crowding score per ticker/theme, crowd ∈ [0,1], mean of available components
(missing components excluded, count reported):

```
crowd = mean( Φ(z_sentiment_volume), Φ(z_social_buzz), Φ(z_ETF_flow_5d),
              Φ(z_short_interest_change · −1), pct_rank(analyst unanimity),
              polymarket odds extremity |p−0.5|·2 )
```

Novelty in §2.1 is N = 1 − crowd for continuation-type signals; for
*contrarian* signal classes (mean reversion into panic) the learning engine
is allowed to flip the sign of crowd's contribution — crowdedness is
predictive in both directions depending on class, and that's an empirical
question the scoreboard settles. Extremes (crowd > 0.85 with negative
momentum turn) emit standalone "crowded unwind risk" signals (bucket C).

### 2.8 Engine 7 — Anomaly Detection

Per symbol per day, feature vector x = (r_1d, volume_z, σ_realized_z, range_z,
sentiment_z, corr_breakdown_z, flow_z). Two detectors:

1. **Univariate robust tails**: flag any |z_robust| > 3 (Φ-based p-value).
2. **Multivariate**: Mahalanobis D² = (x−μ̃)ᵀ Σ̂⁻¹ (x−μ̃) with Σ̂ from
   Ledoit-Wolf (`ledoitWolfShrinkage`) on trailing 252d of the feature
   vector; p-value from χ²_F. Catches *jointly* unusual days (e.g. big
   volume + flat price + sentiment spike = accumulation pattern).

**Ranking** (as mandated): `anomaly_rank = (−log p) · log(1+ADV$) · (1 + hist)`
— statistical significance × economic importance × historical relevance,
where hist = scar-memory match rate: fraction of similar past anomalies
(same feature-bucket signature via `bucketsFor`, exists) that preceded
|forward 5d move| > 1σ. All three terms auditable.

### 2.9 Engines 4, 5, 8, 9 (regime, cross-asset, stat-arb, macro)

**4 — Market Regime.** Extend `hmmRegimeDetect` from 2 to 3 states
(low-vol trend / high-vol / crisis) — EM on Gaussian mixture with sticky
transitions, still O(T·S²), trivial at S=3. Add `cusum()` and `bocpdLite()`
(§3) for change-point *timing*; combine: regime label + P(change within 5d).
Regime output conditions every other engine (signal weights, MC parameters,
EVT tail params via `regimeEVT`). Also compute the **fragility index**:
`computeClankScore` (constraint activity — TRUTH's κ_K) + `fragilityIndex`
(CVaR/VaR ratio, exists).

**5 — Cross-Asset.** Watchlist of ~40 macro pairs (SPY/TLT, HYG/LQD,
copper/gold, XLY/XLP, VIX term proxy, DXY vs EM…): DCC-lite correlation
regime; divergence z = z(spread vs 1y); tail-dependence shifts
(`tailDependence`); lead-lag edges feed the asset graph. Signals: bucket C
(risk/regime) + occasional direct opportunities (divergence mean-reversion
with cointegration support).

**8 — Stat-Arb Discovery.** The funnel applied to pairs:
Stage A: within-sector candidate pairs, |ρ| ≥ 0.6 (O(N²) on ~30-symbol
sectors — cheap). Stage B: `engleGranger` ADF on spread, BH-FDR across all
pairs tested that day (critical — pair scanning is the canonical
multiple-testing trap). Stage C: OU on spread → half-life ∈ [3,30]d, z-entry
±2, `johansenTrace` for triplets (optional). Stage D: walk-forward the z-rule
(`runBacktest`, `walkForwardSplits`) → battery gate. Output: pair
opportunities with hedge ratio (Kalman-filtered β via `kalmanFilter` for
drift), expected convergence horizon = half-life, FSS from `ouSimPaths`.

**9 — Macro Opportunity.** Macro surprise index per release:
`surprise = (actual − consensus)/σ_hist(surprises)` from the existing macro
calendar (`fetchMacroCalendar`); rolling growth/inflation surprise composites
(CESI-style, EWMA λ=0.9); map (growth↑/↓ × inflation↑/↓) quadrant to
sector/factor tilts via a *fitted* historical response table (21d forward
sector returns conditioned on quadrant, shrunken via `shrunkProportion` —
labeled experimental until the table's CIs exclude zero); yield-curve
level/slope/curvature via `nelsonSiegelFit` with slope-inversion and
steepening-turn flags. Emits bucket-C signals + sector/factor candidates.

### 2.10 Engine 10 — Continuous Learning

Four sub-loops, all incremental, all O(1) per outcome:

**(a) Outcome ledger.** Every published opportunity freezes its feature
vector (all engine scores, factors of §2.1, regime, crowd) in
`opportunities`; forward returns at h ∈ {5, 20, 60}d are filled by cron into
`opportunity_outcomes` (hit = sign correct AND net > 0).

**(b) Per-(engine × regime) reliability.** Beta posterior per cell with decay
(`betaUpdate`, λ=0.98) + empirical-Bayes shrinkage to the engine's marginal
(`shrunkProportion`, prior strength 10). Stored in `engine_regime_stats`;
`runConsensus` reliability priors become regime-conditional lookups. Wilson
lower bound (exists in ensemble) gates when a cell's evidence may override
the prior.

**(c) Meta-calibration.** `OnlineLogit` (exists): features = [ensembleScore,
bucket agreements, regime one-hot, vol bucket, crowd, novelty, signal-class
one-hot] → P(hit). Bounded weights, L2, η ≤ 0.05 — the contraction/Lyapunov
discipline as code constraints. This replaces the static Platt map as the C
factor's calibrator once it beats it on rolling Brier (champion/challenger:
the scoreboard decides, not opinion).

**(d) Scar memory (formalized).** On material failures (realized loss >
1.5× expected risk, or hit=false with C > 0.75 — i.e., *confident and
wrong*):

```
Sc(m) = α·min(1, |PnL_err|/PnL_ref)² + β·nov(context) + γ·corroboration − δ·age_decay
        α=0.5, β=0.2, γ=0.2, δ=0.1 (initial; refit annually)
```

Scar status (permanent, never decayed) iff Sc ≥ 0.85-quantile of trailing
scar scores AND corroboration ≥ 2 (two independent failures in the same
context bucket). Context bucket = (signalClass, regime, volBucket,
sentimentBucket) via existing `bucketsFor`. At scoring time,
`validateTrade` (exists) already applies the multiplicative scar hazard
`exp(−W/τ)` — it now reads formally-scored scars. Effect: the system
aggressively refuses to re-publish the class of idea that has repeatedly
burned it *in this regime*, while decaying ordinary losses normally.

**(e) Scoreboard** (REALITY suite, reduced): per engine and overall — Brier,
reliability curve (`reliabilityCurve`), hit-rate + Wilson CI, decile lift of
OS vs realized 20d net return, CPA-1 (predicted second-order moves vs
realized, Pearson), API/LLM calls per scan. Rendered on a Discovery
Scoreboard panel; every number links to its formula.

---

## 3. New algorithms (to implement)

Only what doesn't exist yet. Each lands in `src/lib/discovery/` with seeded
tests (mulberry32 pattern from `quant/validation.ts`).

**3.1 `cusum(xs, k?, h?)` — two-sided CUSUM.** S⁺_t = max(0, S⁺_{t−1} +
(z_t − k)), S⁻ analog; alarm when max(S⁺,S⁻) > h (k=0.5, h=5 defaults, in
robust-z units). O(1)/bar. Used for mean/vol structural breaks.

**3.2 `bocpdLite(xs, hazard?)` — Bayesian online change-point, truncated.**
Adams-MacKay with Normal-Inverse-Gamma conjugate updates, run-length
distribution truncated to top-50 mass. O(R) per observation, R ≤ 50. Emits
P(change point within last m bars). Behind `experimental` flag until it
demonstrably beats CUSUM timing on the scoreboard.

**3.3 `hmm3(xs)` — 3-state Gaussian HMM.** Generalize `hmmRegimeDetect`
(EM, forward-backward, sticky prior on diagonal). O(T·S²), S=3.

**3.4 `grangerLite(y, x, lag=1)`** — OLS r_y,t ~ r_y,t−1 + r_x,t−1 with
Newey-West (HAC) standard error; returns t-stat and p-value. O(T). Feeds
lead-lag edges (always through BH-FDR).

**3.5 `labelPropagation(edges, iters=10)`** — community detection for theme
clustering. O(E·iters).

**3.6 `mahalanobisAnomaly(X, x)`** — Ledoit-Wolf Σ̂, Cholesky solve
(`choleskyDecompose` exists), χ² p-value. O(F³) once per day, F≈7.

**3.7 `jaccardNovelty(claim, recentClaims)`** — token-set Jaccard for novelty
+ sybil dedup. O(k·|tokens|).

**3.8 `propagateImpact(graph, seeds, k=2, ρ=0.6)`** — bounded-depth weighted
propagation with per-node max-aggregation and cycle guard. O(Σ d^k), d≈10.

**3.9 `greedyBudgetAllocator(tasks, budget)`** — marginal-value-per-cost
greedy (justified by budget-concavity: greedy is (1−1/e)-optimal under
submodular value). Governs API/LLM spend per scan inside `apiGovernor`.

**3.10 `admitClaim(cr, constraints)`** — simulation-grounded admission:
range checks (price > 0, |Δp| ≤ exchange band), accounting identities where
applicable, contradiction-with-scar check. Returns V ∈ {1, 0, pending} +
rejection reason. Runs at ingest in `twrd-ingest` and at feature ingest in
`discovery-scan`.

---

## 4. TypeScript architecture — exact files and functions

### 4.1 New: `src/lib/discovery/` (pure modules, ~2,400 LoC total)

| File | Exports (signatures abridged) |
|---|---|
| `types.ts` | `OpportunityCandidate`, `OpportunityScore { os, logOs, ci68, factors: {eNet, r, c, y, tau, l, n, q} }`, `EngineForecast { mu, s2, h }`, `SignalClass`, `DiscoveryStageBudget`, `ClaimRecordLite`, `AssetEdge`, `Theme`, `NarrativeState` |
| `changepoint.ts` | `cusum`, `bocpdLite`, `hmm3` |
| `features.ts` | `robustZ(xs)`, `updateFeatureRow(prev, bar): FeatureRow` (incremental O(1) updates: EWMA vol, volume z, range z, momentum, sector-rel), `FEATURE_SPECS` registry |
| `quant-discovery.ts` | `scanQuant(row: FeatureRow, hist: Series, ctx: RegimeCtx): EngineSignal[] & { forecasts: EngineForecast[] }` — the 9 detectors of §2.4 |
| `news-intel.ts` | `jaccardNovelty`, `informationSurprise`, `epistemicMomentum(tHistory)`, `claimToSignals(claims, links): EngineSignal[]` |
| `narrative.ts` | `labelPropagation`, `buildThemes(claims): Theme[]`, `narrativeState(theme, crowd): NarrativeState`, `propagateImpact` |
| `regime.ts` | `detectRegime(spy, vix, sectors): RegimeCtx` (hmm3 + CUSUM + fragility), `regimeConditionParams(regime): MCParams` |
| `crossasset.ts` | `PAIR_WATCHLIST`, `scanCrossAsset(seriesMap): EngineSignal[]`, `grangerLite` |
| `crowd.ts` | `crowdingScore(inputs: CrowdInputs): { crowd, componentsUsed }`, `unwindRisk(crowd, momentumTurn): EngineSignal | null` |
| `anomaly.ts` | `mahalanobisAnomaly`, `scanAnomalies(rows, scars): RankedAnomaly[]` (§2.8 ranking) |
| `statarb-discovery.ts` | `scanPairs(sectorSeries): PairCandidate[]` (funnel §2.9-8, calls `engleGranger`/`estimateOU`/battery) |
| `macro.ts` | `surpriseIndex(releases)`, `quadrant(growth, inflation)`, `quadrantTilts(q): SectorTilt[]` *(experimental flag)*, `curveSignals(nsParams)` |
| `scoring.ts` | `expectedEdge(forecasts, hist): {eNet, q}` (§2.2), `payoffAsymmetry(mcPaths)`, `timeliness(class, age)`, `liquidityFactor(adv$)`, `opportunityScore(factors): OpportunityScore`, `loadBearingClaim(candidate): {input, deltaOs}` |
| `robustness.ts` | `pReal(pValues, i, batteryOpt)`, `fssMonteCarlo(candidate, regime, constraints): number` (constraint-filtered MC), `regimeStability(stats)`, `publishGate(score, pReal, fss): {publish, reasons[]}` |
| `learning.ts` | `updateReliability(cell, hit)` (decayed Beta + EB shrink), `scarScore(failure): number`, `shouldScar(sc, history)`, `metaCalibrate(logit, features): number`, `scoreboard(outcomes): ScoreboardStats` |
| `funnel.ts` | `runDiscoveryScan(universe, budgets, deps): DiscoveryResult` — orchestrates Stages 1–3, enforces `DiscoveryStageBudget`, calls `greedyBudgetAllocator` |
| `admission.ts` | `admitClaim`, `admitBar(bar, prevBar): AdmissionResult` |
| `index.ts` | barrel re-exports |
| `discovery.test.ts` | seeded tests: parameter recovery (CUSUM detects injected break, HMM3 recovers states), noise-rejection (pure-noise universe ⇒ ≥90% of candidates rejected by FDR gate — *the* critical test), FSS monotonicity, scoring invariants (factor floors, log-space consistency), scar permanence |

### 4.2 New: worker + hook + UI

| File | Contents |
|---|---|
| `src/workers/discovery.worker.ts` | wraps `runDiscoveryScan`; message protocol {universe features in, DiscoveryResult out}; transferable arrays for series |
| `src/hooks/useDiscovery.ts` | orchestrator: loads Stage-0 features + claims + regime from Supabase (via `governedInvoke`), spawns worker, persists published opportunities, exposes `{opportunities, rejected, scoreboard, isScanning, rerun}` |
| `src/components/discovery/DiscoveryFeed.tsx` | ranked opportunity cards: OS + interval, factor breakdown bars, load-bearing claim, regime badge, thesis text, `experimental` labels |
| `src/components/discovery/NarrativeMap.tsx` | theme list with state machine badges + linked tickers (reuses `@xyflow/react` already in deps for the graph view) |
| `src/components/discovery/DiscoveryScoreboard.tsx` | Brier/reliability/decile-lift/hit-rate panels (reuses chart components) |
| `src/components/discovery/RejectedPanel.tsx` | debug view of rejected candidates + reasons |

### 4.3 New/updated edge functions

| Function | Role |
|---|---|
| `discovery-scan/index.ts` (new, cron hourly market hours / daily off-hours) | Stage 0: pull OHLCV + flows + macro via existing `liveData.ts`, run `admitBar`, upsert `discovery_features`; run DSE claim extraction (structured → `twrd_claims`, **no LLM**); refresh `asset_graph_edges` lead-lag weekly |
| `narrative-intel/index.ts` (new, cron 2h) | build themes from trailing claims (`buildThemes`), persist `narrative_themes`, single optional `callAI` per new theme for label |
| `discovery-outcomes/index.ts` (new, cron daily) | fill forward returns in `opportunity_outcomes`, run learning updates (reliability cells, scars, logit step), recompute scoreboard aggregates |
| `twrd-ingest` (modify) | add `admitClaim` gate + `jaccardNovelty` sybil dedup before scoring |
| `desirable-assets` (modify) | consume `opportunities` where fresh instead of re-deriving; keeps API identical for existing UI |
| `_shared/ensemble.ts` (modify) | reliability prior lookup becomes (engine × regime); add Kish effective-evidence adjustment: within-bucket weight × 1/(1+(k−1)·ρ̄) with ρ̄ = mean pairwise signal correlation per bucket (est. quarterly) |

### 4.4 Database migrations (one file, `supabase/migrations/…_discovery_v2.sql`)

```sql
CREATE TABLE public.discovery_features (        -- market-level, no RLS-per-user
  symbol text NOT NULL, as_of date NOT NULL,
  features jsonb NOT NULL,                      -- FeatureRow (versioned schema key)
  admitted boolean NOT NULL DEFAULT true, rejection_reason text,
  PRIMARY KEY (symbol, as_of));

CREATE TABLE public.asset_graph_edges (
  src text NOT NULL, dst text NOT NULL,
  edge_type text NOT NULL,                      -- sector_member|supply_chain|cointegrated|lead_lag|claim_link
  weight real NOT NULL CHECK (weight BETWEEN 0 AND 1),
  as_of timestamptz NOT NULL DEFAULT now(), meta jsonb,
  PRIMARY KEY (src, dst, edge_type));

CREATE TABLE public.narrative_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text, entities text[] NOT NULL, tickers text[] NOT NULL,
  state text NOT NULL,                          -- emerging|accelerating|crowded|decaying
  volume_z real, momentum real, breadth int, crowd real,
  t_history jsonb, updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  symbol text NOT NULL, signal_class text NOT NULL, direction smallint NOT NULL,
  horizon_days int NOT NULL, os real NOT NULL, os_ci68 real[] NOT NULL,
  factors jsonb NOT NULL,                       -- {eNet,r,c,y,tau,l,n,q} + engine votes
  regime text NOT NULL, load_bearing jsonb, thesis text,
  published boolean NOT NULL, reject_reasons text[],
  frozen_features jsonb NOT NULL);              -- for learning, immutable

CREATE TABLE public.opportunity_outcomes (
  opportunity_id uuid REFERENCES public.opportunities(id),
  horizon_days int NOT NULL, fwd_return real, hit boolean,
  filled_at timestamptz, PRIMARY KEY (opportunity_id, horizon_days));

CREATE TABLE public.engine_regime_stats (
  engine_id text NOT NULL, regime text NOT NULL,
  alpha real NOT NULL DEFAULT 1, beta real NOT NULL DEFAULT 1,
  n int NOT NULL DEFAULT 0, updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (engine_id, regime));
```

Market-level tables get read-only anon policies + service-role writes;
user-scoped views join against them (consistent with existing RLS patterns
like `scar_memory`). `scar_memory` gains columns `scar_score real`,
`permanent boolean DEFAULT false`, `context_bucket text` (additive, no
breaking change).

---

## 5. Computational complexity & browser feasibility

| Component | Complexity | Concrete cost (measured class of machine: mid laptop) |
|---|---|---|
| Stage-0 feature update | O(1)/symbol/bar incremental | edge cron, ~500 rows/run |
| Stage-1 screen | O(N·F), 500×25 | < 10 ms |
| GARCH/OU/Hurst per survivor | O(T), T=504 | ~0.3 ms each; 50 survivors × 9 detectors ≈ 100 ms |
| DCC-lite on 40 cross-asset series | O(N²T) capped | ~60 ms, weekly full / daily incremental |
| HMM3 on SPY (T=504) | O(T·S²·iters) | < 20 ms |
| Pair scan per sector (30 symbols) | O(N²) corr + ~40 EG tests O(T) | < 80 ms/sector, staggered across days |
| Stage-3 MC (10 finalists × 1000 paths × 60 steps) | O(n·steps) | ~300 ms total in worker |
| Mahalanobis (F=7) | O(F³ + N·F²) | < 5 ms |
| Theme clustering (5k claims, E≈20k) | O(E·iters) | < 100 ms, edge-side |
| Impact propagation k=2 | O(seeds·d²), d≈10 | < 1 ms |
| Learning updates | O(1)/outcome | negligible |
| **Full browser scan (Stages 1–3)** | — | **< 1.5 s in Web Worker; zero UI jank** |

Memory: 500 symbols × 504 bars × 8B ≈ 2 MB Float64 — trivial. All heavy state
(claims, features) pages from Supabase; the worker holds only the scan
working set. IndexedDB caching of series (existing `useHistoricalPrices`
pattern) avoids refetching.

Feasibility verdicts: everything above runs comfortably. Explicitly **out**
on infeasibility/data grounds: full options-surface flow analysis (no
reliable free feed — options signals degrade gracefully to "if available"),
PC-algorithm causal discovery at universe scale, tick-level microstructure,
cross-user federated learning.

---

## 6. Migration plan

Principle: strangler-fig, never break the existing `desirable-assets` flow.

1. **M0 — additive schema.** Ship the migration (all new tables + scar
   columns). No behavior change.
2. **M1 — shadow mode.** `discovery-scan` cron + `runDiscoveryScan` populate
   `opportunities` with `published=false` alongside the existing engine.
   Scoreboard accumulates. Duration: ≥ 3 weeks of forward outcomes.
3. **M2 — gated exposure.** Discovery page reads v2 opportunities behind a
   flag; `desirable-assets` starts consuming fresh v2 rows (its response
   shape unchanged). Rejected panel live for debugging.
4. **M3 — learning switch-over.** Regime-conditional reliabilities feed
   `runConsensus`; OnlineLogit challenger vs Platt champion on rolling
   Brier; winner calibrates C.
5. **M4 — retire duplicates.** Legacy per-call sentiment keyword scoring in
   `desirable-assets` replaced by claim-based News Intelligence; `callAI`
   volume drops (tracked on scoreboard).
6. Rollback at every step = flag flip; v1 path untouched until M4.

## 7. Implementation roadmap

| Phase | Weeks | Deliverables | Acceptance |
|---|---|---|---|
| **P0 Foundation** | 1–2 | migration; `types/features/changepoint/admission`; `discovery-scan` Stage-0 cron; admission gate in `twrd-ingest` | features populating; 0 impossible claims pass gate; tests green |
| **P1 Quant + scoring core** | 3–5 | `quant-discovery`, `scoring`, `robustness` (FDR + FSS), `funnel`, worker, `useDiscovery`, shadow publishing | pure-noise test rejects ≥90%; scan < 2 s; shadow rows flowing |
| **P2 News + narrative + anomaly** | 6–8 | `news-intel`, `narrative`, `narrative-intel` fn, `anomaly`, asset graph seed (sectors + lead-lag), NarrativeMap UI | themes surface before volume peak (tracked); anomaly ranking audited |
| **P3 Cross-asset + stat-arb + macro + crowd** | 9–11 | `crossasset`, `statarb-discovery`, `macro` (quadrant table experimental), `crowd`; ensemble Kish adjustment | pair funnel end-to-end with battery gate; crowd score on all candidates |
| **P4 Learning loop** | 12–14 | `learning`, `discovery-outcomes` fn, engine×regime reliabilities, scar scoring, meta-calibration challenger, Scoreboard UI | Brier tracked per engine; scar permanence tests; champion/challenger running |
| **P5 Exposure + hardening** | 15–16 | M2→M4 migration steps, RejectedPanel, docs, load tests, budget allocator tuning | v2 default; LLM calls/scan reduced ≥50%; scoreboard public in-app |

Ongoing (quarterly): refit half-life table, bucket correlations ρ̄, scar
weights; review 🧪 flags (bocpdLite, simulated outcome gradient, macro
quadrant tilts, GIE parser) for promotion or deletion based on scoreboard
evidence.

## 8. Expected benefits and honest risks

Benefits (all falsifiable, targets in `TRUTH_TO_ENTROPYLITE_MAP.md` §3):
earlier surfacing (narrative momentum + change-points lead price/volume
peaks), higher precision (FDR + battery + FSS rejection stack), calibrated
uncertainty on every output, regime-aware ranking, second-order effect
coverage no current module has, compounding learning loop, and lower LLM
spend.

Risks: meta-learner overfit (bounded + shrunk + gated — §2.10); early FDR
over-rejection (label-mode first); free-data quality (admission gate +
degraded-mode flags per missing feed); crowding sign ambiguity (learned per
class, not assumed); silent regressions (scoreboard is the tripwire — any
engine whose rolling Brier degrades 20% auto-demotes to `experimental`);
scope creep (anything not in §4 file list is out until a phase completes).

---

*This spec is grounded in the current codebase: every "exists" annotation
names a real exported function. The system it describes is a set of pure
TypeScript modules over Supabase tables and cron edge functions — no cluster,
no new infrastructure class, no fake math.*
