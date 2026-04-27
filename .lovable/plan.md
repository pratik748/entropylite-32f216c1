## Plan

Strip every fallback path out of the Desirable Assets engine so the feature is "AI candidates that survive live data + portfolio filters, or nothing." No deterministic universe, no padding, no rescue tier disguising the same household names.

### What gets removed
1. `ELITE_FALLBACK_UNIVERSE` and `INDIA_FALLBACK_UNIVERSE` arrays.
2. `buildDeterministicCandidates()` and `buildDeterministicScoredRec()`.
3. The "AI returned <5 picks → pad with rotated fallback" branch.
4. The "AI + retry both returned zero → force-inject deterministic universe" branch.
5. The "STAGE 3 yielded 0 scored survivors → activate hard rescue" branch.
6. The "reliability backstop padded N deterministic picks" branch.
7. The `rescue` filter tier and the `rescuePool` selection branch.
8. The `_isFallback` exemptions in liquidity / upside / drawdown filters.
9. Anti-repeat `previousTickers` is kept (still useful), but no more deterministic shuffle.

### What replaces it
- The function calls AI (parallel providers + one retry), runs strict + balanced quant filters, and returns whatever survives.
- If zero candidates survive, the response is `{ recommendations: [], softFailure: true, message: "No assets passed live data + risk filters this cycle." }` and the UI shows a clear empty state explaining why — no silent padding.

### UI changes
- `DesirableAssets.tsx` empty / error state copy updated to reflect "no rescue, real picks only."
- Removes the "Auto-Repair Department" banner wording around fallback.
- Keeps the auto-repair only for genuine retry / cache scenarios (network hiccups), not for deterministic substitution.

### Files touched
- `supabase/functions/desirable-assets/index.ts` — major deletion + simplification
- `src/components/DesirableAssets.tsx` — empty state + repair banner copy

### Result
- The user sees only AI-generated, evidence-backed picks that survived strict/balanced filters.
- Repetition collapses because the deterministic universe is gone.
- If a cycle produces nothing usable, the UI says so honestly instead of dressing up the same fallback names.

Approve and I'll apply the changes.