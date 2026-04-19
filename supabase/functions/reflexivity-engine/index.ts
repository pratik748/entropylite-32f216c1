/**
 * Reflexivity Engine — operationalizes Soros's reflexivity into a real-time
 * belief-about-belief map. Fuses Flow Intelligence + Sentiment + Causal Effects
 * into a single signal: where consensus is internally contradicted and about
 * to break.
 *
 * Output is NOT a price prediction. It is a contradiction map + a shift-ETA.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ---------- Deterministic belief math ----------

interface BeliefInput {
  flows?: any[];                  // from flow-intelligence
  sentiment?: any;                // from sentiment-intel (composite/breakdown)
  causal?: any;                   // from causal-effects (scenario tree)
  vix?: number;
  regime?: string;
  portfolio?: any[];
}

/** Consensus = weighted avg conviction of all signals pointing the same way. */
function deriveConsensus(input: BeliefInput) {
  const flows = Array.isArray(input.flows) ? input.flows : [];
  const sent = input.sentiment || {};

  // Flow vote: SELL=-1, NEUTRAL=0, BUY=+1, weighted by intensity*impact
  let flowVote = 0;
  let flowWeight = 0;
  flows.forEach((f) => {
    const dir = f.direction === "BUY" ? 1 : f.direction === "SELL" ? -1 : 0;
    const w = ((f.intensity || 50) * (f.impact || 50)) / 10000;
    flowVote += dir * w;
    flowWeight += w;
  });
  const flowScore = flowWeight > 0 ? flowVote / flowWeight : 0; // -1..+1

  // Sentiment composite (-100..+100) → -1..+1
  const sentScore = ((sent.compositeScore ?? 0) as number) / 100;

  // Causal: bull - bear probability from scenario tree
  let causalScore = 0;
  const tree = input.causal?.scenario_tree || [];
  if (Array.isArray(tree) && tree.length > 0) {
    const bull = tree.find((t: any) => /bull/i.test(t.label))?.probability ?? 0;
    const bear = tree.find((t: any) => /bear|tail/i.test(t.label))?.probability ?? 0;
    causalScore = bull - bear;
  }

  // Composite belief direction
  const direction = flowScore * 0.45 + sentScore * 0.35 + causalScore * 0.20;
  const label =
    direction > 0.35 ? "STRONGLY BULLISH" :
    direction > 0.10 ? "BULLISH" :
    direction < -0.35 ? "STRONGLY BEARISH" :
    direction < -0.10 ? "BEARISH" : "MIXED";

  return {
    direction: Math.round(direction * 100), // -100..+100
    label,
    components: {
      flow: Math.round(flowScore * 100),
      sentiment: Math.round(sentScore * 100),
      causal: Math.round(causalScore * 100),
    },
  };
}

/** Conviction = how aligned the signals are with each other (low std = high conviction). */
function deriveConviction(consensus: ReturnType<typeof deriveConsensus>) {
  const c = consensus.components;
  const vals = [c.flow, c.sentiment, c.causal];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
  const std = Math.sqrt(variance);
  // std ranges 0..~100. Conviction inverse-maps: low std = high conviction.
  const conviction = Math.max(0, Math.min(100, Math.round(100 - std)));
  return {
    score: conviction,
    label:
      conviction > 75 ? "HIGH CONVICTION" :
      conviction > 50 ? "MODERATE" :
      conviction > 25 ? "WEAK" : "FRAGILE",
    spread: Math.round(std),
  };
}

/** Contradictions = pairs of signals pointing opposite ways. */
function deriveContradictions(consensus: ReturnType<typeof deriveConsensus>, input: BeliefInput) {
  const c = consensus.components;
  const out: { pair: string; gap: number; description: string }[] = [];

  const pairs: [string, string, number, number][] = [
    ["Flow", "Sentiment", c.flow, c.sentiment],
    ["Flow", "Causal", c.flow, c.causal],
    ["Sentiment", "Causal", c.sentiment, c.causal],
  ];

  pairs.forEach(([a, b, va, vb]) => {
    const gap = Math.abs(va - vb);
    if (gap >= 40 && Math.sign(va) !== Math.sign(vb) && va !== 0 && vb !== 0) {
      out.push({
        pair: `${a} ↔ ${b}`,
        gap: Math.round(gap),
        description: `${a} is ${va > 0 ? "bullish" : "bearish"} (${va}) while ${b} is ${vb > 0 ? "bullish" : "bearish"} (${vb}). The market believes one thing about itself but is positioned for another.`,
      });
    }
  });

  // VIX vs sentiment: complacency check
  if (typeof input.vix === "number" && input.sentiment) {
    if (input.vix < 15 && c.sentiment < -20) {
      out.push({
        pair: "VIX ↔ Sentiment",
        gap: Math.abs(c.sentiment) + (15 - input.vix) * 5,
        description: `VIX at ${input.vix.toFixed(1)} signals complacency, but narrative sentiment is ${c.sentiment}. Market is priced for calm while the story is turning sour.`,
      });
    }
    if (input.vix > 28 && c.sentiment > 20) {
      out.push({
        pair: "VIX ↔ Sentiment",
        gap: Math.abs(c.sentiment) + (input.vix - 28) * 5,
        description: `VIX at ${input.vix.toFixed(1)} screams fear, but sentiment composite is bullish at ${c.sentiment}. Hedging demand contradicts the public mood.`,
      });
    }
  }

  return out.sort((a, b) => b.gap - a.gap);
}

