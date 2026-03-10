

## Plan: Switch from Lovable AI to OpenRouter

### What needs to change

**Single file edit — `supabase/functions/_shared/callAI.ts`:**

1. Switch the API endpoint from `https://ai.gateway.lovable.dev/v1/chat/completions` to `https://openrouter.ai/api/v1/chat/completions`
2. Use `OPENROUTER_API_KEY` environment variable instead of `LOVABLE_API_KEY`
3. Update the default model to a free or cheap OpenRouter model (e.g. `google/gemini-2.5-flash` which is available on OpenRouter)
4. Add OpenRouter-specific headers (`HTTP-Referer`, `X-Title`)
5. Update provider type from `"lovable"` to `"openrouter"`
6. Keep all existing error handling (429, 402) and tool call support

### Prerequisites

You need a valid OpenRouter API key with sufficient credits. I'll prompt you to enter a new key since the current one is exhausted.

### No other files need changes

All edge functions (`market-data`, `geopolitical-data`, `desirable-assets`, `causal-effects`, `strategy-generate`, `analyze-stock`, etc.) import from `callAI.ts` — they'll automatically use OpenRouter after this single file change.

