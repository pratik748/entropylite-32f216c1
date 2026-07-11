// useOpportunities — React binding for the shared OpportunityRepository.
// Every module that shows opportunities uses this hook, so they all render
// the same validated objects in the same canonical order.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFX } from "@/hooks/useFX";
import {
  fetchOpportunities,
  filterOpportunities,
  getSnapshot,
  subscribeOpportunities,
} from "@/lib/opportunities/repository";
import type {
  EngineResponse,
  OpportunityFilters,
  ValidatedOpportunity,
} from "@/lib/opportunities/types";

export interface UseOpportunitiesResult {
  opportunities: ValidatedOpportunity[];
  response: EngineResponse | null;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
  refresh: (force?: boolean) => Promise<void>;
}

export function useOpportunities(
  filters: OpportunityFilters = {},
  opts: { auto?: boolean; horizonDays?: number } = {},
): UseOpportunitiesResult {
  const auto = opts.auto !== false;
  const horizonDays = opts.horizonDays ?? 21;
  const { indiaMode } = useFX();
  const [snapshot, setSnapshot] = useState(() => getSnapshot());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const unsub = subscribeOpportunities((s) => {
      if (mounted.current) setSnapshot(s);
    });
    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  const refresh = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const s = await fetchOpportunities({ indiaMode, force, horizonDays });
      if (mounted.current) setSnapshot(s);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "Opportunity engine unreachable.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [indiaMode, horizonDays]);

  useEffect(() => {
    if (auto) void refresh(false);
  }, [auto, refresh]);

  const filterKey = JSON.stringify(filters);
  const opportunities = useMemo(() => {
    const all = snapshot?.response.opportunities ?? [];
    return filterOpportunities(all, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, filterKey]);

  return {
    opportunities,
    response: snapshot?.response ?? null,
    loading,
    error,
    fetchedAt: snapshot?.fetchedAt ?? null,
    refresh,
  };
}
