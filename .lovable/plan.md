

## Plan: NVIDIA-Only AI Provider (No OpenRouter Fallback)

Update `supabase/functions/_shared/callAI.ts` to remove all OpenRouter logic and implement retry with error handling for NVIDIA only.

### Changes to `callAI.ts`:
1. Remove `callOpenRouter` function entirely
2. Remove OpenRouter from provider selection and fallback logic
3. Implement retry logic (up to 3 attempts with exponential backoff) for transient NVIDIA errors (429, 5xx)
4. On hard failures (401, 402), throw immediately with a clear error message
5. Remove all `OPENROUTER_API_KEY` checks and references

### Retry Strategy:
- Attempt 1: immediate
- Attempt 2: wait 1s
- Attempt 3: wait 3s
- Hard errors (401/402): fail immediately, no retry

