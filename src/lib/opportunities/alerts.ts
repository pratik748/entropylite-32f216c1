// Opportunity alerts — derived, never fabricated.
//
// An "opportunity alert" is nothing more than a validated opportunity from
// the shared engine that the user hasn't seen yet. This module observes the
// OpportunityRepository snapshot (it never triggers the pipeline itself) and
// diffs it against the last acknowledged slate. Zero independent scoring,
// zero independent state beyond the seen-set.

import { useCallback, useEffect, useState } from "react";
import { getSnapshot, subscribeOpportunities } from "./repository";
import { newOpportunities } from "./view";
import type { ValidatedOpportunity } from "./types";

const SEEN_KEY = "opportunity-alerts-seen-v1";

function loadSeen(): string[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function saveSeen(symbols: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(symbols.slice(0, 100)));
  } catch { /* ignore */ }
}

export interface UseOpportunityAlertsResult {
  /** Validated opportunities the user hasn't acknowledged yet, canonical order. */
  fresh: ValidatedOpportunity[];
  /** Mark the current slate as seen. */
  acknowledge: () => void;
}

export function useOpportunityAlerts(): UseOpportunityAlertsResult {
  const [fresh, setFresh] = useState<ValidatedOpportunity[]>([]);

  const recompute = useCallback(() => {
    const snapshot = getSnapshot();
    const latest = snapshot?.response.opportunities ?? [];
    setFresh(newOpportunities(loadSeen(), latest));
  }, []);

  useEffect(() => {
    recompute();
    return subscribeOpportunities(recompute);
  }, [recompute]);

  const acknowledge = useCallback(() => {
    const snapshot = getSnapshot();
    const latest = snapshot?.response.opportunities ?? [];
    const seen = new Set([...loadSeen(), ...latest.map((o) => o.symbol.toUpperCase())]);
    saveSeen(Array.from(seen));
    setFresh([]);
  }, []);

  return { fresh, acknowledge };
}
