

## Plan: Switch to Qwen 3.5-122B on NVIDIA + Update API Key

### What changes

1. **Update `NVIDIA_API_KEY` secret** — Replace with the new key from the user's code snippet (`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`).

2. **Update `supabase/functions/_shared/callAI.ts`**:
   - Change default model from `nvidia/llama-3.3-nemotron-super-49b-v1` to `qwen/qwen3.5-122b-a10b`
   - Update default temperature from `0.3` to `0.6`
   - Update default max_tokens from `4000` to `16384`
   - Add `top_p: 0.95` to the request body
   - Add `chat_template_kwargs: { enable_thinking: true }` to enable the model's reasoning mode
   - Strip any `<think>...</think>` blocks from the response content before returning, so downstream consumers get clean output

### No other files need changes
All edge functions (`desirable-assets`, `strategy-generate`, `causal-effects`, etc.) already use `callAI()` from the shared module — they'll automatically pick up the new model and parameters.

