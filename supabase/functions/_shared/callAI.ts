/**
 * AI caller, UNIFIED on Mistral with multi-provider failover.
 *
 * Primary routing prioritizes Mistral and active admin credentials.
 * Providers (Mistral, Gemini, OpenRouter, Groq, OpenAI, Anthropic, NVIDIA)
 * are supported with automatic failover, timeout management, rate-limit backoff,
 * and automatic model step-down.
 *
 * Keys resolve through the global API Manager (public.api_credentials, managed
 * by an admin in-app) first, then environment variables.
 */
import { getKeySync, getManagedSnapshot, getManagedProviderSnapshot, refreshManagedKeys } from "./managedKeys.ts";

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  provider?: "groq" | "cloudflare" | "mistral" | "openai" | "gemini" | "openrouter" | "anthropic" | "nvidia";
  jsonMode?: boolean;
  skipHardening?: boolean;
  /** No-op (kept for backward compatibility). */
  useWebSearch?: boolean;
}

interface AIResult {
  text: string;
  provider: "groq" | "cloudflare" | "mistral" | "openai" | "gemini" | "openrouter" | "anthropic" | "nvidia";
  toolCall?: any;
}

const MISTRAL_DEFAULT_MODEL = "mistral-large-latest";
const MISTRAL_FAST_MODEL = "mistral-small-latest";

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
  return text.replace(/\s*[—–]\s+/g, ", ").replace(/[—–]/g, "-");
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

const MISTRAL_MODEL_CHAIN = [MISTRAL_DEFAULT_MODEL, MISTRAL_FAST_MODEL, "open-mistral-nemo"];

function isModelAvailabilityError(status: number, body: string): boolean {
  if (status === 404) return true;
  if (status !== 403 && status !== 400) return false;
  const b = body.toLowerCase();
  return b.includes("tier_not_allowed") || b.includes("not available in your subscription") ||
    b.includes("model_not_found") || b.includes("invalid model");
}

const modelMemo = new Map<string, string>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

async function callOpenAICompatible(
  opts: CallAIOptions,
  apiKey: string,
  endpoint: string,
  defaultModel: string,
  fallbackModels: string[] = [],
  reported?: AIResult["provider"],
): Promise<AIResult> {
  const models = [opts.model || defaultModel, ...fallbackModels.filter(m => m !== (opts.model || defaultModel))];
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  let lastErr: any = null;

  for (const model of models) {
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
    try {
      const res = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, timeout);

      if (!res.ok) {
        const errBody = await res.text();
        lastErr = { status: res.status, message: `${endpoint} [${model}] ${res.status}: ${errBody.slice(0, 250)}` };
        if (res.status === 404 || res.status === 400 || res.status === 422 || res.status === 429) {
          console.warn(`callAI → model ${model} at ${endpoint} returned ${res.status}, trying fallback`);
          if (res.status === 429 && models.indexOf(model) < models.length - 1) {
            await new Promise((r) => setTimeout(r, 600));
          }
          continue;
        }
        throw lastErr;
      }
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) {
        lastErr = new Error(`Empty response from ${endpoint} [${model}]`);
        continue;
      }
      return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
    } catch (e: any) {
      if (e?.status && (e.status === 404 || e.status === 400 || e.status === 422 || e.status === 429) && models.indexOf(model) < models.length - 1) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error(`All models for ${endpoint} failed`);
}

async function callAnthropic(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const model = opts.model || getKeySync("ANTHROPIC_MODEL") || "claude-3-5-haiku-latest";
  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      system: hardenSystemPrompt(opts.systemPrompt, opts.skipHardening),
      messages: [{ role: "user", content: opts.userPrompt }],
      temperature: opts.temperature ?? 0.6,
      max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
    }),
  }, timeout);
  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Anthropic [${model}] ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = Array.isArray(data?.content) ? data.content.map((part: any) => part?.text || "").join("") : "";
  if (!text.trim()) throw new Error("Empty Anthropic response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "anthropic" };
}

const GEMINI_MODEL_CHAIN = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite"];
const geminiModelMemo = new Map<string, string>();

