---
name: Ensemble Consensus Engine
description: v2 bucket-aware ensemble (3 orthogonal info buckets A=price/flow B=intel/fundamental C=regime/risk), cost-aware expectedR, walk-forward Platt calibration loaded from DB. Gates Direct Profit + Desirable Assets; STAND_ASIDE unless ≥2 buckets agree AND calibrated≥58% AND agreement≥55% AND expectedR-cost≥0.20.
type: feature
---

Shared modules in `supabase/functions/_shared/`: `ensemble.ts` (pure), `buckets.ts` (engine→bucket map), `costs.ts` (liquidity-tier haircut), `calibration.ts` (DB loader + signal logger).

Tables: `signal_outcomes` (fired-signal ledger, settled T+5 by `calibration-fit` cron), `engine_reliability` (per-engine×ticker_class×regime hit-rate), `calibration_params` (Platt α/β/γ, refit nightly).

Inputs: `EngineSignal[]` from independent engines (deterministic technicals, AI verdict, momentum, mean-reversion, Sharpe, volume, CLANK, dashboard intelligence, ODGS desirable hint, etc.). Each carries direction ∈ {-1,0,+1}, confidence ∈ [0,1], reliability prior (default 0.55), `hasSignal`.

Bucket assignment (in `buckets.ts`): A = price/flow (deterministic, momentum, mean_reversion, sharpe, volume, trend, winrate, drawdown, filter_tier); B = intel/fundamental (ai_verdict, ai_confidence, intelligence, desirable, sentiment, news); C = regime/risk (clank, reflexivity, veracity, regime).

Math:
- `weight_i = reliability_i × confidence_i`
- `ensemble = Σ direction × weight / Σ weight ∈ [-1,+1]`
- `agreement = |Σ direction × weight| / Σ weight ∈ [0,1]`
- `calibratedProb = sigmoid(α·|ensemble| + β·agreement + γ)` — α/β/γ loaded from `calibration_params` (defaults 3.2/1.4/−0.7)
- `expectedR = p·rUp − (1-p)·rDown − costHaircut/0.02`  (round-trip cost subtracted in R-units)
- Per-bucket dir = sign(Σ direction×weight within bucket)

Gate (STAND_ASIDE if any):
- engineCount < 3
- votingBuckets < 2  (need ≥2 of 3 info-buckets to fire)
- agreeingBuckets < 2  (≥2 buckets must agree on direction — decorrelation guard)
- calibratedProb < 0.58
- agreement < 0.55
- expectedR (after cost) < 0.20

Cost tiers (`costs.ts`): us_megacap 5bps, us_largecap 10bps, us_smallcap 25bps, in_nifty50 12bps, in_nifty500 25bps, in_smallcap **150bps**, etf_majors 6bps, crypto_majors 15bps, unknown 70bps. India small-caps like GTL INFRA get tagged in_smallcap and routinely fail the gate.

Wired in:
- `direct-profit/index.ts` — final layer; loads calibration, applies cost haircut, gates via buckets, logs every fired signal to `signal_outcomes` for T+5 mark-to-market. WAIT card shows per-bucket A/B/C dirs + "would flip if X bucket fires" hint.
- `desirable-assets/index.ts` — soft re-rank using bucketBonus (ALL_3 +25%, TWO_OF_3 +5%, SPLIT −20%) × costPenalty × agreement; never drops. Each rec carries `bucketConsensus`, `bucketDirs`, `costHaircutPct`, `liquidityTier`, `expectedRAfterCost`.

Nightly job `calibration-fit` (cron 02:17 UTC via pg_cron): (1) marks unsettled signals >7d old to market via Yahoo, (2) refits Platt α/β/γ by 400-epoch gradient descent on last 90d outcomes (≥30 samples), (3) rebuilds `engine_reliability` from per-engine direction-vs-outcome aggregation.

UI:
- `DirectProfitMode.tsx` — calibrated-win-prob bar + 3-pill bucket strip (PRICE/INTEL/REGIME with ↑↓—) + cost warning if haircut≥0.5%. WAIT card shows per-engine ✓/✗ + flip-hint.
- `DesirableAssets.tsx` — replaces UNANIMOUS/MAJORITY chip with bucket consensus chip (3/3, 2/3, SPLIT, 1/3) + calibrated %; adds amber ⚠COST chip when haircut≥1%.
- `ReturnsEstimateModule.tsx` adds an "Insufficient evidence" amber banner when CI width >120pp or sample<120 days with σ>30%.