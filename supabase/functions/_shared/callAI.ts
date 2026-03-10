/**
 * AI caller — NVIDIA Qwen 3.5-122B only, with retry + exponential backoff.
 */

interface CallAIOptions {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  tools?: any[];
  toolChoice?: any;
  model?: string;
}

interface AIResult {
  text: string;
  provider: "nvidia";
  toolCall?: any;
}

function stripThinkingBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function callNvidia(opts: CallAIOptions): Promise<AIResult> {
  const key = Deno.env.get("NVIDIA_API_KEY");
  if (!key) throw new Error("NVIDIA_API_KEY not set");

  const body: any = {
    model: opts.model || "qwen/qwen3.5-122b-a10b",
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userPrompt },
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 16384,
    top_p: 0.95,
  };

  if (opts.tools) {
    body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  }

  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error(`NVIDIA error ${res.status}:`, errBody.slice(0, 300));
    throw { status: res.status, message: `NVIDIA ${res.status}: ${errBody.slice(0, 200)}` };
  }

  const data = await res.json();

  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall) {
    return { text: toolCall.function.arguments, provider: "nvidia", toolCall };
  }

  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Empty NVIDIA response");
  // Strip any residual thinking blocks and markdown fences
  let text = stripThinkingBlocks(raw);
  text = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
  return { text, provider: "nvidia" };
}

const RETRY_DELAYS = [0, 1000, 3000];

export async function callAI(opts: CallAIOptions): Promise<AIResult> {
  let lastError: any;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (RETRY_DELAYS[attempt] > 0) {
      console.log(`callAI → retry #${attempt} after ${RETRY_DELAYS[attempt]}ms`);
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }

    try {
      console.log(`callAI → attempt ${attempt + 1}`);
      const result = await callNvidia(opts);
      console.log(`callAI → success on attempt ${attempt + 1}`);
      return result;
    } catch (err: any) {
      lastError = err;
      console.error(`callAI → attempt ${attempt + 1} failed:`, err.message || err);

      if (err.status === 401 || err.status === 402) {
        throw new Error(`NVIDIA auth/credits error (${err.status}): ${err.message}`);
      }

      if (err.status === 429 || (err.status >= 500 && err.status < 600)) {
        continue;
      }

      throw err;
    }
  }

  throw lastError;
}
