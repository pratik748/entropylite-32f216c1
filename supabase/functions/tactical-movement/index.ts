import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AIS_KEY = Deno.env.get("AISSTREAM_API_KEY") || "";
const OS_ID = Deno.env.get("OPENSKY_CLIENT_ID") || "";
const OS_SECRET = Deno.env.get("OPENSKY_CLIENT_SECRET") || "";

// ── Strategic chokepoints (for stress aggregation) ───────────
// Each box is [minLat, minLng, maxLat, maxLng]
const CHOKEPOINTS: { name: string; box: [number, number, number, number]; lat: number; lng: number }[] = [
  { name: "Strait of Hormuz",  box: [25.5,  55.0, 27.5, 57.5], lat: 26.5, lng: 56.3 },
  { name: "Suez Canal",        box: [29.5,  32.0, 31.5, 33.0], lat: 30.5, lng: 32.5 },
  { name: "Bab-el-Mandeb",     box: [11.5,  42.5, 13.5, 44.5], lat: 12.6, lng: 43.4 },
  { name: "Strait of Malacca", box: [ 1.0,  99.0,  6.0,103.5], lat:  3.5, lng:101.0 },
  { name: "Taiwan Strait",     box: [22.0, 117.0, 26.5,121.5], lat: 24.5, lng:119.5 },
  { name: "Bosphorus",         box: [40.9,  28.8, 41.3, 29.3], lat: 41.1, lng: 29.0 },
  { name: "Panama Canal",      box: [ 8.5, -80.2,  9.6,-79.4], lat:  9.1, lng:-79.7 },
  { name: "English Channel",   box: [49.5,  -1.5, 51.5,  2.0], lat: 50.5, lng:  1.0 },
];

interface Ship { mmsi: string; lat: number; lng: number; sog?: number; cog?: number; name?: string; type?: string; ts: number; }
interface Plane { icao24: string; callsign?: string; lat: number; lng: number; alt?: number; vel?: number; heading?: number; origin?: string; ts: number; }

function inBox(lat: number, lng: number, b: [number, number, number, number]): boolean {
  return lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];
}

// ── AIS snapshot via short-lived WebSocket ──────────────────
async function fetchAISSnapshot(): Promise<Ship[]> {
  if (!AIS_KEY) return [];
  return new Promise((resolve) => {
    const ships = new Map<string, Ship>();
    let ws: WebSocket | null = null;
    const closer = setTimeout(() => {
      try { ws?.close(); } catch {}
      resolve(Array.from(ships.values()));
    }, 3500);

    try {
      ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      ws.onopen = () => {
        // Subscribe to PositionReport messages over the chokepoint boxes
        const boxes = CHOKEPOINTS.map(c => [
          [c.box[0], c.box[1]],
          [c.box[2], c.box[3]],
        ]);
        ws!.send(JSON.stringify({
          APIKey: AIS_KEY,
          BoundingBoxes: boxes,
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
        }));
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
          const meta = msg?.MetaData || {};
          const mmsi = String(meta.MMSI || meta.mmsi || "");
          const lat = Number(meta.latitude ?? meta.Latitude);
          const lng = Number(meta.longitude ?? meta.Longitude);
          if (!mmsi || !isFinite(lat) || !isFinite(lng)) return;

          const pos = msg?.Message?.PositionReport;
          const stat = msg?.Message?.ShipStaticData;
          const existing = ships.get(mmsi) || { mmsi, lat, lng, ts: Date.now() };
          existing.lat = lat;
          existing.lng = lng;
          existing.ts = Date.now();
          if (pos) {
            if (typeof pos.Sog === "number") existing.sog = pos.Sog;
            if (typeof pos.Cog === "number") existing.cog = pos.Cog;
          }
          if (stat) {
            if (stat.Name) existing.name = String(stat.Name).trim();
            if (typeof stat.Type === "number") existing.type = mapShipType(stat.Type);
          }
          if (meta.ShipName && !existing.name) existing.name = String(meta.ShipName).trim();
          ships.set(mmsi, existing);

          // Cap collection — chokepoints fill quickly
          if (ships.size > 400) {
            clearTimeout(closer);
            try { ws?.close(); } catch {}
            resolve(Array.from(ships.values()));
          }
        } catch { /* ignore */ }
      };
      ws.onerror = () => { /* swallow — closer will resolve */ };
      ws.onclose = () => {
        clearTimeout(closer);
        resolve(Array.from(ships.values()));
      };
    } catch {
      clearTimeout(closer);
      resolve([]);
    }
  });
}

function mapShipType(code: number): string {
  if (code >= 70 && code <= 79) return "cargo";
  if (code >= 80 && code <= 89) return "tanker";
  if (code >= 60 && code <= 69) return "passenger";
  if (code >= 30 && code <= 39) return "fishing";
  if (code >= 20 && code <= 29) return "wing";
  if (code === 35) return "military";
  return "other";
}

