import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { callAIParallel } from "../_shared/callAI.ts";

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

    let lesson: string | null = null;
    let tags: string[] = [];
    let pattern_id: string | null = null;

    try {
      const results = await callAIParallel({
        systemPrompt,
        userPrompt,
        tools: [tool],
        toolChoice: { type: "function", function: { name: "distill_lesson" } },
        temperature: 0.4,
        maxTokens: 400,
      });

      // Pick first successful result with tool call or parseable text
      for (const r of results) {
        const raw = r.toolCall?.function?.arguments || r.text;
        if (!raw) continue;
        try {
          const parsed = safeParseJSON(typeof raw === "string" ? raw : JSON.stringify(raw));
          if (parsed && typeof parsed.lesson === "string") {
            lesson = parsed.lesson.slice(0, 200);
            tags = Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6).map((s: any) => String(s).slice(0, 30)) : [];
            pattern_id = typeof parsed.pattern_id === "string" ? parsed.pattern_id.slice(0, 80) : null;
            break;
          }
        } catch (e) {
          console.warn("[lodger-distill] parse attempt failed", e);
        }
      }

      // Last-resort: use first response as text lesson
      if (!lesson && results.length > 0 && typeof results[0].text === "string") {
        lesson = results[0].text.split("\n").find(l => l.trim().length > 10)?.slice(0, 200) || null;
      }
    } catch (e) {
      console.error("[lodger-distill] all providers failed", e);
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