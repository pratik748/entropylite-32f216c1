# Entropy Lite — Institutional Upgrade Specification (v1)

Response to the *Comprehensive Architectural Math/Quant Audit (v3)*.
Architecture and philosophy preserved; this change strengthens estimation,
calibration, validation, and tail risk with mathematically grounded methods
that run in the browser / edge functions at negligible cost.

---

## 1. What this change ships

### New modules (`src/lib/quant/`)

| File | Contents | Runs in |
|---|---|---|
| `covariance.ts` | Ledoit–Wolf constant-correlation shrinkage; EWMA (RiskMetrics) covariance + streaming step; scalar DCC-lite dynamic correlation; correlation distance | browser, edge, laptop — O(N²T), <10 ms at N≤50 |
| `allocation.ts` | Hierarchical Risk Parity (López de Prado 2016); Black–Litterman posterior returns | browser — O(N³) worst case, <5 ms |
| `validation.ts` | Walk-forward splits; purged K-fold + embargo; CSCV/PBO; PSR/DSR/MinTRL; Lo Sharpe SE; stationary bootstrap; White's Reality Check; Benjamini–Hochberg FDR; `validateStrategyBattery` one-call gate | browser (Web Worker above ~10⁸ ops); CSCV S=10 is 252 combos, <100 ms |
| `evt.ts` | POT-GPD tail fit (PWM, closed form); EVT VaR/ES; Hill tail index; regime-stratified EVT | browser — O(T log T) |
| `calibration.ts` | Brier / log-loss / reliability curves; decayed Beta-Bernoulli posterior; empirical-Bayes shrinkage; `OnlineLogit` (SGD, L2, bounded, serialisable) | browser + edge; O(1) per update |

### Modified

| File | Change |
|---|---|
| `odg-validator.ts` | Scar factor → similarity- and severity-weighted multiplicative hazard `exp(−W/τ)`; path probabilities → softmax model with calibratable coefficients (baseline behaviour preserved) |
| `useClankLearning.ts` | Confidence update → prior-anchored Beta posterior with bounded effective sample size (fixed-gain Bayesian; never stops adapting). Same DB columns, no migration |
| `statarb-math.ts` | `riskParityWeights` (SA-14, was inverse-vol heuristic) now delegates to the true ERC solver; inverse-vol only as degenerate-Σ fallback |

### Tests
`src/lib/quant/upgrades.test.ts` — 42 deterministic tests (seeded mulberry32
RNG throughout; parameter-recovery tests for GPD, noise-vs-edge tests for
PBO/Reality Check, PSD/simplex invariants for the estimators). Full suite:
70/70 passing.

---

## 2. Mathematics

### 2.1 Ledoit–Wolf shrinkage (why the optimisers get better inputs)

Sample covariance S from T obs of N assets has O(N²) free parameters vs NT
data points; when T/N is small the extreme eigenvalues are badly biased and
`minVarianceWeights` / Kelly amplify exactly those errors. LW solves

    Σ* = δF + (1−δ)S,   F = constant-correlation target
    δ* = argmin E‖Σ* − Σ‖²_F  =  (π̂ − ρ̂)/γ̂ · 1/T   (clamped to [0,1])

with π̂ (sampling error of S), ρ̂ (covariance of S with F), γ̂ = ‖S−F‖²_F all
estimable in closed form — no tuning parameter. This is complementary to the
existing Marchenko–Pastur cleaning: LW fixes *estimation variance*, MP fixes
*eigenvalue dispersion*; for N/T > 0.3 apply both.

**Recommended Σ pipeline** (single change at each optimiser call-site):

    returns → ledoitWolfShrinkage → (mpCleanCovariance if N/T > 0.3)
            → nearestPSD → { minVariance | meanVariance | ERC | HRP | Kelly }

Trade-off: with very long samples (T ≫ N²) δ→0 automatically, so there is no
regime where LW hurts. Failure mode: none material; degenerate inputs return
`null` like the rest of the library.

### 2.2 DCC-lite (regime-aware correlation without MLE)

Engle (2002) DCC-GARCH needs quasi-MLE — unnecessary weight for this
platform. The fixed-λ (integrated) limit preserves the first-order effect
(correlations rise in stress, exactly what CLANK/Fortress care about):

    h_{i,t} = λ_v h_{i,t−1} + (1−λ_v) x²_{i,t}          (λ_v = 0.94)
    ε_t = x_t / √h_t
    Q_t = λ_c Q_{t−1} + (1−λ_c) ε_t ε_tᵀ                 (λ_c = 0.97)
    R_t = diag(Q_t)^{−½} Q_t diag(Q_t)^{−½},  Σ_t = D_t R_t D_t

Consumers: Fortress threat scanner (correlation spike detection), regime
framework (mean off-diagonal of R_t as a systemic-stress feature), CLANK
`liquidity-threshold` proximity. Streaming: `ewmaCovarianceStep` is O(N²)
per bar.

