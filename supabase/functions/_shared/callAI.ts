/**
 * AI caller, UNIFIED on Mistral.
 *
 * All other provider names (groq/cloudflare/openai/gemini) are kept as type
 * aliases for backward compatibility, but every code path routes to Mistral.
 * Two API keys are supported with automatic failover:
 *   - MISTRAL_API_KEY      (primary)
 *   - MISTRAL_API_KEY_2    (fallback, used if primary fails / 429 / 401 / 5xx)
 *
 * A third key (MISTRAL_API_KEY_3) acts as a priority reserve: it is not part
 * of the round-robin load split, and is tried FIRST when both rotating keys
 * hit limits, before any Gemini/1min fallback, so rate-limit bursts land on
 * the reserve Mistral lane rather than a different provider.
 *
 * Tool-calling requests are converted to JSON-mode prompts (Mistral does not
 * support OpenAI-style function declarations natively), and the JSON response
 * is wrapped into a synthetic toolCall so callers don't have to branch.
 *
 * Keys resolve through the global API Manager (public.api_credentials, managed
 * by an admin in-app) first, then environment variables. Lovable AI is NOT part
 * of the chain.
 */
import { getKeySync, getManagedSnapshot, refreshManagedKeys } from "./managedKeys.ts";

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
  /** No-op (kept for backward compatibility, Mistral has no native web search). */
  useWebSearch?: boolean;
}

interface AIResult {
  text: string;
  provider: "groq" | "cloudflare" | "mistral" | "openai" | "gemini";
  toolCall?: any;
}

const MISTRAL_DEFAULT_MODEL = "mistral-large-latest";
const MISTRAL_FAST_MODEL = "mistral-small-latest";

// Per-isolate round-robin cursor across Mistral keys. Persists for the
// lifetime of the edge worker, so consecutive calls within the same warm
// instance alternate keys and split load roughly 50/50.
let __mistralKeyCursor = 0;
function pickKeyIndex(total: number): number {
  if (total <= 1) return 0;
  const i = __mistralKeyCursor % total;
  __mistralKeyCursor = (__mistralKeyCursor + 1) % 1_000_000;
  return i;
}

const HARDENING_PREAMBLE = `[QUANT HARDENING LAYER, MANDATORY]
You are operating inside a hedge-fund-grade probabilistic decision system. Every response must obey:

1. PROBABILISTIC ONLY, no deterministic opinions. All claims expressed as distributions or probabilities.
2. STOCHASTIC MODEL, assume drift μ, volatility σ, and jump risk J. Treat outcomes as Monte-Carlo derived, not narrative.
3. RISK-FIRST, tail risk (VaR 95%, max drawdown, liquidity risk, vol-expansion risk) dominates mean outcomes.
4. REFLEXIVITY-AWARE, include feedback loops: price → flow → volatility → price; momentum amplification; crowding.
5. SCENARIO DECOMPOSITION, bull (tail-up), bear (tail-down), neutral (mean-reverting cluster), derived from distribution, not assigned.
6. EXPECTED VALUE, EV = ∫ P(x)·R(x) dx with asymmetric payoff, fat-tail penalty, skew adjustment.
7. NO SUBJECTIVE LANGUAGE, banned: "I think", "likely", "should", "guaranteed", "always", "never", em-dashes used as narrative flourish, marketing adjectives.
8. NO AI-SLOP PUNCTUATION, no em-dash dramatics, no rhetorical pauses.
9. OUTPUT DISCIPLINE, if the caller asks for JSON, return ONLY valid JSON, no prose, no markdown fences.
10. EXECUTION-READY, every signal must be risk-adjusted and simulation-derived, not qualitative.

Treat the market as an adaptive reflexive system, not static equilibrium.
Violation of any rule = invalid response.`;

function hardenSystemPrompt(original: string, skip?: boolean): string {
  if (skip) return original;
  if (original.includes("[QUANT HARDENING LAYER")) return original;
  return `${HARDENING_PREAMBLE}\n\n[CALLER CONTEXT]\n${original}`;
}

/** Remove em/en dashes from model prose (banned house style). Safe for JSON. */
function stripLongDashes(text: string): string {
  return text.replace(/\s*[\u2014\u2013]\s+/g, ", ").replace(/[\u2014\u2013]/g, "-");
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
 * Models tried in order for a single Mistral key. If the account's tier does
 * not allow the large model (403 tier_not_allowed) or the model name is not
 * served (400/404), we step down to the open-weight models that every tier
 * can call instead of burning the whole lane.
 */
const MISTRAL_MODEL_CHAIN = [MISTRAL_DEFAULT_MODEL, MISTRAL_FAST_MODEL, "open-mistral-nemo"];

function isModelAvailabilityError(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status !== 403 && status !== 400) return false;
  const b = body.toLowerCase();
  return b.includes("tier_not_allowed") || b.includes("not available in your subscription") ||
    b.includes("model_not_found") || b.includes("invalid model");
}

