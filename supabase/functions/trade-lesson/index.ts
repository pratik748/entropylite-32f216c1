import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { callAI } from "../_shared/callAI.ts";

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

    const result = await callAI({ systemPrompt: sys, userPrompt: user, maxTokens: 120 });

    const lesson = (result.text || "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s*[\u2014\u2013]\s+/g, ", ")
      .replace(/[\u2014\u2013]/g, "-")
      .slice(0, 160);

    return new Response(JSON.stringify({ lesson }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("trade-lesson error", e);
    const msg = e instanceof Error ? e.message : "unknown";
    const status = /429|rate/i.test(msg) ? 429 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
