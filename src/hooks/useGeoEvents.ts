import { useCallback, useEffect, useRef, useState } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

export interface GeoEvent {
  id: string;
  title: string;
  source: string;
  url: string;
  ts: number;
  loc: { lat: number; lng: number; place: string };
  category: "military" | "economic" | "political" | "supply_chain" | "cyber";
  severity: number;
  market_relevance: number;
  velocity: number;
  confidence: number;
  entities: { countries: string[]; tickers: string[]; commodities: string[] };
}

export interface ScoredGeoEvent extends GeoEvent {
  decayedScore: number;
  ageMin: number;
}

const POLL_MS = 60_000;
const HALF_LIFE_MIN = 90; // event score halves every 90 minutes
const MIN_DECAYED = 0.08;

function decayed(e: GeoEvent): ScoredGeoEvent {
  const ageMin = Math.max(0, (Date.now() - e.ts) / 60000);
  const base = 0.4 * e.severity + 0.4 * e.market_relevance + 0.2 * e.velocity;
  const decayedScore = base * Math.exp(-Math.LN2 * (ageMin / HALF_LIFE_MIN));
  return { ...e, ageMin, decayedScore };
}

// ── Lightweight client-side classifier (no AI hop) ────────────────
// We mirror the same articles the user sees in LiveNewsFeed, so taps
// route into the causal-cascade flow instead of opening the source URL.
const MIL = /\b(strike|attack|war|missile|troop|military|killed|airstrike|ceasefire|invasion|drone|conflict)\b/i;
const SUPPLY = /\b(supply chain|shipping|port|tanker|opec|chip|semiconductor|export ban|tariff|sanction)\b/i;
const CYBER = /\b(cyber|hack|breach|ransomware|outage|exploit)\b/i;
const ECON = /\b(inflation|cpi|fed|rate|gdp|earnings|guidance|jobs|unemployment|yield|treasury)\b/i;

function classify(title: string): GeoEvent["category"] {
  if (MIL.test(title)) return "military";
  if (SUPPLY.test(title)) return "supply_chain";
  if (CYBER.test(title)) return "cyber";
  if (ECON.test(title)) return "economic";
  return "political";
}

const TICKER_RE = /\$([A-Z]{1,5})\b|\b([A-Z]{2,5})\.(?:NS|BO|L|HK|T|DE|PA|F|SS|SZ)\b/g;
function extractTickers(s: string): string[] {
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = TICKER_RE.exec(s)) !== null) out.add((m[1] || m[2] || "").toUpperCase());
  return Array.from(out).slice(0, 5);
}

const COUNTRY_RE = /\b(US|U\.S\.|United States|China|Russia|Ukraine|Israel|Iran|India|Japan|Germany|UK|France|Saudi|Taiwan|Korea)\b/gi;
function extractCountries(s: string): string[] {
  const found = (s.match(COUNTRY_RE) || []).map((c) => c.replace(/\./g, ""));
  return Array.from(new Set(found)).slice(0, 5);
}

const COMMODITY_RE = /\b(oil|crude|brent|wti|gold|silver|copper|gas|wheat|corn|uranium|lithium)\b/gi;
function extractCommodities(s: string): string[] {
  return Array.from(new Set((s.match(COMMODITY_RE) || []).map((c) => c.toLowerCase()))).slice(0, 4);
}

const PLACE_COORDS: Array<{ pattern: RegExp; lat: number; lng: number; place: string }> = [
  { pattern: /\bukraine|kyiv|kiev\b/i, lat: 50.4501, lng: 30.5234, place: "Ukraine" },
  { pattern: /\brussia|moscow\b/i, lat: 55.7558, lng: 37.6173, place: "Russia" },
  { pattern: /\bisrael|gaza|tel aviv|jerusalem\b/i, lat: 31.7683, lng: 35.2137, place: "Israel / Gaza" },
  { pattern: /\biran|tehran\b/i, lat: 35.6892, lng: 51.389, place: "Iran" },
  { pattern: /\bchina|beijing\b/i, lat: 39.9042, lng: 116.4074, place: "China" },
  { pattern: /\btaiwan|taipei\b/i, lat: 25.033, lng: 121.5654, place: "Taiwan" },
  { pattern: /\bindia|new delhi|mumbai\b/i, lat: 28.6139, lng: 77.209, place: "India" },
  { pattern: /\bpakistan|islamabad\b/i, lat: 33.6844, lng: 73.0479, place: "Pakistan" },
  { pattern: /\bsaudi|riyadh\b/i, lat: 24.7136, lng: 46.6753, place: "Saudi Arabia" },
  { pattern: /\bred sea|suez|yemen\b/i, lat: 15.3694, lng: 44.191, place: "Red Sea / Yemen" },
  { pattern: /\beurope|brussels|berlin|paris\b/i, lat: 50.8503, lng: 4.3517, place: "Europe" },
  { pattern: /\bunited states|u\.s\.|us |washington|new york\b/i, lat: 38.9072, lng: -77.0369, place: "United States" },
  { pattern: /\bjapan|tokyo\b/i, lat: 35.6762, lng: 139.6503, place: "Japan" },
];

