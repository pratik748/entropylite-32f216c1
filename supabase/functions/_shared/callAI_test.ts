import "https://deno.land/std@0.224.0/dotenv/load.ts";

const apiKey = Deno.env.get("ONEMIN_AI_API_KEY")!;

async function probe(label: string, url: string, headers: Record<string,string>, body: any) {
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const txt = await r.text();
    console.log(`[${label}] ${r.status}: ${txt.slice(0, 300)}`);
  } catch (e) { console.log(`[${label}] ERR ${(e as Error).message}`); }
}

Deno.test("probe 1min.ai endpoints", async () => {
  // 1) OpenAI-compatible
  await probe("openai-compat /v1/chat", "https://api.1min.ai/v1/chat/completions",
    { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    { model: "gpt-4o-mini", messages: [{ role: "user", content: "ping" }], max_tokens: 10 });

  // 2) features w/ CONVERSATIONAL
  await probe("features CONVERSATIONAL", "https://api.1min.ai/api/features?isStreaming=false",
    { "API-KEY": apiKey, "Content-Type": "application/json" },
    { type: "CONVERSATIONAL", model: "gpt-4o-mini", promptObject: { prompt: "ping" } });

  // 3) features w/ CHAT_WITH_AI mistral-nemo (worked before w/ different error)
  await probe("features CHAT_WITH_AI mistral", "https://api.1min.ai/api/features?isStreaming=false",
    { "API-KEY": apiKey, "Content-Type": "application/json" },
    { type: "CHAT_WITH_AI", model: "mistral-nemo", promptObject: { prompt: "ping", isMixed: false, webSearch: false } });
});