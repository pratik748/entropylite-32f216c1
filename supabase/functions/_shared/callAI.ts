/**
 * AI caller — OpenRouter only (nvidia/nemotron-3-nano-30b-a3b:free).
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

interface AIResult {
  text: string;
  provider: "openrouter";
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
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
      model: "nvidia/nemotron-3-nano-30b-a3b:free",
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
    if (res.status === 429 || res.status === 402) {
      throw { status: 429, message: "OpenRouter rate limited or insufficient credits", provider: "openrouter" };
    }
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty OpenRouter response");
  const text = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "openrouter" };
}