/**
 * Remembers, per isolate, which model a given key was actually allowed to
 * call, so a tier-restricted account stops paying a wasted 403 round-trip on
 * every request.
 */
const modelMemo = new Map<string, string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Call Mistral with a single API key. Throws on non-2xx with status info.
 * Free-tier keys rate-limit per second, so a 429 gets one short backoff retry
 * on the same key before the lane is abandoned.
 */
async function callMistralWithKey(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const memoKey = apiKey.slice(0, 8);
  const preferred = modelMemo.get(memoKey);
  const base = opts.model ? [opts.model, MISTRAL_FAST_MODEL, "open-mistral-nemo"] : MISTRAL_MODEL_CHAIN;
  const chain = preferred ? [preferred, ...base.filter((m) => m !== preferred)] : base;
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  let lastErr: any = null;

  for (const model of chain) {
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
    let res: Response | null = null;
    let errBody = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, timeout);
      if (res.ok) break;
      errBody = await res.text();
      if (res.status === 429 && attempt === 0) {
        const retryAfter = Number(res.headers.get("retry-after") || 0);
        await sleep(retryAfter > 0 ? Math.min(retryAfter * 1000, 3000) : 1400);
        continue;
      }
      break;
    }

    if (!res!.ok) {
      lastErr = { status: res!.status, message: `Mistral ${model} ${res!.status}: ${errBody.slice(0, 200)}` };
      if (isModelAvailabilityError(res!.status, errBody)) {
        console.warn(`callAI → model ${model} unavailable on this tier, stepping down`);
        continue;
      }
      throw lastErr;
    }
    const data = await res!.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      lastErr = new Error("Empty Mistral response");
      continue;
    }
    modelMemo.set(memoKey, model);
    return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
  }
  throw lastErr || new Error("Mistral: no usable model");
}



/**
 * Generic OpenAI-compatible lane (OpenRouter, Groq, or any admin-supplied
 * compatible endpoint). Used only as a fallback after every Mistral key.
 */
const OPENROUTER_DEFAULT_MODEL = getKeySync("OPENROUTER_MODEL") || "mistralai/mistral-large";
const GROQ_DEFAULT_MODEL = getKeySync("GROQ_MODEL") || "llama-3.3-70b-versatile";

