/**
 * Dual-provider AI caller: Gemini primary, OpenRouter fallback.
 * Import via: import { callAI } from "../_shared/callAI.ts";
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  /** Which provider to try first. Defaults to "gemini" */
  preferredProvider?: "gemini" | "openrouter";
}

interface AIResult {
  text: string;
  provider: "gemini" | "openrouter";
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
    console.error(`Gemini error ${res.status}:`, body);
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
    console.error(`OpenRouter error ${res.status}:`, body);
    if (res.status === 429) throw { status: 429, message: "OpenRouter rate limited", provider: "openrouter" };
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty OpenRouter response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const preferred = opts.preferredProvider || "openrouter";
  const primary = preferred === "gemini" ? callGemini : callOpenRouter;
  const fallback = preferred === "gemini" ? callOpenRouter : callGemini;
  const primaryName = preferred;
  const fallbackName = preferred === "gemini" ? "openrouter" : "gemini";

  try {
    const text = await primary(opts);
    return { text, provider: primaryName };
  } catch (primaryErr: any) {
    console.warn(`${primaryName} failed:`, primaryErr.message || primaryErr);
    // If both providers rate-limit, throw 429
    try {
      const text = await fallback(opts);
      console.log(`Fell back to ${fallbackName} successfully`);
      return { text, provider: fallbackName };
    } catch (fallbackErr: any) {
      console.error(`${fallbackName} also failed:`, fallbackErr.message || fallbackErr);
      // If primary was 429 and fallback also fails, surface 429
      if (primaryErr.status === 429 || fallbackErr.status === 429) {
        throw { status: 429, message: "All AI providers rate limited" };
      }
      throw new Error(`Both AI providers failed. Primary: ${primaryErr.message || primaryErr}. Fallback: ${fallbackErr.message || fallbackErr}`);
    }
  }
}
