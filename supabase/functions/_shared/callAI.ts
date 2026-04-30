/**
 * AI caller — UNIFIED on Google Gemini API.
 * All provider names (groq/cloudflare/mistral/openai) are kept as aliases for
 * backward compatibility but route to Gemini models for reliability.
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
  /**
   * When true, enable Gemini's built-in Google Search grounding so the model
   * fetches real-time web context (news, prices, filings) before responding.
   * Note: Gemini API does NOT allow `googleSearch` and `functionDeclarations`
   * in the same request. If `tools` are also passed, web search is skipped
   * and the request falls back to function-calling. For tool-using engines,
   * use `fetchLiveWebContext()` separately and inject snippets into the prompt.
   */
  useWebSearch?: boolean;
}

interface AIResult {
  text: string;
  provider: "groq" | "cloudflare" | "mistral" | "openai" | "gemini";
  toolCall?: any;
}

const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";
const GEMINI_HEAVY_MODEL = "gemini-2.5-pro";
const GEMINI_FAST_MODEL = "gemini-2.5-flash-lite";
const LOVABLE_GATEWAY_DEFAULT_MODEL = "openai/gpt-5-mini";

// Models on the Lovable Gateway / OpenAI side that REJECT `max_tokens`
// and require `max_completion_tokens` instead.
const COMPLETION_TOKENS_MODELS = /^(openai\/)?(gpt-5|gpt-5\.|o1|o3|o4)/i;

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
 * Convert OpenAI-style tools to Gemini function declarations.
 */
function toolsToGemini(tools: any[]): any[] {
  const normalizeSchema = (schema: any): any => {
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;

    const allowedKeys = new Set([
      "type",
      "format",
      "description",
      "nullable",
      "enum",
      "properties",
      "items",
      "required",
    ]);

    const next: Record<string, any> = {};
    for (const [key, value] of Object.entries(schema)) {
      if (!allowedKeys.has(key) && key !== "type") continue;

      if (key === "type" && Array.isArray(value)) {
        const typed = value.filter((v) => typeof v === "string");
        const nonNull = typed.find((v) => v !== "null");
        if (nonNull) next.type = nonNull;
        if (typed.includes("null")) next.nullable = true;
        continue;
      }

      if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
        next.properties = Object.fromEntries(
          Object.entries(value).map(([propName, propSchema]) => [propName, normalizeSchema(propSchema)])
        );
        continue;
      }

      if (key === "items") {
        next.items = normalizeSchema(value);
        continue;
      }

      if (Array.isArray(value)) {
        next[key] = value.map((item) => normalizeSchema(item));
        continue;
      }

      if (value && typeof value === "object") {
        next[key] = normalizeSchema(value);
        continue;
      }

      next[key] = value;
    }

    return next;
  };

  return tools
    .filter((t) => t?.type === "function" && t.function)
    .map((t) => ({
      name: t.function.name,
      description: t.function.description || "",
      parameters: normalizeSchema(t.function.parameters || { type: "object", properties: {} }),
    }));
}

