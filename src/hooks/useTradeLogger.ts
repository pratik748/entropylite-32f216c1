import { useCallback, useEffect, useRef } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { supabase } from "@/integrations/supabase/client";

export interface LogEntry {
  id: string;
  ts: number;
  ticker: string;
  action: "BUY" | "SELL";
  price: number;
  qty: number;
  pnl: number;
  source: string;
  catalyst: string;
  lesson: string;
  lessonLoading?: boolean;
}

export type LogInput = Omit<LogEntry, "id" | "ts" | "lesson" | "lessonLoading"> & {
  lesson?: string;
};

const STORAGE_KEY = "entropy-trade-logger";

export function useTradeLogger() {
  const [entries, setEntries] = useLocalStorage<LogEntry[]>(STORAGE_KEY, []);
  const fetchingRef = useRef<Set<string>>(new Set());

  const fetchLesson = useCallback(
    async (entry: LogEntry) => {
      if (fetchingRef.current.has(entry.id)) return;
      fetchingRef.current.add(entry.id);
      try {
        const { data, error } = await supabase.functions.invoke("trade-lesson", {
          body: {
            ticker: entry.ticker,
            action: entry.action,
            source: entry.source,
            catalyst: entry.catalyst,
            pnl: entry.pnl,
            entryPrice: entry.price,
            currentPrice: entry.price,
          },
        });
        const lesson = (!error && data?.lesson) ? String(data.lesson) : "";
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, lesson: lesson || e.lesson, lessonLoading: false } : e)),
        );
      } catch {
        setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, lessonLoading: false } : e)));
      } finally {
        fetchingRef.current.delete(entry.id);
      }
    },
    [setEntries],
  );

  // Auto-fetch lessons for any entry missing one.
  useEffect(() => {
    entries.forEach((e) => {
      if (!e.lesson && !e.lessonLoading && !fetchingRef.current.has(e.id)) {
        setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, lessonLoading: true } : x)));
        fetchLesson(e);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  const logTrade = useCallback(
    (input: LogInput): LogEntry | null => {
      const ticker = input.ticker?.trim().toUpperCase();
      if (!ticker) return null;
      // Dedupe — same ticker+action+price within 60s
      const now = Date.now();
      const dup = entries.find(
        (e) => e.ticker === ticker && e.action === input.action && Math.abs(e.price - input.price) < 1e-6 && now - e.ts < 60_000,
      );
      if (dup) return dup;

      const entry: LogEntry = {
        id: crypto.randomUUID(),
        ts: now,
        ticker,
        action: input.action,
        price: input.price || 0,
        qty: input.qty || 0,
        pnl: input.pnl || 0,
        source: input.source || "",
        catalyst: input.catalyst || "",
        lesson: input.lesson || "",
        lessonLoading: !input.lesson,
      };
      setEntries((prev) => [entry, ...prev]);
      if (!entry.lesson) fetchLesson(entry);
      return entry;
    },
    [entries, fetchLesson, setEntries],
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<LogEntry>) => {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
    },
    [setEntries],
  );

  const removeEntry = useCallback((id: string) => setEntries((prev) => prev.filter((e) => e.id !== id)), [setEntries]);

  const regenerateLesson = useCallback(
    (id: string) => {
      const e = entries.find((x) => x.id === id);
      if (!e) return;
      setEntries((prev) => prev.map((x) => (x.id === id ? { ...x, lessonLoading: true, lesson: "" } : x)));
      fetchLesson(e);
    },
    [entries, fetchLesson, setEntries],
  );

  return { entries, logTrade, updateEntry, removeEntry, regenerateLesson };
}