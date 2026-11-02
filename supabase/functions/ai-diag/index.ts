// Temporary diagnostic: Gemini thinking-budget latency A/B on the live key.
import { getManagedSnapshot, refreshManagedKeys } from "../_shared/managedKeys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await refreshManagedKeys(true);
  const managed = getManagedSnapshot();
  const key = Object.entries(managed).filter(([n, v]) => /GEMINI/i.test(n) && String(v || "").trim()).map(([_, v]) => String(v).trim())[0] || "";
  if (!key) return new Response(JSON.stringify({ error: "no gemini key" }), { headers: cors });

  const model = "gemini-3.5-flash";
  const prompt = `Given stock NVDA at 204 USD, return JSON { "ticker": "...", "score": <0-100>, "rationale": "<10 words>" } only.`;
  const configs: Array<[string, any]> = [
    ["budget0_8k", { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } }],
    ["budget1024_8k", { maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 1024 } }],
    ["budget2048_16k", { maxOutputTokens: 16384, thinkingConfig: { thinkingBudget: 2048 } }],
    ["default_16k", { maxOutputTokens: 16384 }],
  ];

  const results: any[] = [];
  for (const [label, gen] of configs) {
    const t0 = Date.now();
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: "You are a quant analyst. Return ONLY valid JSON." }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.6, responseMimeType: "application/json", ...gen },
        }),
      });
      const text = await res.text();
      let note = "";
      try {
        const j = JSON.parse(text);
        const out = j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
        note = `${j?.candidates?.[0]?.finishReason || res.status} :: ${out.slice(0, 120)}`;
      } catch { note = text.slice(0, 120); }
      results.push({ label, status: res.status, ms: Date.now() - t0, note });
    } catch (e: any) {
      results.push({ label, status: 0, ms: Date.now() - t0, note: String(e?.message || e).slice(0, 120) });
    }
  }

  return new Response(JSON.stringify({ results }, null, 2), { headers: cors });
});