async function callGemini(
  opts: CallAIOptions,
  modelOverride?: string,
  reportedProvider?: AIResult["provider"]
): Promise<AIResult> {
  const primaryKey = Deno.env.get("GOOGLE_GEMINI_KEY") || Deno.env.get("GEMINI_API_KEY");
  const fallbackKey = Deno.env.get("GOOGLE_GEMINI_KEY_2");
  if (!primaryKey && !fallbackKey) throw new Error("GOOGLE_GEMINI_KEY not set");

  const keys = [primaryKey, fallbackKey].filter((k): k is string => !!k);
  const model = modelOverride || opts.model || GEMINI_DEFAULT_MODEL;
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);

  const body: any = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [
      { role: "user", parts: [{ text: opts.userPrompt }] },
    ],
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: opts.maxTokens ?? 8192,
    },
  };

  if (opts.jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  if (opts.tools && opts.tools.length > 0) {
    const fns = toolsToGemini(opts.tools);
    if (fns.length > 0) {
      body.tools = [{ functionDeclarations: fns }];
      if (opts.toolChoice) {
        const forcedName =
          typeof opts.toolChoice === "object" && opts.toolChoice?.function?.name
            ? opts.toolChoice.function.name
            : null;
        body.toolConfig = {
          functionCallingConfig: forcedName
            ? { mode: "ANY", allowedFunctionNames: [forcedName] }
            : { mode: "AUTO" },
        };
      }
    }
  } else if (opts.useWebSearch) {
    // Real-time grounding via Google Search. Mutually exclusive with function calls.
    body.tools = [{ googleSearch: {} }];
  }

  const tokens = opts.maxTokens ?? 8192;
  const timeout = tokens > 8000 ? 55000 : tokens > 2000 ? 45000 : 25000;

  let res: Response | null = null;
  let lastErr: any = null;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${k}`;
    try {
      const r = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, timeout);
      if (r.ok) { res = r; break; }
      const errBody = await r.text();
      const isQuota = r.status === 429 || r.status === 403 || /quota|exhaust|exceed/i.test(errBody);
      console.error(`Gemini key#${i + 1} error ${r.status} (${model}):`, errBody.slice(0, 200));
      lastErr = { status: r.status, message: `Gemini ${r.status}: ${errBody.slice(0, 200)}` };
      if (isQuota && i < keys.length - 1) continue; // try next key
      throw lastErr;
    } catch (e: any) {
      lastErr = e;
      if (i < keys.length - 1 && (e?.status === 429 || e?.status === 403)) continue;
      if (i === keys.length - 1) throw e;
    }
  }
  if (!res) throw lastErr || new Error("Gemini: all keys failed");

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("Empty Gemini response");

  const parts = candidate.content?.parts || [];
  const provider = reportedProvider || "gemini";

  // Function call?
  for (const p of parts) {
    if (p.functionCall) {
      const argsObj = p.functionCall.args || {};
      return {
        text: JSON.stringify(argsObj),
        provider,
        toolCall: {
          id: `gemini_${Date.now()}`,
          type: "function",
          function: {
            name: p.functionCall.name,
            arguments: JSON.stringify(argsObj),
          },
        },
      };
    }
  }

  const raw = parts.map((p: any) => p.text || "").join("").trim();
  if (!raw) throw new Error("Empty Gemini response content");
  return { text: stripThinkingBlocks(raw), provider };
}