function inferLocation(text: string): GeoEvent["loc"] | null {
  for (const candidate of PLACE_COORDS) {
    if (candidate.pattern.test(text)) {
      return { lat: candidate.lat, lng: candidate.lng, place: candidate.place };
    }
  }
  return null;
}

function scoreFor(title: string, sourceTier: number, category: GeoEvent["category"]): {
  severity: number; market_relevance: number; velocity: number; confidence: number;
} {
  const lower = title.toLowerCase();
  let severity = 0.35;
  if (category === "military") severity = 0.75;
  else if (category === "supply_chain") severity = 0.6;
  else if (category === "cyber") severity = 0.55;
  else if (category === "economic") severity = 0.5;
  if (/\b(crash|surge|plunge|record|breaking|crisis|war|emergency)\b/.test(lower)) severity = Math.min(0.95, severity + 0.15);

  const market_relevance = category === "economic" ? 0.8 : category === "supply_chain" ? 0.7 : 0.5;
  const velocity = sourceTier <= 2 ? 0.7 : 0.5;
  const confidence = sourceTier === 1 ? 0.9 : sourceTier === 2 ? 0.78 : 0.65;
  return { severity, market_relevance, velocity, confidence };
}

interface NewsArticle {
  title: string;
  description?: string | null;
  link: string;
  source: string;
  pubDate?: string;
  sourceTier?: number;
}

function articleToEvent(a: NewsArticle): GeoEvent | null {
  if (!a.title) return null;
  const ts = a.pubDate ? Date.parse(a.pubDate) : Date.now();
  if (!Number.isFinite(ts)) return null;
  const cat = classify(a.title);
  const tier = a.sourceTier || 4;
  const s = scoreFor(a.title, tier, cat);
  const id = `${a.source}-${a.link || a.title}`.slice(0, 200);
  const text = `${a.title} ${a.description || ""}`;
  // Best-effort location. If nothing matches, default to a neutral
  // "Global" point near the equator so the article still shows on the
  // wire (it just won't add a misleading marker on the map clusters).
  const inferredLoc = inferLocation(text) ?? { lat: 0, lng: 0, place: "Global" };

  return {
    id,
    title: a.title,
    source: a.source,
    url: a.link,
    ts,
    loc: inferredLoc,
    category: cat,
    ...s,
    entities: {
      countries: extractCountries(text),
      tickers: extractTickers(text),
      commodities: extractCommodities(text),
    },
  };
}

export function useGeoEvents() {
  const [events, setEvents] = useState<ScoredGeoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastTick, setLastTick] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventsRef = useRef<Map<string, GeoEvent>>(new Map());

  const recompute = useCallback(() => {
    const arr: ScoredGeoEvent[] = [];
    for (const e of eventsRef.current.values()) {
      const s = decayed(e);
      if (s.decayedScore >= MIN_DECAYED) arr.push(s);
    }
    arr.sort((a, b) => b.decayedScore - a.decayedScore);
    setEvents(arr);
  }, []);

  const fetchOnce = useCallback(async () => {
    try {
      // Mirror the same multi-source live news feed users see in LiveNewsFeed,
      // so the wire is consistent and we skip an extra AI hop.
      const { data, error: err } = await governedInvoke<{ articles: NewsArticle[] }>(
        "fetch-news",
        { tier: "slow", body: { ticker: "", category: "business", region: "All" } },
      );
      if (err) throw err;
      const articles: NewsArticle[] = data?.articles || [];
      const incoming: GeoEvent[] = articles
        .map(articleToEvent)
        .filter((e): e is GeoEvent => e !== null);
      // Merge: new events overwrite, old events stay until they decay out
      for (const e of incoming) eventsRef.current.set(e.id, e);
      // Trim store to keep memory bounded
      if (eventsRef.current.size > 250) {
        const sorted = Array.from(eventsRef.current.values()).sort((a, b) => b.ts - a.ts).slice(0, 200);
        eventsRef.current = new Map(sorted.map(e => [e.id, e]));
      }
      setLastTick(Date.now());
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Event feed paused");
    } finally {
      setLoading(false);
      recompute();
    }
  }, [recompute]);

  // Poll
  useEffect(() => {
    fetchOnce();
    const i = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(i);
  }, [fetchOnce]);

  // Recompute decay every 30s so feed visibly ages
  useEffect(() => {
    const i = setInterval(recompute, 30_000);
    return () => clearInterval(i);
  }, [recompute]);

  return { events, loading, lastTick, error, refresh: fetchOnce };
}