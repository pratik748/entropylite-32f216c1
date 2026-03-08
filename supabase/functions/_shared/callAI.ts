/**
 * AI caller — OpenRouter only, with Lovable AI as fallback.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

interface AIResult {
  text: string;
  provider: "openrouter" | "lovable";
}

async function callOpenRouter(opts: CallAIOptions): Promise<string> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://entropylite.lovable.app",
      "X-Title": "Entropy Lite",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 4000,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`OpenRouter error ${res.status}:`, body.slice(0, 300));
    if (res.status === 429 || res.status === 402) throw { status: 429, message: "OpenRouter rate limited or insufficient credits", provider: "openrouter" };
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty OpenRouter response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

async function callLovableAI(opts: CallAIOptions): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not set");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userPrompt },
      ],
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 4000,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Lovable AI error ${res.status}:`, body.slice(0, 300));
    if (res.status === 429 || res.status === 402) throw { status: 429, message: "Lovable AI rate limited", provider: "lovable" };
    throw new Error(`Lovable AI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty Lovable AI response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  // Primary: OpenRouter, Fallback: Lovable AI
  try {
    const text = await callOpenRouter(opts);
    return { text, provider: "openrouter" };
  } catch (err: any) {
    console.warn("OpenRouter failed:", err.message || err);
    try {
      const text = await callLovableAI(opts);
      console.log("Fell back to Lovable AI successfully");
      return { text, provider: "lovable" };
    } catch (fallbackErr: any) {
      console.error("Lovable AI also failed:", fallbackErr.message || fallbackErr);
      if (err.status === 429 || fallbackErr.status === 429) {
        throw { status: 429, message: "All AI providers rate limited" };
      }
      throw new Error(`All AI providers failed. OpenRouter: ${err.message || err}. Lovable: ${fallbackErr.message || fallbackErr}`);
    }
  }
}
