## Plan

I’ll harden the Desirable Assets pipeline so it stops producing the failure mode you saw:

“Most rejected names were already in your portfolio. 1 had targets below live price. 1 lacked usable price history.”

The goal is to prevent the system from surfacing a low-quality empty result when the AI proposes duplicates, stale targets, or untradeable names.

### What I’ll change

1. Strengthen candidate generation so duplicates are much less likely
- Rewrite the Desirable Assets prompt to treat current holdings and recent recommendations as hard exclusions with replacement required.
- Add an explicit instruction that the model must keep generating alternatives until it has enough non-held, non-repeat, price-verifiable candidates.
- Emphasize “desirable asset != desirable recommendation if already owned or structurally invalid.”

2. Add a server-side refill pass after first-round rejections
- Keep the first AI pass.
- If too many candidates are rejected for being already held, repeated, or structurally broken, run a second targeted AI pass using the actual reject reasons.
- Feed the rejected ticker list back into the model and request replacements only.
- Merge, dedupe, and re-score the refill candidates before selection.

3. Stop over-penalizing stale target prices
- Replace the current hard reject for `target below live price` with a repair-first rule.
- If a candidate has valid history and live price but an outdated target, recompute target/entry/stop from the quant layer instead of throwing the name away immediately.
- Only reject if the recomputed trade still has no positive upside or violates risk rules.

4. Make anti-repeat behavior smarter instead of permanently hostile
- Change `previousTickers` from a broad hard ban to a scoped recent-memory rule with TTL / windowing.
- Keep it effective enough to avoid spammy repeats, but not so strict that it starves the engine.
- On explicit manual refresh, use a stronger “get me alternatives now” mode instead of reusing a stale exclusion stack forever.

5. Improve the empty-state behavior on the client
- Replace the current blunt error banner with a clearer state:
  - what was rejected,
  - whether the system attempted refill/replacement,
  - whether another pass is still possible.
- Make manual refresh trigger the stronger regeneration mode.
- Avoid showing the same discouraging message if the backend can self-repair first.

6. Preserve portfolio awareness without letting it kill the module
- Keep the current rule that held names cannot be recommended.
- Keep cross-module vetoes for sell/high-risk conflicts.
- But ensure the module escalates to “replacement search” rather than settling for an empty result when portfolio overlap is the dominant reject reason.

### Expected result

After this change, Desirable Assets should:
- avoid recommending assets already in the portfolio,
- avoid recycled recent picks unless intentionally allowed,
- repair stale target/entry math instead of rejecting too early,
- fetch substitutes when the first pass is contaminated,
- return a usable recommendation set far more often,
- stop showing this same rejection message as the primary outcome.

## Technical details

### Files to update
- `supabase/functions/desirable-assets/index.ts`
  - strengthen prompt
  - add replacement/refill generation pass
  - relax F2 into repair-first logic
  - scope anti-repeat memory more intelligently
  - return richer metadata about refill attempts
- `src/components/DesirableAssets.tsx`
  - adjust refresh behavior / client messaging
  - optionally version the local cache keys if needed so stale exclusion state does not poison new runs

### Proposed pipeline shape
```text
AI candidate pass
  -> dedupe
  -> live price/history check
  -> hard rejects (held, no data, true invalids)
  -> repair pass for stale target/entry/stop
  -> if survivor count too low:
       targeted refill AI pass using reject reasons + banned tickers
  -> merge + dedupe + score
  -> final diversified selection
  -> client render
```

### Specific rule changes
- Keep as hard rejects:
  - already in portfolio
  - recent repeat within scoped window
  - no usable history after retry
  - illiquidity / weak quality / explicit cross-module veto
- Convert from hard reject to repair-first:
  - target below live price
  - malformed entry zone / stop
- Trigger refill pass when either is true:
  - survivor count below minimum threshold
  - overlap rejects dominate the reject mix

### Notes
- No heavy model training needed.
- No database schema change is required for this fix.
- This stays lightweight and prompt + rules driven.

If you approve, I’ll implement the hardening directly in the Desirable Assets edge function and UI so this failure mode stops recurring.