

# Rebuild Strategy Lab: Live Market-Aware Strategy Intelligence

## What Changes

Replace the static `StrategyLab.tsx` (6 hardcoded strategy templates computed from portfolio averages) with a live, adaptive strategy engine that:

1. Ingests real-time market data (already available via `market-data` edge function)
2. Detects market regime and conditions client-side
3. Calls AI to generate context-appropriate strategies
4. Runs paper trades in-memory with live price updates
5. Auto-deactivates failing strategies, persists winners to localStorage

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│                   StrategyLab.tsx                     │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ Market    │  │ Regime   │  │ AI Strategy       │  │
│  │ Observer  │→ │ Detector │→ │ Generator (edge)  │  │
│  │ (hook)    │  │ (client) │  │                   │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│        ↕                            ↓                │
│  ┌──────────┐  ┌──────────────────────────────────┐  │
│  │ Price     │  │ Paper Trading Engine             │  │
│  │ Feed      │→ │ (in-memory, live PnL tracking)   │  │
│  │ (existing)│  │ auto-deactivate on drawdown      │  │
│  └──────────┘  └──────────────────────────────────┘  │
│                          ↓                           │
│  ┌──────────────────────────────────────────────────┐│
│  │ Strategy Memory (localStorage)                    ││
│  │ Winners, losers, conditions they worked in        ││
│  └──────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Implementation Steps

### 1. New Edge Function: `strategy-generate`

Backend function that receives current market state (VIX, sector performance, macro mood, portfolio holdings, detected regime) and returns 3-5 dynamically generated strategies using Lovable AI (Gemini 3 Flash).

Each strategy includes: name, type, rationale, entry/exit rules, position sizing logic, stop-loss %, take-profit %, expected regime suitability.

Uses `callAI` with structured tool-calling to extract JSON. Fallback chain: Gemini → OpenRouter (already built).

### 2. Client-Side Market Regime Detector

A `useMarketRegime` hook that consumes the existing `market-data` response (already polling every 15-30s) and classifies the current regime:

- **Trending Bull**: S&P up, VIX < 20, broad sector gains
- **Trending Bear**: S&P down, VIX > 25, broad sector losses
- **High Volatility**: VIX > 30, large intraday swings
- **Range-Bound**: Low VIX, narrow index movement
- **Crisis**: VIX > 35, correlated selloff across regions
- **Rotation**: Mixed sectors, some up sharply, others down

Detects conditions like breakout formation, vol compression, trend acceleration, liquidity stress from the data already flowing in.

### 3. Rebuilt `StrategyLab.tsx` Component

**Three-panel layout:**

**Panel A — Market Situational Map**: Shows detected regime, key signals (VIX level, sector rotation direction, mood score, cross-asset movements), refreshes every 15s from existing market-data.

**Panel B — Active Strategies**: AI-generated strategies with live paper trading. Each strategy card shows:
- Name, type, regime suitability
- AI rationale
- Entry/exit rules
- Live paper PnL (updated from price-feed)
- Rolling drawdown
- Signal precision count
- Status badge: ACTIVE / ADAPTING / DEACTIVATED
- Auto-kill threshold: -5% drawdown → deactivate

**Panel C — Strategy Memory**: Historical log of strategies that worked/failed, indexed by market conditions. When similar regime reappears, suggests reactivation.

### 4. Paper Trading Engine (Client-Side)

In-memory trading simulator using existing `price-feed` polling (already running at 8s intervals):
- When strategy activates → record entry price, position size
- Track live PnL per strategy
- If drawdown exceeds threshold → auto-deactivate, log to Scar Memory
- If take-profit hit → mark as successful, log to Strategy Memory

### 5. Strategy Adaptation Logic

When regime changes (detected by hook):
- Notify active strategies
- Strategies mismatched to new regime get "ADAPTING" status
- If mismatch persists 2+ cycles → deactivate
- Trigger new AI generation for new regime
- Check Strategy Memory for previously successful strategies in this regime

### 6. Strategy Memory (localStorage)

```typescript
interface StrategyMemoryEntry {
  id: string;
  strategy: GeneratedStrategy;
  regime: string;
  entryTime: number;
  exitTime: number;
  pnlPct: number;
  outcome: "win" | "loss" | "neutral";
  conditions: { vix: number; mood: string; sectorLeader: string };
}
```

Stored in `entropy-strategy-memory` localStorage key. Queried when new regime detected.

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/strategy-generate/index.ts` | **Create** — AI strategy generation endpoint |
| `supabase/config.toml` | **Modify** — Add `strategy-generate` function config |
| `src/hooks/useMarketRegime.ts` | **Create** — Regime detection from market-data |
| `src/hooks/usePaperTrading.ts` | **Create** — In-memory paper trade tracker |
| `src/hooks/useStrategyMemory.ts` | **Create** — localStorage strategy history |
| `src/components/sandbox/StrategyLab.tsx` | **Rewrite** — Full rebuild with 3-panel layout |

## Key Constraints

- Reuses existing `market-data`, `price-feed`, and `callAI` infrastructure — no new API keys needed
- AI calls throttled to 1 per regime change (not per refresh cycle) to conserve credits
- All paper trading is client-side — no database tables needed
- Strategy Memory persists via localStorage (consistent with Scar Memory pattern)
- Existing sandbox navigation in `EntropySandbox.tsx` unchanged — only the Strategy Lab content changes

