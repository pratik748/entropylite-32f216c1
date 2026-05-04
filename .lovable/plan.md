# First-Time Tutorial — Arrow-Based Walkthrough

When a user opens the dashboard for the first time, overlay a guided tour that points (with arrows) at the key parts of the terminal, one step at a time. After completion or skip, it never shows again.

## What the tour covers

Sequenced steps, each with a short title, one-line description, and an arrow pointing to the actual element:

1. **Stock Input** — "Drop a ticker here. This is where every analysis begins."
2. **Tab Bar** — "Nine modes. Dashboard is your cockpit; the rest are specialist lenses."
3. **Geopolitics tab** — "Live world risk overlay. Already running in the background."
4. **Sandbox tab** — "Twelve engines. Run scenarios before the market does."
5. **Risk + Fortress tabs** — "Defensive layer. Stress, hedge, fortress mode."
6. **Direct Profit toggle (header)** — "One-button verdict. Arbitrated across all engines."
7. **Brief button (header)** — "Three insights. Shareable card. PNG export."
8. **System Status bar** — "Live data health. Always visible."

Final step: "You're in. Press ? anytime to replay the tour."

## How it works

- **Trigger**: On `/dashboard` mount, check `localStorage.entropy_tour_done`. If absent and `loaded === true` and stocks have hydrated, start the tour.
- **Replay**: Pressing `?` (or a small "Tour" link in the header overflow) re-opens it.
- **Skip / Next / Back**: Footer buttons. ESC = skip. Skip and Finish both set the flag.
- **No external library** — keep bundle lean. Custom lightweight component using `getBoundingClientRect()` + a fixed overlay.

## Visual style

Matches the institutional terminal aesthetic (no buzzwords, mono labels):

- Full-screen dim overlay (`bg-background/80 backdrop-blur-sm`), z-index above header.
- A "spotlight" cutout: a transparent rounded rectangle aligned to the target element's bounding box (4px padding), with a 1px primary border + soft glow.
- An **SVG arrow** drawn from the tooltip card to the spotlight edge — curved bezier, 1.5px stroke, primary color, animated dash on draw.
- Tooltip card: `glass-panel` style, ~280px wide, mono caption + step counter `03 / 08`, title, body, and `Skip · Back · Next` row.
- Auto-positions the card on the side with most space (top/bottom/left/right of target). Repositions on window resize and on tab change.
- Smooth 200ms fade between steps.

## Mobile behavior

Viewport is 420px. The tab bar wraps and Direct Profit/Brief live in a Sheet menu.

- Detect `useIsMobile()`. On mobile, condense to 5 steps (Input, Tabs, Direct Profit, Brief, Status), and skip steps whose target is offscreen.
- For targets inside the mobile menu (Sheet), the tour will programmatically open the Sheet for that step, then close it after Next.
- Arrows shorten to straight lines on small screens.

## Tab-aware steps

Some targets only exist when their tab is active (e.g. Geopolitics globe). For those steps the tour calls `setActiveTab(...)` first, waits one frame for layout, then anchors the arrow. After Next, it returns to `dashboard`.

## Technical details

**New files**
- `src/components/tour/TerminalTour.tsx` — overlay, spotlight, SVG arrow, card, keyboard handlers.
- `src/components/tour/tourSteps.ts` — ordered step list `{ id, selector, title, body, requiresTab?, side? }`.
- `src/hooks/useTour.ts` — manages `localStorage` flag, current step index, start/skip/finish, and exposes `startTour()` for the replay shortcut.

**Edits**
- `src/pages/Index.tsx`:
  - Add `data-tour="..."` attributes to: stock input wrapper, tab bar container, each relevant tab button, status bar, and (via props) the Brief + Direct Profit buttons.
  - Mount `<TerminalTour stocks={stocks} setActiveTab={handleTabSwitch} />` after `loaded`.
  - Listen for `?` keypress to call `startTour()`.
- `src/components/Header.tsx`: forward `data-tour="brief-btn"` and `data-tour="direct-profit-btn"` onto the existing buttons (no visual change).
- `src/components/terminal/SystemStatusBar.tsx`: add `data-tour="status-bar"` on root.

**Selector strategy**: query by `[data-tour="..."]` so refactors that change classNames don't break the tour. If a target is missing, that step is skipped silently.

**Persistence**: `localStorage.setItem("entropy_tour_done", "1")` on Finish or Skip. Versioned key (`entropy_tour_done_v1`) so we can bump it later when the UI changes meaningfully.

## Out of scope

- Onboarding for `/` landing page (this is dashboard-only, per request).
- Per-tab nested tours inside Sandbox/Augment sub-modules (can be a follow-up).
