import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { trade, recent } = await req.json();
    if (!trade) {
      return new Response(JSON.stringify({ error: "Missing trade payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const condensed = {
      ticker: trade.ticker,
      side: trade.side,
      regime: trade.regime,
      pnl_pct: Number(trade.pnl_pct).toFixed(2),
      expected_pct: Number(trade.expected_pct).toFixed(2),
      divergence_pct: Number(trade.divergence_pct).toFixed(2),
      actual_hold_min: Number(trade.actual_hold_min).toFixed(1),
      expected_hold_min: Number(trade.expected_hold_min).toFixed(1),
      vol_at_entry: Number(trade.vol_at_entry).toFixed(2),
      slippage_bps: Number(trade.slippage_bps).toFixed(1),
      reflex_score: Number(trade.reflex_score).toFixed(2),
    };
    const recentSummary = (Array.isArray(recent) ? recent : []).slice(-10).map((t: any, i: number) =>
      `${i + 1}. ${t.ticker} ${t.regime} pnl=${Number(t.pnl_pct).toFixed(2)}% exp=${Number(t.expected_pct).toFixed(2)}% hold=${Number(t.actual_hold_min).toFixed(0)}m div=${Number(t.divergence_pct).toFixed(2)}%${t.lesson ? ` // ${String(t.lesson).slice(0, 80)}` : ""}`
    ).join("\n");

    const systemPrompt = `You are a discipline coach for an intraday trader.
Given one closed trade and the trader's last 10 trades, produce ONE single-line distilled lesson (≤140 chars).
The lesson must be specific to the divergence between expected vs realized return AND between expected vs actual hold time.
Reference the regime if it changed the outcome. No platitudes. No emojis.
Also produce 2-4 short tags (e.g. "exit-discipline", "vol-mismatch", "regime-pivot") and a stable pattern_id (snake_case slug describing the pattern).
Return strictly via the distill_lesson tool.`;

    const userPrompt = `Closed trade:\n${JSON.stringify(condensed, null, 2)}\n\nRecent trades:\n${recentSummary || "(none)"}`;

    const tool = {
      type: "function",
      function: {
        name: "distill_lesson",
        description: "Return one distilled lesson, tags, and a stable pattern id.",
        parameters: {
          type: "object",
          properties: {
            lesson: { type: "string", description: "Single-line lesson, ≤140 chars." },
            tags: { type: "array", items: { type: "string" }, description: "2-4 short tags." },
            pattern_id: { type: "string", description: "snake_case slug." },
          },
          required: ["lesson", "tags", "pattern_id"],
          additionalProperties: false,
        },
      },
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [tool],
        tool_choice: { type: "function", function: { name: "distill_lesson" } },
      }),
    });

    if (aiResp.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited", lesson: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiResp.status === 402) {
      return new Response(JSON.stringify({ error: "Credits required", lesson: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("[lodger-distill] gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error", lesson: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiResp.json();
    const choice = json?.choices?.[0];
    const toolCall = choice?.message?.tool_calls?.[0];
    let lesson: string | null = null;
    let tags: string[] = [];
    let pattern_id: string | null = null;
    if (toolCall?.function?.arguments) {
      try {
        const parsed = safeParseJSON(toolCall.function.arguments);
        lesson = typeof parsed.lesson === "string" ? parsed.lesson.slice(0, 200) : null;
        tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map((s: any) => String(s).slice(0, 30)) : [];
        pattern_id = typeof parsed.pattern_id === "string" ? parsed.pattern_id.slice(0, 80) : null;
      } catch (e) {
        console.warn("[lodger-distill] parse failed", e);
      }
    } else if (typeof choice?.message?.content === "string") {
      // Fallback: take first 140 chars as the lesson
      lesson = choice.message.content.split("\n")[0].slice(0, 200);
    }

    return new Response(JSON.stringify({ lesson, tags, pattern_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[lodger-distill] error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error", lesson: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});