async function callLovableGateway(
  opts: CallAIOptions,
  modelOverride?: string,
  reportedProvider?: AIResult["provider"]
): Promise<AIResult> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not set");

  const model = modelOverride || opts.model || LOVABLE_GATEWAY_DEFAULT_MODEL;
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const timeout = (opts.maxTokens ?? 8192) > 4000 ? 55000 : 30000;

  const body: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
  };

  // Newer OpenAI reasoning models (gpt-5*, o1/o3/o4) reject `max_tokens`.
  const tokenCap = opts.maxTokens ?? 8192;
  if (COMPLETION_TOKENS_MODELS.test(model)) {
    body.max_completion_tokens = tokenCap;
    // gpt-5 family also rejects custom temperature on some endpoints.
    delete body.temperature;
  } else {
    body.max_tokens = tokenCap;
  }

  if (opts.tools && opts.tools.length > 0) {
    body.tools = opts.tools;
    body.tool_choice = opts.toolChoice || "auto";
  }

  if (opts.jsonMode && !(opts.tools && opts.tools.length > 0)) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    // Auto-retry once with `max_tokens` swapped if the gateway complains.
    if (res.status === 400 && /max_tokens/i.test(errBody) && body.max_tokens) {
      delete body.max_tokens;
      body.max_completion_tokens = tokenCap;
      const retry = await fetchWithTimeout("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, timeout);
      if (retry.ok) return parseGatewayResponse(await retry.json(), opts, reportedProvider);
      const retryBody = await retry.text();
      throw { status: retry.status, message: `Gateway retry ${retry.status}: ${retryBody.slice(0, 200)}` };
    }
    throw { status: res.status, message: `Gateway ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  return parseGatewayResponse(data, opts, reportedProvider);
}

function parseGatewayResponse(data: any, opts: CallAIOptions, reportedProvider?: AIResult["provider"]): AIResult {
  const message = data?.choices?.[0]?.message;
  const toolCall = Array.isArray(message?.tool_calls) ? message.tool_calls[0] : null;
  if (toolCall?.function?.name) {
    const args = typeof toolCall.function.arguments === "string"
      ? toolCall.function.arguments
      : JSON.stringify(toolCall.function.arguments || {});

    return {
      text: stripThinkingBlocks(args),
      provider: reportedProvider || opts.provider || "mistral",
      toolCall: {
        id: toolCall.id || `gateway_${Date.now()}`,
        type: "function",
        function: {
          name: toolCall.function.name,
          arguments: args,
        },
      },
    };
  }

  const text = Array.isArray(message?.content)
    ? message.content
        .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
    : message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Empty gateway response content");
  }

  return {
    text: stripThinkingBlocks(text),
    provider: reportedProvider || opts.provider || "mistral",
  };
}

const RETRY_DELAYS = [0, 1500];

/**
 * Direct Mistral API caller — used as a real fallback when Gemini is rate-limited.
 * Free-tier friendly. No tool-calling support here (only text + JSON mode).
 */
async function callMistralDirect(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key) throw new Error("MISTRAL_API_KEY not set");

  const model = "mistral-large-latest";
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
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
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
 * Direct Cloudflare Workers AI caller — second free-tier fallback.
 */
async function callCloudflareDirect(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!accountId || !apiToken) throw new Error("CLOUDFLARE creds not set");

  const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
  const body: Record<string, any> = {
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
  };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Cloudflare ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  // Cloudflare returns different shapes per model:
  //   { result: { response: "..." } }                          (older llama)
  //   { result: { response: { ... } } }                        (some 70B variants)
  //   { result: { choices: [{ message: { content: "..." } }] }} (OpenAI-compat)
  let text: string | undefined;
  const r = data?.result;
  if (typeof r?.response === "string") text = r.response;
  else if (r?.response && typeof r.response === "object") {
    text = r.response.content || r.response.text || JSON.stringify(r.response);
  } else if (Array.isArray(r?.choices) && r.choices[0]?.message?.content) {
    text = r.choices[0].message.content;
  } else if (typeof data?.response === "string") {
    text = data.response;
  }
  if (typeof text !== "string" || !text.trim()) {
    throw new Error(`Empty Cloudflare response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return { text: stripThinkingBlocks(text), provider: reported || "cloudflare" };
}

/**
 * Direct Groq caller — extremely fast inference, third free-tier provider.
 */
async function callGroqDirect(opts: CallAIOptions, reported?: AIResult["provider"]): Promise<AIResult> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY not set");

  // Free-tier model that's enabled by default. `llama-3.3-70b-versatile`
  // requires manual project-level enablement.
  const model = opts.model && opts.model.startsWith("llama-") ? opts.model : "llama-3.1-8b-instant";
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const body: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8000),
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 60000 : 40000;
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `Groq ${res.status}: ${errBody.slice(0, 200)}` };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error("Empty Groq response");
  return { text: stripThinkingBlocks(text), provider: reported || "groq" };
}

/**
 * Race all non-gateway providers in parallel, return the first successful result.
 * Gateway (Lovable AI Gateway) is only invoked if every direct provider fails.
 * For tool-calling requests, only Gemini supports function declarations here,
 * so the parallel fan-out is skipped and Gemini is tried directly.
 */
