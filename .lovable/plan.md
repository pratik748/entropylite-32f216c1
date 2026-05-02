## Geopolitical Intelligence → Battle Board Terminal (BBT)

Rebuild `GeopoliticalGlobe` into a four-pane command surface that streams live events, projects them onto a reactive map, derives 2nd/3rd-order causal chains, and overlays tactical movement (ships/planes). Existing Leaflet map, `useGeoIntelligence` hook, and `geopolitical-data` edge function are kept as the foundation and extended — not thrown away.

### Final layout (desktop, ≥1280px)

```text
┌───────────────────────────────────────────────────────────────────────┐
│  GLOBAL RISK STRIP · regime · capital flow · safe-haven · last tick   │
├──────────────┬─────────────────────────────────────┬──────────────────┤
│              │                                     │                  │
│  LIVE FEED   │         BATTLE MAP                  │  INTEL STACK     │
│  (events)    │   heat zones + pulsing markers      │  • Snapshot      │
│  scrolling   │   ships ▲  planes ✈  routes ━━     │  • Causal chain  │
│  age-decayed │   tap → selects + drills            │  • Trade signal  │
│              │                                     │                  │
├──────────────┴─────────────────────────────────────┴──────────────────┤
│  MOVEMENT TICKER · live ship/plane reroutes · chokepoint pressure     │
└───────────────────────────────────────────────────────────────────────┘
```

Mobile collapses to stacked tabs: Map · Feed · Intel · Movement.

### What gets built

**1. Live Event Pipeline (`geo-events` edge function — new)**
- Pulls in parallel every 20s: GDELT (already used), `fetch-news`, RSS proxies for Reuters/AP.
- Normalizes each headline into the structured `GeoEvent` schema below.
- AI scoring pass via `callAI` (Gemini Flash, jsonMode) assigns: lat/lng, category, severity, market_relevance, velocity, entities. Uses the existing `safeParseJSON` + key-rotation.
- Decay function: `score_now = score * exp(-age_minutes / half_life)`; events fall off feed below 0.15.
- Returns `{ events, lastTick }`. Front-end polls every 20s (no WebSocket — Lovable Cloud functions are stateless; this is the honest, working alternative).

**2. Battle Map upgrades (`GeopoliticalMap.tsx`)**
- Adds three layer groups: `events` (pulsing markers, color by category), `ships` (▲ icons), `planes` (✈ icons).
- Heat-zone overlay using Leaflet `heatLayer` weighted by event density × severity.
- Marker click → calls `onSelectEvent(event)` instead of just conflict.
- Chokepoint highlight when supply route crosses a high-severity event.

**3. Causal Chain Engine (`causal-effects` edge function — new)**
- On event tap: front-end calls with `{ eventId, portfolioTickers }`.
- AI returns a node graph: `{ nodes: [{ id, label, kind, confidence }], edges: [{ from, to, strength }] }` up to depth 3.
- Cached server-side per event hash for 10 min.
- Rendered with **React Flow** (`@xyflow/react` — needs install) inside the Intel Stack pane. Tap node → expand sub-chain, collapse siblings. Edge thickness = strength, glow = confidence.

**4. Ships & Planes layer (`tactical-movement` edge function — new)**
- Ships: AISStream.io free tier (key needed) **or** MarineTraffic public endpoints; bounded by viewport bbox.
- Planes: OpenSky Network anonymous endpoint (free, no key; rate-limited to ~10s polling).
- Returns last-known positions for vessels/aircraft within view + flagged anomalies (loitering, rapid course change near chokepoints).
- Tap marker → side card with origin/destination, type, strategic note.
- Honest fallback: if API quota exceeds, layer is hidden with a "movement feed paused" pill.

**5. Event ↔ Movement correlation**
- Worker function on the events response: any active event within 500km of an AIS chokepoint pulls those ship tracks into the event's snapshot panel and draws a red dashed reroute line on the map.

**6. Trade Impact Signal (Entropy integration)**
- Per selected event, the Intel Stack shows: bullish/bearish/volatile chip, confidence %, time horizon, exposed portfolio tickers (already computed in `useGeoIntelligence.computeTickerThreats`).
- Event severity is forwarded into Scar/TRUTH via existing `twrd-ingest` as a claim with `domain: "geopolitical"` so the prediction core consumes it.

### Data architecture

