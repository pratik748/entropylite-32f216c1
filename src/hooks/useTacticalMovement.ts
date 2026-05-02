import { useCallback, useEffect, useState } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

export interface Ship {
  mmsi: string; lat: number; lng: number;
  sog?: number; cog?: number; name?: string; type?: string; ts: number;
}
export interface Plane {
  icao24: string; callsign?: string; lat: number; lng: number;
  alt?: number; vel?: number; heading?: number; origin?: string; ts: number;
}
export interface ChokepointStress {
  name: string; lat: number; lng: number;
  ships: number; stoppedShips: number; movingShips: number; planes: number;
  density: number; baseline: number; delta: number; stress: number;
}
export interface TacticalSnapshot {
  ships: Ship[];
  planes: Plane[];
  chokepoints: ChokepointStress[];
  lastTick: number;
  sources?: { ais: string; opensky: string };
}

const POLL_MS = 45_000;

export function useTacticalMovement(enabled: boolean = true) {
  const [data, setData] = useState<TacticalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOnce = useCallback(async () => {
    try {
      const { data: res, error: err } = await governedInvoke<TacticalSnapshot>(
        "tactical-movement",
        { tier: "slow", body: {} },
      );
      if (err) throw err;
      if (res) setData(res);
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Tactical feed paused");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchOnce();
    const i = setInterval(fetchOnce, POLL_MS);
    return () => clearInterval(i);
  }, [enabled, fetchOnce]);

  return { data, loading, error, refresh: fetchOnce };
}