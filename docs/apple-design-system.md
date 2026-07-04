# Entropy Design System

A HIG-inspired design language for EntropyLite. The goal is not to imitate Apple screen-for-screen,
but to make every surface feel like it was built with the same restraint: calm, tactile, layered,
and impossible to notice until it's gone.

Everything below is already wired into the codebase. New and migrated components should consume
these tokens and primitives — never hard-coded values.

---

## 1. Color tokens (`src/index.css`)

All colors are HSL CSS variables consumed through Tailwind (`bg-card`, `text-gain`, …).
Three themes: **dark** (default, true-black elevated), **light** (grouped gray + white cards),
**palantir/"Paper"** (flat editorial).

| Token | Role | Dark value |
|---|---|---|
| `--background` | App canvas | `240 10% 3%` (near-black, whisper of blue) |
| `--card` / `--surface-1..3` | Elevated surface ladder | `8% → 10% → 14%` lightness steps |
| `--gain` | Positive / up | iOS systemGreen (`#30D158`-class) |
| `--loss` | Negative / down | iOS systemRed (`#FF453A`-class) |
| `--warning` | Caution | iOS systemOrange |
| `--info` | Neutral-informational, focus ring | iOS systemBlue |
| `--glass-*`, `--material-thin/regular/thick` | Translucent materials | alpha-layered |
| `--shadow-1..3` | Depth ladder | diffuse ambient, never harsh |

Rules:
- Color is **semantic only**: green/red for P&L direction, orange for caution, blue for focus and
  informational accents. Chrome stays neutral.
- Never introduce a new hex. Extend the token table instead.

## 2. Typography

- **Stack**: `-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, …` (SF on Apple hardware,
  Inter elsewhere). Mono: `SF Mono, ui-monospace, JetBrains Mono` — for tabular data only.
- **Scale** (utility classes in `index.css`, HIG-derived):
  `text-large-title` 34 · `text-title-1` 28 · `text-title-2` 22 · `text-title-3` 20 ·
  `text-headline` 17/600 · `text-callout` 16 · `text-subheadline` 15 · `text-footnote` 13 ·
  `text-caption-1` 12 · `text-caption-2` 11.
- Negative tracking scales with size (baked into the utilities). Numerals use `.tabular`
  (`font-variant-numeric: tabular-nums`) so prices never jitter.
- **No uppercase-mono eyebrows in product chrome.** Labels are sentence case, 12–13px,
  `font-medium text-muted-foreground`. The terminal look lives in data tables, not labels.

## 3. Spacing & geometry

- 4pt base grid; card padding 16–24px (`p-4`–`p-6`); gaps 8–12px between siblings.
- Radius scale: `--radius: 0.875rem` (14px) drives `rounded-lg`; `rounded-xl` 18px,
  `rounded-2xl` 22px for cards, `rounded-full` for pills/controls.
- Cards float: `border-border/70` + `shadow-soft` (token `--shadow-1`). Hover raises to
  `shadow-soft-lg`. Never use hard `border-2` outlines.
- Touch targets ≥ 44px on mobile (enforced globally in `index.css`).

## 4. Materials

| Class | Use |
|---|---|
| `.glass-subtle` | Bars, strips (thin material, 14px blur) |
| `.glass-panel` / `.glass-card` | Toolbars, nav (regular material, 24px blur + top highlight) |
| `.glass-thick` | Floating docks, popovers over content (32px blur) |

Materials always pair with a `--glass-border` hairline and sit on the shadow ladder.

## 5. Motion (`src/lib/motion.ts`)

Physics, not durations. Transform + opacity only (GPU-composited, 120fps-capable).

| Preset | Feel | Use |
|---|---|---|
| `springSnappy` | crisp, no overshoot | buttons, toggles, selection |
| `springGentle` | settles softly | card/panel entrances |
| `springBouncy` | whisper of overshoot | badges, confirmations |
| `springLayout` | tight morph | `layoutId` pills, shared-element moves |

Shared variants: `fadeUp`, `scaleIn`, `staggerContainer`/`staggerItem` (iOS-list stagger),
`pressable`/`pressableIcon` (tap feedback). CSS equivalents: `.pressable`, `.animate-breathe`,
`animate-slide-up`, `animate-scale-in`, easing utilities `ease-out-quart`/`ease-out-expo`/`ease-spring`.

`prefers-reduced-motion` is honored globally; Framer components should also use
`useReducedMotion()` for large moves (see `PageTransition`).

## 6. Interaction principles

- **Segmented control** (`Index.tsx` nav): active tab is a sliding glass pill via
  `layoutId="tab-pill"` + `springLayout`. Reuse this pattern for any exclusive choice.
- **⌘K command palette** (`CommandPalette.tsx`): every screen and key action one keystroke away.
  Register new screens/actions there when adding them.
- **Progressive disclosure**: headline number first (`text-title-1`), supporting detail in
  `text-caption-1 text-muted-foreground`, converted currencies as `≈` afterthoughts.
- Every pressable surface gives tactile feedback (`.pressable` → `scale(0.97)`).
- Loading states breathe (`animate-breathe`), they don't flash. Skeletons use the same pulse.

## 7. Component recipes

- **Card**: `rounded-2xl border border-border/70 bg-card p-5 shadow-soft` (+ `fadeUp` entrance).
- **Metric tile**: `rounded-xl bg-surface-2 p-3.5` → caption label, `text-subheadline font-semibold tabular` value.
- **Pill button/chip**: `rounded-full px-3 py-1.5 text-[12px] font-medium tracking-tight` + `.pressable`.
- **Status dot**: `h-1.5 w-1.5 rounded-full bg-gain` + `animate-breathe` (live) or `animate-ping` halo (critical).
- **Floating dock** (mobile): centered `rounded-full glass-thick p-1.5 shadow-soft-xl` island.

## 8. Migration roadmap

Foundation (done): tokens, motion system, chrome (header, nav, ticker, status bar, dock),
primitives (button, card, input, tabs, skeleton), dashboard analysis column, ⌘K palette.

Remaining screens, in order of user exposure — apply §7 recipes, replace uppercase-mono labels
with sentence-case captions, swap `rounded-sm`+hard borders for the card recipe:

1. `DailyBriefing`, `PortfolioBlotter`, `LiveNewsFeed` (first-session surfaces)
2. `MarketOverview`, `DesirableAssets`, `RiskDashboard`, `FortressMode`
3. `EntropySandbox` + engines, `StatArbEngine`, `AugmentDashboard` modules
4. `GeopoliticalGlobe` + panels, landing/marketing pages
5. Charts: adopt token colors (`hsl(var(--gain))` etc.), 1.5px strokes, no glow filters
