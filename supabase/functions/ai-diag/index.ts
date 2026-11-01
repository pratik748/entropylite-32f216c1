// Temporary diagnostic: identify each configured AI key's provider and test it.
// Returns REDACTED results only (no key values, no key fragments).
import { getManagedSnapshot, refreshManagedKeys } from "../_shared/managedKeys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const PROVIDERS: Array<[string, string, (k: string) => RequestInit]> = [
  ["openrouter", "https://openrouter.ai/api/v1/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-5.6-luna", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["mistral", "https://api.mistral.ai/v1/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "open-mistral-nemo", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["groq", "https://api.groq.com/openai/v1/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "llama-3.1-8b-instant", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["deepseek", "https://api.deepseek.com/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "deepseek-chat", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["together", "https://api.together.xyz/v1/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["xai", "https://api.x.ai/v1/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "grok-3-mini", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["anthropic", "https://api.anthropic.com/v1/messages", (k) => ({
    method: "POST",
    headers: { "x-api-key": k, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-haiku-5.5", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
  ["openai", "https://api.openai.com/v1/chat/completions", (k) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${k}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-5.6-luna", max_tokens: 5, messages: [{ role: "user", content: "say OK" }] }),
  })],
];

async function probeAll(key: string) {
  const results: any[] = [];
  for (const [provider, url, mk] of PROVIDERS) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, mk(key));
      const text = await res.text();
      results.push({ provider, status: res.status, ms: Date.now() - t0, body: text.slice(0, 160) });
    } catch (e: any) {
      results.push({ provider, status: 0, ms: Date.now() - t0, body: String(e?.message || e).slice(0, 120) });
    }
  }
  return results;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await refreshManagedKeys(true);
  const managed = getManagedSnapshot();
  const report: any = { keys: [] };

  const skip = /LOVABLE_AI_ENABLED|SUPABASE|DEMO_|SESSION|JWKS|DB_URL|_MODEL$|_ENABLED$|_URL$|_BASE_URL$/i;
  for (const [name, value] of Object.entries(managed)) {
    const v = String(value || "").trim();
    if (!name || !v || skip.test(name)) continue;
    report.keys.push({ name, len: v.length, prefix4: v.slice(0, 4), probes: await probeAll(v) });
  }

  return new Response(JSON.stringify(report, null, 2), { headers: cors });
});
