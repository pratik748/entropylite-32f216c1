/**
 * AI caller using Lovable AI as primary (no API key needed),
 * with Gemini and OpenRouter as fallbacks.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  preferredProvider?: "lovable" | "gemini" | "openrouter";
}

interface AIResult {
  text: string;
  provider: "lovable" | "gemini" | "openrouter";
}

async function callLovable(opts: CallAIOptions): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY not set");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) throw new Error("SUPABASE_URL not set");

  const res = await fetch(`${supabaseUrl}/functions/v1/proxy-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
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
    if (res.status === 429) throw { status: 429, message: "Lovable AI rate limited", provider: "lovable" };
    throw new Error(`Lovable AI ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty Lovable AI response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

async function callGemini(opts: CallAIOptions): Promise<string> {
  const key = Deno.env.get("GOOGLE_GEMINI_KEY");
  if (!key) throw new Error("GOOGLE_GEMINI_KEY not set");

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: opts.userPrompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.3,
          maxOutputTokens: opts.maxTokens ?? 4000,
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`Gemini error ${res.status}:`, body.slice(0, 300));
    if (res.status === 429) throw { status: 429, message: "Gemini rate limited", provider: "gemini" };
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error("Empty Gemini response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
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
    if (res.status === 429 || res.status === 402) throw { status: 429, message: "OpenRouter rate limited/no credits", provider: "openrouter" };
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty OpenRouter response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

const providers = {
  lovable: callLovable,
  gemini: callGemini,
  openrouter: callOpenRouter,
};

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  // Try providers in order: lovable first, then gemini, then openrouter
  const order: Array<"lovable" | "gemini" | "openrouter"> = ["lovable", "gemini", "openrouter"];
  
  let lastError: any;
  for (const name of order) {
    try {
      const text = await providers[name](opts);
      if (name !== order[0]) console.log(`Fell back to ${name} successfully`);
      return { text, provider: name };
    } catch (err: any) {
      console.warn(`${name} failed:`, err.message || err);
      lastError = err;
    }
  }

  if (lastError?.status === 429) {
    throw { status: 429, message: "All AI providers rate limited" };
  }
  throw new Error(`All AI providers failed. Last error: ${lastError?.message || lastError}`);
}
