// Opportunity lifecycle — conviction has a history, not just a snapshot.
//
//   validated → high_conviction → active → weakening → invalidated → archived
//
// State is DERIVED from successive engine runs (the repository calls
// `updateLifecycle` after every fetch); nothing here re-scores anything.
// Rules:
//   validated        first appearance in a validated slate
//   high_conviction  confidence ≥ 0.72 with 3/3 bucket agreement
//   active           survived ≥ 2 consecutive engine runs
//   weakening        still validated, but confidence dropped ≥ 0.06 from its
//                    peak or score dropped ≥ 30% from its peak
//   invalidated      no longer in the validated slate (or direction flipped)
//   archived         invalidated more than 7 days ago
//
// Persisted per browser profile in localStorage.

import type { EngineResponse, ValidatedOpportunity } from "./types";

export type LifecycleState =
  | "validated"
  | "high_conviction"
  | "active"
  | "weakening"
  | "invalidated"
  | "archived";

export interface ConvictionPoint {
  at: string;          // ISO timestamp of the engine run
  confidence: number;
  score: number;       // ranking score used at the time
}

export interface LifecycleEntry {
  symbol: string;
  name: string;
  direction: "long" | "short";
  state: LifecycleState;
  firstSeen: string;
  lastSeen: string;
  invalidatedAt?: string;
  invalidationReason?: string;
  consecutiveRuns: number;
  peakConfidence: number;
  peakScore: number;
  history: ConvictionPoint[];  // capped at 20 points
}

const STORE_KEY = "opportunity-lifecycle-v1";
const HISTORY_CAP = 20;
const ARCHIVE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const HIGH_CONVICTION_CONFIDENCE = 0.72;
const WEAKENING_CONFIDENCE_DROP = 0.06;
const WEAKENING_SCORE_RATIO = 0.7;

type LifecycleMap = Record<string, LifecycleEntry>;

function load(): LifecycleMap {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(map: LifecycleMap) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch { /* storage full — lifecycle is a convenience layer */ }
}

function scoreOf(o: ValidatedOpportunity): number {
  return o.portfolioAdjustedScore ?? o.riskAdjustedScore;
}

function stateFor(entry: LifecycleEntry, o: ValidatedOpportunity): LifecycleState {
  const weakened =
    entry.peakConfidence - o.confidence >= WEAKENING_CONFIDENCE_DROP ||
    (entry.peakScore > 0 && scoreOf(o) < entry.peakScore * WEAKENING_SCORE_RATIO);
  if (weakened) return "weakening";
  if (o.confidence >= HIGH_CONVICTION_CONFIDENCE && o.consensus.bucketConsensus === "ALL_3") return "high_conviction";
  if (entry.consecutiveRuns >= 2) return "active";
  return "validated";
}

/** Fold a fresh engine run into the lifecycle store. */
export function updateLifecycle(response: EngineResponse): LifecycleMap {
  const map = load();
  const now = response.asOf || new Date().toISOString();
  const present = new Set<string>();

  for (const o of response.opportunities) {
    const key = o.symbol.toUpperCase();
    present.add(key);
    const prev = map[key];
    if (prev && prev.state !== "invalidated" && prev.state !== "archived" && prev.direction === o.direction) {
      const entry: LifecycleEntry = {
        ...prev,
        lastSeen: now,
        consecutiveRuns: prev.consecutiveRuns + 1,
        peakConfidence: Math.max(prev.peakConfidence, o.confidence),
        peakScore: Math.max(prev.peakScore, scoreOf(o)),
        history: [...prev.history, { at: now, confidence: o.confidence, score: scoreOf(o) }].slice(-HISTORY_CAP),
      };
      entry.state = stateFor(entry, o);
      map[key] = entry;
    } else {
      // New thesis (or re-validation after invalidation / direction flip).
      map[key] = {
        symbol: o.symbol,
        name: o.name,
        direction: o.direction,
        state: "validated",
        firstSeen: now,
        lastSeen: now,
        consecutiveRuns: 1,
        peakConfidence: o.confidence,
        peakScore: scoreOf(o),
        history: [{ at: now, confidence: o.confidence, score: scoreOf(o) }],
      };
      const asNew = map[key];
      asNew.state = stateFor(asNew, o);
    }
  }

  // Anything previously live that vanished from the validated slate is
  // invalidated — the consensus gate failed on re-evaluation.
  for (const [key, entry] of Object.entries(map)) {
    if (present.has(key)) continue;
    if (entry.state === "archived") continue;
    if (entry.state === "invalidated") {
      if (entry.invalidatedAt && Date.now() - new Date(entry.invalidatedAt).getTime() > ARCHIVE_AFTER_MS) {
        entry.state = "archived";
      }
      continue;
    }
    entry.state = "invalidated";
    entry.invalidatedAt = now;
    entry.invalidationReason = "Dropped out of the validated slate on re-evaluation (consensus gate no longer passes).";
  }

  save(map);
  return map;
}

export function getLifecycleMap(): LifecycleMap {
  return load();
}

export function getLifecycle(symbol: string): LifecycleEntry | null {
  return load()[symbol.toUpperCase()] ?? null;
}

/** Recently invalidated theses (for the "what stopped working" strip). */
export function recentlyInvalidated(withinMs = 48 * 60 * 60 * 1000): LifecycleEntry[] {
  const cutoff = Date.now() - withinMs;
  return Object.values(load())
    .filter((e) => e.state === "invalidated" && e.invalidatedAt && new Date(e.invalidatedAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.invalidatedAt!).getTime() - new Date(a.invalidatedAt!).getTime());
}
