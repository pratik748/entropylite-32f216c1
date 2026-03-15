# Fix Desirable Assets: More Diverse, Region-Aware Recommendations

## Problem

1. **Prompt is too generic** — asks for "8-10 BEST assets" with no diversity constraints, so the AI defaults to the same popular US mega-caps every time
2. **No region awareness** — ignores the user's base currency / market context (e.g., Indian user should see NSE stocks)
3. **Low temperature (0.35)** — makes output deterministic and repetitive
4. **6-hour cache** — stale recommendations shown for too long with no way to get variety

## Changes

### 1. `supabase/functions/desirable-assets/index.ts`

- **Accept `baseCurrency**` from the request body to detect user's market (INR → India, EUR → Europe, etc.)
- **Rewrite the prompt** with explicit diversity rules:
  - Mandate distribution: "3-4 from user's home market, 2-3 global equities from different regions, 1-2 ETFs, 1 crypto, 1 commodity/defensive"
  - Add: "Each recommendation MUST be from a DIFFERENT sector. NO two stocks from the same industry."
  - Add: "Include small/mid-cap opportunities, not just mega-caps"
  - Add: "Use Yahoo Finance tickers with correct exchange suffix (.NS for NSE, .L for London, .T for Tokyo, etc.)"
  - For Indian users: "Include NSE-listed stocks with .NS suffix, priced in INR"
- **Raise temperature** from 0.35 → 0.65 for more creative/varied output
- **Raise maxTokens** from 4000 → 5000 to handle richer responses
- **Add a `seed` randomizer** — inject a random number into the prompt to break AI caching patterns
- Keep at least one hour of cache.

### 2. `src/components/DesirableAssets.tsx`

- **Pass `baseCurrency**` from the FX context to the edge function call
- **Reduce cache TTL** from 6 hours → 2 hours so users get fresher picks
- Show the user's home market label in the header (e.g., "India + Global")

## Files to Edit


| File                                           | Change                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| `supabase/functions/desirable-assets/index.ts` | Region-aware prompt, diversity rules, higher temperature, random seed |
| `src/components/DesirableAssets.tsx`           | Pass baseCurrency, reduce cache TTL, show market label                |
