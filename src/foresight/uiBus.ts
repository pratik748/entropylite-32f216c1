/**
 * Foresight UI bus — the operating layer's control plane.
 *
 * A typed event emitter that lets tools drive the interface (navigate,
 * open modules, focus positions, highlight evidence, pin workbench cards)
 * without coupling tool code to React component internals. Components
 * subscribe to the events they own; targets self-register for highlighting.
 */

import { useEffect } from "react";

export interface WorkbenchCard {
  id: string;
  title: string;
  /** Structured payload rendered by the workbench (table | metrics | text). */
  kind: "metrics" | "table" | "text";
  body: unknown;
  source: string;
  createdAt: number;
}

export interface UIBusEvents {
  navigate: { tab: string };
  open_module: { moduleId: string };
  set_active_stock: { positionId: string };
  highlight: { targetId: string; note?: string; durationMs?: number };
  workbench_pin: { card: WorkbenchCard };
  workbench_clear: Record<string, never>;
  open_surface: { prefill?: string };
}

type Handler<K extends keyof UIBusEvents> = (payload: UIBusEvents[K]) => void;

const handlers = new Map<keyof UIBusEvents, Set<Handler<never>>>();

export function onUIEvent<K extends keyof UIBusEvents>(event: K, handler: Handler<K>): () => void {
  let set = handlers.get(event);
  if (!set) {
    set = new Set();
    handlers.set(event, set);
  }
  set.add(handler as Handler<never>);
  return () => set!.delete(handler as Handler<never>);
}

export function emitUIEvent<K extends keyof UIBusEvents>(event: K, payload: UIBusEvents[K]): boolean {
  const set = handlers.get(event);
  if (!set || set.size === 0) return false;
  set.forEach((h) => {
    try {
      (h as Handler<K>)(payload);
    } catch (e) {
      console.error(`[foresight] ui handler for ${event} threw`, e);
    }
  });
  return true;
}

/** React helper — subscribe for the lifetime of the component. */
export function useUIEvent<K extends keyof UIBusEvents>(event: K, handler: Handler<K>): void {
  useEffect(() => onUIEvent(event, handler), [event, handler]);
}

// ── Highlight target registry ──────────────────────────────────────────
// Components declare `data-foresight-id` (via useForesightTarget or a plain
// attribute); tools address targets by id. The registry knows what is
// currently mounted so the planner is told which surfaces exist right now.

const targets = new Map<string, { description: string }>();

export function registerTarget(id: string, description: string): () => void {
  targets.set(id, { description });
  return () => { targets.delete(id); };
}

export function listTargets(): Array<{ id: string; description: string }> {
  return Array.from(targets.entries()).map(([id, v]) => ({ id, description: v.description }));
}

/** Declare a DOM region addressable by ui.highlight. */
export function useForesightTarget(id: string, description: string): { "data-foresight-id": string } {
  useEffect(() => registerTarget(id, description), [id, description]);
  return { "data-foresight-id": id };
}

export function resolveTargetElement(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-foresight-id="${CSS.escape(id)}"]`);
}
