# Fix: Provider Toggle Not Routing All AI Calls to Mistral

## Problem

The C/M toggle only injects the `provider` field for endpoints on `ai`, `continuous`, and `evolution` tiers. But three endpoints that also call `callAI` are on other tiers and never receive the provider preference:

- `market-data` — tier `frequent`
- `geopolitical-data` — tier `slow`  
- `desirable-assets` — tier `slow`

These always default to Cloudflare, depleting credits even when Mistral is selected.and the casual effects is also not working.and the scenarios trees should be real and informative 

## Fix

**Edit `src/lib/apiGovernor.ts**` — expand the provider injection condition (line 192) to include `frequent` and `slow` tiers, or better yet, inject provider for ALL calls unconditionally. Since non-AI edge functions simply ignore the extra field, there's no harm.

Change line 192 from:

```typescript
if (tier === "ai" || tier === "continuous" || tier === "evolution") {
```

to:

```typescript
// Inject provider for all calls — non-AI functions ignore it harmlessly
{
```

This ensures every edge function call carries the provider preference, so `market-data`, `geopolitical-data`, and `desirable-assets` will route to Mistral when M is selected.

## Files

- **Edit** `src/lib/apiGovernor.ts` — remove tier condition, always inject provider