### 2.3 HRP and Black–Litterman (where the proprietary signals belong)

**HRP** never inverts Σ — it clusters assets on d_ij = √(½(1−ρ_ij)),
quasi-diagonalises, and splits risk top-down with inverse-variance
allocations. It is the robust default when N is small-sample or Σ is
near-singular (duplicated ETFs, short histories) — precisely where
`minVarianceWeights` returns null today.

**Black–Litterman** is the mathematically correct integration point for the
proprietary stack. Equilibrium prior Π = δΣw_mkt; views (P, Q, Ω); posterior

    μ_BL = [(τΣ)⁻¹ + PᵀΩ⁻¹P]⁻¹ [(τΣ)⁻¹Π + PᵀΩ⁻¹Q]

Map Entropy Lite signals → views:
- ODG `gNew` on ticker i → absolute view `P = e_i`, `Q = k·gNew·σ_i`,
  confidence = scar-and-calibration-weighted (start k so views are ±1σ max).
- CLANK pressure on an asset class → relative bearish view with confidence =
  learned constraint confidence.
- Reflexivity crowding → *reduces* confidence of views aligned with the crowd.

This replaces ad-hoc weight nudges with a Bayesian blend that degrades
gracefully to the market portfolio when signals are silent. With no views the
posterior is exactly Π (unit-tested).

### 2.4 Validation framework (the research gate)

The platform generates many strategy variants (Strategy Lab/Factory); the
selection step is where overfitting enters. The gate:

1. **Purged K-fold + embargo** for any fitted parameter (labels spanning h
   bars leak into naive folds; purge width = h, embargo ≈ 1%T).
2. **CSCV → PBO**: split T into S=10 blocks; for each of C(10,5)=252
   IS/OOS partitions, rank the IS-best strategy OOS. PBO = P(rank below
   median). Accept < 0.2.
3. **DSR**: benchmark the observed Sharpe against the expected max of N
   trials, E[maxSR] ≈ √V[SR]·[(1−γ)Φ⁻¹(1−1/N) + γΦ⁻¹(1−1/(Ne))], then
   PSR against that. Accept DSR ≥ 0.95.
4. **White's Reality Check** (stationary bootstrap, seeded): p-value that the
   best variant beats the benchmark by luck. Accept < 0.10.
5. **BH-FDR** across signal batteries (e.g. per-ticker cointegration scans in
   the stat-arb engine — 50 pairs at α=0.05 yields ~2.5 false "cointegrations"
   without it).

`validateStrategyBattery(returnsPanel, benchmark)` runs 2–4 and returns
`robust | borderline | overfit | insufficient-data`. Wire it as a hard gate
before any strategy is promoted to EXECUTABLE, and store the report next to
the strategy row.

### 2.5 EVT (what unifiedVaR cannot see)

Historical VaR cannot exceed the worst observed loss; Cornish-Fisher breaks
down beyond |z| ≈ 2.5 with the skew/kurtosis seen in crisis regimes. POT-GPD:

    over threshold u:  P(L > u + y | L > u) ≈ (1 + ξy/β)^{−1/ξ}
    VaR_p = u + (β/ξ)[((n/N_u)(1−p))^{−ξ} − 1]
    ES_p  = (VaR_p + β − ξu)/(1 − ξ)            (ξ < 1)

PWM fitting is closed-form and deterministic (unit-tested parameter
recovery). Use for the 99%+ tail and Fortress stress sizing; keep
`unifiedVaR` for the 95% body. `regimeEVT` conditions the tail on the HMM
regime path where each stratum has ≥150 obs. Failure mode: with <100 obs or
ξ ≥ 0.5 samples the fit refuses (`null`) rather than extrapolating nonsense.

### 2.6 Calibration layer (proprietary engines)

**CLANK (relationship: hand-tuned expert system → calibrated probabilistic
classifier).** The registry priors (0.65–0.95) are now the *prior mean* of a
Beta posterior with strength N0=10 and evidence capped at NCAP=40:

    conf_{n+1} = (conf_n·(N0 + min(n,NCAP)) + accuracy_{n+1}) / (N0 + min(n,NCAP) + 1)

Gain floors at 1/(N0+NCAP+1) ≈ 0.02 — equivalent to a decayed-Beta posterior
with ~50-outcome memory, so confidence tracks regime change instead of
freezing (the flaw of the previous running mean). Phase 2 (infrastructure
shipped, wiring pending): per-constraint `OnlineLogit` on features
`[proximity, vix/40, realizedVol/40, |drawdown|·5, regimeFlag]`, blended with
the registry prior via `predictBlended` until nObs ≥ 30; state serialises to
one JSON column (suggested: `clank_confidence_overrides.model_state jsonb`).

