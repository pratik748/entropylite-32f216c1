import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Lovable EntropyLite Geo Pipeline)";
const NEWSDATA_KEY = Deno.env.get("NEWSDATA_API_KEY") || "";

interface RawHeadline {
  title: string;
  source: string;
  url: string;
  ts: number; // unix ms
  place?: string;
  lang?: string;
}

// ── 1. GDELT (free, ~15-min lag, global coverage) ──────────────
async function fetchGDELT(): Promise<RawHeadline[]> {
  try {
    const q = encodeURIComponent("(conflict OR war OR sanctions OR tariff OR strike OR attack OR crisis OR central bank) sourcelang:eng");
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=40&format=json&sort=datedesc&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    const items = data?.articles || [];
    return items.map((a: any) => ({
      title: a.title,
      source: a.domain || "GDELT",
      url: a.url,
      // GDELT seendate format: "20241115T123000Z"
      ts: parseGDELTDate(a.seendate) || Date.now(),
      place: a.sourcecountry,
      lang: "en",
    })).filter((h: RawHeadline) => h.title);
  } catch { return []; }
}

function parseGDELTDate(s: string): number | null {
  if (!s || s.length < 15) return null;
  // 20241115T123000Z → 2024-11-15T12:30:00Z
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`;
  const t = Date.parse(iso);
  return isNaN(t) ? null : t;
}

// ── 2. NewsData.io (free key already present) ──────────────────
async function fetchNewsData(): Promise<RawHeadline[]> {
  if (!NEWSDATA_KEY) return [];
  try {
    const url = `https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&category=world,politics,business&language=en&size=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results || []).map((r: any) => ({
      title: r.title,
      source: r.source_id || "NewsData",
      url: r.link,
      ts: r.pubDate ? Date.parse(r.pubDate) : Date.now(),
      place: (r.country || [])[0],
      lang: r.language || "en",
    })).filter((h: RawHeadline) => h.title);
  } catch { return []; }
}

// ── 3. Reuters / AP via Google News RSS (no Bloomberg-claim) ───
async function fetchRSS(): Promise<RawHeadline[]> {
  const feeds = [
    { url: "https://news.google.com/rss/search?q=when:1d+(conflict+OR+sanctions+OR+military+OR+strike+OR+%22central+bank%22)&hl=en&gl=US&ceid=US:en", name: "GoogleNews" },
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml", name: "BBC World" },
    { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera" },
  ];
  const out: RawHeadline[] = [];
  await Promise.all(feeds.map(async (f) => {
    try {
      const res = await fetch(f.url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
      if (!res.ok) return;
      const xml = await res.text();
      const items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
      for (const it of items.slice(0, 12)) {
        const title = (it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1]?.trim();
        const link = (it.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/) || [])[1]?.trim();
        const pub = (it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]?.trim();
        if (!title) continue;
        out.push({
          title,
          source: f.name,
          url: link || "",
          ts: pub ? Date.parse(pub) : Date.now(),
          lang: "en",
        });
      }
    } catch { /* skip feed */ }
  }));
  return out;
}

// ── Dedupe + age filter ────────────────────────────────────────
function hashId(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}
function dedupe(items: RawHeadline[]): RawHeadline[] {
  const seen = new Map<string, RawHeadline>();
  for (const it of items) {
    const key = normalizeTitle(it.title).slice(0, 80);
    if (!key) continue;
    const existing = seen.get(key);
    if (!existing || it.ts > existing.ts) seen.set(key, it);
  }
  return Array.from(seen.values());
}

// ── AI scoring + structuring ──────────────────────────────────
async function scoreEvents(headlines: RawHeadline[]): Promise<any[]> {
  if (headlines.length === 0) return [];
  const top = headlines.slice(0, 35);
  const lines = top.map((h, i) => `${i + 1}. [${h.source}] ${h.title}${h.place ? ` (${h.place})` : ""}`).join("\n");

  try {
    const result = await callAI({
      provider: "gemini",
      systemPrompt: `You are the geopolitical event router for an institutional trading desk. For each headline, decide:
- category: military | economic | political | supply_chain | cyber
- severity (0-1): kinetic activity, casualties, or systemic stress
- market_relevance (0-1): how directly it moves equities, FX, commodities or rates
- velocity (0-1): how fast the story is spreading right now (peak news cycle = 1)
- confidence (0-1): your certainty in the structured output
- loc: best-guess { lat, lng, place } for the EVENT, not the publisher
- entities: { countries: ISO names, tickers: real symbols (NSE/NYSE/etc), commodities: oil|gold|wheat|nat_gas|copper|... }

Skip filler/celebrity/sports headlines (mark them with severity:0 — caller will drop). Be terse. Return ONLY JSON.`,
      userPrompt: `Score these ${top.length} headlines. Return:
{"events":[{"idx":1,"category":"...","severity":0.0,"market_relevance":0.0,"velocity":0.0,"confidence":0.0,"loc":{"lat":0,"lng":0,"place":"..."},"entities":{"countries":[],"tickers":[],"commodities":[]}}]}

HEADLINES:
${lines}`,
      maxTokens: 4500,
      temperature: 0.2,
      jsonMode: true,
    });
    const parsed = safeParseJSON(result.text);
    const scored = parsed?.events || [];
    const byIdx = new Map<number, any>();
    for (const s of scored) if (s?.idx) byIdx.set(s.idx, s);

    const out: any[] = [];
    top.forEach((h, i) => {
      const s = byIdx.get(i + 1);
      if (!s || s.severity === 0) return;
      out.push({
        id: hashId(`${h.url || h.title}-${Math.floor(h.ts / 60000)}`),
        title: h.title,
        source: h.source,
        url: h.url,
        ts: h.ts,
        loc: s.loc && typeof s.loc.lat === "number" ? s.loc : { lat: 0, lng: 0, place: h.place || "" },
        category: ["military","economic","political","supply_chain","cyber"].includes(s.category) ? s.category : "political",
        severity: clamp01(s.severity),
        market_relevance: clamp01(s.market_relevance),
        velocity: clamp01(s.velocity),
        confidence: clamp01(s.confidence ?? 0.5),
        entities: s.entities || { countries: [], tickers: [], commodities: [] },
      });
    });
    return out;
  } catch (e) {
    console.error("scoreEvents AI error:", e);
    return [];
  }
}

function clamp01(n: any): number {
  const x = Number(n);
  if (!isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);

    const t0 = Date.now();
    const [g, n, r] = await Promise.all([fetchGDELT(), fetchNewsData(), fetchRSS()]);
    const merged = dedupe([...g, ...n, ...r]);

    // Drop anything older than 12h — feed must feel live
    const fresh = merged.filter(h => Date.now() - h.ts < 12 * 60 * 60 * 1000);
    fresh.sort((a, b) => b.ts - a.ts);

    const events = await scoreEvents(fresh);

    return new Response(JSON.stringify({
      events,
      lastTick: Date.now(),
      sources: { gdelt: g.length, newsdata: n.length, rss: r.length },
      latencyMs: Date.now() - t0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    console.error("geo-events error:", e);
    return new Response(JSON.stringify({ events: [], lastTick: Date.now(), error: e?.message || "failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});