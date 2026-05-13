import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const which = url.searchParams.get("key") || "1";
  const apiKey = which === "2" ? Deno.env.get("GOOGLE_GEMINI_KEY_2") : Deno.env.get("GOOGLE_GEMINI_KEY");
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: "no key" }), { headers: { ...cors, "Content-Type": "application/json" } });
  const model = url.searchParams.get("model") || "gemini-2.0-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with only OK" }] }] }),
  });
  const body = await r.text();
  return new Response(JSON.stringify({ ok: r.ok, status: r.status, body: body.slice(0, 300) }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
