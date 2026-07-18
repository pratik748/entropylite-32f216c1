# Entropy Public-Site Design System

Fixed institutional dark system for every public surface (`/`, `/about`, `/backbone`, `/data`,
`/cadence`, `/pricing`, `/access`, `/disclaimer`, auth, 404). The terminal (`/dashboard`) keeps
its own themeable system and is out of scope here. The public site does **not** follow the
terminal theme toggle — it is one fixed voice.

Implementation: React + Vite + Tailwind. Tokens live in `tailwind.config.ts` (`carbon`,
`hairline`, `signal`, `pos`, `neg`, `gilt`) and `src/index.css` (`.mkt-*` classes).

---

## 1 · Color tokens

### Surfaces (elevation = surface step, never shadow)

| Token         | Hex       | Usage |
|---------------|-----------|-------|
| `carbon-950`  | `#050505` | Page base. The default background of every route. |
| `carbon-900`  | `#0A0A0A` | Raised band: global chrome, alternating sections, panels on `950`. |
| `carbon-850`  | `#0E0E0E` | Panel interior on `900` (e.g. PDF viewer well, tooltips). |
| `carbon-800`  | `#121212` | Elevated panel / hover state of a `900` panel. |
| `carbon-750`  | `#171717` | Row hover, active surface. Highest step; nothing sits above it. |

### Structure

| Token             | Hex       | Usage |
|-------------------|-----------|-------|
| `hairline-faint`  | `#161616` | Interior dividers inside a dense component (table rows, data cells). |
| `hairline`        | `#1F1F1F` | Default separator: section borders, panel frames, grid lines. |
| `hairline-strong` | `#2B2B2B` | Interactive outlines (secondary buttons, inputs), rule accents. |

All separators are 1px. No borders thicker than 1px anywhere on the site.

### Text (white at fixed opacities — no gray hex ramp, no blue cast)

| Role            | Value        | Usage |
|-----------------|--------------|-------|
| Primary         | `white/90–100` | Headlines, key figures, row keys. |
| Secondary       | `white/50–65`  | Body copy, descriptions. |
| Tertiary        | `white/30–45`  | Labels, captions, table headers, metadata. |
| Disabled/trace  | `white/20–30`  | Index numbers, footnotes, legal microcopy. |

### Functional accents (never decorative)

| Token          | Hex       | Rule |
|----------------|-----------|------|
| `signal`       | `#E8912D` | Live/active market data only: LIVE marker, active structural signals, regime alerts. Never on buttons, links, or headings. |
| `signal-bright`| `#F5A83C` | Hover/emphasis state of `signal`. |
| `pos`          | `#4E9E72` | Gains, upside deltas. Data cells only. |
| `neg`          | `#C4564F` | Losses, downside deltas, VaR tails. Data cells only. |
| `gilt`         | `#9E7E3C` | Reserved for premium/strategic elements. Currently unused by design — scarcity is the point. |

Forbidden: blues, purples, gradients, glassmorphism/backdrop blur (except a minimal
`blur-sm` on sticky chrome), glows, colored shadows, neon.

---

## 2 · Typography

**Stack:** `IBM Plex Sans` (display + body) and `IBM Plex Mono` (labels, data, numerals).
Two families, no serif on the public site.

| Class / role   | Family | Size | Weight | Tracking | Line-height |
|----------------|--------|------|--------|----------|-------------|
| `.mkt-display`   | Plex Sans | clamp(36 → 64px) | 600 | −0.03em | 1.05 |
| `.mkt-display-2` | Plex Sans | clamp(24 → 38px) | 600 | −0.025em | 1.12 |
| Card/section title | Plex Sans | 14–18px | 600 | −0.02em (`tracking-tight`) | snug |
| `.mkt-lede`      | Plex Sans | clamp(15 → 17px) | 400 | −0.011em | 1.6 |
| Body dense       | Plex Sans | 12.5–13.5px | 400 | −0.01em | 1.55–1.65 |
| `.mkt-label`     | Plex Mono | 8–10px | 500 | +0.18em, uppercase | 1.3 |
| `.mkt-num`       | Plex Mono | contextual | 400–500 | −0.01em | 1.3 |

Rules:
- Every numeral on the site is set in `.mkt-num` → `tabular-nums`, decimals align in columns.
- Headers are large but understated: weight 600 max, tight tracking, no gradient text.
- Numeric table columns are right-aligned; text columns left-aligned.

---

## 3 · Spacing & grid

- **Container:** `max-w-7xl` (1280px) with `px-8` at desktop, `px-5` mobile. Desktop-first ≥1440px;
  the container centers with generous margins at 1440+.
- **Section rhythm:** `py-20` / `py-28` (80/112px) for narrative sections; `py-16`/`py-24` on sub-pages.
- **Panel grids:** the shared-border pattern — parent gets `border-t border-l`, each cell gets
  `border-b border-r` — produces engineering-drawing grids with no doubled lines.
- **Data density:** table rows 28–36px, console rows ~30px, cell padding `px-4 py-2`.
- **Radius: 0.** Every panel, button, table and input is square. The single exception is the
  1.5×1.5px live-marker square (also square).
- Base unit 4px; components snap to the 4px grid.

---

## 4 · Motion tokens

| Token | Value | Usage |
|-------|-------|-------|
| Duration, standard | 150ms | Hover states: color, border-color. |
| Duration, reveal | 200ms | `.mkt-reveal` — content entering (fade + 4px rise). |
| Easing | `cubic-bezier(0.25, 1, 0.5, 1)` (ease-out-quart) or CSS `ease-out` | Everything. |

Rules: no bounce, no springs, no ping/pulse animations, no marquees, no loaders beyond a plain
spinner, no parallax. Information is revealed, not performed. `prefers-reduced-motion` collapses
all motion (global rule in `index.css`).

---

## 5 · Component primitives

- **Panel** — `border border-hairline bg-carbon-900`. Optional header strip: `h-8/h-9`,
  `border-b border-hairline`, mono label left, mono metadata right. No shadows, no radius.
- **Separator** — 1px `hairline`; use `hairline-faint` inside data components.
- **Data table** — header row: `.mkt-label text-white/30`, 1px bottom rule; body rows:
  `border-b hairline-faint`, hover `bg-carbon-750` @150ms; numerals `.mkt-num` right-aligned;
  deltas in `pos`/`neg`; active signals in `signal`.
- **Data cell** — mono microlabel (`text-white/30`) over value (`.mkt-num text-white/90`),
  16px value in stat blocks, stacked with 4px gap.
- **Primary button** — `h-11 px-7 bg-white text-carbon-950 font-semibold text-[13px]`,
  hover `bg-white/85`. Square.
- **Secondary button** — `h-11 px-7 border border-hairline-strong text-white/75`,
  hover `border-white/40 text-white`. Square.
- **Section intro** — index number + 32px rule + mono eyebrow, then display-2 headline,
  optional lede at `white/50`. (`SectionIntro` in `src/components/marketing/Section.tsx`.)
- **Live marker** — `1.5×1.5px` square in `signal` + mono "LIVE". The only always-amber element.
- **Hover/active states** — surface step up (`carbon-900 → 750`) or border brighten
  (`hairline-strong → white/40`); never scale, never glow.

## 6 · Responsive behavior

- ≥1440px: full 12-col layouts, console two-pane, tables at natural width.
- 1024–1440: identical structure, container margins shrink.
- <1024: console stacks (positions above risk rail), stat bands go 2-up, tables scroll inside
  `overflow-x-auto` with a min-width — columns never wrap or shrink below legibility.
- <640: nav collapses to sheet, sticky bottom CTA appears on the landing page only.