async function raceProviders(opts: CallAIOptions): Promise<AIResult> {
  const reported: AIResult["provider"] =
    opts.provider && opts.provider !== "gemini" ? opts.provider : "gemini";
  const needsTools = !!(opts.tools && opts.tools.length > 0);

  if (needsTools) {
    return await raceWithToolFallback(opts, reported);
  }

  // Parallel race across direct providers (Mistral + Cloudflare + Groq + Gemini flash).
  const tokens = opts.maxTokens ?? 8192;
  const geminiModel = opts.model || (tokens >= 8000 ? GEMINI_HEAVY_MODEL : GEMINI_DEFAULT_MODEL);

  const candidates: Array<{ name: string; run: () => Promise<AIResult> }> = [
    { name: "mistral",    run: () => callMistralDirect(opts, opts.provider || "mistral") },
    { name: "cloudflare", run: () => callCloudflareDirect(opts, opts.provider || "cloudflare") },
    { name: "groq",       run: () => callGroqDirect(opts, opts.provider || "groq") },
    { name: "gemini",     run: () => callGemini(opts, geminiModel, reported) },
  ];

  const errors: string[] = [];
  // Promise.any returns the first fulfilled; rejects only if ALL reject.
  try {
    return await Promise.any(
      candidates.map(c =>
        c.run().catch((e: any) => {
          const msg = `${c.name}: ${e?.message || e}`;
          errors.push(msg);
          console.warn("raceProviders →", msg);
          throw e;
        })
      )
    );
  } catch {
    console.warn("raceProviders → all direct providers failed:", errors.join(" | "));
    // Last-resort: Lovable Gateway.
    return await callLovableGateway(opts, undefined, opts.provider || reported);
  }
}

/**
 * Tool-calling race: try Gemini (only direct provider that supports function
 * declarations). If it fails, transform the request into a JSON-mode prompt
 * and race Mistral/Cloudflare/Groq. Their JSON text response is wrapped back
 * into a synthetic toolCall so callers don't have to branch.
 */
async function raceWithToolFallback(opts: CallAIOptions, reported: AIResult["provider"]): Promise<AIResult> {
  const tokens = opts.maxTokens ?? 8192;
  const geminiModel = opts.model || (tokens >= 8000 ? GEMINI_HEAVY_MODEL : GEMINI_DEFAULT_MODEL);

  // Race Gemini variants (only one that natively supports function-calling).
  const geminiTasks = [
    callGemini(opts, geminiModel, reported).catch((e) => {
      console.warn("raceWithToolFallback → gemini-primary failed:", e?.message || e); return null;
    }),
    callGemini(opts, GEMINI_FAST_MODEL, reported).catch((e) => {
      console.warn("raceWithToolFallback → gemini-lite failed:", e?.message || e); return null;
    }),
  ];
  const timeoutP = new Promise<null>(r => setTimeout(() => r(null), 25000));
  const settled = await Promise.allSettled(geminiTasks.map(p => Promise.race([p, timeoutP])));
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) return s.value as AIResult;
  }

  // Gemini exhausted — synthesise a JSON-mode prompt for Mistral/Cloudflare/Groq.
  const forcedToolName =
    typeof opts.toolChoice === "object" && opts.toolChoice?.function?.name
      ? opts.toolChoice.function.name
      : (opts.tools![0]?.function?.name || "respond");
  const toolDef = opts.tools!.find((t: any) => t?.function?.name === forcedToolName) || opts.tools![0];
  const schemaHint = toolDef?.function?.parameters
    ? `\n\nReturn ONLY a single JSON object matching this schema (no prose, no markdown):\n${JSON.stringify(toolDef.function.parameters)}`
    : "\n\nReturn ONLY a single JSON object. No prose.";

  const fallbackOpts: CallAIOptions = {
    ...opts,
    tools: undefined,
    toolChoice: undefined,
    jsonMode: true,
    userPrompt: `${opts.userPrompt}${schemaHint}`,
  };

  const wrapAsToolCall = (r: AIResult): AIResult => {
    if (r.toolCall) return r;
    return {
      ...r,
      toolCall: {
        id: `synth_${Date.now()}`,
        type: "function",
        function: { name: forcedToolName, arguments: r.text },
      },
    };
  };

  const directTasks = [
    callMistralDirect(fallbackOpts, "mistral").then(wrapAsToolCall).catch((e) => {
      console.warn("raceWithToolFallback → mistral failed:", e?.message || e); return null;
    }),
    callCloudflareDirect(fallbackOpts, "cloudflare").then(wrapAsToolCall).catch((e) => {
      console.warn("raceWithToolFallback → cloudflare failed:", e?.message || e); return null;
    }),
    callGroqDirect(fallbackOpts, "groq").then(wrapAsToolCall).catch((e) => {
      console.warn("raceWithToolFallback → groq failed:", e?.message || e); return null;
    }),
  ];
  const directSettled = await Promise.allSettled(
    directTasks.map(p => Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), 75000))]))
  );
  for (const s of directSettled) {
    if (s.status === "fulfilled" && s.value) return s.value as AIResult;
  }

  // Last-resort: Lovable Gateway with original tools.
  console.warn("raceWithToolFallback → all direct providers failed, trying Lovable Gateway");
  return await callLovableGateway(opts, undefined, opts.provider || reported);
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  return await raceProviders(opts);
}

