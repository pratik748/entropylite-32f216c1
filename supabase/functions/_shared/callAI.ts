/**
 * AI caller — supports Mistral, Cloudflare Workers AI, and Google Gemini.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  provider?: "cloudflare" | "mistral" | "gemini";
  jsonMode?: boolean;
}

interface AIResult {
  text: string;
  provider: "cloudflare" | "mistral" | "gemini";
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

// ── Gemini Provider ────────────────────────────────────────────────
async function callGemini(opts: CallAIOptions): Promise<AIResult> {
  const apiKey = Deno.env.get("GOOGLE_GEMINI_KEY");
  if (!apiKey) throw new Error("GOOGLE_GEMINI_KEY not set");

  const model = opts.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    { role: "user", parts: [{ text: `${opts.systemPrompt}\n\n${opts.userPrompt}` }] },
  ];

  const body: any = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.6,
      maxOutputTokens: opts.maxTokens ?? 8192,
    },
  };

  if (opts.jsonMode) {
    body.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Gemini error ${res.status}:`, errBody.slice(0, 300));
    throw { status: res.status, message: `Gemini ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const candidate = data.candidates?.[0];
  if (!candidate) throw new Error("Empty Gemini response");

  const raw = candidate.content?.parts?.map((p: any) => p.text || "").join("") || "";
  if (!raw.trim()) throw new Error("Empty Gemini response content");
  const text = stripThinkingBlocks(raw);
  return { text, provider: "gemini" };
}

// ── Cloudflare Provider ────────────────────────────────────────────
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

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

  const raw = (result.response || result.content || "").trim();
  if (!raw) throw new Error("Empty Cloudflare AI response content");
  const text = stripThinkingBlocks(raw);
  return { text, provider: "cloudflare" };
}

// ── Mistral Provider ───────────────────────────────────────────────
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

  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

// ── Main entry with fallback chain ─────────────────────────────────
const RETRY_DELAYS = [0, 1000, 3000];

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const provider = opts.provider || "gemini";

  // Gemini (new default — best JSON reliability)
  if (provider === "gemini") {
    try {
      console.log("callAI → Gemini");
      return await callGemini(opts);
    } catch (err: any) {
      console.error("callAI → Gemini failed:", err.message || err);
      // Fallback to Mistral
      console.log("callAI → Gemini failed, falling back to Mistral");
      try {
        return await callMistral(opts);
      } catch (mistralErr: any) {
        console.error("callAI → Mistral fallback also failed:", mistralErr.message || mistralErr);
        throw err;
      }
    }
  }

  if (provider === "cloudflare") {
    let lastError: any;
    for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
      if (RETRY_DELAYS[attempt] > 0) {
        console.log(`callAI → retry #${attempt} after ${RETRY_DELAYS[attempt]}ms`);
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      }
      try {
        console.log(`callAI → Cloudflare attempt ${attempt + 1}`);
        const result = await callCloudflare(opts);
        console.log(`callAI → Cloudflare success on attempt ${attempt + 1}`);
        return result;
      } catch (err: any) {
        lastError = err;
        console.error(`callAI → Cloudflare attempt ${attempt + 1} failed:`, err.message || err);
        if (err.status === 401 || err.status === 403) break;
        if (err.status === 429 || (err.status >= 500 && err.status < 600)) continue;
        break;
      }
    }
    console.log("callAI → Cloudflare exhausted, falling back to Gemini");
    try {
      return await callGemini(opts);
    } catch {
      try { return await callMistral(opts); } catch { throw lastError; }
    }
  }

  // Mistral explicit
  console.log("callAI → Mistral (forced)");
  return await callMistral(opts);
}
