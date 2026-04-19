---
name: Reflexivity Engine
description: Soros-style "belief about belief" engine — fuses flow, sentiment, and causal signals into a contradiction map with shift-ETA and asymmetric trade expression
type: feature
---
The Reflexivity Engine is a unified intelligence layer that operationalizes Soros's reflexivity. It does NOT predict price.

**Architecture**:
- Edge function `supabase/functions/reflexivity-engine/index.ts` — deterministic math + AI narrative layer
- Hook `src/hooks/useReflexivity.ts` — invokes via apiGovernor (heavy tier, 30min cache)
- Component `src/components/ReflexivityEngine.tsx` — dashboard tab "Reflexivity" (Brain icon)

**Inputs synthesized**:
- Flows: from `useInstitutionalFlows` (options + ETF flow signals)
- Sentiment: from `sentiment-intel` edge function (CNN F&G + GDELT + Reddit + sources)
- Causal: from `causal-effects` edge function (scenario tree probabilities)
- Market context: VIX + regime from `useMarketRegime`

**Outputs**:
- `consensus`: direction (-100..+100) + label + per-source breakdown
- `conviction`: inverse of std-dev across signals (0=fragile, 100=high)
- `contradictions[]`: signal pairs with opposite direction, gap >= 40
- `shiftETA`: probability + window ("0–48 hours" through "Stable") based on contradiction × low conviction × VIX factor
- `thesis`: AI-generated 2-3 sentence Soros-voice narrative
- `actionable`: { trigger, trade, risk } — confirmation event + asymmetric expression + invalidation

**Endpoint registered in apiGovernor.ts as "heavy" tier (30min TTL).**
