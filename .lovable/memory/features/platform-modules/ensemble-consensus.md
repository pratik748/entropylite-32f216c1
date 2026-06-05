---
name: Ensemble Consensus Engine
description: Shared inverse-variance + Platt-calibrated multi-engine voter that gates Direct Profit, Desirable Assets and similar surfaces; downgrades to STAND_ASIDE when calibrated win-prob<58% OR agreement<55% OR expected-R<0.2 OR <3 engines vote.
type: feature
---

Shared module `supabase/functions/_shared/ensemble.ts`. Pure, dependency-free.

Inputs: `EngineSignal[]` from independent engines (deterministic technicals, AI verdict, momentum, mean-reversion, Sharpe, volume, CLANK, dashboard intelligence, ODGS desirable hint, etc.). Each carries direction ∈ {-1,0,+1}, confidence ∈ [0,1], reliability prior (default 0.55), `hasSignal`.

Math:
- `weight_i = reliability_i × confidence_i`
- `ensemble = Σ direction × weight / Σ weight ∈ [-1,+1]`
- `agreement = |Σ direction × weight| / Σ weight ∈ [0,1]`
- `calibratedProb = sigmoid(3.2·|ensemble| + 1.4·agreement − 0.7)` (Platt-style)
- `expectedR = p·rUp − (1-p)·rDown`

Gate (STAND_ASIDE if any):
- engineCount < 3
- calibratedProb < 0.58
- agreement < 0.55
- expectedR < 0.20

Wired in:
- `direct-profit/index.ts` — final layer; if STAND_ASIDE and action!=WAIT, forces WAIT and prepends consensus reasons to `waitReasons`. Re-calibrates displayed confidence.
- `desirable-assets/index.ts` — soft re-rank `quantScore × (0.6 + 0.6·agreement)`, attaches `consensus` block to each emitted recommendation; never drops.

UI:
- `DirectProfitMode.tsx` shows a calibrated-win-prob bar in the action header for every result, plus a per-engine ✓/✗ breakdown in the WAIT card when `ensemble` present.
- `DesirableAssets.tsx` shows a UNANIMOUS/MAJORITY/SPLIT chip with calibrated %.
- `ReturnsEstimateModule.tsx` adds an "Insufficient evidence" amber banner when CI width >120pp or sample<120 days with σ>30%.