

# Plan: AI-Native Across All Subsystems

## Current State

**Already AI-powered (6 edge functions):** Stock Analysis, Strategy Generation, Causal Effects, Desirable Assets, Geopolitical Intelligence, Sentiment Intel

**Static rule-based logic (needs AI):** 14+ subsystems using hardcoded formulas, `Math.random()`, and synthetic data

## Priority-Ordered Implementation

### Phase 1 — Highest Impact (3 new edge functions)

**1. `risk-intelligence` edge function**
- Replaces the static VaR/CVaR formulas in RiskDashboard
- AI evaluates portfolio-wide: downside probabilities, volatility regime, liquidity stress, systemic risk, factor exposures
- Input: portfolio holdings, current VIX, market regime, sector data
- Output: structured risk scores, VaR/CVaR estimates, factor decomposition, regime-adjusted risk ratings

**2. `portfolio-intelligence` edge function**
- Replaces static logic in PortfolioCommandCenter, AftermathMatrix, and ExecutionEngine
- AI optimizes: capital allocation efficiency, diversification, correlation exposure, market impact estimation, optimal execution strategy
- Input: full portfolio with weights, prices, sectors, betas
- Output: rebalancing suggestions, concentration warnings, impact estimates, execution recommendations

**3. `flow-intelligence` edge function**
- Replaces `Math.random()` signals in FlowDetectionPanel
- AI interprets: institutional flow patterns, CTA momentum, gamma exposure, dark pool activity from portfolio structure + market context
- Input: portfolio, VIX, market regime, sector rotation data
- Output: flow signal classifications with intensity, direction, and confidence

### Phase 2 — Sandbox AI Enhancement (2 new edge functions)

**4. `monte-carlo-intelligence` edge function**
- AI calibrates Monte Carlo parameters (drift, vol, jump probability) per asset based on current regime instead of static `scenarioParams`
- AI interprets simulation results and generates narrative summary
- MonteCarloEngine sends portfolio + regime → gets calibrated params + AI interpretation

**5. `crown-intelligence` edge function**
- Replaces rule-based opportunity detection in CrownLayer
- AI identifies: crowded trades, squeeze setups, mean-reversion plays, structural dislocations
- Uses portfolio data + market context to generate actionable opportunities with confidence scores

### Phase 3 — Deep Intelligence Layers

**6. `deep-intelligence` edge function**
- Replaces formula-derived scores in IntelligenceLayers (Management DNA, Capital Flow, Narrative, Structural Risk)
- AI produces institutional-grade assessments per stock using fundamentals + market context

### Frontend Changes (all phases)

Each subsystem component gets updated to:
1. Call its new edge function via `governedInvoke()` on mount/refresh
2. Show loading state while AI processes
3. Display AI-generated data instead of computed formulas
4. Fall back to current static logic if AI call fails (graceful degradation)

### Cost Management

- All new functions routed through `apiGovernor` with `tier: "ai"` (30s cooldown)
- Tab-switch triggers refresh but cache prevents redundant calls within TTL
- AI functions use tool-calling for structured JSON output (no parsing failures)
- Estimated additional load: ~6 AI calls per full dashboard refresh, throttled by governor

### Technical Approach

- All edge functions use the existing `callAI` shared module (NVIDIA Qwen 3.5-122B)
- All use `tools` + `tool_choice` for structured output (avoids JSON parsing issues)
- All include `requireAuth` for security
- Frontend components maintain current UI structure — only the data source changes from `useMemo` formulas to API responses

### Implementation Order

1. `risk-intelligence` + RiskDashboard update
2. `flow-intelligence` + FlowDetectionPanel update  
3. `portfolio-intelligence` + CommandCenter/Aftermath/Execution updates
4. `monte-carlo-intelligence` + MonteCarloEngine update
5. `crown-intelligence` + CrownLayer update
6. `deep-intelligence` + IntelligenceLayers update

Each step is independently deployable and the system remains functional throughout (static fallbacks).

