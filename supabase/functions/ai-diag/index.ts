// Temporary diagnostic: test Google "AQ."-format key auth styles + list models.
// Returns REDACTED results only.
import { getManagedSnapshot, refreshManagedKeys } from "../_shared/managedKeys.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  await refreshManagedKeys(true);
  const managed = getManagedSnapshot();
  const report: any = { keys: [] };

  for (const [name, value] of Object.entries(managed)) {
    const v = String(value || "").trim();
    if (!name || !v || !v.startsWith("AQ.")) continue;

    const styles: any = {};
    const listUrl = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200";

    // 1. key= query param
    try {
      const r = await fetch(`${listUrl}&key=${v}`);
      styles.queryParam = { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e: any) { styles.queryParam = { error: String(e?.message || e) }; }

    // 2. Authorization: Bearer
    try {
      const r = await fetch(listUrl, { headers: { Authorization: `Bearer ${v}` } });
      styles.bearer = { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e: any) { styles.bearer = { error: String(e?.message || e) }; }

    // 3. x-goog-api-key header
    try {
      const r = await fetch(listUrl, { headers: { "x-goog-api-key": v } });
      styles.xGoogApiKey = { status: r.status, body: (await r.text()).slice(0, 200) };
    } catch (e: any) { styles.xGoogApiKey = { error: String(e?.message || e) }; }

    const item: any = { name, styles };

    // If any style works, list usable models and try a real generation.
    const okStyle = Object.entries(styles).find(([_, s]: any) => s.status === 200);
    if (okStyle) {
      item.workingAuth = okStyle[0];
      const [styleName] = okStyle;
      const headers: Record<string, string> =
        styleName === "bearer" ? { Authorization: `Bearer ${v}` } :
        styleName === "xGoogApiKey" ? { "x-goog-api-key": v } : {};
      const finalUrl = styleName === "queryParam" ? `${listUrl}&key=${v}` : listUrl;
      const data = JSON.parse((await (await fetch(finalUrl, { headers })).text()));
      const usable = (data.models || [])
        .filter((m: any) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m: any) => m.name.replace("models/", ""));
      item.generateContentModels = usable;
      const pick = usable.filter((m: string) => /flash/.test(m)).sort().reverse()[0] || usable[0];
      if (pick) {
        const t0 = Date.now();
        const cres = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${pick}:generateContent`, {
          method: "POST", headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "Reply with the single word OK." }] }], generationConfig: { maxOutputTokens: 8, temperature: 0 } }),
        });
        const ctext = await cres.text();
        item.testModel = pick;
        item.testStatus = cres.status;
        item.testLatencyMs = Date.now() - t0;
        item.testBody = ctext.slice(0, 240);
      }
    }
    report.keys.push(item);
  }

  return new Response(JSON.stringify(report, null, 2), { headers: cors });
});
