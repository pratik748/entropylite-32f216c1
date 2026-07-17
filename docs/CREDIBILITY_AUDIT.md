# EntropyLite Credibility Audit — Findings, Fixes, and Residual Risk

**Date:** 2026-07-17
**Scope:** full data → math → evidence → UI spine (client `src/lib/*`, hooks,
edge functions `supabase/functions/*`).
**Standard applied:** every material number must be able to answer *what is
this, where did it come from, what convention produced it, and how confident
should a professional be*. A number that cannot answer these is either fixed,
labeled, or removed.

This document is the defensible chain of evidence for the audit. Every finding
cites the code. Findings are grouped by class, each with status:
**FIXED**, **LABELED** (made honest without rebuilding), or **RESIDUAL**
(documented risk, not yet resolved — with the reason).

---

## 1. One truth spine: duplicated & conflicting math

### 1.1 Four independent definitions of volatility — FIXED

The same concept ("daily volatility") was computed with different estimators
in different modules, so the same ticker could show different vols depending
on the screen:

| Location | Old estimator |
|---|---|
| `src/lib/quant-engine.ts` | sample stdev (÷N−1), log returns |
| `src/lib/statarb-math.ts` `stddev` | **population** stdev (÷N) |
| `src/lib/evidence/compute.ts` `annualizedVol` | **population** stdev |
| `supabase/functions/direct-profit` | **population** stdev over **simple** returns |
| `supabase/functions/analyze-stock` | sample stdev over **simple** returns |
| `supabase/functions/desirable-assets` | sample stdev, log returns |

**Fix:** one convention — sample stdev (ddof = 1) of daily **log** returns,
annualized by √252.
- Edge: new canonical module `supabase/functions/_shared/stats.ts`; the
  three big engines (`desirable-assets`, `analyze-stock`, `direct-profit`)
  and `_shared/mathEdge.ts` now import from it instead of redefining.
- Client: `evidence/compute.ts` and `statarb-math.ts` converged to the
  documented `quant-engine.ts` convention.
- Invariant enforced by test: `src/test/truth-spine.test.ts` asserts the edge
  and client spines produce **identical** vol, Sharpe, Sortino, drawdown, and
  VaR for the same series.

### 1.2 Three different risk-free assumptions for "Sharpe" — FIXED

- client `quant-engine.sharpe`: rf = 0
- `analytics/performance.ts`: rf = 5.0%
- `analyze-stock`: rf = 4.5%; `desirable-assets`: rf ≈ 5.04% (0.0002/day)

The same portfolio could show materially different Sharpe ratios on the Desk
vs. the Workstation vs. Discover — with no indication why.

**Fix:** one exported constant `ANNUAL_RISK_FREE = 0.045` in both
`quant-engine.ts` (client) and `_shared/stats.ts` (edge); all surfaces route
through it; the truth-spine test asserts the two constants are equal. The
evidence node for Sharpe now states the convention in its calculation string
(`build.ts`, `sharpe_1y`).

**RESIDUAL:** a single global rf is itself an approximation — an INR book
should use an INR curve (~6.5–7%). The right end state is a per-currency rf
from a rates source, threaded through provenance. Until then the assumption
is at least *single* and *stated*.

### 1.3 Evidence fallback disagreed with its primary — FIXED

`evidence/build.ts:356` uses `quantMetrics.sharpe1y` from `analyze-stock`,
falling back to a locally computed `realizedSharpe` — which used rf = 0 and a
population stdev. The *same evidence node* could be produced under two silent
conventions depending on which source happened to be available.
`realizedSharpe` now matches the engine convention exactly.

### 1.4 VaR conventions — FIXED

`direct-profit` used `floor(n·0.05)−1` tail indexing; `quant-engine` uses
`floor((1−conf)·n)`. Both now share the canonical `historicalVaRCVaR`
(edge) / `historicalVaR`+`historicalCVaR` (client), asserted identical in
tests. `direct-profit` also computed "historical VaR" from as few as **3**
returns; it now requires ≥ 20 observations and otherwise uses its explicitly
labeled parametric estimate branch.

