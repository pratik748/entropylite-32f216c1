

# Refine Geopolitical Section UI/UX

## Current State
The geopolitical section has solid functionality but the layout is vertically stacked, causing excessive scrolling. On the 612px viewport, the RiskStrip gauge + 4 metric cards, intelligence brief, exposure banner, layer toggles, map, and threat feed all stack vertically. The map view splits into a `lg:grid-cols-[1fr_320px]` grid but at the current viewport it collapses to single column.

## Refinements

### 1. Compact Header — merge header + view tabs into a single tight bar
- Reduce the large header with satellite icon into a slim single-row bar
- Inline the view mode tabs (Map/Threats/Forex) and refresh button into the header row
- Remove the oversized satellite icon box, use a small inline icon instead
- Cut vertical padding from `p-4 sm:p-5` to `px-3 py-2`

### 2. RiskStrip — horizontal density upgrade
- Force the gauge + 4 metric cards into a single horizontal row at all sizes using `grid-cols-[100px_1fr]` with the gauge at 100px size
- Metric cards: 4-column grid always, reduce padding to `p-2`
- Remove the bottom severity bar (redundant with the gauge)
- Tighten font sizes

### 3. Intelligence Brief — make collapsible
- Default collapsed to a single-line summary (first 120 chars) with expand toggle
- Reduce padding

### 4. Exposure Banner — inline ticker pills, remove animation bloat
- Single compact row with ticker pills, remove `animate-pulse-subtle` (distracting)
- Merge into a slim alert bar instead of a full card

### 5. Map View — better space utilization
- Reduce map `minHeight` from 500 to 380
- Move layer toggles into a floating overlay inside the map (top-left) instead of a separate row
- Threat feed sidebar: make it a scrollable overlay panel on the right side of the map container on smaller screens, instead of collapsing below

### 6. Threat Feed — tighter cards
- Reduce card padding from `p-2.5 sm:p-3` to `p-2`
- Smaller conflict name text
- Cap visible items to 6 with "Show more" toggle

### 7. Forex View — compact grid
- Reduce currency card padding
- Use `grid-cols-3` minimum instead of responsive stepping

## Files Modified
- `src/components/GeopoliticalGlobe.tsx` — compact header, floating layer toggles, map container layout
- `src/components/geopolitical/GeopoliticalPanels.tsx` — tighter RiskStrip, collapsible intel brief, compact threat feed, denser forex grid
- `src/components/geopolitical/GeopoliticalMap.tsx` — no changes needed

