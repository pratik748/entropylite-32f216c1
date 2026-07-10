/**
 * Persistent research memory.
 *
 * Findings survive page reloads so an analyst can pick a thread back up
 * days later ("what did we conclude about Tata Motors last week?").
 * localStorage-backed — same zero-infrastructure posture as the rest of the
 * platform's client caches — capped and LRU-evicted.
 */

import type { FactRecord, MemoryRecord } from "./types";

const STORE_KEY = "foresight-memory-v1";
const MAX_RECORDS = 200;

function load(): MemoryRecord[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(records: MemoryRecord[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(records));
  } catch {
    // Quota exceeded — drop the oldest half and retry once.
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(records.slice(-Math.floor(MAX_RECORDS / 2))));
    } catch { /* give up silently — memory is an enhancement, not a dependency */ }
  }
}

export function rememberFinding(opts: {
  kind?: string;
  entities: string[];
  text: string;
  facts?: FactRecord[];
}): MemoryRecord {
  const records = load();
  const record: MemoryRecord = {
    id: crypto.randomUUID(),
    kind: opts.kind || "finding",
    entities: opts.entities.map((e) => e.toUpperCase()),
    text: opts.text,
    facts: opts.facts?.slice(0, 12),
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
  records.push(record);
  // LRU eviction beyond cap.
  if (records.length > MAX_RECORDS) {
    records.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    records.splice(0, records.length - MAX_RECORDS);
  }
  persist(records);
  return record;
}

export function searchMemory(query: string, limit = 6): MemoryRecord[] {
  const records = load();
  const terms = query.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);
  if (terms.length === 0) return [];
  const scored = records.map((r) => {
    const hay = `${r.entities.join(" ")} ${r.text} ${r.kind}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (r.entities.some((e) => e.toLowerCase().includes(term))) score += 3;
      else if (hay.includes(term)) score += 1;
    }
    // Recency bonus: half-life of ~14 days.
    const ageDays = (Date.now() - r.createdAt) / 86_400_000;
    return { r, score: score * Math.exp(-ageDays / 20) };
  });
  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.r);
  if (hits.length > 0) {
    const now = Date.now();
    const ids = new Set(hits.map((h) => h.id));
    persist(records.map((r) => (ids.has(r.id) ? { ...r, lastAccessedAt: now } : r)));
  }
  return hits;
}

export function recentMemory(limit = 8): MemoryRecord[] {
  return load()
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export function forgetMemory(id: string): boolean {
  const records = load();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false;
  persist(next);
  return true;
}

export function clearMemory(): void {
  try { localStorage.removeItem(STORE_KEY); } catch { /* noop */ }
}