---

## 2. Fabricated values presented as measured data

### 2.1 AI-invented FII/DII flows and top movers — FIXED (highest severity)

`supabase/functions/market-data/index.ts` *prompted the model to fabricate*:

> `fiiFlow / diiFlow: directional + magnitude phrase ("FII +$1.2bn 5d net
> buy"...). Plausible scale for the region.`

These invented dollar amounts rendered in `MarketOverview` as a macro data
card **next to real quotes** (USD/INR, Brent, Gold), indistinguishable from
measured data. `topMovers` (names + % changes) and `moodScore` were also
model-invented, and `moodScore`/`topMovers` feed `useMarketRegime`, which
feeds the derivatives engine and strategy lab — fabricated data propagating
into decision inputs.

**Fix:**
- `topMovers` is now computed from the real index/sector quotes the function
  already fetches (largest |Δ%|), labeled "measured".
- `moodScore` is now computed server-side from measured VIX, breadth, and
  average index move with the formula stated in `moodBasis` — the model no
  longer supplies it.
- `fiiFlow`/`diiFlow` are `null` with `flowDataAvailable: false`. The UI
  card was replaced with measured market breadth. **No flow data source is
  connected, and the system now says so instead of inventing figures.**
- The AI's remit is reduced to interpretation of the measured numbers it is
  given, under hard no-invented-numbers rules; "keyEvents" became
  model-suggested **watch items** and are labeled as model commentary in the
  UI (previously the prompt instructed the model to fabricate "scheduled
  events" when uncertain).

### 2.2 Risk dashboard preferred fabricated risk over measured risk — FIXED

`RiskDashboard.tsx` had real historical VaR/CVaR available from
`useQuantSnapshot` (actual 1y return series) but displayed the
`risk-intelligence` figures — sigma inferred from VIX with magic multipliers
(`(0.65 + β·0.45)·(0.7 + risk/100)`), CVaR as `VaR × (1.24 + σ·4)` — or a
static fallback (`dailyVol = riskScore/100 × 2.5%`).

**Fix:** measured-first priority. When return history is loaded, headline
VaR/CVaR are the historical figures, labeled with their sample size; the
heuristics only appear when history is absent, labeled "heuristic estimate".
The server response now carries a `methodology` block declaring each of its
outputs heuristic (`risk-intelligence/index.ts`).

### 2.3 Fabricated correlation matrix — FIXED

`RiskDashboard` displayed a "correlation matrix" built as
`0.3 + min(βᵢ,βⱼ)·0.2` (+0.3 in "bear" mode) while genuine Pearson
correlations from return history sat unused in `snap.correlation`. Measured
correlations now render when available (labeled with window); the beta
heuristic remains only as an explicitly labeled fallback.

### 2.4 Fake E/S/G decomposition — FIXED

`ESGModule.tsx` displayed Environment/Social/Governance sub-scores that were
scaled copies of one provider number (×0.92 / ×0.97 / ×1.05), charted in a
radar as if independently measured. Deterministic fabrication is still
fabrication. The module now shows only the provider overall score, states
that no pillar-level source is connected, and reports per-row provenance.

### 2.5 Heuristic beta with false provenance — FIXED

`analyze-stock` substitutes `clamp(vol/22, 0.65, 2.75)` when Yahoo has no
beta, and the evidence graph described the result as "Regression of daily
returns on the index" — a calculation that never happens anywhere in the
system. The payload now carries `betaSource: "yahoo" | "vol_heuristic"`, and
the evidence node reports provenance `reported` vs `estimated` with an honest
calculation string ("Treat as a rough proxy, not a regression").

### 2.6 Dead demo data — FIXED

`src/lib/demoData.ts` (hardcoded RELIANCE analysis + six fake headlines with
invented sentiment/impact/confidence) was unreferenced legacy. Deleted.

---

## 3. Residual risk register (found, documented, not yet rebuilt)

These are real weaknesses a professional should know about. They are listed
here precisely so they cannot masquerade as strengths.

1. **`risk-intelligence` factor exposures and stress scenarios are
   templates, not models.** Value = PE buckets; stress = fixed shocks scaled
   by beta. Now labeled heuristic end-to-end (server `methodology` block +
   dashboard badge), but the honest end state is factor regressions against
   real factor return series and scenario repricing. (`risk-intelligence/
   index.ts:108–151`; `RiskDashboard.tsx` fallback blocks.)
2. **`computeMaxProfitTarget` "confidence" is uncalibrated.**
   `80 − uplift·1.5 + Sharpe·10 − vol·0.3` clamped to [15, 95] is a score
   with no empirical basis. It feeds Discover ranking context. Should be
   replaced by an interval from the drift/vol model it already computes.
   (`desirable-assets/index.ts:519–564`.)
3. **Single global risk-free rate** (see 1.2).
4. **`quant-engine.beta()` returns 1 on insufficient data** — a neutral-looking
   default where `null` would be honest. Callers need a null-path before this
   changes. (`quant-engine.ts:270`.)
5. **Sortino returns 0 when there are no downside observations** — reads as
   "bad" when it means "no downside in sample". Convention kept for
   compatibility (client and edge agree), but a `null`/"insufficient sample"
   surface would be more truthful.
6. **Yahoo scraping is the de-facto primary price source** with no cross-source
   reconciliation. `liveData.ts` fetches Screener/Finviz/Yahoo but conflicts
   are resolved by fixed precedence (`screener ?? yahoo`), silently. A
   conflict detector (flag when sources disagree > x%) is the next provenance
   step.
7. **Some augment modules remain display-grade.** e.g. `HedgingModule`
   derives position vol from a risk score (`(risk/100)·0.018·√252`) rather
   than from the covariance snapshot that exists in `useQuantSnapshot`.
   Same wiring pattern as the RiskDashboard fix should be applied
   module-by-module.
8. **`statarb-math.ts` GARCH/HMM local refinement uses `Math.random`
   hill-climbing** — results can vary between runs of the same input. Grid
   search dominates the fit so variance is small, but a seeded RNG would make
   the pipeline reproducible.

---

## 4. Invariants now enforced by tests

`src/test/truth-spine.test.ts` (new, 12 assertions):
- Edge (`_shared/stats.ts`) and client (`quant-engine.ts`) produce
  **identical** log returns, mean, sample stdev, Sharpe, Sortino, drawdown
  magnitude, historical VaR and CVaR for the same series.
- One shared risk-free constant.
- Degenerate inputs refuse to fabricate: tiny samples yield no VaR; constant
  series yield zero vol; non-positive prices are skipped.

Full suite: **233 tests, 12 files, all passing** (`npm test`).

---

## 5. Conventions (the one-page truth contract)

- **Returns:** daily log returns, non-positive prices skipped.
- **Volatility:** sample stdev (ddof = 1) of daily log returns; annualized ×√252.
- **Sharpe/Sortino:** annualized, excess over `ANNUAL_RISK_FREE = 4.5%`;
  Sortino downside deviation averages over downside-observation count.
- **Max drawdown:** positive decimal at the spine; display layers own sign/percent.
- **Historical VaR/CVaR:** ascending sort, index `floor((1−conf)·n)`, tail
  mean for CVaR; requires ≥ 20 observations, otherwise a labeled estimate.
- **Provenance vocabulary:** `reported` (filed/provider) > `computed`
  (deterministic from measured series) > `estimated` (heuristic) > `model`
  (AI/simulation). AI text fields are enumerated in `aiGeneratedFields` on
  payloads that mix them with measured data.