**ODG (relationship: rule-gated expected-utility scorer; the G_new gradient
is a product-form expected-utility heuristic).** Two formalisations shipped:
- *Scar memory* → multiplicative failure hazard. Each similar past failure
  contributes weight w = similarity·severity (severity = clamp(|pnl|/5,¼,2));
  scarFactor = clamp(exp(−Σw/τ), 0.3, 1), τ=3. Monotone in evidence,
  severity-aware, removes the arbitrary per-ticker denominator, same output
  range so every downstream gate is unchanged.
- *Path probabilities* → softmax over path logits with base logits
  ln(0.35/0.40/0.25) (reproduces the prior baseline exactly) and regime /
  crowding / VIX coefficients mapped from the old tilts via Δz ≈ Δp/(p(1−p)).
  Guaranteed simplex, and the coefficient vector is now a calibration target:
  record (features, realised path) per closed trade, refit with `OnlineLogit`
  per path (one-vs-rest) once ≥100 outcomes exist, and score with
  `brierScore`/`reliabilityCurve` in the Outcome Gradient dashboard.

**TWRD (relationship: already a correct Bayesian design — Beta credibility,
Noisy-OR, exponential decay, logistic aggregation with SGD).** No internal
changes (matching the audit's finding). Additions available to it now:
`reliabilityCurve`/`brierScore` over `twrd_feedback` outcomes vs truth scores
gives the first quantitative statement of TWRD calibration; the decayed
`betaUpdate` is the drop-in upgrade for `bumpSource` so stale sources lose
credibility (λ=0.995 ≈ 200-claim memory). Both are additive, not rewrites.

**Reflexivity/CROWN/FGM/Regime.** FGM's OU/GBM/Hurst core is standard and
sound. The regime framework (HMM in `statarb-math.ts` + heuristic fallback)
gains two features from this change: DCC-lite mean-correlation and the Hill
tail index — both cheap, regime-discriminating inputs. CROWN micro-hedge
logic is untouched.

---

## 3. Migration plan (priority order)

| # | Step | Effort | Risk | Why first |
|---|---|---|---|---|
| 1 | **Σ pipeline**: call `ledoitWolfShrinkage` before every optimiser (`useQuantSnapshot`, PortfolioCommandCenter, markowitzWithCosts callers) | S | none (null-safe fallback to current path) | Improves every downstream weight with zero UI change |
| 2 | **Validation gate**: `validateStrategyBattery` as hard gate in Strategy Lab/Factory promotion; persist report | M | none (advisory→blocking flag) | Directly attacks overfitting, the biggest silent risk |
| 3 | **HRP** as allocator option + automatic fallback when `minVarianceWeights` returns null | S | low | Robustness where Markowitz fails today |
| 4 | **EVT VaR/ES** panel next to unifiedVaR for 99%/99.9%; Fortress stress sizing from ES | S | low | Honest tail numbers |
| 5 | **CLANK logistic phase 2**: log features at activation, add `model_state jsonb`, wire `OnlineLogit.predictBlended` | M | low (blending guards small n) | Ends hard-coded confidences permanently |
| 6 | **ODG path calibration**: record realised path per closed trade; refit softmax coefficients; reliability curve in dashboard | M | low | Turns the validator's probabilities into measured quantities |
| 7 | **Black–Litterman**: map ODG/CLANK/reflexivity signals to views; replace direct weight nudges | L | medium (needs view-scaling discipline) | Principled signal→allocation path |
| 8 | **TWRD decayed credibility** (λ in `bumpSource`) + calibration dashboard | S | low | Keeps source credibility current |

Compute/memory at platform scale (N≤50 assets, T≤2500 bars, S≤50 variants):
every routine above is <100 ms and <10 MB in the browser; only CSCV with
S>50 partitions or Reality Check with nBoot>2000 warrants a Web Worker.
Nothing requires new infrastructure, retraining jobs, or data feeds beyond
what exists (real VIX + factor series already piped per audit items 7/13).

## 4. Explicitly not done (and why)

- **No removal or replacement of TWRD, CLANK, ODG, Reflexivity, Scar Memory,
  FGM, Outcome Gradient, CROWN, or the regime framework** — all preserved;
  changes are estimation/calibration upgrades inside their existing shapes.
- **Nonlinear shrinkage (Ledoit–Wolf 2020)**: needs numerical Hilbert
  transforms; benefit over linear LW is second-order at N≤50. Revisit if the
  universe grows past ~100 assets.
- **Full DCC-GARCH / Bayesian state-space MLE**: optimisation-heavy, fragile
  in JS, marginal gain over the fixed-λ limits at daily frequency.
- **Full Johansen (S00/S01/S11 canonical correlations)**: the existing
  Johansen-lite plus Engle–Granger with proper ADF covers the platform's
  pair-trading needs; full Johansen matters for baskets >3 series.
