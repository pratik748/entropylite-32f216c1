import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { regime, vix, moodScore, sectors, holdings, keyEvents, outlook } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sectorSummary = (sectors || [])
      .slice(0, 6)
      .map((s: any) => `${s.name}: ${s.changePct > 0 ? "+" : ""}${s.changePct.toFixed(1)}%`)
      .join(", ");

    const holdingSummary = (holdings || [])
      .slice(0, 8)
      .map((h: any) => `${h.ticker} (${h.pnlPct > 0 ? "+" : ""}${h.pnlPct.toFixed(1)}%, beta=${h.beta.toFixed(2)})`)
      .join(", ");

    const systemPrompt = `You are an elite quantitative strategist at a top-tier hedge fund. You generate adaptive trading strategies based on LIVE market conditions. You never use static templates. Every strategy must be born from the current market regime and data.

Rules:
- Generate exactly 4 strategies suited to the CURRENT regime
- Each strategy must have specific, actionable entry/exit rules
- Include position sizing as % of portfolio
- Include stop-loss and take-profit levels
- Explain WHY this strategy fits the current conditions
- Strategies must cover different approaches (e.g. directional, hedged, momentum, mean-reversion)
- Be specific about asset classes and instruments`;

    const userPrompt = `CURRENT MARKET STATE:
Regime: ${regime}
VIX: ${vix}
Mood Score: ${moodScore}/100
Key Events: ${(keyEvents || []).join("; ")}
Outlook: ${outlook || "N/A"}
Sector Performance: ${sectorSummary || "N/A"}
Portfolio Holdings: ${holdingSummary || "None"}

Generate 4 adaptive strategies for this exact market environment.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
        tools: [
          {
            type: "function",
            function: {
              name: "generate_strategies",
              description: "Return 4 market-adaptive trading strategies",
              parameters: {
                type: "object",
                properties: {
                  strategies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Strategy name" },
                        type: { type: "string", description: "e.g. Momentum, Mean-Reversion, Hedged, Tactical" },
                        regime_fit: { type: "string", description: "Which regime this strategy fits best" },
                        rationale: { type: "string", description: "Why this strategy suits current conditions (2-3 sentences)" },
                        entry_rule: { type: "string", description: "Specific entry condition" },
                        exit_rule: { type: "string", description: "Specific exit condition" },
                        stop_loss_pct: { type: "number", description: "Stop loss as negative percentage e.g. -3" },
                        take_profit_pct: { type: "number", description: "Take profit as positive percentage e.g. 8" },
                        position_size_pct: { type: "number", description: "Position size as % of portfolio e.g. 15" },
                        instruments: { type: "array", items: { type: "string" }, description: "Specific tickers or asset classes" },
                        confidence: { type: "number", description: "Confidence score 0-100" },
                      },
                      required: ["name", "type", "regime_fit", "rationale", "entry_rule", "exit_rule", "stop_loss_pct", "take_profit_pct", "position_size_pct", "instruments", "confidence"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["strategies"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_strategies" } },
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI error ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in response");

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify({ strategies: parsed.strategies, regime, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Strategy generate error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
