import { useCallback, useEffect, useState } from "react";

/**
 * Reading streak — the habit primitive behind the Daily Briefing.
 *
 * The streak rewards *reviewing intelligence*, never trading (Doctrine P1).
 * It advances at most once per local calendar day, the first time the user
 * opens the briefing:
 *   - same day again → no change
 *   - consecutive day → streak += 1
 *   - a gap of ≥ 2 days → streak resets to 1
 * `best` tracks the all-time longest run. State is local-only (localStorage),
 * so it works offline and needs no schema; a Supabase-backed version can
 * replace the store later without changing this interface.
 */

export interface ReadingStreak {
  current: number;
  best: number;
  lastReadISO: string | null;
  markRead: () => void;
  /** True once for the session if today's read just extended the streak. */
  advancedToday: boolean;
}

const KEY = "el-reading-streak-v1";

interface Stored {
  current: number;
  best: number;
  lastRead: string | null; // YYYY-MM-DD
}

function todayKey(d = new Date()): string {
  // Local calendar day (not UTC) so "today" matches the user's clock.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86_400_000);
}

function read(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Stored;
      if (typeof p.current === "number" && typeof p.best === "number") return p;
    }
  } catch { /* ignore */ }
  return { current: 0, best: 0, lastRead: null };
}

export function useReadingStreak(): ReadingStreak {
  const [state, setState] = useState<Stored>(() =>
    typeof window === "undefined" ? { current: 0, best: 0, lastRead: null } : read(),
  );
  const [advancedToday, setAdvancedToday] = useState(false);

  const markRead = useCallback(() => {
    setState((prev) => {
      const today = todayKey();
      if (prev.lastRead === today) return prev; // already counted today

      let current: number;
      if (prev.lastRead && dayDiff(prev.lastRead, today) === 1) {
        current = prev.current + 1; // consecutive day
      } else {
        current = 1; // first ever, or a gap broke the streak
      }
      const next: Stored = { current, best: Math.max(prev.best, current), lastRead: today };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
      setAdvancedToday(true);
      return next;
    });
  }, []);

  // Auto-mark on mount: opening the briefing IS the read event.
  useEffect(() => {
    markRead();
  }, [markRead]);

  return {
    current: state.current,
    best: state.best,
    lastReadISO: state.lastRead,
    markRead,
    advancedToday,
  };
}
