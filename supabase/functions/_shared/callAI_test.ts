import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Force only the 1min lane to verify it works end-to-end.
Deno.env.delete("MISTRAL_API_KEY");
Deno.env.delete("MISTRAL_API_KEY_2");

const { callAI } = await import("./callAI.ts");

Deno.test("1min.ai lane returns text", async () => {
  const r = await callAI({
    systemPrompt: "Reply with the single word: pong",
    userPrompt: "ping",
    maxTokens: 20,
    temperature: 0,
    skipHardening: true,
  });
  console.log("1min.ai response:", r.text);
  assert(r.text && r.text.length > 0, "expected non-empty text");
});