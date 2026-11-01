// Temporary diagnostic: which newest Gemini models can this key actually generate with?
// Returns REDACTED results only.
import { getManagedSnapshot, refreshManagedKeys } from "../_shared/managedKeys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const CANDIDATES = [
  "gemini-4-argon",
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await refreshManagedKeys(true);
  const managed = getManagedSnapshot();
  const report: any = { tests: [] };

  for (const [name, value] of Object.entries(managed)) {
    const v = String(value || "").trim();
    if (!name || !v || !v.startsWith("AQ.")) continue;

    for (const model of CANDIDATES) {
      const t0 = Date.now();
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${v}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: "Reply with the single word OK." }] },
            contents: [{ role: "user", parts: [{ text: "ping" }] }],
            generationConfig: { maxOutputTokens: 2048, temperature: 0 },
          }),
        });
        const text = await res.text();
        let note = "";
        try {
          const j = JSON.parse(text);
          const fr = j?.candidates?.[0]?.finishReason;
          const out = j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
          note = fr ? `finishReason=${fr} text=${JSON.stringify(out.slice(0, 20))}` : text.slice(0, 120);
        } catch { note = text.slice(0, 120); }
        report.tests.push({ model, status: res.status, ms: Date.now() - t0, note });
      } catch (e: any) {
        report.tests.push({ model, status: 0, ms: Date.now() - t0, note: String(e?.message || e).slice(0, 120) });
      }
    }
  }

  return new Response(JSON.stringify(report, null, 2), { headers: cors });
});
