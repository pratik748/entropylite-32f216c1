// Temporary diagnostic: capture the full 429 quota body from the Gemini key.
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

  const out: any = {};
  for (const model of ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"]) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "say OK" }] }], generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    out[model] = { status: res.status, body: (await res.text()).slice(0, 2000) };
  }
  return new Response(JSON.stringify(out, null, 2), { headers: cors });
});
