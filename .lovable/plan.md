

# Add AI Provider Toggle (C / M) — System-Wide Switch

## Overview
Add a discreet toggle switch in the Stat Arb / Monte Carlo section header that switches the entire system's AI provider between **Cloudflare (C)** and **Mistral (M)**. The preference is stored in localStorage and passed as a `provider` field in all AI edge function calls.

## Changes

### 1. Create global provider state — `src/hooks/useAIProvider.ts`
- Custom hook using localStorage key `entropy-ai-provider` (values: `"cloudflare"` | `"mistral"`, default `"cloudflare"`)
- Exports `provider`, `setProvider`, `providerLabel` ("C" or "M")
- Uses a global event emitter pattern (window `storage` event) so all components react to changes

### 2. Update `src/lib/apiGovernor.ts` — pass provider in body
- Read current provider from `localStorage.getItem("entropy-ai-provider")`
- Inject `provider` field into the request body for all AI-tier calls automatically

### 3. Update `supabase/functions/_shared/callAI.ts` — respect provider preference
- Accept optional `provider?: "cloudflare" | "mistral"` in `CallAIOptions`
- In `callAI()`: if `provider === "mistral"`, skip Cloudflare entirely and call Mistral directly; if `provider === "cloudflare"`, use current Cloudflare-first logic
- All edge functions that use `callAI` automatically get the `provider` from request body and pass it through

### 4. Update edge functions to pass provider through
- In each edge function that calls `callAI`, extract `provider` from the request body and pass it as part of the options. This is a small change to functions like `monte-carlo-intelligence`, `analyze-stock`, `risk-intelligence`, etc.

### 5. Add the toggle UI — `src/components/sandbox/EntropySandbox.tsx`
- Place a small, minimal toggle in the sandbox header bar (top-right corner, next to section tabs)
- Style: tiny switch with **C** and **M** labels on either side, muted colors, no tooltip — intentionally "secret"
- Uses the `useAIProvider` hook to read/write the preference

## Files
- **Create** `src/hooks/useAIProvider.ts`
- **Edit** `src/lib/apiGovernor.ts` — inject provider into AI-tier request bodies
- **Edit** `supabase/functions/_shared/callAI.ts` — accept and route by provider preference
- **Edit** `src/components/sandbox/EntropySandbox.tsx` — add C/M toggle in header
- **Edit** all edge functions that destructure the request body and call `callAI` — pass `provider` through (~15 files, trivial 1-line additions)

