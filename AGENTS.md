# Project: EntropyLite

Subdirectories have their own AGENTS.md to read before changing files there.

## AI chain (supabase/functions/_shared/callAI.ts)
- Lane priority is explicit: omniroute, openrouter, gemini, openai, anthropic, mistral, then smaller lanes. OmniRoute/OpenRouter is the user-chosen primary; never demote it or add Lovable AI to the chain.
- Gemini keys in Google's new `AQ.` format are valid; call them with `?key=` (verified). Model chains must only contain models verified against the live ListModels for the configured keys; `gemini-2.5*` is retired for new keys, `gemini-4-argon` needs paid quota.
- Gemini 3.x needs `thinkingConfig.thinkingBudget` (2048) and a maxOutputTokens floor of 16384, else calls run 20s+ or truncate; pin the working model per key in geminiModelMemo.
- All model chains use current-generation IDs (verified Nov 2026): OpenRouter google/gemini-3.8-flash, openai/gpt-6-luna; OpenAI gpt-6.1-terra; Anthropic claude-haiku-5.5; xAI grok-4.7. A key whose name says one provider but whose value is another provider's shape routes by value (e.g. omniroute-named sk-or- key goes to OpenRouter when no local gateway URL is set).