async function callGeminiWithKey(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const memoKey = apiKey.slice(0, 8);
  const preferred = geminiModelMemo.get(memoKey);
  const customModel = opts.model || getKeySync("GEMINI_MODEL") || getKeySync("GOOGLE_GEMINI_MODEL") || Deno.env.get("GEMINI_DEFAULT_MODEL");
  const base = customModel ? [customModel, ...GEMINI_MODEL_CHAIN.filter(m => m !== customModel)] : GEMINI_MODEL_CHAIN;
  const chain = preferred ? [preferred, ...base.filter((m) => m !== preferred)] : base;

  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const jsonHint = opts.jsonMode
    ? "\n\nReturn ONLY a single valid JSON object. No prose. No markdown fences."
    : "";
  let lastErr: any = null;

  for (const model of chain) {
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
        lastErr = { status: res.status, message: `Gemini [${model}] ${res.status}: ${errBody.slice(0, 200)}` };
        if (res.status === 404 || res.status === 400 || res.status === 403 || res.status === 429) {
          console.warn(`callAI → Gemini model ${model} unavailable/rate-limited (${res.status}), stepping down...`);
          if (res.status === 429 && chain.indexOf(model) < chain.length - 1) {
            await new Promise((r) => setTimeout(r, 600));
          }
          continue;
        }
        throw lastErr;
      }
      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts;
      const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("") : "";
      if (!text || !text.trim()) {
        lastErr = new Error(`Empty Gemini response from ${model}`);
        continue;
      }
      geminiModelMemo.set(memoKey, model);
      return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "gemini" };
    } catch (e: any) {
      if (e?.status && (e.status === 404 || e.status === 400 || e.status === 403 || e.status === 429) && chain.indexOf(model) < chain.length - 1) {
        continue;
      }
      throw e;
    }
  }
  throw lastErr || new Error("All Gemini models failed");
}

