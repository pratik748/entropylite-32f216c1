/**
 * Generic AI provider caller that can communicate with OpenAI-compatible,
 * Anthropic, Google Gemini, Mistral, and custom endpoints.
 */

import { CallAIOptions, AIResult, hardenSystemPrompt, stripLongDashes, stripThinkingBlocks, fetchWithTimeout } from "./callAI.ts";

export interface CustomAIConfig {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl?: string;
  apiVersion?: string;
}

export async function callCustomAIProvider(
  opts: CallAIOptions,
  config: CustomAIConfig,
  reportedProvider?: AIResult["provider"]
): Promise<AIResult> {
  const provider = config.provider.toLowerCase();
  const model = opts.model || config.model;
  const systemText = hardenSystemPrompt(opts.systemPrompt, opts.skipHardening);
  const timeout = (opts.maxTokens ?? 4096) > 4000 ? 90000 : 60000;

  // 1. Anthropic Claude
  if (provider === "anthropic") {
    const endpoint = config.baseUrl || "https://api.anthropic.com/v1/messages";
    const body: Record<string, any> = {
      model,
      system: systemText,
      messages: [{ role: "user", content: opts.userPrompt }],
      max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
      temperature: opts.temperature ?? 0.6,
    };

    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": config.apiVersion || "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, timeout);

    if (!res.ok) {
      const errBody = await res.text();
      throw { status: res.status, message: `Anthropic ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== "string" || !text.trim()) throw new Error("Empty Anthropic response");
    return {
      text: stripLongDashes(stripThinkingBlocks(text)),
      provider: reportedProvider || "mistral",
    };
  }

  // 2. Google Gemini
  if (provider === "gemini") {
    const endpoint = config.baseUrl ||
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

    const jsonHint = opts.jsonMode
      ? "\n\nReturn ONLY a single valid JSON object. No prose. No markdown fences."
      : "";

    const body: Record<string, any> = {
      systemInstruction: { role: "system", parts: [{ text: systemText }] },
      contents: [{ role: "user", parts: [{ text: `${opts.userPrompt}${jsonHint}` }] }],
      generationConfig: {
        temperature: opts.temperature ?? 0.6,
        maxOutputTokens: Math.min(opts.maxTokens ?? 4096, 8192),
        ...(opts.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };

    const res = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, timeout);

    if (!res.ok) {
      const errBody = await res.text();
      throw { status: res.status, message: `Gemini ${res.status}: ${errBody.slice(0, 200)}` };
    }

    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts;
    const text = Array.isArray(parts) ? parts.map((p: any) => p?.text || "").join("") : "";
    if (!text || !text.trim()) throw new Error("Empty Gemini response");
    return {
      text: stripLongDashes(stripThinkingBlocks(text)),
      provider: reportedProvider || "gemini",
    };
  }

  // 3. OpenAI or OpenAI-compatible (Mistral, OpenRouter, Custom, Groq, Together, etc.)
  let endpoint = config.baseUrl;
  if (!endpoint) {
    if (provider === "mistral") endpoint = "https://api.mistral.ai/v1/chat/completions";
    else if (provider === "openrouter") endpoint = "https://openrouter.ai/api/v1/chat/completions";
    else endpoint = "https://api.openai.com/v1/chat/completions";
  }

  const body: Record<string, any> = {
    model,
    messages: [
      { role: "system", content: systemText },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };

  if (provider === "openrouter") {
    headers["HTTP-Referer"] = "https://entropylite.com";
    headers["X-Title"] = "EntropyLite";
  }

  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }, timeout);

  if (!res.ok) {
    const errBody = await res.text();
    throw { status: res.status, message: `${provider} ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new Error(`Empty response from ${provider}`);
  return {
    text: stripLongDashes(stripThinkingBlocks(text)),
    provider: reportedProvider || (provider === "openai" ? "openai" : "mistral"),
  };
}
