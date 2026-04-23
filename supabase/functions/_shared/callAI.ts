/**
 * AI caller — Groq (primary) + Cloudflare Workers AI + Mistral + OpenAI fallback chain.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  provider?: "groq" | "cloudflare" | "mistral" | "openai";
  jsonMode?: boolean;
}

interface AIResult {
  text: string;
  provider: "groq" | "cloudflare" | "mistral" | "openai";
  toolCall?: any;
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

  try {
    JSON.parse(cleaned);
  } catch {
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

/** Fetch with AbortController timeout */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGroq(opts: CallAIOptions): Promise<AIResult> {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY not set");

  // Fast, capable default. Override via opts.model if needed.
  const model = opts.model && opts.model.startsWith("groq:")
    ? opts.model.slice(5)
    : "llama-3.3-70b-versatile";

  const body: any = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const timeout = opts.maxTokens && opts.maxTokens > 8000 ? 55000 : opts.maxTokens && opts.maxTokens > 2000 ? 45000 : 20000;
  const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Groq error ${res.status}:`, errBody.slice(0, 300));
    throw { status: res.status, message: `Groq ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("Empty Groq response");

  if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    return {
      text: typeof toolCall.function?.arguments === "string"
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function?.arguments),
      provider: "groq",
      toolCall,
    };
  }

  const raw = (choice.message?.content || "").trim();
  if (!raw) throw new Error("Empty Groq response content");
  const text = stripThinkingBlocks(raw);
  return { text, provider: "groq" };
}

async function callCloudflare(opts: CallAIOptions): Promise<AIResult> {
  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const apiToken = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!accountId) throw new Error("CLOUDFLARE_ACCOUNT_ID not set");
  if (!apiToken) throw new Error("CLOUDFLARE_API_TOKEN not set");

  const model = opts.model || "@cf/meta/llama-4-scout-17b-16e-instruct";

  const body: any = {
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  const timeout = opts.maxTokens && opts.maxTokens > 8000 ? 55000 : opts.maxTokens && opts.maxTokens > 2000 ? 50000 : 30000;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Cloudflare AI error ${res.status}:`, errBody.slice(0, 300));
    throw { status: res.status, message: `Cloudflare ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const result = data.result;
  if (!result) throw new Error("Empty Cloudflare AI response");

  if (result.tool_calls && result.tool_calls.length > 0) {
    const toolCall = result.tool_calls[0];
    return {
      text: typeof toolCall.function?.arguments === "string"
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function?.arguments),
      provider: "cloudflare",
      toolCall,
    };
  }

  let raw: string;
  if (typeof result.response === "string") {
    raw = result.response.trim();
  } else if (typeof result.content === "string") {
    raw = result.content.trim();
  } else if (result.response != null) {
    raw = JSON.stringify(result.response);
  } else if (result.content != null) {
    raw = JSON.stringify(result.content);
  } else {
    throw new Error("Empty Cloudflare AI response content");
  }
  if (!raw) throw new Error("Empty Cloudflare AI response content");
  const text = stripThinkingBlocks(raw);
  return { text, provider: "cloudflare" };
}

async function callMistral(opts: CallAIOptions): Promise<AIResult> {
  const apiKey = Deno.env.get("MISTRAL_API_KEY");
  if (!apiKey) throw new Error("MISTRAL_API_KEY not set");

  const model = "mistral-medium-latest";

  const body: any = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const timeout = opts.maxTokens && opts.maxTokens > 8000 ? 55000 : opts.maxTokens && opts.maxTokens > 2000 ? 50000 : 25000;
  const res = await fetchWithTimeout("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Mistral error ${res.status}:`, errBody.slice(0, 300));
    throw { status: res.status, message: `Mistral ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("Empty Mistral response");

  if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    return {
      text: typeof toolCall.function?.arguments === "string"
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function?.arguments),
      provider: "mistral",
      toolCall,
    };
  }

  const raw = (choice.message?.content || "").trim();
  if (!raw) throw new Error("Empty Mistral response content");
  const text = stripThinkingBlocks(raw);
  return { text, provider: "mistral" };
}

async function callOpenAI(opts: CallAIOptions): Promise<AIResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");

  const model = "gpt-4o-mini";

  const body: any = {
    model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 8192,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  if (opts.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const timeout = opts.maxTokens && opts.maxTokens > 8000 ? 55000 : opts.maxTokens && opts.maxTokens > 2000 ? 50000 : 25000;
  const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`OpenAI error ${res.status}:`, errBody.slice(0, 300));
    throw { status: res.status, message: `OpenAI ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error("Empty OpenAI response");

  if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
    const toolCall = choice.message.tool_calls[0];
    return {
      text: typeof toolCall.function?.arguments === "string"
        ? toolCall.function.arguments
        : JSON.stringify(toolCall.function?.arguments),
      provider: "openai",
      toolCall,
    };
  }

  const raw = (choice.message?.content || "").trim();
  if (!raw) throw new Error("Empty OpenAI response content");
  const text = stripThinkingBlocks(raw);
  return { text, provider: "openai" };
}

// Optimized: 2 attempts max, instant 429 fallback
const RETRY_DELAYS = [0, 1500];

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const provider = opts.provider || "cloudflare";

  if (provider === "cloudflare") {
    let lastError: any;
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt] > 0) await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      try {
        return await callCloudflare(opts);
      } catch (err: any) {
        lastError = err;
        if (err.status === 429 || err.status === 401 || err.status === 403 || err.name === "AbortError") break;
        if (err.status >= 500 && err.status < 600) continue;
        break;
      }
    }
    try { return await callMistral(opts); } catch {}
    try { return await callOpenAI(opts); } catch {}
    throw lastError;
  }

  if (provider === "openai") return await callOpenAI(opts);
  return await callMistral(opts);
}

/**
 * Fire Cloudflare + Mistral in parallel (lighter), return all successful results.
 */
export async function callAIParallel(opts: CallAIOptions): Promise<AIResult[]> {
  console.log("callAIParallel → firing Cloudflare + Mistral + OpenAI simultaneously");

  const promises = [
    callCloudflare(opts).then(r => ({ ...r, provider: "cloudflare" as const })).catch((err) => {
      console.warn("callAIParallel → Cloudflare failed:", err.message || err);
      return null;
    }),
    callMistral({ ...opts, temperature: Math.min(0.5, (opts.temperature ?? 0.35) + 0.1) }).then(r => ({ ...r, provider: "mistral" as const })).catch((err) => {
      console.warn("callAIParallel → Mistral failed:", err.message || err);
      return null;
    }),
    callOpenAI({ ...opts, temperature: Math.min(0.5, (opts.temperature ?? 0.35) + 0.05) }).then(r => ({ ...r, provider: "openai" as const })).catch((err) => {
      console.warn("callAIParallel → OpenAI failed:", err.message || err);
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
    // Sequential final attempts
    for (const fn of [callCloudflare, callMistral, callOpenAI]) {
      try {
        const result = await fn(opts);
        return [result];
      } catch { /* try next */ }
    }
    throw new Error("callAIParallel: all providers failed");
  }

  console.log(`callAIParallel → ${successes.length}/3 providers succeeded`);
  return successes;
}
