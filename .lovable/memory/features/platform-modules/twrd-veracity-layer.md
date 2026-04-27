---
name: TWRD Veracity Layer
description: Truth-Weighted Reality Database — every signal feeding prediction/risk/scenarios is gated by T(x,t)=σ(w1S+w2A+w3D−w4B−w5C+b) before use; UI surfaces TruthBadge + False Consensus.
type: feature
---

TWRD is Entropylite's Veracity Layer.

- Tables: `twrd_sources` (Beta α,β), `twrd_claims` (versioned, decayed on read), `twrd_contradictions`, `twrd_feedback`, `twrd_weights` (w1..w5,b — learnable).
- Shared engine: `supabase/functions/_shared/twrd/{types,truth,cleaners,extract,store,gate,failureGuards,feedback}.ts`. `truth.ts` is pure, streaming-friendly, normalised to [0,1].
- Edge functions: `twrd-ingest` (cleaners→TRUTH→store), `twrd-query` (read decayed truth), `twrd-feedback` (Beta + SGD self-correction; requires auth).
- Wired into `reflexivity-engine` (adds `veracity` block; falseConsensus → `shiftETA.label = "FALSE CONSENSUS"` and prob ≥70) and `risk-intelligence` (adds `twrd` block: meanTruthConfidence, truthRisk, sizeMultiplier, hedgeBias).
- UI: `src/components/twrd/TruthBadge.tsx` rendered in `ReflexivityEngine` header and `RiskDashboard` Truth Risk panel.
- Failure guards: false consensus (A>0.85 ∧ H<0.35 ∧ C>0.25), adversarial spike, stale fact (D<0.2), overfit drift.
- All gate calls are best-effort: if Supabase or sources fail, the host engine still returns its original output.