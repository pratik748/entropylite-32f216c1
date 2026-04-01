# Fix: AI Intelligence Reliability + Price Accuracy + Remove Static Defaults

## Problems Identified

1. **Static fallback always contaminates results** — Line 845 unconditionally merges `deterministicCandidates` into AI candidates. Even when AI returns 15 good tickers, 16 more static ones get blended in, often outscoring AI picks in the quant filter because they're blue-chip names.
2. **Edge function times out** — 35+ tickers × Yahoo fetch (batch of 6) + sentiment fetch (batch of 5) = too many sequential HTTP calls. Function dies before reaching scoring/output. Logs confirm: AI stage completes, but no "scored" or "tiers" log ever appears.for it we can do batches of 5-5 5 stocks get tested and appear then next etc.
3. **Wrong/stale prices** — Yahoo `regularMarketPrice` is the last traded price, which can be hours old for closed markets. No freshness indicator shown to user.
4. **callAI wastes time on retries** — Cloudflare free tier frequently exhausts neurons. 3 retry attempts with delays (0, 1s, 3s) burn 4+ seconds before falling to Mistral. Combined with Yahoo batching, this eats the entire edge function timeout budget.

## Changes

### 1. `supabase/functions/desirable-assets/index.ts` — Stop forcing static fallback

**Current** (line 845):

```
candidates = dedupeCandidates([...candidates, ...deterministicCandidates]).slice(0, 25);
```

**Fix**: Only use fallback when AI returns fewer than 8 candidates:

```
if (candidates.length < 8) {
  const needed = 8 - candidates.length;
  candidates = dedupeCandidates([...candidates, ...deterministicCandidates.slice(0, needed)]);
} else {
  candidates = dedupeCandidates(candidates).slice(0, 20);
}
```

This ensures AI-generated picks dominate when the AI succeeds. Fallback only kicks in on actual failure.

### 2. `supabase/functions/desirable-assets/index.ts` — Reduce batch sizes + parallelize

- Increase `BATCH_SIZE` from 6 to 10 (Yahoo can handle parallel requests)
- Reduce max candidates from 25 to 18 (fewer Yahoo fetches = less timeout risk)
- Reduce sentiment batch from top 18 to top 12
- Add 8-second timeout per Yahoo fetch to prevent one slow ticker from blocking everything
- Skip sentiment stage entirely if scored candidates < 6 (save time)

### 3. `supabase/functions/desirable-assets/index.ts` — Add market hours freshness

After fetching Yahoo data, check `meta.regularMarketTime` (Unix timestamp). If it's older than 8 hours, mark it as `stalePrice: true` in the output. The frontend can show a subtle indicator.

### 4. `supabase/functions/_shared/callAI.ts` — Optimize retry strategy

**Current**: 3 retries with [0, 1000, 3000]ms delays = up to 7+ seconds wasted on Cloudflare failures.

**Fix**:

- Reduce to 2 attempts: [0, 1500]ms
- On ANY 429 error (not just quota), fall back to Mistral immediately (no retry)
- Add a 15-second timeout on Cloudflare fetch to prevent hanging
- Add a 20-second timeout on Mistral fetch

### 5. `supabase/functions/desirable-assets/index.ts` — Add per-fetch timeout

Wrap each `fetchYahooChart` call in a timeout:

```typescript
async function fetchWithTimeout(symbol: string, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchYahooChart(symbol, "3mo", "1d", controller.signal);
  } catch { return null; }
  finally { clearTimeout(timer); }
}
```

Pass `AbortSignal` through to the Yahoo fetch call.

### 6. `supabase/functions/desirable-assets/index.ts` — Reduce AI token budget

Current `maxTokens: 5200` is generous. Reduce to `3800` — the tool call schema constrains output well enough. Faster AI response = more budget for Yahoo fetches.

## Files to modify


| File                                           | Change                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `supabase/functions/desirable-assets/index.ts` | Conditional fallback, timeouts, smaller batches, market freshness |
| `supabase/functions/_shared/callAI.ts`         | Faster retry, fetch timeouts                                      |


## Expected outcomes

- AI-generated picks appear as primary results (not diluted by static fallback)
- Edge function completes within timeout (fewer fetches, faster AI)
- Prices include freshness metadata
- Cloudflare failures fall back to Mistral in <2s instead of 7+s