```ts
interface GeoEvent {
  id: string;                // hash(title+source+day)
  title: string;
  source: string;
  url: string;
  ts: number;                // unix ms
  loc: { lat: number; lng: number; place: string };
  category: "military" | "economic" | "political" | "supply_chain" | "cyber";
  severity: number;          // 0-1
  market_relevance: number;  // 0-1
  velocity: number;          // 0-1, how fast it's spreading
  confidence: number;        // 0-1 from AI
  entities: { countries: string[]; tickers: string[]; commodities: string[] };
  decayedScore: number;      // computed client-side each render
}

interface CausalGraph {
  rootEventId: string;
  nodes: { id: string; label: string; kind: "event" | "asset" | "macro" | "policy"; confidence: number }[];
  edges: { from: string; to: string; strength: number; rationale: string }[];
}

interface MovementMarker {
  id: string; kind: "ship" | "plane";
  lat: number; lng: number; heading: number; speed: number;
  type?: string; flag?: string; from?: string; to?: string;
  anomaly?: "reroute" | "loiter" | "airspace_close";
}
```

### Visual language (BBT)

- Background `#000`, surfaces `hsl(var(--surface-1))`.
- Accents: cyan `#22d3ee` (data), red `#ef4444` (military), amber `#f59e0b` (economic), purple `#a855f7` (political), blue `#3b82f6` (logistics).
- Typography: existing JetBrains Mono for tickers/numerics, Inter for prose.
- Pulsing markers via CSS `@keyframes` (already used in PortfolioPanel risk dots). No external animation lib.
- All colors via existing semantic tokens in `index.css`/`tailwind.config.ts` — no raw hex in components except the map style URLs.

### Performance

- Feed virtualized (only ~30 events render); rest tracked in ref.
- Map markers diff-updated, never wiped (extends existing pattern in `GeopoliticalMap`).
- Causal graph lazy: only fetched on tap, not on event arrival.
- Movement layer disabled at zoom < 4 to keep marker count sane.
- Single `useGeoIntelligence` poll cycle; events/movement piggyback on it via parallel `Promise.all`.

### Files touched / created

Created:
- `supabase/functions/geo-events/index.ts`
- `supabase/functions/causal-effects/index.ts` *(file exists for a different purpose — will be replaced or namespaced as `geo-causal`)*
- `supabase/functions/tactical-movement/index.ts`
- `src/components/geopolitical/BattleBoard.tsx` (new shell, replaces old `GeopoliticalGlobe` body)
- `src/components/geopolitical/EventFeed.tsx`
- `src/components/geopolitical/IntelStack.tsx`
- `src/components/geopolitical/CausalGraph.tsx`
- `src/components/geopolitical/MovementTicker.tsx`
- `src/hooks/useGeoEvents.ts`
- `src/hooks/useTacticalMovement.ts`

Edited:
- `src/components/geopolitical/GeopoliticalMap.tsx` — add events/ships/planes layers + heat overlay
- `src/components/GeopoliticalGlobe.tsx` — becomes thin wrapper over `BattleBoard`
- `src/pages/Index.tsx` — pass new hooks down
- `package.json` — add `@xyflow/react`, `leaflet.heat`

Untouched: `useGeoIntelligence` (still drives risk strip, ticker threats, escalation toasts), `geopolitical-data` edge function (still source of truth for conflicts/forex/regime).

### Honest constraints (to set expectations)

- **WebSockets**: Supabase Edge Functions are request/response — true push needs Realtime channels or a 3rd-party socket. Plan uses 20s polling, which feels live but isn't socket-grade. We can add Supabase Realtime later if you want sub-second.
- **AIS data**: Free tiers (AISStream/MarineTraffic) are heavily rate-limited and bbox-bound. Coverage will be partial — major chokepoints only. Will request the AIS key as a secret when we get to step 4.
- **OpenSky planes**: Free anonymous tier works but caps at ~10s polling and ~500 aircraft per call.
- **News sources**: Reuters/AP/Bloomberg do not offer free APIs. We use GDELT (free, global, 15-min lag) + NewsData.io (key already configured) + RSS proxies. "Bloomberg-style" feed will be branded as "Wire" without claiming Bloomberg.

### Build order (one task per stage so you see it land progressively)

1. Live event pipeline + feed pane (visible value immediately).
2. Map event markers + heat overlay + tap-to-select.
3. Intel stack + causal graph engine.
4. Tactical movement layer (ships, then planes).
5. Event↔movement correlation + trade-impact signal wired to Scar/TRUTH.

Approve and I'll execute in that order.