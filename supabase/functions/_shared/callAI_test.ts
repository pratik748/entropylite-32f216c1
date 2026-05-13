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
  const models = [
    "mistral-large", "mistral-small", "open-mistral-7b", "open-mixtral-8x7b",
    "gpt-4", "gpt-4-turbo", "gpt-3.5-turbo",
    "claude-3-haiku-20240307", "claude-3-5-sonnet-20240620",
    "gemini-1.5-pro", "gemini-1.5-flash",
    "deepseek-chat", "command-r", "llama-3-70b",
  ];
  for (const m of models) {
    await probe(`CHAT_WITH_AI ${m}`, "https://api.1min.ai/api/features?isStreaming=false",
      { "API-KEY": apiKey, "Content-Type": "application/json" },
      { type: "CHAT_WITH_AI", model: m, promptObject: { prompt: "ping", isMixed: false, webSearch: false } });
  }
});