/**
 * Fire multiple Gemini variants in parallel for diversity (replaces multi-vendor parallel).
 * Returns all successful results.
 */
export async function callAIParallel(opts: CallAIOptions): Promise<AIResult[]> {
  console.log("callAIParallel → firing Mistral + Cloudflare + Groq + Gemini in parallel (Gateway last-resort)");

  const needsTools = !!(opts.tools && opts.tools.length > 0);
  const tokens = opts.maxTokens ?? 8192;
  const geminiModel = opts.model || (tokens >= 8000 ? GEMINI_HEAVY_MODEL : GEMINI_DEFAULT_MODEL);

  if (needsTools) {
    // Tool-calling: race Gemini, then JSON-mode fallback to Mistral/Cloudflare/Groq.
    return [await raceWithToolFallback(opts, "gemini")];
  }

  const tasks = [
    callMistralDirect(opts, "mistral").catch((e) => {
      console.warn("callAIParallel → mistral failed:", e?.message || e); return null;
    }),
    callCloudflareDirect(opts, "cloudflare").catch((e) => {
      console.warn("callAIParallel → cloudflare failed:", e?.message || e); return null;
    }),
    callGroqDirect(opts, "groq").catch((e) => {
      console.warn("callAIParallel → groq failed:", e?.message || e); return null;
    }),
    callGemini(opts, geminiModel, "gemini").catch((e) => {
      console.warn("callAIParallel → gemini failed:", e?.message || e); return null;
    }),
  ];

  const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 55000));
  const settled = await Promise.allSettled(tasks.map(p => Promise.race([p, timeoutPromise])));

  const successes: AIResult[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && r.value) successes.push(r.value);
  }

  if (successes.length > 0) {
    console.log(`callAIParallel → ${successes.length}/4 direct providers succeeded`);
    return successes;
  }

  // Last-resort: Lovable Gateway.
  console.warn("callAIParallel → all 4 direct providers failed, trying Lovable Gateway");
  try { return [await callLovableGateway(opts, undefined, opts.provider || "mistral")]; }
  catch { throw new Error("callAIParallel: all providers failed (Mistral + Cloudflare + Groq + Gemini + Gateway)"); }
}

/**
 * Fetch real-time web context using Gemini's Google Search grounding.
 * Use this BEFORE a tool-using AI call to inject fresh news / prices / events
 * into the prompt (since Gemini disallows function tools + search in one call).
 *
 * Returns a short bulleted snippet block ready to drop into a userPrompt,
 * or an empty string on any failure (silent — never blocks the host engine).
 */
export async function fetchLiveWebContext(query: string, maxBullets = 6): Promise<string> {
  if (!query || query.trim().length < 3) return "";
  try {
    const res = await callGemini({
      systemPrompt:
        "You are a real-time market news fetcher. Use Google Search to find the LATEST (last 24-72 hours) factual headlines and data points relevant to the query. Output ONLY a tight bulleted list, max " +
        maxBullets +
        " bullets. Each bullet: one factual fact + source domain in parentheses. No analysis, no opinions, no preamble.",
      userPrompt: `Search the web RIGHT NOW for the latest information on:\n\n${query}\n\nReturn only freshly-sourced facts from the past 72 hours where possible. Include dates if available. No commentary.`,
      maxTokens: 800,
      temperature: 0.1,
      useWebSearch: true,
      skipHardening: true,
    }, GEMINI_FAST_MODEL, "gemini");
    const txt = (res.text || "").trim();
    if (!txt) return "";
    return `\n## LIVE WEB CONTEXT (Google Search, fetched ${new Date().toISOString()})\n${txt}\n`;
  } catch (e) {
    console.warn("fetchLiveWebContext failed (silent):", (e as Error).message);
    return "";
  }
}
