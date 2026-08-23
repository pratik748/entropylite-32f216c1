import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callAI } from "../_shared/callAI.ts";

function fallbackLesson(action: string, pnl: unknown): string {
  const pnlText = pnl == null || pnl === "" ? "unmeasured P&L" : `${pnl} P&L`;
  return `${String(action).toUpperCase()} logged with ${pnlText}; review catalyst, entry discipline, and invalidation before repeating.`.slice(0, 160);
}

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

    const sys =
      "You are an institutional trading desk mentor. Given a single trade, write ONE short, sharp, declarative lesson (max 18 words). No emoji. No hedging. No 'remember to'. Imperative or observational tone. Return only the lesson sentence.";
    const user = `Ticker: ${ticker}\nAction: ${action}\nEntry: ${entryPrice ?? "?"}\nCurrent: ${currentPrice ?? "?"}\nP&L: ${pnl ?? "n/a"}\nSource: ${source ?? "n/a"}\nCatalyst: ${catalyst ?? "n/a"}`;

    let lesson: string;
    try {
      const ai = await callAI({
        systemPrompt: sys,
        userPrompt: user,
        maxTokens: 80,
        temperature: 0.3,
        skipHardening: true,
      });
      lesson = ai.text.trim();
    } catch (aiError) {
      console.warn("trade-lesson AI unavailable, returning local fallback", aiError);
      lesson = fallbackLesson(action, pnl);
    }
    lesson = lesson
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s*[\u2014\u2013]\s+/g, ", ")
      .replace(/[\u2014\u2013]/g, "-")
      .slice(0, 160);

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