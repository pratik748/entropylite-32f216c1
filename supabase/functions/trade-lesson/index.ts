import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { ticker, action, source, catalyst, pnl, entryPrice, currentPrice } = await req.json();
    if (!ticker || !action) {
      return new Response(JSON.stringify({ error: "ticker and action required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const sys =
      "You are an institutional trading desk mentor. Given a single trade, write ONE short, sharp, declarative lesson (max 18 words). No emoji. No hedging. No 'remember to'. Imperative or observational tone. Return only the lesson sentence.";
    const user = `Ticker: ${ticker}\nAction: ${action}\nEntry: ${entryPrice ?? "?"}\nCurrent: ${currentPrice ?? "?"}\nP&L: ${pnl ?? "n/a"}\nSource: ${source ?? "n/a"}\nCatalyst: ${catalyst ?? "n/a"}`;

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      }),
    });

    if (r.status === 429) {
      return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (r.status === 402) {
      return new Response(JSON.stringify({ error: "credits_exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!r.ok) {
      const t = await r.text();
      throw new Error(`AI gateway ${r.status}: ${t}`);
    }

    const j = await r.json();
    let lesson: string = j?.choices?.[0]?.message?.content?.trim() || "";
    lesson = lesson.replace(/^["'`]+|["'`]+$/g, "").slice(0, 160);

    return new Response(JSON.stringify({ lesson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("trade-lesson error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});