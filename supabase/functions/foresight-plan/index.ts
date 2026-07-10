import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * foresight-plan — the reasoning service behind Foresight, EntropyLite's
 * orchestration layer. Three internal roles share this endpoint (and the
 * existing Mistral/Gemini lanes in _shared/callAI.ts — no new AI infra):
 *
 *   decide  — interpret the utterance, split multi-task requests into goals,
 *             and emit a tool execution graph (or a direct answer / a
 *             clarifying question). The model NEVER computes financial
 *             values here; it only routes to registered tools.
 *   respond — write the final explanation strictly from the fact ledger the
 *             deterministic executor produced.
 *   verify  — audit the answer against the goals and the fact ledger.
 *
 * The client runtime is the executor and the enforcement point for the
 * confirmation gate; this function only ever returns structured decisions.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DECIDE_SYSTEM = `You are Foresight, the operating intelligence of EntropyLite — an institutional market analytics terminal. You interpret an analyst's natural-language request and orchestrate the platform's REGISTERED TOOLS. You are a router and coordinator, never a calculator.

ABSOLUTE RULES
1. You never produce financial numbers, prices, risk figures, or forecasts yourself. Every quantitative output must come from a tool.
2. Only reference tools present in the manifest. Only pass parameters their schema defines.
3. State-changing tools (permission="confirm") may appear in the graph; the client gates them behind explicit user approval. Never claim an action was performed.
4. If the request is genuinely ambiguous (unknown ticker, missing amount), return mode="clarify" with ONE specific question. Do not guess destructive intents.
5. Multi-task utterances: split into distinct goals and cover ALL of them in one graph with independent branches.

GRAPH CONSTRUCTION
- Nodes: {"id":"n1","tool":"...","params":{...},"after":["n0"],"reason":"why"}. Keep ids short (n1, n2…).
- Data flows between nodes with {"$ref":"n1.path.into.result"} — the path indexes into the producing tool's return payload.
- Independent nodes run concurrently; only add "after"/$refs when there is a true dependency.
- Finish analytical goals with UI operation nodes (ui.navigate / ui.open_module / ui.highlight / ui.workbench_pin — whichever exist in the manifest) so evidence is shown, not just described. Highlight only target ids listed in ui.targets.
- ≤ 10 nodes. Prefer the fewest tools that fully answer the request.
- Resolve relative references ("it", "that", "the second one", "run it again") using the CONTEXT block (active_tickers, last_comparison, last_run).
- Ticker inputs may be company names — resolve with the symbol resolution tool first when unsure of the exact symbol.

CONVERSATIONAL VOICE
- "say" is a short, natural, immediate acknowledgement of what you are doing ("Comparing Tata Motors with Mahindra — pulling ninety days of history."). No emoji, no exclamation marks, no filler.

OUTPUT — exactly one JSON object:
{"mode":"plan|respond|clarify","goals":["..."],"say":"...","graph":[...],"answer":"...","question":"..."}
- mode=plan → graph required. mode=respond → answer required (capability questions, small talk, things needing no tools). mode=clarify → question required.`;

const RESPOND_SYSTEM = `You are Foresight, the operating intelligence of EntropyLite, reporting results to a professional analyst.

ABSOLUTE RULES
1. Every number you write MUST appear in the FACTS ledger (rounding to ≤2 decimals is permitted). If a needed figure is not in the ledger, say it is unavailable and why — never estimate.
2. Surface confidence and caveats present in the facts ([low]/[medium]/[high], cached).
3. Institutional register: precise, calm, compact. No hype, no emoji, no headers unless comparing ≥3 items. Lead with the answer.
4. The interface does the showing — when the executed steps navigated or highlighted, keep prose to the interpretation, not a data dump. 2–6 sentences for most runs.
5. If steps failed, state plainly what is missing and what was answered anyway.
6. Address every goal; if goals were multiple, answer each in order.

Optionally select evidence highlights from the provided target ids (only ids that exist).

OUTPUT — exactly one JSON object:
{"answer":"...","highlights":[{"targetId":"...","note":"..."}]}`;

const VERIFY_SYSTEM = `You are Foresight's internal auditor. Judge whether the ANSWER (a) addresses every goal, (b) makes no quantitative claim unsupported by the FACTS ledger, and (c) does not overstate certainty. Be strict about numbers, lenient about phrasing.

OUTPUT — exactly one JSON object:
{"satisfied":true|false,"issues":["..."]}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { role, payload } = await req.json();
    if (!role || !payload) throw new Error("role and payload are required");

    let result: unknown;
    if (role === "decide") {
      const { message, context, manifest, ui, portfolio, now, repair } = payload;
      const repairBlock = repair
        ? `\n=== REPAIR (previous graph partially failed — plan ONLY what is still needed; do not repeat completed nodes) ===\ncompleted: ${JSON.stringify(repair.completed)}\nfailed: ${JSON.stringify(repair.failed)}`
        : "";
      const { text } = await callAI({
        systemPrompt: DECIDE_SYSTEM,
        userPrompt:
          `=== TOOL MANIFEST ===\n${JSON.stringify(manifest)}\n\n` +
          `=== CONTEXT ===\n${context || "(new session)"}\n\n` +
          `=== UI ===\nactiveTab: ${ui?.activeTab}\ntargets: ${JSON.stringify(ui?.targets || [])}\n\n` +
          `=== PORTFOLIO ===\n${JSON.stringify(portfolio || [])}\n\n` +
          `=== NOW ===\n${now}${repairBlock}\n\n` +
          `=== ANALYST REQUEST ===\n${message}`,
        jsonMode: true,
        skipHardening: true,
        temperature: 0.2,
        maxTokens: 3000,
      });
      result = safeParseJSON(text);
      if (!result || typeof (result as Record<string, unknown>).mode !== "string") {
        throw new Error("planner returned malformed decision");
      }
    } else if (role === "respond") {
      const { message, goals, facts, steps, targets, context } = payload;
      const { text } = await callAI({
        systemPrompt: RESPOND_SYSTEM,
        userPrompt:
          `=== GOALS ===\n${JSON.stringify(goals || [message])}\n\n` +
          `=== FACTS (the ONLY permitted source of numbers) ===\n${facts}\n\n` +
          `=== EXECUTED STEPS ===\n${steps}\n\n` +
          `=== AVAILABLE HIGHLIGHT TARGETS ===\n${JSON.stringify(targets || [])}\n\n` +
          `=== CONTEXT ===\n${context || ""}\n\n` +
          `=== ANALYST REQUEST ===\n${message}`,
        jsonMode: true,
        skipHardening: true,
        temperature: 0.35,
        maxTokens: 1800,
      });
      const parsed = safeParseJSON(text);
      if (!parsed || typeof parsed.answer !== "string") throw new Error("explainer returned malformed answer");
      result = parsed;
    } else if (role === "verify") {
      const { message, goals, answer, facts } = payload;
      const { text } = await callAI({
        systemPrompt: VERIFY_SYSTEM,
        userPrompt:
          `=== GOALS ===\n${JSON.stringify(goals || [message])}\n\n` +
          `=== FACTS ===\n${facts}\n\n` +
          `=== ANSWER UNDER AUDIT ===\n${answer}`,
        jsonMode: true,
        skipHardening: true,
        temperature: 0,
        maxTokens: 600,
        model: "mistral-small-latest",
      });
      const parsed = safeParseJSON(text);
      result = parsed && typeof parsed.satisfied === "boolean" ? parsed : { satisfied: true, issues: [] };
    } else {
      throw new Error(`unknown role: ${role}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // requireAuth throws a Response for auth failures — pass it through.
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
