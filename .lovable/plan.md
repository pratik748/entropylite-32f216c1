# Fix: Desirable Assets (and Market Data) Failing Due to Invalid JSON from Mistral also review the output format everywhere so it doesn't feel crappy 

## Problem

Mistral returns JSON containing `+4.2` (positive sign prefix on numbers), which is invalid JSON. `JSON.parse` throws `Unexpected token '+'`. This affects both `desirable-assets` and `market-data` (same error visible in logs for both).

## Root Cause

The `stripThinkingBlocks` function in `_shared/callAI.ts` already fixes trailing commas but does **not** strip leading `+` signs from numbers.

## Fix

**Edit `supabase/functions/_shared/callAI.ts**` — in the `stripThinkingBlocks` function, add a regex to remove `+` prefixes on numbers in the JSON cleanup section (around line 63):

Add this line to the existing cleanup chain:

```typescript
.replace(/:\s*\+(\d)/g, ': $1')   // Fix +4.2 → 4.2
```

This single regex handles `": +4.2"` → `": 4.2"` patterns throughout the JSON string. No other files need changes — the fix applies globally to all AI responses.

## Files

- **Edit** `supabase/functions/_shared/callAI.ts` — add `+number` fix to `stripThinkingBlocks`