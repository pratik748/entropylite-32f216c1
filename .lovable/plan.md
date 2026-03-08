

# Fix Geopolitical Visuals, Remove Analysis History, Replace with Sentiment Intel

## Issues Identified

1. **"Yellow" geopolitical section**: The `--warning` color (`38 92% 55%` — amber/yellow) dominates because the regime signal is "transition" and many elements use `text-warning`. With a global risk score of 62 and regime "transition", the color mapping routes to warning/yellow instead of loss/red. The severity-to-color mapping needs adjustment — at score 62 with active wars, it should feel more urgent.

2. **Broken transition/escalation bars**: The escalation probability bars in `GeopoliticalPanels.tsx` (line 102-104) use inline `width` with `evt.escalationProb * 100`. The data shows escalationProb as decimals (0.35, 0.45 etc.) which is correct. The bars may appear broken if the parent container has no defined width or if `overflow: hidden` clips them. Need to verify and fix the bar rendering.

3. **Analysis History panel still present**: Lines 301-308 of `Index.tsx` show the "Analysis History" resizable panel in the desktop layout. This needs to be removed and replaced with a Sentiment Intel panel.

4. **Sentiment intel call failing**: Network requests show `sentiment-intel` POST failing with "Load failed" — needs investigation but that's a separate issue from the UI changes.

## Plan

### 1. Make Geopolitical Section Feel Dynamic and Urgent
**File: `src/components/GeopoliticalGlobe.tsx`**
- Shift the risk score color thresholds: score >= 50 should use `text-loss` (red) instead of `text-warning` (yellow) since 50+ with active wars is crisis-level
- Add animated pulse effects to conflict markers based on severity
- Add a dynamic threat level banner that uses red tones when conflicts > 5 and severity avg > 0.5

**File: `src/components/geopolitical/GeopoliticalPanels.tsx`**
- Fix the `RiskStrip` regime color logic: "transition" with score > 55 should map to `text-loss` not `text-warning`
- Make entropy zone cards use severity-proportional coloring (red gradient for high severity, not uniform yellow)
- Add pulse animations to high-severity conflict cards
- Fix escalation bar styling — ensure bars have explicit min-width and proper rendering

**File: `src/components/charts/RiskGauge.tsx`**
- Lower the "loss" threshold from 70 to 55 so the gauge renders red at score 62 (current data)

### 2. Remove Analysis History, Replace with Sentiment Intel
**File: `src/pages/Index.tsx`**
- Remove the AnalysisHistory import and the resizable panel on lines 301-308 (desktop)
- Replace that bottom-center panel with a `SentimentDashboard` panel (compact mode) showing the composite score, source breakdown, and trend
- Remove AnalysisHistory from mobile layout if present (it's not currently in mobile, confirmed)
- Keep the `useCloudPortfolio` history hooks but stop rendering the AnalysisHistory component

### 3. Fix Conflict Severity Color Mapping Throughout
**Files: `GeopoliticalPanels.tsx`, `GeopoliticalGlobe.tsx`**
- War type conflicts (severity > 0.7) should always render in deep red, not amber/yellow
- The `TYPE_BADGE` map already has `war: "bg-red-500"` which is correct, but surrounding panels use `glass-glow-loss` only conditionally — make high-severity zones always use loss styling
- Replace `text-warning` with `text-loss` for conflicts with severity > 0.6

### Technical Details
- The `RiskGauge` threshold change: line 28 change `clampedScore >= 70` to `clampedScore >= 55`
- `RiskStrip` regime color: change `transition` mapping from `text-warning` to conditional based on globalRiskScore
- Index.tsx: Replace lines 301-308 (AnalysisHistory panel) with SentimentDashboard compact panel
- Add CSS animation `animate-threat-pulse` for high-severity conflict cards

