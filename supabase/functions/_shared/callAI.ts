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

  const model = modelOverride || opts.model || "mistral-medium-2508";
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const timeout = (opts.maxTokens ?? 8192) > 4000 ? 55000 : 30000;

  const body: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.jsonMode) {
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
    throw { status: res.status, message: `Gateway ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Empty gateway response content");
  }

  return {
    text: stripThinkingBlocks(text),
    provider: reportedProvider || opts.provider || "mistral",
  };
}

const RETRY_DELAYS = [0, 1500];

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  // Choose model: heavy reasoning for big requests, default flash otherwise.
  const tokens = opts.maxTokens ?? 8192;
  const preferredModel =
    opts.model ||
    (tokens >= 8000 ? GEMINI_HEAVY_MODEL : GEMINI_DEFAULT_MODEL);

  const reported: AIResult["provider"] =
    opts.provider && opts.provider !== "gemini" ? opts.provider : "gemini";

  let lastError: any;
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    try {
      return await callGemini(opts, preferredModel, reported);
    } catch (err: any) {
      lastError = err;
      if (err.status === 401 || err.status === 403 || err.name === "AbortError") break;
      if (err.status === 429) {
        // backoff then try a lighter model
        await new Promise(r => setTimeout(r, 2000));
        try { return await callGemini(opts, GEMINI_FAST_MODEL, reported); }
        catch (e) { lastError = e; }
        break;
      }
      if (err.status >= 500 && err.status < 600) continue;
      break;
    }
  }

  // Final fallback: try the other tier model.
  try {
    const fallbackModel =
      preferredModel === GEMINI_HEAVY_MODEL ? GEMINI_DEFAULT_MODEL : GEMINI_HEAVY_MODEL;
    return await callGemini(opts, fallbackModel, reported);
  } catch (e) {
    lastError = e;
  }
  try { return await callGemini(opts, GEMINI_FAST_MODEL, reported); }
  catch (e) { lastError = e; }

  try {
    return await callLovableGateway(opts, undefined, opts.provider || reported);
  } catch (e) {
    lastError = e;
  }

  throw lastError;
}

/**
 * Fire multiple Gemini variants in parallel for diversity (replaces multi-vendor parallel).
 * Returns all successful results.
 */
export async function callAIParallel(opts: CallAIOptions): Promise<AIResult[]> {
  console.log("callAIParallel → firing 3 Gemini variants in parallel (flash + pro + flash-lite)");

  const baseTemp = opts.temperature ?? 0.35;

  const promises = [
    callGemini({ ...opts, temperature: baseTemp }, GEMINI_DEFAULT_MODEL, "gemini")
      .then(r => ({ ...r, provider: "gemini" as const }))
      .catch((err) => {
        console.warn("callAIParallel → gemini-2.5-flash failed:", err.message || err);
        return null;
      }),
    callGemini({ ...opts, temperature: Math.min(0.6, baseTemp + 0.1) }, GEMINI_HEAVY_MODEL, "gemini")
      .then(r => ({ ...r, provider: "gemini" as const }))
      .catch((err) => {
        console.warn("callAIParallel → gemini-2.5-pro failed:", err.message || err);
        return null;
      }),
    callGemini({ ...opts, temperature: Math.max(0.1, baseTemp - 0.05) }, GEMINI_FAST_MODEL, "gemini")
      .then(r => ({ ...r, provider: "gemini" as const }))
      .catch((err) => {
        console.warn("callAIParallel → gemini-2.5-flash-lite failed:", err.message || err);
        return null;
      }),
  ];

  const timeoutPromise = new Promise<null>(r => setTimeout(() => r(null), 55000));
  const results = await Promise.allSettled(
    promises.map(p => Promise.race([p, timeoutPromise]))
  );

  const successes: AIResult[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) successes.push(r.value);
  }

  if (successes.length === 0) {
    for (const m of [GEMINI_DEFAULT_MODEL, GEMINI_FAST_MODEL, GEMINI_HEAVY_MODEL]) {
      try { return [await callGemini(opts, m, "gemini")]; }
      catch { /* try next */ }
    }
    try {
      return [await callLovableGateway(opts, undefined, opts.provider || "mistral")];
    } catch { /* fall through */ }
    throw new Error("callAIParallel: all Gemini variants failed");
  }

  console.log(`callAIParallel → ${successes.length}/3 Gemini variants succeeded`);
  return successes;
}
