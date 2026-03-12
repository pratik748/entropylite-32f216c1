

# Fix Provider Toggle + Reliability Across Edge Functions

## Problems Identified

### 1. Toggle "Stuck" Bug
The `toggle` function in `useAIProvider` captures `provider` via closure: `() => setProvider(provider === "mistral" ? "cloudflare" : "mistral")`. On rapid clicks, the stale closure reads the old value and toggles back, making it appear stuck. Fix: use functional state update.

### 2. Cache Not Invalidated on Provider Switch
When the user toggles from M→C, the API Governor's cache keys include `{provider: "mistral"}` in the body, so the new `{provider: "cloudflare"}` key is different — that's fine. But the **AI cooldown** (lines 169-179) blocks ALL AI-tier calls within 30s regardless of provider change, serving stale data from the wrong provider. Fix: flush AI caches when provider changes.

### 3. JSON Parse Failures (Reliability)
Edge function logs show `risk-intelligence` crashing with `SyntaxError: Expected ',' or ']'`. **12 of 13 AI edge functions** use bare `JSON.parse(result.text)` with no try/catch recovery. Only `desirable-assets` has repair logic. The `callAI` shared module already has `stripThinkingBlocks` but it can't catch every malformed response. Fix: add a shared `safeParseJSON` helper and use it in all edge functions.

## Plan

### A. Fix `useAIProvider` toggle (1 file)
- **`src/hooks/useAIProvider.ts`**: Change `toggle` to use functional update: `setProviderState(prev => ...)`. Also dispatch a custom event so same-tab components sync (StorageEvent only fires cross-tab).

### B. Flush caches on provider change (1 file)
- **`src/lib/apiGovernor.ts`**: Export a `flushAICaches()` function that clears all AI-tier cache entries and resets `lastAiCall`.
- **`src/hooks/useAIProvider.ts`**: Call `flushAICaches()` inside `setProvider`.

### C. Add robust JSON parsing to all AI edge functions (14 files)
- **`supabase/functions/_shared/safeParseJSON.ts`** (NEW): Extract the JSON repair logic from `desirable-assets` into a shared utility that tries `JSON.parse`, then falls back to brace/bracket repair, trailing comma removal, and truncation recovery.
- **12 edge functions**: Replace bare `JSON.parse(result.text)` with `safeParseJSON(result.text)`:
  - `risk-intelligence`, `flow-intelligence`, `deep-intelligence`, `crown-intelligence`
  - `portfolio-intelligence`, `monte-carlo-intelligence`, `causal-effects`, `clank-detection`
  - `strategy-generate`, `strategy-evolution`, `continuous-simulation`, `market-data`
- **`desirable-assets`**: Import shared `safeParseJSON` instead of inline repair code.

## Files to Create/Edit (15 files)

1. `src/hooks/useAIProvider.ts` — fix toggle + flush caches on change
2. `src/lib/apiGovernor.ts` — add `flushAICaches()`
3. `supabase/functions/_shared/safeParseJSON.ts` — NEW shared JSON repair utility
4-15. 12 edge functions — replace `JSON.parse(result.text)` with `safeParseJSON(result.text)`

