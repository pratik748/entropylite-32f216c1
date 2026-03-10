/**
 * AI caller — Lovable AI Gateway (primary) with OpenRouter fallback.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  preferredProvider?: string;
}

interface AIResult {
  text: string;
  provider: "lovable" | "openrouter";
  toolCall?: any;
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  // Try Lovable AI Gateway first
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    try {
      return await callLovable(opts, lovableKey);
    } catch (e: any) {
      console.error("Lovable AI error, falling back to OpenRouter:", e.message || e);
    }
  }

  // Fallback to OpenRouter
  const orKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!orKey) throw new Error("No AI provider available (LOVABLE_API_KEY and OPENROUTER_API_KEY both missing)");
  return await callOpenRouter(opts, orKey);
}

async function callLovable(opts: CallAIOptions, key: string): Promise<AIResult> {
  const body: any = {
    model: opts.model || "google/gemini-2.5-flash",
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

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`Lovable AI error ${res.status}:`, errBody.slice(0, 300));
    if (res.status === 429) {
      throw { status: 429, message: "Rate limited, please try again shortly", provider: "lovable" };
    }
    if (res.status === 402) {
      throw { status: 402, message: "AI credits exhausted", provider: "lovable" };
    }
    throw new Error(`Lovable AI ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    return { text: toolCall.function.arguments, provider: "lovable", toolCall };
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty AI response");
  const text = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "lovable" };
}

async function callOpenRouter(opts: CallAIOptions, key: string): Promise<AIResult> {
  const body: any = {
    model: opts.model || "google/gemini-2.5-flash",
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
  if (!raw) throw new Error("Empty AI response");
  const text = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "openrouter" };
}
