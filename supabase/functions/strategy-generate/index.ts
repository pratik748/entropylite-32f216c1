import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { regime, vix, moodScore, sectors, portfolio, keyEvents, outlook } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const sectorSummary = (sectors || [])
      .slice(0, 10)
      .map((s: any) => `${s.name}: ${s.changePct > 0 ? "+" : ""}${s.changePct.toFixed(1)}%`)
      .join(", ");

    // Build detailed portfolio context
    const portfolioLines = (portfolio || []).map((p: any) =>
      `${p.ticker}: ${p.quantity} shares @ $${p.currentPrice.toFixed(2)} (bought $${p.buyPrice.toFixed(2)}, PnL ${p.pnlPct > 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%, weight ${p.weightPct.toFixed(1)}%)`
    ).join("\n");

    const totalValue = (portfolio || []).reduce((s: number, p: any) => s + p.currentPrice * p.quantity, 0);

    const systemPrompt = `You are an elite portfolio strategist managing a live portfolio. You produce EXACT, EXECUTABLE trade instructions — not generic advice.

CRITICAL RULES:
1. Every instruction must specify: exact ticker, exact action (BUY/SELL/HEDGE/HOLD/TRIM), exact quantity or dollar amount, exact entry price or price range, exact stop-loss price, exact take-profit price
2. Reference the user's ACTUAL positions by ticker, current PnL, and weight
3. Consider position concentration risk — if any position is >25% weight, flag it
4. For hedges, specify exact instruments (e.g. "Buy 2 SPY $540 puts expiring Mar 21")
5. For new entries, specify exact entry zone, position size in dollars AND shares
6. Include time horizon for each trade (intraday, swing 2-5 days, position 1-4 weeks)
7. Explain the EXACT market condition driving each recommendation
8. If portfolio is empty, recommend 4-6 specific new positions to build a balanced portfolio
9. All prices must be realistic based on current market data provided
10. Generate 4-6 trade instructions covering: position management, hedging, new opportunities`;

    const userPrompt = `LIVE MARKET STATE:
Regime: ${regime}
VIX: ${vix}
Mood Score: ${moodScore}/100
Key Events: ${(keyEvents || []).join("; ")}
Outlook: ${outlook || "N/A"}
Sector Performance: ${sectorSummary || "N/A"}

CURRENT PORTFOLIO (Total Value: $${totalValue.toFixed(0)}):
${portfolioLines || "EMPTY — No positions. Recommend initial portfolio construction."}

Generate exact trade instructions for this portfolio in this market environment.`;

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
              name: "generate_trade_instructions",
              description: "Return 4-6 exact, executable trade instructions",
              parameters: {
                type: "object",
                properties: {
                  portfolio_assessment: {
                    type: "string",
                    description: "2-3 sentence assessment of the current portfolio's health, risk exposure, and key concerns given market conditions",
                  },
                  instructions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        action: { type: "string", enum: ["BUY", "SELL", "TRIM", "ADD", "HEDGE", "HOLD", "CLOSE"], description: "Trade action" },
                        ticker: { type: "string", description: "Exact ticker symbol e.g. AAPL, SPY, GLD" },
                        is_existing_position: { type: "boolean", description: "True if this ticker is already in the portfolio" },
                        urgency: { type: "string", enum: ["IMMEDIATE", "TODAY", "THIS_WEEK", "WHEN_TRIGGERED"], description: "When to execute" },
                        quantity: { type: "number", description: "Number of shares/contracts" },
                        dollar_amount: { type: "number", description: "Dollar amount of the trade" },
                        entry_price: { type: "number", description: "Target entry price" },
                        entry_zone_low: { type: "number", description: "Lower bound of entry zone" },
                        entry_zone_high: { type: "number", description: "Upper bound of entry zone" },
                        stop_loss_price: { type: "number", description: "Exact stop-loss price" },
                        take_profit_price: { type: "number", description: "Exact take-profit price" },
                        time_horizon: { type: "string", description: "e.g. Intraday, Swing 2-5 days, Position 1-4 weeks" },
                        rationale: { type: "string", description: "2-3 sentences explaining WHY this trade, referencing specific market conditions" },
                        risk_reward: { type: "string", description: "Risk/reward ratio e.g. 1:2.5" },
                        category: { type: "string", enum: ["POSITION_MGMT", "HEDGE", "NEW_ENTRY", "REBALANCE", "RISK_REDUCTION"], description: "Type of instruction" },
                        priority: { type: "number", description: "1=highest priority, 6=lowest" },
                        confidence: { type: "number", description: "Confidence score 0-100" },
                      },
                      required: ["action", "ticker", "is_existing_position", "urgency", "rationale", "category", "priority", "confidence", "time_horizon", "risk_reward"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["portfolio_assessment", "instructions"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_trade_instructions" } },
        temperature: 0.3,
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

    // Sort instructions by priority
    if (parsed.instructions) {
      parsed.instructions.sort((a: any, b: any) => (a.priority || 99) - (b.priority || 99));
    }

    return new Response(JSON.stringify({
      portfolio_assessment: parsed.portfolio_assessment,
      instructions: parsed.instructions,
      regime,
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Strategy generate error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
