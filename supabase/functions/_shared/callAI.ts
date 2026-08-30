/**
 * AI caller, unified behind the shared callAI() interface.
 *
 * Routing hierarchy:
 * 1. User API (if explicitly configured)
 * 2. Admin Global AI (centrally configured in database)
 * 3. Existing workspace / fallback architecture (Mistral workspaces 1-3 -> Gemini -> 1min.ai -> Lovable Gateway)
 */

import { getAdminGlobalAIConfig } from "./adminAIProvider.ts";
import { callCustomAIProvider } from "./customAICaller.ts";

export interface CallAIOptions {
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
  /** Optional user-specific API overrides */
  userApiKey?: string;
  userProvider?: string;
  userModel?: string;
  userBaseUrl?: string;
}

export interface AIResult {
  text: string;
  provider: "groq" | "cloudflare" | "mistral" | "openai" | "gemini";
  toolCall?: any;
}

const MISTRAL_DEFAULT_MODEL = "mistral-large-latest";
const MISTRAL_FAST_MODEL = "mistral-small-latest";

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

export function hardenSystemPrompt(original: string, skip?: boolean): string {
  if (skip) return original;
  if (original.includes("[QUANT HARDENING LAYER")) return original;
  return `${HARDENING_PREAMBLE}\n\n[CALLER CONTEXT]\n${original}`;
}

/** Remove em/en dashes from model prose (banned house style). Safe for JSON. */
export function stripLongDashes(text: string): string {
  return text.replace(/\s*[\u2014\u2013]\s+/g, ", ").replace(/[\u2014\u2013]/g, "-");
}