async function callOneMinAI(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const key = getKeySync("ONEMIN_AI_API_KEY");
  if (!key) throw new Error("1min.ai key not configured");
  const model = opts.model || getKeySync("ONEMIN_AI_MODEL") || "gpt-4o-mini";
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);

  const res = await fetch("https://api.1min.ai/api/features", {
    method: "POST",
    headers: {
      "API-KEY": key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "CHAT_WITH_AI",
      model,
      prompt: `${systemText}\n\n${opts.userPrompt}`,
      temperature: opts.temperature ?? 0.6,
      max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `1min.ai ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = data?.result?.response || data?.response || data?.text || "";
  if (!text || !text.trim()) throw new Error("Empty 1min.ai response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
}

interface Lane {
  label: string;
  credentialName?: string;
  provider: string;
  source?: "manager" | "environment";
  call: (opts: CallAIOptions) => Promise<AIResult>;
}

function buildLanes(reported?: AIResult["provider"], requestedProvider?: string): { primary: Lane[]; fallback: Lane[] } {
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
  const openai = getKeySync("OPENAI_API_KEY");
  const anthropic = getKeySync("ANTHROPIC_API_KEY");
  const nvidia = getKeySync("NVIDIA_API_KEY");
  const managed = getManagedSnapshot();

  const openrouterDefault = getKeySync("OPENROUTER_MODEL") || "mistralai/mistral-large-2411";
  const openrouterFallbacks = ["google/gemini-2.0-flash-001", "meta-llama/llama-3.3-70b-instruct", "openrouter/auto"];
  const groqDefault = getKeySync("GROQ_MODEL") || "llama-3.3-70b-versatile";
  const groqFallbacks = ["llama-3.1-8b-instant", "mixtral-8x7b-32768"];

  if (m1) primary.push({ label: "mistral-1", credentialName: "MISTRAL_API_KEY", provider: "Mistral", source: managed.MISTRAL_API_KEY ? "manager" : "environment", call: (o) => callMistralWithKey(o, m1, reported) });
  if (m2) primary.push({ label: "mistral-2", credentialName: "MISTRAL_API_KEY_2", provider: "Mistral", source: managed.MISTRAL_API_KEY_2 ? "manager" : "environment", call: (o) => callMistralWithKey(o, m2, reported) });
  if (m3) fallback.push({ label: "mistral-3-reserve", credentialName: "MISTRAL_API_KEY_3", provider: "Mistral", source: managed.MISTRAL_API_KEY_3 ? "manager" : "environment", call: (o) => callMistralWithKey(o, m3, reported) });

  if (g1) fallback.push({ label: "gemini-1", credentialName: "GOOGLE_GEMINI_KEY", provider: "Gemini", source: managed.GOOGLE_GEMINI_KEY ? "manager" : "environment", call: (o) => callGeminiWithKey(o, g1, reported || "gemini") });
  if (g2) fallback.push({ label: "gemini-2", credentialName: "GOOGLE_GEMINI_KEY_2", provider: "Gemini", source: managed.GOOGLE_GEMINI_KEY_2 ? "manager" : "environment", call: (o) => callGeminiWithKey(o, g2, reported || "gemini") });

  if (or1) fallback.push({ label: "openrouter", credentialName: "OPENROUTER_API_KEY", provider: "OpenRouter", source: managed.OPENROUTER_API_KEY ? "manager" : "environment", call: (o) => callOpenAICompatible(o, or1, "https://openrouter.ai/api/v1/chat/completions", openrouterDefault, openrouterFallbacks, reported || "openrouter") });
  if (gq) fallback.push({ label: "groq", credentialName: "GROQ_API_KEY", provider: "Groq", source: managed.GROQ_API_KEY ? "manager" : "environment", call: (o) => callOpenAICompatible(o, gq, "https://api.groq.com/openai/v1/chat/completions", groqDefault, groqFallbacks, reported || "groq") });
  if (openai) fallback.push({ label: "openai", credentialName: "OPENAI_API_KEY", provider: "OpenAI", source: managed.OPENAI_API_KEY ? "manager" : "environment", call: (o) => callOpenAICompatible(o, openai, "https://api.openai.com/v1/chat/completions", getKeySync("OPENAI_MODEL") || "gpt-4o-mini", ["gpt-4o", "gpt-3.5-turbo"], reported || "openai") });
  if (anthropic) fallback.push({ label: "anthropic", credentialName: "ANTHROPIC_API_KEY", provider: "Anthropic", source: managed.ANTHROPIC_API_KEY ? "manager" : "environment", call: (o) => callAnthropic(o, anthropic, reported || "anthropic") });
  if (nvidia) fallback.push({ label: "nvidia", credentialName: "NVIDIA_API_KEY", provider: "NVIDIA", source: managed.NVIDIA_API_KEY ? "manager" : "environment", call: (o) => callOpenAICompatible(o, nvidia, "https://integrate.api.nvidia.com/v1/chat/completions", getKeySync("NVIDIA_MODEL") || "meta/llama-3.1-70b-instruct", [], reported || "nvidia") });
  if (onemin && getKeySync("ONEMIN_AI_ENABLED") === "1") {
    fallback.push({ label: "1minai", credentialName: "ONEMIN_AI_API_KEY", provider: "1min.ai", source: managed.ONEMIN_AI_API_KEY ? "manager" : "environment", call: (o) => callOneMinAI(o, reported) });
  }

  const known = new Set([m1, m2, m3, g1, g2, or1, gq, openai, anthropic, nvidia, onemin].filter(Boolean) as string[]);
  const NON_LLM_NAME = /(SUPABASE|ALPACA|ALPHAVANTAGE|NEWSDATA|POLYMARKET|OPENSKY|SCRAPEGRAPH|CLOUDFLARE|AISSTREAM|DEMO_|SESSION|JWKS|DB_URL|_MODEL|_ENABLED)/i;
  const inferred: Lane[] = [];
  const managedProviders = getManagedProviderSnapshot();
  for (const [name, value] of Object.entries(managed)) {
    if (!value || known.has(value) || NON_LLM_NAME.test(name)) continue;
    const v = value.trim();
    const configuredProvider = (managedProviders[name] || "").toLowerCase();
    if (configuredProvider === "openrouter" || /^sk-or-/.test(v) || /OPENROUTER/i.test(name)) {
      inferred.push({ label: `managed:${name}(openrouter)`, credentialName: name, provider: "OpenRouter", source: "manager", call: (o) => callOpenAICompatible(o, v, "https://openrouter.ai/api/v1/chat/completions", openrouterDefault, openrouterFallbacks, reported || "openrouter") });
    } else if (configuredProvider === "groq" || /^gsk_/.test(v) || /GROQ/i.test(name)) {
      inferred.push({ label: `managed:${name}(groq)`, credentialName: name, provider: "Groq", source: "manager", call: (o) => callOpenAICompatible(o, v, "https://api.groq.com/openai/v1/chat/completions", groqDefault, groqFallbacks, reported || "groq") });
    } else if (configuredProvider === "gemini" || /^AIza[\w-]{20,}$/.test(v) || /GEMINI/i.test(name)) {
      inferred.push({ label: `managed:${name}(gemini)`, credentialName: name, provider: "Gemini", source: "manager", call: (o) => callGeminiWithKey(o, v, reported || "gemini") });
    } else if (configuredProvider === "anthropic" || /ANTHROPIC|CLAUDE/i.test(name)) {
      inferred.push({ label: `managed:${name}(anthropic)`, credentialName: name, provider: "Anthropic", source: "manager", call: (o) => callAnthropic(o, v, reported || "anthropic") });
    } else if (configuredProvider === "nvidia" || /^nvapi-/.test(v) || /NVIDIA/i.test(name)) {
      inferred.push({ label: `managed:${name}(nvidia)`, credentialName: name, provider: "NVIDIA", source: "manager", call: (o) => callOpenAICompatible(o, v, "https://integrate.api.nvidia.com/v1/chat/completions", getKeySync("NVIDIA_MODEL") || "meta/llama-3.1-70b-instruct", [], reported || "nvidia") });
    } else if (configuredProvider === "openai" || /^sk-[A-Za-z0-9_-]{20,}$/.test(v) || /OPENAI/i.test(name)) {
      inferred.push({ label: `managed:${name}(openai)`, credentialName: name, provider: "OpenAI", source: "manager", call: (o) => callOpenAICompatible(o, v, "https://api.openai.com/v1/chat/completions", getKeySync("OPENAI_MODEL") || "gpt-4o-mini", ["gpt-4o", "gpt-3.5-turbo"], reported || "openai") });
    } else if (configuredProvider === "mistral" || /^[A-Za-z0-9]{32}$/.test(v) || /MISTRAL/i.test(name)) {
      inferred.push({ label: `managed:${name}(mistral)`, credentialName: name, provider: "Mistral", source: "manager", call: (o) => callMistralWithKey(o, v, reported) });
    }
    known.add(v);
  }

  const testKey = Deno.env.get("AI_TEST_API_KEY")?.trim();
  if (testKey && !known.has(testKey)) {
    if (/^sk-or-/.test(testKey)) inferred.unshift({ label: "test-key(openrouter)", credentialName: "AI_TEST_API_KEY", provider: "OpenRouter", source: "environment", call: (o) => callOpenAICompatible(o, testKey, "https://openrouter.ai/api/v1/chat/completions", openrouterDefault, openrouterFallbacks, reported || "openrouter") });
    else if (/^gsk_/.test(testKey)) inferred.unshift({ label: "test-key(groq)", credentialName: "AI_TEST_API_KEY", provider: "Groq", source: "environment", call: (o) => callOpenAICompatible(o, testKey, "https://api.groq.com/openai/v1/chat/completions", groqDefault, groqFallbacks, reported || "groq") });
    else if (/^AIza/.test(testKey)) inferred.unshift({ label: "test-key(gemini)", credentialName: "AI_TEST_API_KEY", provider: "Gemini", source: "environment", call: (o) => callGeminiWithKey(o, testKey, reported || "gemini") });
    else if (/^sk-/.test(testKey)) inferred.unshift({ label: "test-key(openai)", credentialName: "AI_TEST_API_KEY", provider: "OpenAI", source: "environment", call: (o) => callOpenAICompatible(o, testKey, "https://api.openai.com/v1/chat/completions", getKeySync("OPENAI_MODEL") || "gpt-4o-mini", ["gpt-4o", "gpt-3.5-turbo"], reported || "openai") });
    else if (/^[A-Za-z0-9]{32}$/.test(testKey)) inferred.unshift({ label: "test-key(mistral)", credentialName: "AI_TEST_API_KEY", provider: "Mistral", source: "environment", call: (o) => callMistralWithKey(o, testKey, reported) });
  }

  const allPrimary = inferred.concat(primary);

  if (requestedProvider) {
    const target = requestedProvider.toLowerCase();
    const allLanes = allPrimary.concat(fallback);
    const matched = allLanes.filter(l => l.provider.toLowerCase() === target);
    const remainder = allLanes.filter(l => l.provider.toLowerCase() !== target);
    if (matched.length > 0) {
      return { primary: matched, fallback: remainder };
    }
  }

  return { primary: allPrimary, fallback };
}

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

  const raw = await callAI(jsonOpts);
  let parsed: any;
  try {
    parsed = JSON.parse(raw.text);
  } catch (err) {
    const match = raw.text.match(/\{[\s\S]*\}/);
    if (match) {
      try { parsed = JSON.parse(match[0]); }
      catch { parsed = { rawResponse: raw.text }; }
    } else {
      parsed = { rawResponse: raw.text };
    }
  }

  if (arrayFieldName && Array.isArray(parsed) && !parsed[arrayFieldName]) {
    parsed = { [arrayFieldName]: parsed };
  }

  return {
    text: raw.text,
    provider: raw.provider,
    toolCall: {
      id: `call_${Date.now()}`,
      type: "function",
      function: {
        name: forcedToolName,
        arguments: JSON.stringify(parsed),
      },
    },
  };
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  await refreshManagedKeys();

  if (opts.tools && opts.tools.length > 0) {
    return await callMistralToolMode(opts);
  }

  const reportedProvider = opts.provider || "mistral";
  const { primary, fallback } = buildLanes(reportedProvider, opts.provider);
  const lanesToTry = [...primary, ...fallback];

  if (lanesToTry.length === 0) {
    throw {
      status: 500,
      message: "No AI providers configured. Add MISTRAL_API_KEY or GOOGLE_GEMINI_KEY in the API Manager.",
    };
  }

  let lastError: any = null;
  for (const lane of lanesToTry) {
    try {
      const result = await lane.call(opts);
      return result;
    } catch (err: any) {
      lastError = err;
      console.warn(`callAI → Lane [${lane.label}] failed (${err?.status || err?.message || err}), trying next lane`);
    }
  }

  throw lastError || new Error("All AI provider lanes failed.");
}