// ── OpenSky OAuth2 token + flights ──────────────────────────
let cachedToken: { token: string; exp: number } | null = null;
async function openSkyToken(): Promise<string | null> {
  if (!OS_ID || !OS_SECRET) return null;
  if (cachedToken && cachedToken.exp > Date.now() + 30_000) return cachedToken.token;
  try {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: OS_ID,
      client_secret: OS_SECRET,
    });
    const r = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(7000),
    });
    if (!r.ok) {
      console.error("opensky token http", r.status);
      return null;
    }
    const j = await r.json();
    cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in || 1800) * 1000 };
    return cachedToken.token;
  } catch (e) {
    console.error("opensky token err", e);
    return null;
  }
}

async function fetchFlightsForBox(b: [number, number, number, number], token: string | null): Promise<Plane[]> {
  const url = `https://opensky-network.org/api/states/all?lamin=${b[0]}&lomin=${b[1]}&lamax=${b[2]}&lomax=${b[3]}`;
  try {
    const headers: Record<string, string> = { "Accept": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const j = await r.json();
    const states: any[] = j?.states || [];
    return states.map(s => ({
      icao24: s[0],
      callsign: (s[1] || "").trim(),
      origin: s[2],
      lng: Number(s[5]),
      lat: Number(s[6]),
      alt: Number(s[7]) || undefined,
      vel: Number(s[9]) || undefined,
      heading: Number(s[10]) || undefined,
      ts: (s[3] || s[4] || Math.floor(Date.now() / 1000)) * 1000,
    } as Plane)).filter(p => isFinite(p.lat) && isFinite(p.lng));
  } catch { return []; }
}

async function fetchFlightsAll(): Promise<Plane[]> {
  const token = await openSkyToken();
  // Fan out across chokepoints (small bboxes are friendlier on the rate budget)
  const results = await Promise.all(CHOKEPOINTS.map(c => fetchFlightsForBox(c.box, token)));
  const merged: Plane[] = [];
  const seen = new Set<string>();
  for (const arr of results) {
    for (const p of arr) {
      if (seen.has(p.icao24)) continue;
      seen.add(p.icao24);
      merged.push(p);
    }
  }
  return merged.slice(0, 600);
}

// ── Chokepoint stress: density vs rolling baseline (in-memory) ───
const baselines = new Map<string, number>();
function computeChokepointStress(ships: Ship[], planes: Plane[]) {
  return CHOKEPOINTS.map(c => {
    const inShips = ships.filter(s => inBox(s.lat, s.lng, c.box));
    const inPlanes = planes.filter(p => inBox(p.lat, p.lng, c.box));
    const stopped = inShips.filter(s => (s.sog ?? 0) < 0.5).length; // ships idle = congestion
    const moving = inShips.length - stopped;
    const density = inShips.length + 0.5 * inPlanes.length;

    const prev = baselines.get(c.name) ?? density;
    const baseline = 0.85 * prev + 0.15 * density;
    baselines.set(c.name, baseline);
    const delta = baseline > 0 ? (density - baseline) / baseline : 0;

    // Stress score: idle ratio + density delta
    const idleRatio = inShips.length > 0 ? stopped / inShips.length : 0;
    const stress = Math.max(0, Math.min(1, 0.6 * idleRatio + 0.4 * Math.max(-1, Math.min(1, delta + 0.1))));

    return {
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      ships: inShips.length,
      stoppedShips: stopped,
      movingShips: moving,
      planes: inPlanes.length,
      density,
      baseline: Number(baseline.toFixed(2)),
      delta: Number(delta.toFixed(2)),
      stress: Number(stress.toFixed(2)),
    };
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);

    const t0 = Date.now();
    const [ships, planes] = await Promise.all([fetchAISSnapshot(), fetchFlightsAll()]);
    const chokepoints = computeChokepointStress(ships, planes);

    // Trim ships for payload size — keep highest-signal first (in-box, then closest to chokepoint)
    const inAnyBox = (lat: number, lng: number) => CHOKEPOINTS.some(c => inBox(lat, lng, c.box));
    const trimmedShips = ships
      .filter(s => inAnyBox(s.lat, s.lng))
      .sort((a, b) => (a.sog ?? 99) - (b.sog ?? 99)) // idle first
      .slice(0, 250);
    const trimmedPlanes = planes.slice(0, 350);

    return new Response(JSON.stringify({
      ships: trimmedShips,
      planes: trimmedPlanes,
      chokepoints,
      lastTick: Date.now(),
      sources: {
        ais: AIS_KEY ? (ships.length > 0 ? "live" : "empty") : "missing-key",
        opensky: (OS_ID && OS_SECRET) ? (planes.length > 0 ? "live" : "empty") : "missing-key",
      },
      latencyMs: Date.now() - t0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    console.error("tactical-movement error:", e);
    return new Response(JSON.stringify({ ships: [], planes: [], chokepoints: [], lastTick: Date.now(), error: e?.message || "failed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});