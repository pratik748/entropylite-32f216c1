/**
 * Robust JSON parser with repair logic for LLM responses.
 * Handles markdown fences, trailing commas, truncated output, and unbalanced brackets.
 */
export function safeParseJSON(raw: string): any {
  // 1. Try direct parse
  try {
    return JSON.parse(raw);
  } catch { /* continue */ }

  // 2. Strip markdown fences, thinking blocks, and trim
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^Thinking[\s\S]*?\n\s*\n/i, "")
    .replace(/```json?\s*\n?/gi, "")
    .replace(/\n?```\s*$/gi, "")
    .trim();

  // 3. Find JSON boundaries
  const jsonStart = cleaned.search(/[\{\[]/);
  if (jsonStart === -1) throw new Error("No JSON found in AI response");
  cleaned = cleaned.substring(jsonStart);

  // 4. Find matching closing brace/bracket by depth
  let depth = 0, inStr = false, esc = false, endPos = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") depth++;
    if (ch === "}" || ch === "]") { depth--; if (depth === 0) { endPos = i; break; } }
  }
  if (endPos > 0) cleaned = cleaned.substring(0, endPos + 1);

  // 5. Fix common LLM JSON issues
  cleaned = cleaned
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/:\s*\+(\d)/g, ": $1")
    .replace(/:\s*[~≈∼]\s*(\d)/g, ": $1")
    .replace(/:\s*approximately\s+(\d)/gi, ": $1")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    // Fix unquoted property names: { key: → { "key":
    // (Do NOT blindly replace single quotes — that breaks apostrophes in text)
    .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":');

  // 6. Try parse after cleanup
  try {
    return JSON.parse(cleaned);
  } catch { /* continue to deep repair */ }

  // 7. Fix NaN, Infinity, undefined literals that are invalid JSON
  cleaned = cleaned
    .replace(/:\s*NaN\b/g, ": 0")
    .replace(/:\s*Infinity\b/g, ": 999999")
    .replace(/:\s*-Infinity\b/g, ": -999999")
    .replace(/:\s*undefined\b/g, ": null");

  // 8. Try again
  try {
    return JSON.parse(cleaned);
  } catch { /* continue */ }

  // 9. Deep repair: remove trailing incomplete pairs, close unbalanced brackets
  cleaned = cleaned
    .replace(/,\s*"[^"]*"?\s*:?\s*"?[^"]*$/, "")
    .replace(/,\s*$/, "");

  let braces = 0, brackets = 0;
  let s = false, e = false;
  for (let i = 0; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (e) { e = false; continue; }
    if (c === "\\") { e = true; continue; }
    if (c === '"') { s = !s; continue; }
    if (s) continue;
    if (c === "{") braces++;
    if (c === "}") braces--;
    if (c === "[") brackets++;
    if (c === "]") brackets--;
  }
  while (brackets > 0) { cleaned += "]"; brackets--; }
  while (braces > 0) { cleaned += "}"; braces--; }

  try {
    return JSON.parse(cleaned);
  } catch (finalErr) {
    // Last resort: try to extract at least partial data
    console.error("safeParseJSON final failure, attempting line-by-line repair");
    console.error("First 500 chars:", cleaned.slice(0, 500));
    throw finalErr;
  }
}
