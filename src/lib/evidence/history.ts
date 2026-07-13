/**
 * Historical intelligence — session-over-session evidence snapshots.
 * Every graph build is diffed against the last stored session so the
 * workstation can answer "what changed, and in which direction" with real
 * deltas instead of generated text. Pure functions + a small localStorage
 * store; snapshots only roll forward after a 6h gap so intra-session
 * refreshes don't erase the comparison point.
 */

import type { EvidenceGraph, Grade } from "./types";
import { round } from "./compute";

interface SnapshotNode {
  v: number | null;
  g: Grade;
  w: number;
}

interface Snapshot {
  ts: number;
  nodes: Record<string, SnapshotNode>;
}

export interface EvidenceChange {
  id: string;
  label: string;
  previous: number | null;
  current: number | null;
  deltaPct: number | null;
  gradeFrom: Grade;
  gradeTo: Grade;
  /** True when the assessment grade itself flipped — the material changes. */
  regraded: boolean;
  sinceTs: number;
}

const KEY = (ticker: string) => `ws_v1_snapshot_${ticker.toUpperCase()}`;
const ROLL_FORWARD_MS = 6 * 60 * 60 * 1000;

function toSnapshot(graph: EvidenceGraph): Snapshot {
  const nodes: Record<string, SnapshotNode> = {};
  for (const id of graph.order) {
    const m = graph.metrics[id];
    nodes[id] = { v: m.value, g: m.assessment.grade, w: m.thesisWeight };
  }
  return { ts: graph.builtAt, nodes };
}

function readSnapshot(ticker: string): Snapshot | null {
  try {
    const raw = localStorage.getItem(KEY(ticker));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === "number" && parsed.nodes) return parsed as Snapshot;
    return null;
  } catch {
    return null;
  }
}

/** Pure diff between a stored snapshot and the current graph. */
export function diffSnapshot(prev: Snapshot, graph: EvidenceGraph): EvidenceChange[] {
  const changes: EvidenceChange[] = [];
  for (const id of graph.order) {
    const now = graph.metrics[id];
    const before = prev.nodes[id];
    if (!before) continue;
    const regraded = before.g !== now.assessment.grade;
    let deltaPct: number | null = null;
    if (before.v != null && now.value != null && before.v !== 0) {
      deltaPct = round(((now.value - before.v) / Math.abs(before.v)) * 100, 1);
    }
    const moved = deltaPct != null && Math.abs(deltaPct) >= 2;
    if (regraded || moved) {
      changes.push({
        id,
        label: now.label,
        previous: before.v,
        current: now.value,
        deltaPct,
        gradeFrom: before.g,
        gradeTo: now.assessment.grade,
        regraded,
        sinceTs: prev.ts,
      });
    }
  }
  // Material first: grade flips, then largest absolute moves.
  return changes.sort((a, b) => {
    if (a.regraded !== b.regraded) return a.regraded ? -1 : 1;
    return Math.abs(b.deltaPct ?? 0) - Math.abs(a.deltaPct ?? 0);
  });
}

/**
 * Diff the current graph against the last stored session and update the
 * store. The stored snapshot only rolls forward after ROLL_FORWARD_MS so
 * repeated builds within a session keep comparing against the same anchor.
 */
export function diffAndStore(graph: EvidenceGraph): EvidenceChange[] {
  if (graph.order.length === 0) return [];
  const prev = readSnapshot(graph.ticker);
  const changes = prev ? diffSnapshot(prev, graph) : [];
  const shouldRoll = !prev || graph.builtAt - prev.ts >= ROLL_FORWARD_MS;
  if (shouldRoll) {
    try {
      localStorage.setItem(KEY(graph.ticker), JSON.stringify(toSnapshot(graph)));
    } catch {
      /* storage full — history is an enhancement, never a requirement */
    }
  }
  return changes;
}
