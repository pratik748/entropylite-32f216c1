/**
 * AI caller — 80% NVIDIA Nemotron, 20% OpenRouter (Gemini 2.5 Flash Lite).
 * Weighted distribution with automatic failover.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  preferredProvider?: "nvidia" | "openrouter";
}

interface AIResult {
  text: string;
  provider: "nvidia" | "openrouter";
  toolCall?: any;
}

type ProviderName = "nvidia" | "openrouter";

// ── Provider call implementations ──

async function callNvidia(opts: CallAIOptions): Promise<AIResult> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) throw new Error("NVIDIA_API_KEY not set");

  const body: any = {
    model: "nvidia/llama-3.3-nemotron-super-49b-v1",
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4000,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`NVIDIA error ${res.status}:`, errBody.slice(0, 300));
    if (res.status === 429) {
      throw { status: 429, message: "NVIDIA rate limited", provider: "nvidia" };
    }
    if (res.status === 402 || res.status === 401) {
      throw { status: res.status, message: "NVIDIA auth/credits issue", provider: "nvidia" };
    }
    throw new Error(`NVIDIA ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    return { text: toolCall.function.arguments, provider: "nvidia", toolCall };
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty NVIDIA response");
  const text = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "nvidia" };
}

async function callOpenRouter(opts: CallAIOptions): Promise<AIResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const body: any = {
    model: opts.model || "google/gemini-2.5-flash-lite",
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.maxTokens ?? 4000,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://entropylite.lovable.app",
      "X-Title": "Entropy",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`OpenRouter error ${res.status}:`, errBody.slice(0, 300));
    if (res.status === 429) {
      throw { status: 429, message: "Rate limited, please try again shortly", provider: "openrouter" };
    }
    if (res.status === 402) {
      throw { status: 402, message: "Credits exhausted", provider: "openrouter" };
    }
    throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    return { text: toolCall.function.arguments, provider: "openrouter", toolCall };
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty OpenRouter response");
  const text = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "openrouter" };
}

// ── Weighted provider selection with failover ──

function selectProvider(): ProviderName {
  // 80% NVIDIA, 20% OpenRouter
  return Math.random() < 0.8 ? "nvidia" : "openrouter";
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const primary: ProviderName = opts.preferredProvider || selectProvider();
  const fallback: ProviderName = primary === "nvidia" ? "openrouter" : "nvidia";

  const callers: Record<ProviderName, (o: CallAIOptions) => Promise<AIResult>> = {
    nvidia: callNvidia,
    openrouter: callOpenRouter,
  };

  // Check key availability — skip provider if key missing
  const hasNvidia = !!Deno.env.get("NVIDIA_API_KEY");
  const hasOpenRouter = !!Deno.env.get("OPENROUTER_API_KEY");

  const order: ProviderName[] = [];
  if (primary === "nvidia" && hasNvidia) order.push("nvidia");
  if (primary === "openrouter" && hasOpenRouter) order.push("openrouter");
  if (fallback === "nvidia" && hasNvidia && !order.includes("nvidia")) order.push("nvidia");
  if (fallback === "openrouter" && hasOpenRouter && !order.includes("openrouter")) order.push("openrouter");

  if (order.length === 0) {
    throw new Error("No AI provider API keys configured (NVIDIA_API_KEY or OPENROUTER_API_KEY)");
  }

  let lastError: any;
  for (const provider of order) {
    try {
      console.log(`callAI → trying ${provider}`);
      const result = await callers[provider](opts);
      console.log(`callAI → success via ${provider}`);
      return result;
    } catch (err: any) {
      console.error(`callAI → ${provider} failed:`, err.message || err);
      lastError = err;
      // If it's a hard auth/credit error on this provider, try fallback
      if (err.status === 402 || err.status === 401 || err.status === 429) {
        continue;
      }
      // For other errors, also try fallback
      continue;
    }
  }

  // All providers failed — throw the last error
  throw lastError;
}
