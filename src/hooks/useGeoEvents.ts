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

const POLL_MS = 25_000;
const HALF_LIFE_MIN = 90; // event score halves every 90 minutes
const MIN_DECAYED = 0.08;

function decayed(e: GeoEvent): ScoredGeoEvent {
  const ageMin = Math.max(0, (Date.now() - e.ts) / 60000);
  const base = 0.4 * e.severity + 0.4 * e.market_relevance + 0.2 * e.velocity;
  const decayedScore = base * Math.exp(-Math.LN2 * (ageMin / HALF_LIFE_MIN));
  return { ...e, ageMin, decayedScore };
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
      const { data, error: err } = await governedInvoke<{ events: GeoEvent[]; lastTick: number }>(
        "geo-events",
        { tier: "slow", body: {} },
      );
      if (err) throw err;
      const incoming = data?.events || [];
      // Merge: new events overwrite, old events stay until they decay out
      for (const e of incoming) eventsRef.current.set(e.id, e);
      // Trim store to keep memory bounded
      if (eventsRef.current.size > 250) {
        const sorted = Array.from(eventsRef.current.values()).sort((a, b) => b.ts - a.ts).slice(0, 200);
        eventsRef.current = new Map(sorted.map(e => [e.id, e]));
      }
      setLastTick(data?.lastTick || Date.now());
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