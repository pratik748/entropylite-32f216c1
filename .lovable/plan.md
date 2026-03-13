

# Deep Company Intelligence + 3D Monte Carlo

## Scope

Two features:
1. **Company Intelligence Dossier** — A new edge function + component that generates a deep structural profile for each analyzed stock, displayed in the Dashboard when a stock is selected.
2. **3D Monte Carlo in StatArb** — Replace the 2D Recharts LineChart in the StatArb Monte Carlo tab with a 3D surface/path visualization using `@react-three/fiber` + `@react-three/drei`.

---

## Part 1: Deep Company Intelligence

### Architecture

**New Edge Function: `supabase/functions/company-intelligence/index.ts`**
- Takes a ticker + basic analysis data
- Calls `callAI` with a comprehensive prompt requesting structured JSON across all 12 intelligence dimensions
- Returns a large JSON object covering: Corporate Core, Supply Chain, Ownership, Leadership, Partnerships, Competitive Landscape, Product Ecosystem, Regulatory Exposure, Insider Activity, Narrative Intelligence
- Uses `safeParseJSON` for robust parsing
- Cached via API Governor at "slow" tier (60s)

**New Component: `src/components/CompanyIntelligence.tsx`**
- Rendered in the Dashboard center panel below StockSummary when a stock is selected
- Tabbed interface with 10+ intelligence tabs matching the spec sections
- Each tab renders structured data from the AI response:
  - **Corporate Core**: Overview card, revenue segments bar chart, geographic pie chart
  - **Supply Chain**: Structured list of suppliers/distributors/manufacturers with risk tags; simple dependency table (no heavy graph lib needed — use a clean grid layout with connection indicators)
  - **Ownership**: Institutional vs insider vs retail pie chart, top holders table, accumulation/distribution signals
  - **Leadership**: Executive cards with career history, board membership network
  - **Partnerships**: Contract list with concentration risk bar chart
  - **Competitive**: Competitor comparison table with revenue/market share bars
  - **Products**: Product cards with lifecycle stage badges and revenue contribution
  - **Regulatory**: Risk exposure cards with severity indicators
  - **Insider Activity**: Buy/sell activity table with sentiment gauge
  - **Narrative**: Sentiment velocity gauge, analyst consensus distribution

**New Hook: `src/hooks/useCompanyIntelligence.ts`**
- Wraps `governedInvoke("company-intelligence", ...)` with loading/error state
- Triggers when activeStock changes and has analysis data
- Caches results per ticker to avoid re-fetching

### Integration

- **`src/pages/Index.tsx`**: Add `CompanyIntelligence` component in both mobile and desktop dashboard views, rendered below the existing analysis cards when a stock is active
- **`src/lib/apiGovernor.ts`**: Register `company-intelligence` at "slow" tier
- **`supabase/config.toml`**: Add function entry with `verify_jwt = false`

---

## Part 2: 3D Monte Carlo in StatArb

### Approach

Install `@react-three/fiber@^8.18` and `@react-three/drei@^9.122.0` (compatible with React 18). The project already has `three@^0.160.1`.

**Replace `MonteCarloPanel` in `src/components/sandbox/StatArbEngine.tsx`**:
- Replace the 2D Recharts spaghetti chart with a 3D canvas
- X axis = Day (0-252), Y axis = Portfolio Value, Z axis = Path index
- Render simulation paths as 3D line geometries using `@react-three/fiber`
- Use `OrbitControls` from drei for rotation/zoom
- Keep the existing metrics cards and stat calculations unchanged
- Add a grid plane, axis labels, and a median path highlighted in bold
- Maintain the existing color palette for paths

### Files

| File | Action |
|------|--------|
| `supabase/functions/company-intelligence/index.ts` | CREATE |
| `src/components/CompanyIntelligence.tsx` | CREATE |
| `src/hooks/useCompanyIntelligence.ts` | CREATE |
| `src/pages/Index.tsx` | EDIT — add CompanyIntelligence below analysis |
| `src/lib/apiGovernor.ts` | EDIT — register company-intelligence |
| `src/components/sandbox/StatArbEngine.tsx` | EDIT — replace MonteCarloPanel with 3D |
| `package.json` | EDIT — add @react-three/fiber, @react-three/drei |

**7 files total**

