/**
 * AI caller — UNIFIED on Mistral.
 *
 * All other provider names (groq/cloudflare/openai/gemini) are kept as type
 * aliases for backward compatibility, but every code path routes to Mistral.
 * Two API keys are supported with automatic failover:
 *   - MISTRAL_API_KEY      (primary)
 *   - MISTRAL_API_KEY_2    (fallback, used if primary fails / 429 / 401 / 5xx)
 *
 * Tool-calling requests are converted to JSON-mode prompts (Mistral does not
 * support OpenAI-style function declarations natively), and the JSON response
 * is wrapped into a synthetic toolCall so callers don't have to branch.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  provider?: "groq" | "cloudflare" | "mistral" | "openai" | "gemini";
  jsonMode?: boolean;
  skipHardening?: boolean;
  /** No-op (kept for backward compatibility — Mistral has no native web search). */
  useWebSearch?: boolean;
}

interface AIResult {
  text: string;
  provider: "groq" | "cloudflare" | "mistral" | "openai" | "gemini";
  toolCall?: any;
}

const MISTRAL_DEFAULT_MODEL = "mistral-large-latest";
const MISTRAL_FAST_MODEL = "mistral-small-latest";

const HARDENING_PREAMBLE = `[QUANT HARDENING LAYER — MANDATORY]
You are operating inside a hedge-fund-grade probabilistic decision system. Every response must obey:

1. PROBABILISTIC ONLY — no deterministic opinions. All claims expressed as distributions or probabilities.
2. STOCHASTIC MODEL — assume drift μ, volatility σ, and jump risk J. Treat outcomes as Monte-Carlo derived, not narrative.
3. RISK-FIRST — tail risk (VaR 95%, max drawdown, liquidity risk, vol-expansion risk) dominates mean outcomes.
4. REFLEXIVITY-AWARE — include feedback loops: price → flow → volatility → price; momentum amplification; crowding.
5. SCENARIO DECOMPOSITION — bull (tail-up), bear (tail-down), neutral (mean-reverting cluster) — derived from distribution, not assigned.
6. EXPECTED VALUE — EV = ∫ P(x)·R(x) dx with asymmetric payoff, fat-tail penalty, skew adjustment.
7. NO SUBJECTIVE LANGUAGE — banned: "I think", "likely", "should", "guaranteed", "always", "never", em-dashes used as narrative flourish, marketing adjectives.
8. NO AI-SLOP PUNCTUATION — no em-dash dramatics, no rhetorical pauses.
9. OUTPUT DISCIPLINE — if the caller asks for JSON, return ONLY valid JSON, no prose, no markdown fences.
10. EXECUTION-READY — every signal must be risk-adjusted and simulation-derived, not qualitative.

Treat the market as an adaptive reflexive system, not static equilibrium.
Violation of any rule = invalid response.`;

function hardenSystemPrompt(original: string, skip?: boolean): string {
  if (skip) return original;
  if (original.includes("[QUANT HARDENING LAYER")) return original;
  return `${HARDENING_PREAMBLE}\n\n[CALLER CONTEXT]\n${original}`;
}

