// Temporary diagnostic: which models can each configured AI key actually call?
// Returns REDACTED results only (no key values, no key fragments).
import { getManagedSnapshot, refreshManagedKeys } from "../_shared/managedKeys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function classify(value: string): string {
  const v = value.trim();
  if (/^omni-|^sk-omni-/.test(v)) return "omniroute";
  if (/^sk-or-/.test(v)) return "openrouter";
  if (/^sk-ant-/.test(v)) return "anthropic";
  if (/^gsk_/.test(v)) return "groq";
  if (/^nvapi-/.test(v)) return "nvidia";
  if (/^AIza[\w-]{20,}$/.test(v)) return "gemini";
  if (/^sk-(proj-)?[A-Za-z0-9_-]{20,}$/.test(v)) return "openai";
  if (/^[A-Za-z0-9]{32}$/.test(v)) return "mistral";
  return `unknown(len=${v.length})`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await refreshManagedKeys(true);
  const managed = getManagedSnapshot();
  const report: any = { keys: [], env: {} };

  for (const envName of [
    "OMNIROUTE_API_KEY", "OMNIROUTE_URL", "MISTRAL_API_KEY", "MISTRAL_API_KEY_2", "MISTRAL_API_KEY_3",
    "GOOGLE_GEMINI_KEY", "GOOGLE_GEMINI_KEY_2", "OPENAI_API_KEY", "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY", "GROQ_API_KEY", "NVIDIA_API_KEY", "CLOUDFLARE_API_TOKEN", "ONEMIN_AI_API_KEY",
  ]) {
    const v = Deno.env.get(envName);
    report.env[envName] = v ? `present(len=${v.trim().length})` : "absent";
  }

  const entries = Object.entries(managed).filter(([n, v]) => n && v && !/LOVABLE_AI_ENABLED|SUPABASE|DEMO_|SESSION|JWKS|DB_URL|_MODEL$|_ENABLED$|_URL$|_BASE_URL$/i.test(n));
  for (const [name, value] of entries) {
    const cls = classify(String(value));
    const item: any = { name, class: cls };
    if (cls === "gemini") {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${value.trim()}&pageSize=200`, { method: "GET" });
        const bodyText = await res.text();
        if (!res.ok) {
          item.listModels = `HTTP ${res.status}: ${bodyText.slice(0, 240)}`;
        } else {
          const data = JSON.parse(bodyText);
          const usable = (data.models || [])
            .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
            .map((m: any) => m.name.replace("models/", ""));
          item.listModels = "OK";
          item.generateContentModels = usable;
          // Try the newest-looking flash model with a tiny call.
          const pick = usable.filter((m: string) => /flash/.test(m)).sort().reverse()[0] || usable[0];
          if (pick) {
            const t0 = Date.now();
            const cres = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${pick}:generateContent?key=${value.trim()}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } }),
            });
            const ctext = await cres.text();
            item.testModel = pick;
            item.testStatus = cres.status;
            item.testLatencyMs = Date.now() - t0;
            item.testBody = ctext.slice(0, 200);
          }
        }
      } catch (e: any) {
        item.listModels = `error: ${String(e?.message || e).slice(0, 160)}`;
      }
    } else {
      item.note = "non-gemini key: no live test in this probe";
    }
    report.keys.push(item);
  }

  return new Response(JSON.stringify(report, null, 2), { headers: cors });
});
