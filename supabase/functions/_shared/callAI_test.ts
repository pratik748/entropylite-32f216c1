import "https://deno.land/std@0.224.0/dotenv/load.ts";

const apiKey = Deno.env.get("ONEMIN_AI_API_KEY")!;

async function probe(label: string, url: string, headers: Record<string,string>, body: any) {
  try {
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const txt = await r.text();
    console.log(`[${label}] ${r.status}: ${txt.slice(0, 300)}`);
  } catch (e) { console.log(`[${label}] ERR ${(e as Error).message}`); }
}

Deno.test("probe 1min.ai endpoints", async () => {
  // Discover endpoints
  for (const path of ["/api/features", "/api/models", "/api/account", "/api/features/types"]) {
    try {
      const r = await fetch(`https://api.1min.ai${path}`, { headers: { "API-KEY": apiKey } });
      const t = await r.text();
      console.log(`GET ${path} → ${r.status}: ${t.slice(0, 400)}`);
    } catch (e) { console.log(`GET ${path} ERR ${(e as Error).message}`); }
  }
});