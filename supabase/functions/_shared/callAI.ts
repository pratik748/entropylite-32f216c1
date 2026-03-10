/**
 * AI caller — OpenRouter with NVIDIA Nemotron 3 Nano 30B A3B.
 * Primary reasoning engine for Entropy Lite market intelligence.
 * Includes automatic JSON repair for truncated responses.
 */

const NEMOTRON_MODEL = "nvidia/nemotron-3-nano-30b-a3b:free";
const MAX_RETRIES = 2;

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
  preferredProvider?: string; // ignored, kept for compatibility
}

interface AIResult {
  text: string;
  provider: "openrouter";
  toolCall?: any;
}

/**
 * Attempt to repair truncated JSON by closing open brackets/braces/strings.
 */
function repairJSON(raw: string): string {
  let s = raw.trim();
  // Strip markdown fences
  s = s.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  s = s.trim();
  if (!s) return "{}";

  // Try parsing as-is first
  try { JSON.parse(s); return s; } catch { /* needs repair */ }

  // Remove trailing comma before repair
  s = s.replace(/,\s*$/, "");

  // Track open structures
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === "\\") { escape = true; continue; }
    if (c === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") stack.pop();
  }

  // Close open string
  if (inString) s += '"';

  // Remove trailing incomplete key-value patterns
  s = s.replace(/,\s*"[^"]*"?\s*:?\s*$/, "");
  s = s.replace(/,\s*$/, "");

  // Close all open brackets/braces
  while (stack.length > 0) {
    s += stack.pop();
  }

  // Final validation
  try { JSON.parse(s); return s; } catch {
    // Last resort: try to extract first complete JSON object
    const objMatch = s.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { JSON.parse(objMatch[0]); return objMatch[0]; } catch { /* fall through */ }
    }
    return s;
  }
}

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  const key = Deno.env.get("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY not set");

  const model = opts.model || NEMOTRON_MODEL;

  // Enforce strict JSON output in system prompt for Nemotron
  const jsonEnforcedSystem = opts.systemPrompt + 
    "\n\nCRITICAL OUTPUT RULES: Output ONLY valid JSON. No explanations or text outside JSON. Ensure all brackets, commas, and quotes are properly closed. If data is unavailable, return null. Keep responses compact — omit unnecessary whitespace.";

  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: any = {
        model,
        messages: [
          { role: "system", content: jsonEnforcedSystem },
          { role: "user", content: opts.userPrompt },
        ],
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 4000,
      };

      if (opts.tools) {
        body.tools = opts.tools;
        if (opts.toolChoice) body.tool_choice = opts.toolChoice;
      }

      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://entropylite.lovable.app",
          "X-Title": "Entropy",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.text();
        console.error(`OpenRouter error ${res.status} (attempt ${attempt + 1}):`, errBody.slice(0, 300));
        if (res.status === 429) {
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
            continue;
          }
          throw { status: 429, message: "Rate limited, please try again shortly", provider: "openrouter" };
        }
        if (res.status === 402) {
          throw { status: 402, message: "Credits exhausted", provider: "openrouter" };
        }
        throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 200)}`);
      }

      const data = await res.json();

      // Handle tool calls
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall) {
        const args = toolCall.function.arguments;
        // Attempt repair on tool call arguments too
        const repairedArgs = repairJSON(args);
        return { text: repairedArgs, provider: "openrouter", toolCall };
      }

      const raw = data.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        if (attempt < MAX_RETRIES) {
          console.warn(`Empty AI response (attempt ${attempt + 1}), retrying...`);
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
        throw new Error("Empty AI response after retries");
      }

      // Repair and validate JSON
      const repaired = repairJSON(raw);
      
      // Validate the repaired JSON parses
      try {
        JSON.parse(repaired);
      } catch (parseErr) {
        console.warn(`JSON repair failed (attempt ${attempt + 1}):`, (parseErr as Error).message);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
          continue;
        }
      }

      return { text: repaired, provider: "openrouter" };
    } catch (err) {
      lastError = err;
      // Don't retry on auth/payment errors
      if (err && typeof err === "object" && "status" in err && (err.status === 402 || err.status === 429)) {
        throw err;
      }
      if (attempt < MAX_RETRIES) {
        console.warn(`callAI attempt ${attempt + 1} failed, retrying:`, (err as Error).message || err);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error("AI call failed after retries");
}