function stripThinkingBlocks(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleaned = cleaned.replace(/^Thinking[\s\S]*?\n\s*\n/i, "").trim();
  cleaned = cleaned.replace(/^```json?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) return cleaned;
  cleaned = cleaned.substring(jsonStart);

  let depth = 0, inString = false, escape = false, endPos = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) { endPos = i; break; }
    }
  }
  if (endPos > 0) cleaned = cleaned.substring(0, endPos + 1);

  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/:\s*\+(\d)/g, ': $1')
    .replace(/:\s*[~≈∼]\s*(\d)/g, ': $1')
    .replace(/:\s*approximately\s+(\d)/gi, ': $1')
    .replace(/[\x00-\x1F\x7F]/g, " ");

  try { JSON.parse(cleaned); }
  catch {
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "");
    cleaned = cleaned.replace(/,\s*$/, "");
    let braces = 0, brackets = 0, inStr = false, esc = false;
    for (let i = 0; i < cleaned.length; i++) {
      const c = cleaned[i];
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === "{") braces++;
      if (c === "}") braces--;
      if (c === "[") brackets++;
      if (c === "]") brackets--;
    }
    while (brackets > 0) { cleaned += "]"; brackets--; }
    while (braces > 0) { cleaned += "}"; braces--; }
  }
  return cleaned;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build a tiny placeholder JSON example from a JSON-schema fragment.
 * Used to give Mistral a concrete shape to imitate when the caller passed
 * OpenAI-style tools.
 */
function buildJsonSkeleton(schema: any, depth = 0): any {
  if (!schema || typeof schema !== "object" || depth > 6) return null;
  let type: any = schema.type;
  if (Array.isArray(type)) type = type.find((t) => t !== "null") || type[0];

  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];

  switch (type) {
    case "string":
      return schema.description ? `<${String(schema.description).slice(0, 40)}>` : "<string>";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array": {
      const item = buildJsonSkeleton(schema.items, depth + 1);
      return item === null ? [] : [item];
    }
    case "object":
    default: {
      const out: Record<string, any> = {};
      const props = schema.properties || {};
      const required: string[] = Array.isArray(schema.required) ? schema.required : [];
      const keys = [
        ...required.filter((k) => k in props),
        ...Object.keys(props).filter((k) => !required.includes(k)).slice(0, 4),
      ];
      for (const k of keys) {
        out[k] = buildJsonSkeleton(props[k], depth + 1);
      }
      return out;
    }
  }
}

/**
 * Call Mistral with a single API key. Throws on non-2xx with status info.
 */
async function callMistralWithKey(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const model = opts.model || MISTRAL_DEFAULT_MODEL;
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const body: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Mistral ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty Mistral response");
  return { text: stripThinkingBlocks(text), provider: reported || "mistral" };
}

/**
 * Mistral caller with automatic key 1 → key 2 fallback.
 * Falls back on any error from key 1 (rate limit, auth, network, empty body).
 */
async function callMistral(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const primary = Deno.env.get("MISTRAL_API_KEY");
  const secondary = Deno.env.get("MISTRAL_API_KEY_2");
  const keys: Array<{ key: string; label: string }> = [];
  if (primary) keys.push({ key: primary, label: "primary" });
  if (secondary) keys.push({ key: secondary, label: "secondary" });
  if (keys.length === 0) throw new Error("No Mistral API keys configured (MISTRAL_API_KEY / MISTRAL_API_KEY_2)");

  let lastErr: any = null;
  for (const { key, label } of keys) {
    try {
      return await callMistralWithKey(opts, key, reported);
    } catch (e: any) {
      lastErr = e;
      console.warn(`callMistral → ${label} key failed:`, e?.message || e);
      // continue to next key
    }
  }
  throw lastErr || new Error("All Mistral keys failed");
}

/**
 * Convert a tool-calling request into a JSON-mode prompt and wrap the result
 * back into a synthetic toolCall so callers don't have to branch.
 */
async function callMistralToolMode(opts: CallAIOptions): Promise<AIResult> {
  const forcedToolName =
    typeof opts.toolChoice === "object" && opts.toolChoice?.function?.name
      ? opts.toolChoice.function.name
      : (opts.tools![0]?.function?.name || "respond");
  const toolDef = opts.tools!.find((t: any) => t?.function?.name === forcedToolName) || opts.tools![0];
  const params = toolDef?.function?.parameters;
  const skeleton = params ? buildJsonSkeleton(params) : null;
  const requiredFieldsLine = params?.required?.length
    ? `Top-level REQUIRED keys: ${params.required.join(", ")}.`
    : "";
  const arrayFieldName = params?.properties
    ? Object.entries(params.properties).find(([_, v]: any) => v?.type === "array")?.[0]
    : undefined;
  const arrayHint = arrayFieldName
    ? `If you would otherwise return a top-level JSON array, wrap it as { "${arrayFieldName}": [...] } instead.`
    : "";
  const schemaHint = skeleton
    ? `\n\n=== OUTPUT FORMAT (STRICT) ===
Return EXACTLY one JSON object. No prose. No markdown fences. No comments.
${requiredFieldsLine}
${arrayHint}
Use this exact shape (replace placeholder values, keep all keys, never invent new top-level keys):
${JSON.stringify(skeleton, null, 2)}
Rules:
- Every required string field must be a non-empty string.
- Every numeric field must be a finite number, never null, never a string.
- Enum fields must use ONLY the listed values.
- If a field is unknown, OMIT it (do not write null/empty) unless it is required.`
    : "\n\nReturn ONLY a single JSON object. No prose, no markdown.";

  const fallbackTokens = Math.max(opts.maxTokens ?? 4096, 6000);
  const jsonOpts: CallAIOptions = {
    ...opts,
    tools: undefined,
    toolChoice: undefined,
    jsonMode: true,
    maxTokens: fallbackTokens,
    userPrompt: `${opts.userPrompt}${schemaHint}`,
  };

  const r = await callMistral(jsonOpts, opts.provider || "mistral");

  // Normalise: if model returned a bare array, wrap it under the array field name.
  let argText = r.text;
  if (arrayFieldName) {
    const trimmed = (r.text || "").trim().replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();
    if (trimmed.startsWith("[")) {
      argText = `{"${arrayFieldName}": ${trimmed}}`;
    }
  }
  return {
    ...r,
    text: argText,
    toolCall: {
      id: `synth_${Date.now()}`,
      type: "function",
      function: { name: forcedToolName, arguments: argText },
    },
  };
}

/**
 * Public API — single AI call. Always Mistral, with key1 → key2 fallback.
 */
export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const needsTools = !!(opts.tools && opts.tools.length > 0);
  if (needsTools) return await callMistralToolMode(opts);
  return await callMistral(opts, opts.provider || "mistral");
}

/**
 * Public API — fan out for ensemble diversity. With Mistral-only we just
 * return one result (kept as array to preserve existing call sites).
 */
export async function callAIParallel(opts: CallAIOptions): Promise<AIResult[]> {
  const r = await callAI(opts);
  return [r];
}

/**
 * Web search grounding is no longer available (Gemini removed). Returns
 * empty string so callers degrade gracefully without injecting fake context.
 */
export async function fetchLiveWebContext(_query: string, _maxBullets = 6): Promise<string> {
  return "";
}
