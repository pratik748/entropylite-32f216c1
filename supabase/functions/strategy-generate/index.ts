import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { regime, vix, moodScore, sectors, portfolio, keyEvents, outlook, provider, indiaMode } = await req.json();

    const sectorSummary = (sectors || [])
      .slice(0, 10)
      .map((s: any) => `${s.name}: ${s.changePct > 0 ? "+" : ""}${s.changePct.toFixed(1)}%`)
      .join(", ");

    const portfolioLines = (portfolio || []).map((p: any) =>
      `${p.ticker}: ${p.quantity} shares @ $${p.currentPrice.toFixed(2)} (bought $${p.buyPrice.toFixed(2)}, PnL ${p.pnlPct > 0 ? "+" : ""}${p.pnlPct.toFixed(1)}%, weight ${p.weightPct.toFixed(1)}%)`
    ).join("\n");

    const totalValue = (portfolio || []).reduce((s: number, p: any) => s + p.currentPrice * p.quantity, 0);

    const indiaBlock = indiaMode ? "\n11. INDIA-ONLY MODE: Only recommend Indian equities (NSE/BSE), F&O instruments, Indian ETFs/bonds. Use INR denomination. Consider SEBI/RBI rules, Indian tax structure, Indian market hours. No foreign-centric recommendations." : "";

    const systemPrompt = `You are a senior portfolio strategist on an institutional trading desk. You produce EXACT, EXECUTABLE trade instructions backed by an explicit market thesis — never vague advice. The user is treating each instruction as a candidate ticket on their blotter; ambiguity costs money.

REASONING FRAMEWORK — for every instruction, work through:
1. WHAT regime are we in? (regime tag + VIX band + sector rotation evidence in the data below)
2. WHAT does this regime imply for the existing book? (which positions are aligned, which are exposed)
3. WHAT is the highest-conviction action? (close a misaligned risk first, then layer hedges, then add opportunities)
4. WHAT is the EXIT plan before the entry plan? (stop-loss anchored to volatility, take-profit anchored to a real level)
5. WHAT is the risk/reward? It must be ≥ 1:1.5 to justify the ticket — if not, downgrade to HOLD or skip.

EXECUTION RULES (strict):
1. Every instruction must specify: exact ticker, action (BUY/SELL/TRIM/ADD/HEDGE/HOLD/CLOSE), quantity OR dollar amount, entry price (or zone low/high), stop_loss_price, take_profit_price.
2. Reference the user's ACTUAL positions by ticker, current PnL, and weight. If portfolio empty, build 4–6 positions covering 3 sectors + 1 hedge + 1 cash-equivalent.
3. Concentration > 25% weight in any single name → an explicit TRIM instruction MUST appear with the rebalance target weight in the rationale.
4. Hedges must be CONCRETE instruments and tenor: "Buy 2 SPY $540 puts expiring 21-Mar" — never "consider hedging".
5. New entries: entry_zone_low/high tied to support, stop_loss_price one ATR below support, take_profit at next resistance or 2× ATR.
6. Time horizon must match the volatility regime — high VIX favours intraday/swing, low VIX favours position trades.
7. Rationale (2–3 sentences) must cite the SPECIFIC market condition driving the trade — name a regime tag, a VIX level, a sector move, or a key event from the inputs.
8. risk_reward must be a real ratio computed from (take_profit − entry) ÷ (entry − stop_loss).
9. confidence calibration: 70–85 only when regime, momentum, and risk all align; 50–65 mixed; 35–50 conflicting; never below 35 for an actionable ticket.
10. Output MUST cover the four buckets in this order of priority: (i) RISK_REDUCTION on existing exposed positions, (ii) HEDGE for portfolio-level tail risk, (iii) POSITION_MGMT (TRIM/ADD), (iv) NEW_ENTRY only after the book is defended.${indiaBlock}`;

    const userPrompt = `LIVE MARKET STATE:
Regime: ${regime}
VIX: ${vix}
Mood Score: ${moodScore}/100
Key Events: ${(keyEvents || []).join("; ")}
Outlook: ${outlook || "N/A"}
Sector Performance: ${sectorSummary || "N/A"}

CURRENT PORTFOLIO (Total Value: $${totalValue.toFixed(0)}):
${portfolioLines || "EMPTY — No positions. Recommend initial portfolio construction."}

Walk the framework end-to-end:
(a) Diagnose regime → portfolio exposure mismatches FIRST.
(b) Defend the book BEFORE seeking opportunities — RISK_REDUCTION + HEDGE before NEW_ENTRY.
(c) Each ticket must defend itself with a number from the data above (a sector %, a VIX level, a position weight, a PnL).
(d) portfolio_assessment leads with the single biggest concern in 1 sentence, then 1 sentence on the largest opportunity.

Generate 4–6 instructions, sorted by priority (1 = highest, execute first).`;

    const tools = [
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
    ];

    const result = await callAI({
      provider,
      systemPrompt,
      userPrompt,
      tools,
      toolChoice: { type: "function", function: { name: "generate_trade_instructions" } },
      temperature: 0.3,
      maxTokens: 4000,
    });

    const parsed = safeParseJSON(result.text);

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
  } catch (error: any) {
    console.error("Strategy generate error:", error);
    if (error.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited, please try again shortly" }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (error.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
        status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