/** Shift ETA — expected time until belief breaks, derived from contradiction magnitude. */
function deriveShiftETA(
  conviction: ReturnType<typeof deriveConviction>,
  contradictions: ReturnType<typeof deriveContradictions>,
  vix: number | undefined,
) {
  const maxGap = contradictions[0]?.gap || 0;
  // Higher gap + lower conviction + higher VIX = sooner shift.
  const vixFactor = vix ? Math.min(2, vix / 20) : 1;
  const pressure = (maxGap / 100) * (1 - conviction.score / 100) * vixFactor;
  const probability = Math.max(0, Math.min(95, Math.round(pressure * 120)));

  let window = "Stable";
  if (probability > 70) window = "0–48 hours";
  else if (probability > 50) window = "2–5 days";
  else if (probability > 30) window = "1–2 weeks";
  else if (probability > 15) window = "2–4 weeks";

  return {
    probability,
    window,
    pressure: Math.round(pressure * 100),
    label:
      probability > 70 ? "IMMINENT SHIFT" :
      probability > 50 ? "ELEVATED RISK" :
      probability > 30 ? "BUILDING" :
      probability > 15 ? "WATCH" : "STABLE",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const input: BeliefInput = await req.json().catch(() => ({}));

    const consensus = deriveConsensus(input);
    const conviction = deriveConviction(consensus);
    const contradictions = deriveContradictions(consensus, input);
    const shiftETA = deriveShiftETA(conviction, contradictions, input.vix);

    // AI narrative layer — interprets the deterministic math into a Soros-voice thesis.
    // The math above is real and complete; the AI only adds the narrative interpretation.
    // If the AI provider fails (rate limit, timeout, parse failure), we return the math
    // with thesis=null so the panel surfaces real signal instead of crashing the whole module.
    let thesis: string | null = null;
    let actionable: { trigger: string; trade: string; risk: string } | null = null;
    let aiError: string | null = null;
    try {
      const ai = await callAI({
        systemPrompt:
          "You are a reflexivity strategist in the Soros tradition. You analyze belief about belief. You never predict price. You identify where market consensus is internally contradicted and when belief is about to break. Return ONLY valid JSON.",
        userPrompt: `Belief map:
- Consensus: ${consensus.label} (${consensus.direction})
- Components — Flow: ${consensus.components.flow}, Sentiment: ${consensus.components.sentiment}, Causal: ${consensus.components.causal}
- Conviction: ${conviction.label} (${conviction.score}, spread ${conviction.spread})
- Top contradictions: ${contradictions.slice(0, 3).map((c) => c.pair + " gap " + c.gap).join("; ") || "none"}
- Shift ETA: ${shiftETA.label} (${shiftETA.probability}% in ${shiftETA.window})
- VIX: ${input.vix ?? "n/a"}, Regime: ${input.regime ?? "n/a"}

Return JSON: { "thesis": "<2-3 sentences in Soros voice — what the market believes the market believes, and where that belief is wrong>", "actionable": { "trigger": "<specific observable event that confirms the belief is breaking>", "trade": "<directional asymmetric position to express the contradiction>", "risk": "<what would invalidate the thesis>" } }`,
        temperature: 0.4,
        maxTokens: 700,
      });
      const parsed = safeParseJSON(ai.text);
      if (parsed?.thesis && typeof parsed.thesis === "string") {
        thesis = parsed.thesis;
        actionable = parsed.actionable && typeof parsed.actionable === "object"
          ? {
              trigger: String(parsed.actionable.trigger || ""),
              trade: String(parsed.actionable.trade || ""),
              risk: String(parsed.actionable.risk || ""),
            }
          : null;
      } else {
        aiError = "AI returned no thesis";
      }
    } catch (e: any) {
      aiError = e?.message || "AI narrative unavailable";
      console.warn("Reflexivity narrative skipped:", aiError);
    }

    return new Response(
      JSON.stringify({
        consensus,
        conviction,
        contradictions,
        shiftETA,
        thesis,
        actionable,
        signalCount: [
          input.flows?.length ? 1 : 0,
          input.sentiment ? 1 : 0,
          input.causal?.scenario_tree?.length ? 1 : 0,
        ].reduce((a, b) => a + b, 0),
        timestamp: new Date().toISOString(),
      }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=21600, s-maxage=21600"
        } 
      },
    );
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Reflexivity engine error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Reflexivity computation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
