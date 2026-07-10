/**
 * Research memory tools — recall what Foresight previously concluded.
 * Findings are written automatically by the runtime after substantive runs;
 * these tools let the planner read them back ("what did we conclude about
 * Tata Motors last week?") and let the analyst save explicit notes.
 */

import { registerTool } from "../registry";
import { recentMemory, rememberFinding, searchMemory } from "../memory";

registerTool({
  name: "memory.search",
  description: "Search Foresight's persistent research memory for prior findings about an entity or topic. Returns dated findings with their supporting facts.",
  category: "memory",
  permission: "read",
  keywords: ["remember", "recall", "previous", "last time", "concluded", "history"],
  parameters: {
    query: { type: "string", required: true },
  },
  execute: async (params) => {
    const hits = searchMemory(params.query as string);
    return {
      data: hits.map((h) => ({
        when: new Date(h.createdAt).toISOString().slice(0, 10),
        entities: h.entities,
        finding: h.text,
        facts: (h.facts || []).map((f) => `${f.label} = ${f.value}${f.unit || ""} (${f.tool})`),
      })),
      source: "foresight-memory",
      caveats: hits.length === 0 ? ["no stored findings matched"] : undefined,
    };
  },
});

registerTool({
  name: "memory.recent",
  description: "List the most recent stored research findings.",
  category: "memory",
  permission: "read",
  keywords: ["recent findings", "research log", "what have we done"],
  parameters: {},
  execute: async () => {
    const items = recentMemory();
    return {
      data: items.map((h) => ({
        when: new Date(h.createdAt).toISOString().slice(0, 10),
        entities: h.entities,
        finding: h.text.slice(0, 300),
      })),
      source: "foresight-memory",
    };
  },
});

registerTool({
  name: "memory.note",
  description: "Save an explicit analyst note or thesis into research memory for later recall.",
  category: "memory",
  permission: "read",
  keywords: ["note", "save", "thesis", "remember this"],
  parameters: {
    text: { type: "string", required: true, maxLength: 1000 },
    entities: { type: "array", items: { type: "string" }, description: "Related tickers/topics" },
  },
  execute: async (params) => {
    const rec = rememberFinding({
      kind: "note",
      entities: (params.entities as string[]) || [],
      text: params.text as string,
    });
    return { data: { saved: rec.id }, source: "foresight-memory" };
  },
});
