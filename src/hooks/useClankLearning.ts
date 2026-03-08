import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CONSTRAINT_REGISTRY } from "@/lib/clank-engine";

export interface ActivationEvent {
  id: string;
  constraint_id: string;
  activated_at: string;
  clank_score_at_activation: number;
  activation_probability: number;
  observed_price_impact: number | null;
  observed_volume_impact: number | null;
  observed_vol_change: number | null;
  outcome_accuracy: number | null;
  notes: string | null;
}

export interface ConfidenceOverride {
  constraint_id: string;
  adjusted_confidence: number;
  sample_count: number;
  last_updated: string;
}

export function useClankLearning() {
  const [overrides, setOverrides] = useState<Record<string, ConfidenceOverride>>({});
  const [events, setEvents] = useState<ActivationEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  // Fetch data on mount
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoading(false); return; }
      userIdRef.current = user.id;

      const [ovRes, evRes] = await Promise.all([
        supabase.from("clank_confidence_overrides" as any).select("*").eq("user_id", user.id),
        supabase.from("clank_activation_events" as any).select("*").eq("user_id", user.id).order("activated_at", { ascending: false }).limit(100),
      ]);

      if (!cancelled) {
        const ovMap: Record<string, ConfidenceOverride> = {};
        ((ovRes.data as any[]) || []).forEach((r: any) => {
          ovMap[r.constraint_id] = {
            constraint_id: r.constraint_id,
            adjusted_confidence: Number(r.adjusted_confidence),
            sample_count: r.sample_count,
            last_updated: r.last_updated,
          };
        });
        setOverrides(ovMap);
        setEvents(((evRes.data as any[]) || []).map(mapEvent));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const getAdjustedConfidence = useCallback(
    (constraintId: string): number | undefined => overrides[constraintId]?.adjusted_confidence,
    [overrides]
  );

  const confidenceOverridesMap = useCallback((): Record<string, number> => {
    const m: Record<string, number> = {};
    Object.entries(overrides).forEach(([k, v]) => { m[k] = v.adjusted_confidence; });
    return m;
  }, [overrides]);

  const recordActivation = useCallback(async (
    constraintId: string,
    clankScore: number,
    probability: number
  ): Promise<ActivationEvent | null> => {
    if (!userIdRef.current) return null;
    const { data, error } = await supabase.from("clank_activation_events" as any).insert({
      user_id: userIdRef.current,
      constraint_id: constraintId,
      clank_score_at_activation: clankScore,
      activation_probability: probability,
    } as any).select().single();
    if (error || !data) return null;
    const ev = mapEvent(data as any);
    setEvents(prev => [ev, ...prev]);
    return ev;
  }, []);

  const recordOutcome = useCallback(async (
    eventId: string,
    priceImpact: number,
    volumeImpact: number,
    volChange: number
  ): Promise<boolean> => {
    if (!userIdRef.current) return false;

    // Find event to get constraint info
    const ev = events.find(e => e.id === eventId);
    if (!ev) return false;

    // Calculate accuracy: compare predicted probability with whether impact was significant
    const impactMagnitude = Math.abs(priceImpact);
    const accuracy = Math.min(impactMagnitude > 0.5 ? ev.activation_probability : 1 - ev.activation_probability, 1);

    // Update event
    const { error: evErr } = await supabase.from("clank_activation_events" as any).update({
      observed_price_impact: priceImpact,
      observed_volume_impact: volumeImpact,
      observed_vol_change: volChange,
      outcome_accuracy: accuracy,
    } as any).eq("id", eventId);
    if (evErr) return false;

    // Update confidence override using running average
    const existing = overrides[ev.constraint_id];
    const defaultConf = CONSTRAINT_REGISTRY.find(c => c.id === ev.constraint_id)?.confidenceScore ?? 0.5;
    const oldConf = existing?.adjusted_confidence ?? defaultConf;
    const n = (existing?.sample_count ?? 0) + 1;
    const newConf = Math.max(0.05, Math.min(0.99, (oldConf * (n - 1) + accuracy) / n));

    const { error: ovErr } = await supabase.from("clank_confidence_overrides" as any).upsert({
      user_id: userIdRef.current,
      constraint_id: ev.constraint_id,
      adjusted_confidence: newConf,
      sample_count: n,
      last_updated: new Date().toISOString(),
    } as any, { onConflict: "user_id,constraint_id" });
    if (ovErr) return false;

    // Update local state
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, observed_price_impact: priceImpact, observed_volume_impact: volumeImpact, observed_vol_change: volChange, outcome_accuracy: accuracy } : e));
    setOverrides(prev => ({ ...prev, [ev.constraint_id]: { constraint_id: ev.constraint_id, adjusted_confidence: newConf, sample_count: n, last_updated: new Date().toISOString() } }));
    return true;
  }, [events, overrides]);

  return { overrides, events, loading, getAdjustedConfidence, confidenceOverridesMap, recordActivation, recordOutcome };
}

function mapEvent(r: any): ActivationEvent {
  return {
    id: r.id,
    constraint_id: r.constraint_id,
    activated_at: r.activated_at,
    clank_score_at_activation: Number(r.clank_score_at_activation),
    activation_probability: Number(r.activation_probability),
    observed_price_impact: r.observed_price_impact != null ? Number(r.observed_price_impact) : null,
    observed_volume_impact: r.observed_volume_impact != null ? Number(r.observed_volume_impact) : null,
    observed_vol_change: r.observed_vol_change != null ? Number(r.observed_vol_change) : null,
    outcome_accuracy: r.outcome_accuracy != null ? Number(r.outcome_accuracy) : null,
    notes: r.notes,
  };
}
