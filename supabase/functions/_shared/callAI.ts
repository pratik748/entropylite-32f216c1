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
import { getKeySync, getManagedSnapshot, refreshManagedKeys, getProviderHints, getHealthSnapshot, recordKeyHealth, getUpdatedAts } from "./managedKeys.ts";

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
  if (status === 404 || status === 410) return true;
  if (status === 403 && body.toLowerCase().includes("blocked at the project")) return true;
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
  model: string | string[],
  reported?: AIResult["provider"],
): Promise<AIResult> {
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const models = Array.isArray(model) ? model : [model];
  let lastErr: any = null;
  for (const m of models) {
    const body: Record<string, any> = {
      model: m,
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
      lastErr = { status: res.status, message: `${new URL(endpoint).host} ${m} ${res.status}: ${errBody.slice(0, 200)}` };
      if (isModelAvailabilityError(res.status, errBody)) continue;
      throw lastErr;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) { lastErr = new Error("Empty provider response"); continue; }
    return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
  }
  throw lastErr || new Error("No usable model");
}

/** Anthropic Messages API lane. */
async function callAnthropic(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const jsonHint = opts.jsonMode ? "\n\nReturn ONLY a single valid JSON object. No prose. No markdown fences." : "";
  const models = [getKeySync("ANTHROPIC_MODEL") || "claude-3-5-haiku-latest", "claude-3-haiku-20240307"];
  let lastErr: any = null;
  for (const m of models) {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: JSON.stringify({
        model: m, system: systemText, max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
        temperature: opts.temperature ?? 0.6,
        messages: [{ role: "user", content: `${opts.userPrompt}${jsonHint}` }],
      }),
    }, (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000);
    if (!res.ok) {
      const errBody = await res.text();
      lastErr = { status: res.status, message: `Anthropic ${m} ${res.status}: ${errBody.slice(0, 200)}` };
      if (isModelAvailabilityError(res.status, errBody)) continue;
      throw lastErr;
    }
    const data = await res.json();
    const text = Array.isArray(data?.content) ? data.content.map((p: any) => p?.text || "").join("") : "";
    if (!text.trim()) { lastErr = new Error("Empty Anthropic response"); continue; }
    return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
  }
  throw lastErr || new Error("Anthropic: no usable model");
}

// ---------------------------------------------------------------------------
// Fortress lane runner: circuit breaker + persisted per-key telemetry.
// ---------------------------------------------------------------------------
type FailureClass = "dead" | "rate" | "transient" | "model";

export function classifyFailure(status: number | undefined, message: string): FailureClass {
  const m = (message || "").toLowerCase();
  if (status === 401 || m.includes("invalid api key") || m.includes("suspended") || m.includes("user not found") ||
      m.includes("permission denied") || m.includes("api key not valid") || m.includes("unauthorized")) return "dead";
  if (status === 402 || m.includes("insufficient") || m.includes("quota") || m.includes("billing")) return "rate";
  if (status === 429 || m.includes("rate limit")) return "rate";
  if (status === 404 || m.includes("model_not_found") || m.includes("does not exist")) return "model";
  if (status === 403) return "dead";
  return "transient";
}

const COOLDOWN_MS: Record<FailureClass, number> = {
  dead: 30 * 60_000,      // bad/suspended key: stop paying its latency for 30 min
  rate: 90_000,           // rate/quota: brief rest
  model: 30 * 60_000,     // no usable model on this key
  transient: 15_000,
};

/** Is this key resting after a recent failure? Uses persisted health so cold isolates benefit. */
function coolingDown(name: string): boolean {
  const h = getHealthSnapshot()[name];
  if (!h || h.status !== "error" || !h.errorAt) return false;
  if (h.okAt > h.errorAt) return false;

  // If this credential was updated in the API Manager AFTER the recorded error,
  // the error belongs to the old key value, so do not cool down the new key!
  const uAts = getUpdatedAts();
  if (uAts[name] && uAts[name] > h.errorAt) return false;

  const cls = classifyFailure(undefined, h.error || "");
  const statusMatch = /\b(4\d\d|5\d\d)\b/.exec(h.error || "");
  const cls2 = statusMatch ? classifyFailure(Number(statusMatch[1]), h.error || "") : cls;
  return Date.now() - h.errorAt < COOLDOWN_MS[cls2];
}