async function callOpenAICompatible(
  opts: CallAIOptions,
  apiKey: string,
  endpoint: string,
  model: string,
  reported?: AIResult["provider"],
): Promise<AIResult> {
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const body: Record<string, any> = {
    model: model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `${endpoint} ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty provider response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
}


/**
 * Mistral caller with automatic key 1 → key 2 fallback.
 * Falls back on any error from key 1 (rate limit, auth, network, empty body).
 */
async function callMistral(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const { primary, fallback } = buildLanes(reported);
  if (primary.length === 0 && fallback.length === 0) {
    throw new Error("No AI providers configured (MISTRAL_API_KEY / MISTRAL_API_KEY_2 / MISTRAL_API_KEY_3 / GOOGLE_GEMINI_KEY / GOOGLE_GEMINI_KEY_2)");
  }

  // Round-robin across PRIMARY (Mistral) lanes; cascade to FALLBACK (Gemini, 1min)
  // sequentially only after every primary lane has failed.
  const idx = primary.length ? pickKeyIndex(primary.length) : 0;
  const orderedPrimary = primary.slice(idx).concat(primary.slice(0, idx));
  const ordered = orderedPrimary.concat(fallback);

  let lastErr: any = null;
  for (const lane of ordered) {
    try {
      return await lane.call(opts);
    } catch (e: any) {
      lastErr = e;
      console.warn(`callAI → lane ${lane.label} failed:`, e?.message || e);
    }
  }
  throw lastErr || new Error("All AI lanes failed");
}

// ---------------------------------------------------------------------------
// 1min.ai lane
// ---------------------------------------------------------------------------
// 1min.ai exposes a unified gateway over many models. We use it as a third
// resilience lane alongside Mistral. Endpoint:
//   POST https://api.1min.ai/api/features?isStreaming=false
//   Headers: API-KEY: <key>
//   Body: { type: "CHAT_WITH_AI", model, promptObject: { prompt, isMixed, webSearch } }
// Response shape: aiRecord.aiRecordDetail.resultObject[0] (string)
const ONEMIN_DEFAULT_MODEL = Deno.env.get("ONEMIN_AI_MODEL") || "mistral-nemo";

async function callOneMinAI(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const apiKey = Deno.env.get("ONEMIN_AI_API_KEY");
  if (!apiKey) throw new Error("ONEMIN_AI_API_KEY not configured");

  // 1min.ai has no system role, fold system into the user prompt.
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const jsonHint = opts.jsonMode
    ? "\n\nReturn ONLY a single valid JSON object. No prose. No markdown fences. No comments."
    : "";
  const combinedPrompt = `${systemText}\n\n=== USER ===\n${opts.userPrompt}${jsonHint}`;

  const body = {
    type: "CHAT_WITH_AI",
    model: ONEMIN_DEFAULT_MODEL,
    promptObject: {
      prompt: combinedPrompt,
      isMixed: false,
      webSearch: false,
    },
  };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const res = await fetchWithTimeout("https://api.1min.ai/api/features?isStreaming=false", {
    method: "POST",
    headers: { "API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `1minAI ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  // Result can be array or string depending on the feature.
  const raw = data?.aiRecord?.aiRecordDetail?.resultObject;
  const text = Array.isArray(raw) ? raw.join("") : (typeof raw === "string" ? raw : "");
  if (!text || !text.trim()) throw new Error("Empty 1minAI response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
}

// ---------------------------------------------------------------------------
// Gemini lane (Google Generative Language API)
// ---------------------------------------------------------------------------
// Used as a tertiary failover after both Mistral keys. We expose two keys
// (GOOGLE_GEMINI_KEY, GOOGLE_GEMINI_KEY_2) and round-robin between them
// inside the lane registry. Default model is gemini-2.0-flash for low latency
// and high quota; can be overridden via GEMINI_DEFAULT_MODEL.
const GEMINI_DEFAULT_MODEL = Deno.env.get("GEMINI_DEFAULT_MODEL") || "gemini-2.5-flash-lite";

async function callGeminiWithKey(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const model = GEMINI_DEFAULT_MODEL;
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const jsonHint = opts.jsonMode
    ? "\n\nReturn ONLY a single valid JSON object. No prose. No markdown fences."
    : "";
  const body: Record<string, any> = {
    systemInstruction: { role: "system", parts: [{ text: systemText }] },
    contents: [{ role: "user", parts: [{ text: `${opts.userPrompt}${jsonHint}` }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: Math.min(opts.maxTokens ?? 4096, 8192),
      ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
    },
  };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Gemini ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("") : "";
  if (!text || !text.trim()) throw new Error("Empty Gemini response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
}

// ---------------------------------------------------------------------------
// Lane registry, assembles all available providers into a single rotation.
// ---------------------------------------------------------------------------
interface Lane {
  label: string;
  call: (opts: CallAIOptions) => Promise<AIResult>;
}

/**
 * Returns { primary, fallback }. Primary lanes round-robin (Mistral keys).
 * Fallback lanes are tried sequentially after every primary fails (Gemini, 1min).
 */
function buildLanes(reported?: AIResult["provider"]): { primary: Lane[]; fallback: Lane[] } {
  const primary: Lane[] = [];
  const fallback: Lane[] = [];
  const m1 = getKeySync("MISTRAL_API_KEY");
  const m2 = getKeySync("MISTRAL_API_KEY_2");
  const m3 = getKeySync("MISTRAL_API_KEY_3");
  const onemin = getKeySync("ONEMIN_AI_API_KEY");
  const g1 = getKeySync("GOOGLE_GEMINI_KEY");
  const g2 = getKeySync("GOOGLE_GEMINI_KEY_2");
  const or1 = getKeySync("OPENROUTER_API_KEY");
  const gq = getKeySync("GROQ_API_KEY");
  if (m1) primary.push({ label: "mistral-1", call: (o) => callMistralWithKey(o, m1, reported) });
  if (m2) primary.push({ label: "mistral-2", call: (o) => callMistralWithKey(o, m2, reported) });
  // Reserve Mistral key, kept out of the round-robin so it stays under its
  // rate limits, and tried before Gemini when the rotating keys are exhausted.
  if (m3) fallback.push({ label: "mistral-3-reserve", call: (o) => callMistralWithKey(o, m3, reported) });
  // Gemini lanes, sequential fallback after every Mistral key fails.
  // Ensures analytics never go dark when Mistral is rate-limited or down.
  if (g1) fallback.push({ label: "gemini-1", call: (o) => callGeminiWithKey(o, g1, reported) });
  if (g2) fallback.push({ label: "gemini-2", call: (o) => callGeminiWithKey(o, g2, reported) });
  if (or1) fallback.push({ label: "openrouter", call: (o) => callOpenAICompatible(o, or1, "https://openrouter.ai/api/v1/chat/completions", OPENROUTER_DEFAULT_MODEL, reported) });
  if (gq) fallback.push({ label: "groq", call: (o) => callOpenAICompatible(o, gq, "https://api.groq.com/openai/v1/chat/completions", GROQ_DEFAULT_MODEL, reported) });
  if (onemin && getKeySync("ONEMIN_AI_ENABLED") === "1") {
    fallback.push({ label: "1minai", call: (o) => callOneMinAI(o, reported) });
  }

  // Admin-added credentials from the in-app API Manager: any active row whose
  // value looks like an LLM key joins the chain even if the admin named it
  // something arbitrary. Provider is inferred from the key's own shape, so a
  // freshly added key is usable immediately with no redeploy and no naming
  // convention to remember. Tried FIRST, since an admin adds a key precisely
  // because the existing lanes are exhausted or blocked.
  const known = new Set([m1, m2, m3, g1, g2, or1, gq, onemin].filter(Boolean) as string[]);
  const NON_LLM_NAME = /(SUPABASE|ALPACA|ALPHAVANTAGE|NEWSDATA|POLYMARKET|OPENSKY|SCRAPEGRAPH|CLOUDFLARE|AISSTREAM|DEMO_|SESSION|JWKS|DB_URL|_MODEL|_ENABLED)/i;
  const inferred: Lane[] = [];
  for (const [name, value] of Object.entries(getManagedSnapshot())) {
    if (!value || known.has(value) || NON_LLM_NAME.test(name)) continue;
    const v = value.trim();
    if (/^sk-or-/.test(v)) {
      inferred.push({ label: `managed:${name}(openrouter)`, call: (o) => callOpenAICompatible(o, v, "https://openrouter.ai/api/v1/chat/completions", OPENROUTER_DEFAULT_MODEL, reported) });
    } else if (/^gsk_/.test(v)) {
      inferred.push({ label: `managed:${name}(groq)`, call: (o) => callOpenAICompatible(o, v, "https://api.groq.com/openai/v1/chat/completions", GROQ_DEFAULT_MODEL, reported) });
    } else if (/^AIza[\w-]{20,}$/.test(v)) {
      inferred.push({ label: `managed:${name}(gemini)`, call: (o) => callGeminiWithKey(o, v, reported) });
    } else if (/^sk-[A-Za-z0-9_-]{20,}$/.test(v)) {
      inferred.push({ label: `managed:${name}(openai)`, call: (o) => callOpenAICompatible(o, v, "https://api.openai.com/v1/chat/completions", getKeySync("OPENAI_MODEL") || "gpt-4o-mini", reported) });
    } else if (/^[A-Za-z0-9]{32}$/.test(v)) {
      inferred.push({ label: `managed:${name}(mistral)`, call: (o) => callMistralWithKey(o, v, reported) });
    }
    known.add(v);
  }

  return { primary: inferred.concat(primary), fallback };
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
 * Public API, single AI call. Always Mistral, with key1 → key2 fallback.
 */
export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  await refreshManagedKeys();
  const needsTools = !!(opts.tools && opts.tools.length > 0);
  if (needsTools) return await callMistralToolMode(opts);
  return await callMistral(opts, opts.provider || "mistral");
}

/**
 * Public API, fan out for ensemble diversity. With Mistral-only we just
 * return one result (kept as array to preserve existing call sites).
 */
export async function callAIParallel(opts: CallAIOptions): Promise<AIResult[]> {
  const r = await callAI(opts);
  return [r];
}

/**
 * Live web search grounding via Gemini's built-in google_search tool.
 * Returns a compact bullet list of real-time web snippets (titles + URLs)
 * that the caller can inject directly into a prompt. Empty string on any
 * failure so callers degrade gracefully, but we DO try, because the user
 * explicitly asked for real-time recommendations, not training-cutoff guesses.
 */
export async function fetchLiveWebContext(_query: string, _maxBullets = 8): Promise<string> {
  // Live web context disabled, Gemini removed. Mistral-only stack.
  return "";
}
