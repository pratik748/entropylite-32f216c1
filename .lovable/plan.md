

# Fix: Company Intelligence Dossier JSON Parse Failures

## Root Cause

Edge function logs show:
```
SyntaxError: Unexpected token '~', ..."", "pct": ~5.0, "tre"... is not valid JSON
```

Mistral outputs `~5.0` (tilde meaning "approximately") which is invalid JSON. The `safeParseJSON` utility doesn't handle this pattern.

## Fix (2 files)

### 1. `supabase/functions/_shared/safeParseJSON.ts`
Add tilde stripping to the "Fix common LLM JSON issues" section (step 5):
- `:\s*~(\d)` → `: $1` — strips `~` before numbers in values
- Also add handling for other LLM quirks: `≈`, `∼`, `approximately` before numbers

### 2. `supabase/functions/_shared/callAI.ts`
Add the same tilde fix in `stripThinkingBlocks` so the issue is caught at the source too:
- Add `.replace(/:\s*[~≈∼](\d)/g, ': $1')` to the cleanup chain

Both changes are single-line regex additions to existing cleanup chains.