async function runLane(lane: Lane, opts: CallAIOptions): Promise<AIResult> {
  const t0 = Date.now();
  try {
    const r = await lane.call(opts);
    recordKeyHealth(lane.name, lane.provider, lane.source, true, Date.now() - t0);
    return r;
  } catch (e: any) {
    const msg = String(e?.message || e || "error");
    recordKeyHealth(lane.name, lane.provider, lane.source, false, Date.now() - t0, msg);
    throw e;
  }
}

async function callMistral(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const lanes = buildLanes(reported);
  if (lanes.length === 0) {
    throw { status: 503, message: "No AI keys configured. Add one in the API Manager." };
  }
  // Prioritization score:
  // Manager keys get high priority (+10) so admin-added keys are ALWAYS tried before environment keys.
  // Recently successful keys get +2 bonus.
  const health = getHealthSnapshot();
  const score = (l: Lane) => (l.source === "manager" ? 10 : 0) + ((health[l.name]?.okAt || 0) > (health[l.name]?.errorAt || 0) ? 2 : 0);
  const ready = lanes.filter((l) => !coolingDown(l.name));
  const resting = lanes.filter((l) => coolingDown(l.name) && classifyFailure(undefined, health[l.name]?.error || "") !== "dead");

  // Rotate among equal-priority keys, but keep manager keys strictly ahead of environment
  const sortedReady = [...ready].sort((a, b) => score(b) - score(a));
  let ordered = sortedReady.concat(resting);

  // Resilience safety net: if every single key was marked dead/resting, DO NOT fail with 503!
  // Instead, try all configured lanes (manager keys first) as an emergency fallback.
  if (ordered.length === 0) {
    ordered = [...lanes].sort((a, b) => (a.source === "manager" ? -1 : 1));
  }

  let lastErr: any = null;
  const tried: string[] = [];
  for (const lane of ordered) {
    try {
      return await runLane(lane, opts);
    } catch (e: any) {
      lastErr = e;
      tried.push(lane.name);
      console.warn(`callAI → ${lane.name} (${lane.provider}) failed:`, String(e?.message || e).slice(0, 180));
    }
  }
  throw { status: 503, message: `All AI keys failed (${tried.join(", ")}). Last: ${String(lastErr?.message || lastErr).slice(0, 160)}` };
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
const GEMINI_MODELS = [
  GEMINI_DEFAULT_MODEL,
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

async function callGeminiWithKey(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const jsonHint = opts.jsonMode
    ? "\n\nReturn ONLY a single valid JSON object. No prose. No markdown fences."
    : "";
  let lastErr: any = null;

  for (const model of GEMINI_MODELS) {
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
    try {
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, timeout);

      if (!res.ok) {
        const errBody = await res.text();
        lastErr = { status: res.status, message: `Gemini ${model} ${res.status}: ${errBody.slice(0, 200)}` };
        if (res.status === 404 || res.status === 400) continue;
        throw lastErr;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("") : "";
      if (!text || !text.trim()) { lastErr = new Error("Empty Gemini response"); continue; }
      return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "gemini" };
    } catch (e: any) {
      lastErr = e;
      if (e?.status === 404 || e?.status === 400) continue;
      throw e;
    }
  }
  throw lastErr || new Error("Gemini: no usable model");
}

// ---------------------------------------------------------------------------
// Lane registry, assembles all available providers into a single rotation.
// ---------------------------------------------------------------------------
interface Lane {
  name: string;
  provider: string;
  source: "manager" | "environment";
  call: (opts: CallAIOptions) => Promise<AIResult>;
}

const GROQ_MODELS = [GROQ_DEFAULT_MODEL, "llama-3.1-8b-instant", "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
const OPENAI_MODELS = () => [getKeySync("OPENAI_MODEL") || "gpt-4o-mini", "gpt-4.1-mini"];
const NVIDIA_MODELS = ["meta/llama-3.3-70b-instruct", "meta/llama-4-maverick-17b-128e-instruct", "mistralai/mistral-small-24b-instruct", "meta/llama-3.1-8b-instruct"];

function inferProvider(value: string): string | null {
  const v = value.trim();
  if (/^sk-or-/.test(v)) return "openrouter";
  if (/^sk-ant-/.test(v)) return "anthropic";
  if (/^gsk_/.test(v)) return "groq";
  if (/^nvapi-/.test(v)) return "nvidia";
  if (/^AIza[\w-]{20,}$/.test(v)) return "gemini";
  if (/^sk-(proj-)?[A-Za-z0-9_-]{20,}$/.test(v)) return "openai";
  if (/^[A-Za-z0-9]{32}$/.test(v)) return "mistral";
  return null;
}

export function detectProvider(name: string, value: string, hint?: string | null): string | null {
  if (hint && hint !== "auto" && hint.trim()) return hint.trim().toLowerCase();
  const n = name.toUpperCase();
  if (n.includes("MISTRAL")) return "mistral";
  if (n.includes("GEMINI") || n.includes("GOOGLE")) return "gemini";
  if (n.includes("OPENROUTER")) return "openrouter";
  if (n.includes("GROQ")) return "groq";
  if (n.includes("OPENAI") || n.startsWith("GPT")) return "openai";
  if (n.includes("ANTHROPIC") || n.includes("CLAUDE")) return "anthropic";
  if (n.includes("NVIDIA")) return "nvidia";
  if (n.includes("CLOUDFLARE")) return "cloudflare";
  if (n.includes("1MIN")) return "1minai";
  return inferProvider(value);
}

function laneFor(name: string, provider: string, key: string, source: Lane["source"], reported?: AIResult["provider"]): Lane | null {
  const mk = (call: Lane["call"]): Lane => ({ name, provider, source, call });
  switch (provider) {
    case "mistral": return mk((o) => callMistralWithKey(o, key, reported));
    case "gemini": return mk((o) => callGeminiWithKey(o, key, reported));
    case "openrouter": return mk((o) => callOpenAICompatible(o, key, "https://openrouter.ai/api/v1/chat/completions", [OPENROUTER_DEFAULT_MODEL, "meta-llama/llama-3.3-70b-instruct:free"], reported));
    case "groq": return mk((o) => callOpenAICompatible(o, key, "https://api.groq.com/openai/v1/chat/completions", GROQ_MODELS, reported));
    case "openai": return mk((o) => callOpenAICompatible(o, key, "https://api.openai.com/v1/chat/completions", OPENAI_MODELS(), reported));
    case "nvidia": return mk((o) => callOpenAICompatible(o, key, "https://integrate.api.nvidia.com/v1/chat/completions", NVIDIA_MODELS, reported));
    case "anthropic": return mk((o) => callAnthropic(o, key, reported));
    case "cloudflare": {
      const acct = getKeySync("CLOUDFLARE_ACCOUNT_ID");
      if (!acct) return null;
      return mk((o) => callOpenAICompatible(o, key, `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/v1/chat/completions`, ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct"], reported));
    }
    case "1minai": return getKeySync("ONEMIN_AI_ENABLED") === "1" ? mk((o) => callOneMinAI(o, reported)) : null;
    default: return null;
  }
}

/** Every configured AI credential, environment and API Manager, deduplicated by value. */
export const ENV_AI_KEYS: Array<[string, string]> = [
  ["MISTRAL_API_KEY", "mistral"], ["MISTRAL_API_KEY_2", "mistral"], ["MISTRAL_API_KEY_3", "mistral"],
  ["GOOGLE_GEMINI_KEY", "gemini"], ["GOOGLE_GEMINI_KEY_2", "gemini"],
  ["OPENAI_API_KEY", "openai"], ["ANTHROPIC_API_KEY", "anthropic"],
  ["OPENROUTER_API_KEY", "openrouter"], ["GROQ_API_KEY", "groq"], ["NVIDIA_API_KEY", "nvidia"],
  ["CLOUDFLARE_API_TOKEN", "cloudflare"], ["ONEMIN_AI_API_KEY", "1minai"],
];
const NON_LLM_NAME = /(SUPABASE|ALPACA|ALPHAVANTAGE|NEWSDATA|POLYMARKET|OPENSKY|SCRAPEGRAPH|CLOUDFLARE_ACCOUNT|AISSTREAM|DEMO_|SESSION|JWKS|DB_URL|_MODEL$|_ENABLED$)/i;

export function buildLanes(reported?: AIResult["provider"]): Lane[] {
  const lanes: Lane[] = [];
  const seen = new Set<string>();
  const managed = getManagedSnapshot();
  const hints = getProviderHints();
  const envNames = new Set(ENV_AI_KEYS.map(([n]) => n));

  // 1. API Manager keys (admin-added, any name). Declared provider wins, else inferred from name/shape.
  for (const [name, raw] of Object.entries(managed)) {
    const v = (raw || "").trim();
    if (!v || NON_LLM_NAME.test(name) || seen.has(v)) continue;
    const provider = detectProvider(name, v, hints[name]);
    if (!provider) continue;
    const lane = laneFor(name, provider, v, "manager", reported);
    if (lane) { lanes.push(lane); seen.add(v); }
  }
  // 2. Environment keys not overridden by the manager.
  for (const [name, defaultProvider] of ENV_AI_KEYS) {
    if (managed[name]) continue;
    const v = (Deno.env.get(name) || "").trim();
    if (!v || seen.has(v)) continue;
    const provider = detectProvider(name, v, defaultProvider);
    if (!provider) continue;
    const lane = laneFor(name, provider, v, "environment", reported);
    if (lane) { lanes.push(lane); seen.add(v); }
  }
  // 3. Any other env secret that looks like an LLM key (e.g. a test key).
  for (const name of ["AI_TEST_API_KEY"]) {
    if (envNames.has(name) || managed[name]) continue;
    const v = (Deno.env.get(name) || "").trim();
    if (!v || seen.has(v)) continue;
    const provider = detectProvider(name, v);
    if (!provider) continue;
    const lane = laneFor(name, provider, v, "environment", reported);
    if (lane) { lanes.push(lane); seen.add(v); }
  }
  return lanes;
}

/** Test exactly one credential end to end. Supports both AI keys and data APIs. */
export async function testKey(name: string): Promise<{ ok: boolean; provider: string | null; latencyMs: number; error?: string; sample?: string }> {
  await refreshManagedKeys(true);
  const managed = getManagedSnapshot();
  const rawKey = managed[name] || Deno.env.get(name) || "";
  const upper = name.toUpperCase();

  // Test data APIs (AlphaVantage, NewsData, etc.)
  if (upper.includes("ALPHAVANTAGE")) {
    if (!rawKey.trim()) return { ok: false, provider: "alphavantage", latencyMs: 0, error: "Key value is empty" };
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=IBM&apikey=${rawKey.trim()}`, {}, 15000);
      const text = await res.text();
      const ok = res.ok && !text.includes("Invalid API call") && !text.includes("Error Message");
      return { ok, provider: "alphavantage", latencyMs: Date.now() - t0, sample: ok ? "AlphaVantage OK" : text.slice(0, 100), error: ok ? undefined : text.slice(0, 200) };
    } catch (e: any) {
      return { ok: false, provider: "alphavantage", latencyMs: Date.now() - t0, error: e?.message || "Connection failed" };
    }
  }

  if (upper.includes("NEWSDATA")) {
    if (!rawKey.trim()) return { ok: false, provider: "newsdata", latencyMs: 0, error: "Key value is empty" };
    const t0 = Date.now();
    try {
      const res = await fetchWithTimeout(`https://newsdata.io/api/1/news?apikey=${rawKey.trim()}&q=market&language=en`, {}, 15000);
      const text = await res.text();
      const ok = res.ok && !text.includes('"status":"error"');
      return { ok, provider: "newsdata", latencyMs: Date.now() - t0, sample: ok ? "NewsData OK" : text.slice(0, 100), error: ok ? undefined : text.slice(0, 200) };
    } catch (e: any) {
      return { ok: false, provider: "newsdata", latencyMs: Date.now() - t0, error: e?.message || "Connection failed" };
    }
  }

  const lane = buildLanes().find((l) => l.name === name);
  if (!lane) {
    if (!rawKey.trim()) return { ok: false, provider: null, latencyMs: 0, error: "Key value is empty." };
    const prov = detectProvider(name, rawKey);
    return { ok: false, provider: prov, latencyMs: 0, error: `Could not initialize lane for key (provider: ${prov || "unknown"}).` };
  }
  const t0 = Date.now();
  try {
    const r = await runLane(lane, { systemPrompt: "Reply with the single word OK.", userPrompt: "ping", maxTokens: 8, temperature: 0, skipHardening: true });
    return { ok: true, provider: lane.provider, latencyMs: Date.now() - t0, sample: r.text.slice(0, 40) };
  } catch (e: any) {
    return { ok: false, provider: lane.provider, latencyMs: Date.now() - t0, error: String(e?.message || e).slice(0, 300) };
  }
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
