/**
 * AI caller — Lovable AI Gateway (google/gemini-3-flash-preview).
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  preferredProvider?: string; // ignored, kept for compat
}

interface AIResult {
  text: string;
  provider: "lovable";
  toolCall?: any;
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not set");

  const body: any = {
    model: "google/gemini-3-flash-preview",
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
      Authorization: `Bearer ${key}`,
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

  // Handle tool calls
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    return { text: toolCall.function.arguments, provider: "lovable", toolCall };
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty AI response");
  const text = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "lovable" };
}
