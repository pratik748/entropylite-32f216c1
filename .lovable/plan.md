

# Geopolitical Intelligence Map — Clean Rebuild Plan

## Current State Assessment

The existing `GeopoliticalGlobe.tsx` (495 lines) uses Leaflet with CartoDB dark tiles. Based on diagnostics:

- **Backend is working**: The `geopolitical-data` edge function returns 200 with valid conflict/forex/supply-chain data (confirmed in network logs)
- **AI JSON parsing fails frequently**: Gemini returns truncated JSON (`Unterminated string in JSON`), but fallback data works correctly
- **Leaflet CSS is imported** in `index.css` line 2
- **Map rendering**: The component has proper `invalidateSize()` calls and ResizeObserver

The "million errors" likely stem from Leaflet's DOM manipulation quirks — re-renders causing double initialization, divIcon HTML injection issues, and the component's complexity (495 lines mixing map logic, UI panels, and data processing).

## Rebuild Strategy

Delete the entire 495-line component and rebuild as a clean, modular system with three focused files:

### File 1: `src/components/geopolitical/GeopoliticalMap.tsx` (~200 lines)
Pure Leaflet map component with:
- Single `useEffect` for map init with proper cleanup
- Stable layer management (conflicts, trade hubs, supply chains, forex, entropy zones, portfolio)
- Layer toggle UI (checkboxes for each layer)
- All Leaflet markers use simple `L.circleMarker` — no complex `divIcon` HTML injection (major error source)
- `flyTo` on conflict click
- ResizeObserver for container stability

### File 2: `src/components/geopolitical/GeopoliticalPanels.tsx` (~150 lines)  
Non-map UI panels:
- Risk strip (Global Risk, Regime, Capital Flow, Entropy Zones)
- Intelligence Brief
- Threat feed sidebar (clickable, emits `onSelectConflict`)
- Forex volatility grid
- Portfolio exposure list

### File 3: `src/components/GeopoliticalGlobe.tsx` (~80 lines)
Orchestrator that:
- Fetches data from edge function (30s polling)
- Manages view mode state (map/threats/forex)
- Composes `GeopoliticalMap` + `GeopoliticalPanels`
- Shows loading/error states

### Key Fixes in Rebuild

1. **No `divIcon` HTML strings** — use only `L.circleMarker` and `L.polyline` to eliminate DOM injection bugs
2. **Stable layer refs** — create layers once, update via `clearLayers()` + re-add pattern
3. **Map init guard** — use a `mapInitialized` ref flag to prevent double initialization
4. **Tooltip labels** — use Leaflet's built-in `bindTooltip` with `permanent: true` instead of custom divIcons for labels
5. **Simpler CSS animation** — pulsing effect via CSS class in index.css instead of inline styles

### Edge Function Fix

The `geopolitical-data` function's AI call frequently returns truncated JSON. Fix by:
- Reducing `maxTokens` from 3000 to 2000 (less chance of cutoff)
- Adding `response_mime_type: "application/json"` to Gemini request to force valid JSON
- Wrapping `JSON.parse` with a regex cleanup to strip trailing incomplete content

### Files Changed

| Action | File |
|--------|------|
| Delete | `src/components/GeopoliticalGlobe.tsx` (current 495-line file) |
| Create | `src/components/geopolitical/GeopoliticalMap.tsx` |
| Create | `src/components/geopolitical/GeopoliticalPanels.tsx` |
| Create | `src/components/GeopoliticalGlobe.tsx` (new orchestrator, ~80 lines) |
| Edit | `supabase/functions/geopolitical-data/index.ts` (JSON parsing fix) |
| Edit | `src/index.css` (add pulse animation CSS class) |

No changes needed to `Index.tsx` — the import path and props interface stay identical.