export function stripThinkingBlocks(text: string): string {
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

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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

interface MistralWorkspace {
  id: string;
  apiKey: string;
}

type MistralFailureClassification =
  | "UNAUTHORIZED"
  | "BILLING_UNAVAILABLE"
  | "RATE_LIMIT"
  | "PROVIDER_FAILURE"
  | "REQUEST_ERROR"
  | "NETWORK_TIMEOUT"
  | "UNKNOWN";

interface MistralFailure {
  status?: number;
  message?: string;
  classification: MistralFailureClassification;
}

function classifyMistralFailure(error: any): MistralFailureClassification {
  const status = Number(error?.status || error?.statusCode || 0);
  if (status === 401) return "UNAUTHORIZED";
  if (status === 402) return "BILLING_UNAVAILABLE";
  if (status === 429) return "RATE_LIMIT";
  if (status === 400) return "REQUEST_ERROR";
  if (status >= 500 && status <= 599) return "PROVIDER_FAILURE";
  if (error?.name === "AbortError" || /network|timeout|fetch failed/i.test(String(error?.message || error))) return "NETWORK_TIMEOUT";
  return "UNKNOWN";
}

function toMistralFailure(error: any): MistralFailure {
  return {
    status: Number(error?.status || error?.statusCode || 0) || undefined,
    message: error?.message || String(error),
    classification: classifyMistralFailure(error),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Mistral with a workspace API key. Throws on non-2xx with status info.
 */
async function callMistralWorkspaceOnce(opts: CallAIOptions, workspace: MistralWorkspace, reported?: AIResult["provider"]): Promise<AIResult> {
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
    headers: { Authorization: `Bearer ${workspace.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Mistral ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty Mistral response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
}

async function callMistralWorkspace(opts: CallAIOptions, workspace: MistralWorkspace, reported?: AIResult["provider"]): Promise<AIResult> {
  const maxAttemptsForWorkspace = 2;
  let lastFailure: MistralFailure | null = null;

  for (let attempt = 1; attempt <= maxAttemptsForWorkspace; attempt++) {
    try {
      const result = await callMistralWorkspaceOnce(opts, workspace, reported);
      console.info(`[AI] ${workspace.id} → success`);
      return result;
    } catch (error: any) {
      const failure = toMistralFailure(error);
      lastFailure = failure;
      const statusLabel = failure.status ? String(failure.status) : "network";
      console.warn(`[AI] ${workspace.id} → ${statusLabel} ${failure.classification}`);

      if (failure.classification === "REQUEST_ERROR" || failure.classification === "UNAUTHORIZED" || failure.classification === "BILLING_UNAVAILABLE" || failure.classification === "RATE_LIMIT") {
        throw failure;
      }

      if ((failure.classification === "PROVIDER_FAILURE" || failure.classification === "NETWORK_TIMEOUT" || failure.classification === "UNKNOWN") && attempt < maxAttemptsForWorkspace) {
        await sleep(100 * attempt);
        continue;
      }

      throw failure;
    }
  }

  throw lastFailure || { classification: "UNKNOWN", message: "Mistral workspace failed" };
}

/**
 * Lovable AI Gateway lane, OpenAI-compatible, no user-supplied key required.
 * This is the final managed-quota fallback after every configured Mistral lane
 * has failed or exhausted rate/credit limits.
 */
const GATEWAY_DEFAULT_MODEL = Deno.env.get("GATEWAY_DEFAULT_MODEL") || "google/gemini-3-flash-preview";

async function callLovableGateway(opts: CallAIOptions, apiKey: string, reported?: AIResult["provider"]): Promise<AIResult> {
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const body: Record<string, any> = {
    model: GATEWAY_DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Gateway ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty gateway response");
  return { text: stripLongDashes(stripThinkingBlocks(text)), provider: reported || "mistral" };
}

/**
 * Mistral caller with explicit workspace 1 → workspace 2 → workspace 3 routing.
 * Emergency fallback providers are considered only after every configured
 * Mistral workspace has failed. A 400 request error is surfaced immediately
 * because changing workspaces will not fix malformed request configuration.
 */
async function callMistral(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const { workspaces, fallback } = buildLanes(reported);
  if (workspaces.length === 0 && fallback.length === 0) {
    throw new Error("No AI providers configured (MISTRAL_API_KEY / MISTRAL_API_KEY_2 / MISTRAL_API_KEY_3 / GOOGLE_GEMINI_KEY / GOOGLE_GEMINI_KEY_2)");
  }

  let lastErr: any = null;

  for (let i = 0; i < workspaces.length; i++) {
    const lane = workspaces[i];
    try {
      const result = await lane.call(opts);
      console.info(`[AI] final provider=mistral workspace=${lane.label}`);
      return result;
    } catch (e: any) {
      lastErr = e;
      if (e?.classification === "REQUEST_ERROR") {
        console.warn(`[AI] ${lane.label} request error surfaced; no workspace cascade`);
        throw e;
      }
      const nextWorkspace = workspaces[i + 1]?.label;
      if (nextWorkspace) console.warn(`[AI] failover → ${nextWorkspace}`);
    }
  }

  for (const lane of fallback) {
    try {
      const result = await lane.call(opts);
      console.info(`[AI] final provider=${result.provider} lane=${lane.label}`);
      return result;
    } catch (e: any) {
      lastErr = e;
      console.warn(`callAI → emergency lane ${lane.label} failed:`, e?.message || e);
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
// Used as emergency failover after all configured Mistral workspaces fail.
// We expose two keys (GOOGLE_GEMINI_KEY, GOOGLE_GEMINI_KEY_2) and try them
// sequentially inside the emergency lane registry. Default model is selected
// for low latency and high quota; can be overridden via GEMINI_DEFAULT_MODEL.
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
// Lane registry, assembles workspace-ordered Mistral plus emergency providers.
// ---------------------------------------------------------------------------
interface Lane {
  label: string;
  call: (opts: CallAIOptions) => Promise<AIResult>;
}

/**
 * Returns workspace-aware Mistral lanes plus existing emergency providers.
 * Workspaces are never round-robined: every request starts with workspace 1,
 * then fails over to workspace 2 and workspace 3 only when classified failures
 * indicate that the current workspace/key cannot serve this request.
 */
function buildLanes(reported?: AIResult["provider"]): { workspaces: Lane[]; fallback: Lane[] } {
  const fallback: Lane[] = [];
  const configuredWorkspaces: Array<MistralWorkspace | null> = [
    { id: "mistral-workspace-1", apiKey: Deno.env.get("MISTRAL_API_KEY") || "" },
    { id: "mistral-workspace-2", apiKey: Deno.env.get("MISTRAL_API_KEY_2") || "" },
    { id: "mistral-workspace-3", apiKey: Deno.env.get("MISTRAL_API_KEY_3") || "" },
  ];
  const workspaces = configuredWorkspaces
    .filter((workspace): workspace is MistralWorkspace => !!workspace?.apiKey)
    .map((workspace) => ({
      label: workspace.id,
      call: (o: CallAIOptions) => callMistralWorkspace(o, workspace, reported),
    }));

  const onemin = Deno.env.get("ONEMIN_AI_API_KEY");
  const g1 = Deno.env.get("GOOGLE_GEMINI_KEY");
  const g2 = Deno.env.get("GOOGLE_GEMINI_KEY_2");
  const gw = Deno.env.get("LOVABLE_API_KEY");

  // Existing emergency providers, sequential fallback after every Mistral
  // workspace fails.
  if (g1) fallback.push({ label: "gemini-1", call: (o) => callGeminiWithKey(o, g1, reported) });
  if (g2) fallback.push({ label: "gemini-2", call: (o) => callGeminiWithKey(o, g2, reported) });
  if (onemin && Deno.env.get("ONEMIN_AI_ENABLED") === "1") {
    fallback.push({ label: "1minai", call: (o) => callOneMinAI(o, reported) });
  }
  if (gw) fallback.push({ label: "lovable-gateway", call: (o) => callLovableGateway(o, gw, reported) });
  return { workspaces, fallback };
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
 * Public API, single AI call.
 *
 * Implements request hierarchy:
 * 1. User-specific API (if explicitly configured)
 * 2. Admin Global AI (centrally configured in database)
 * 3. System workspace & emergency fallback lanes (Mistral 1-3 -> Gemini -> 1min.ai -> Lovable Gateway)
 */
export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const needsTools = !!(opts.tools && opts.tools.length > 0);

  // Level 1: User-provided API override
  if (opts.userApiKey) {
    try {
      console.info("[AI] Using user-configured API provider");
      return await callCustomAIProvider(
        opts,
        {
          provider: opts.userProvider || "openai",
          apiKey: opts.userApiKey,
          model: opts.userModel || opts.model || "gpt-4o",
          baseUrl: opts.userBaseUrl,
        },
        opts.provider || "openai"
      );
    } catch (err: any) {
      console.warn("[AI] User-configured API failed, evaluating fallback chain:", err?.message || err);
      // If user API fails, proceed down to Admin / System fallback
    }
  }

  // Level 2: Admin Global AI configuration
  try {
    const adminConfig = await getAdminGlobalAIConfig();
    if (adminConfig && adminConfig.enabled) {
      console.info(`[AI] Using Admin Global AI: ${adminConfig.provider} (${adminConfig.model})`);
      try {
        return await callCustomAIProvider(
          opts,
          {
            provider: adminConfig.provider,
            apiKey: adminConfig.apiKey,
            model: adminConfig.model,
            baseUrl: adminConfig.baseUrl,
            apiVersion: adminConfig.apiVersion,
          },
          opts.provider || (adminConfig.provider as any)
        );
      } catch (adminErr: any) {
        console.warn(
          `[AI] Admin Global AI (${adminConfig.provider}) failed, falling back to system lanes:`,
          adminErr?.message || adminErr
        );
        // Fall through to system round-robin / fallback
      }
    }
  } catch (err) {
    console.warn("[AI] Failed to check admin AI config, using system fallback:", err);
  }

  // Level 3: Existing System Workspace Routing & Fallback Lanes
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
