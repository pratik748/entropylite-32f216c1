---
name: Refined modern-minimal direction
description: System-wide UI refinement — softened radius, larger type, calmer borders, breathing-room mobile spacing
type: design
---

## Refined design language (April 2026)

The platform softened from "Bloomberg-dense" toward "modern minimal" while keeping institutional density inside panels.

### Tokens
- `--radius` bumped from `0.125rem` to `0.5rem` (cascades via shadcn `rounded-md/lg/sm`).
- Dark border eased to `0 0% 14%`, light to `0 0% 90%`.
- Scrollbars: 6px (was 3px), `border-radius: 999px`, transparent track.
- Container: padding `1rem → 1.25rem (sm) → 2rem (lg)`, `2xl: 1480px` cap.

### New utility classes
- `.h-display`, `.h-section`, `.h-card`, `.body-soft`, `.eyebrow`
- `.panel-soft`, `.surface-soft`, `.section-pad`, `.section-pad-sm`

### Tailwind extensions
- `boxShadow.soft`, `boxShadow.soft-lg`, `boxShadow.ring-soft`
- `letterSpacing.tighter`, `letterSpacing.eyebrow`

### Mobile rules
- Body 15px (was 16px). Tap targets 40px min. Opt-out via `[data-density="compact"]`.

### Shell polish
- Header h-11/h-12, rounded-md buttons, separators.
- PanelWrapper rounded-lg + hover:shadow-soft.
- Index tab nav: rounded-t, foreground active, backdrop-blur sticky.
- PublicNav h-16, rounded-full Sign In.
- AugmentDashboard pill module selector.
- Mobile dock: 2-col, min-h-14.

### Landing
- Hero text-7xl tracking-tighter, more whitespace, rounded-full CTAs.
- Feature cards rounded-2xl + 9x9 icon chip.
- FAQ rounded-2xl, 15px semibold questions.

DO NOT regress panel density inside terminal modules — softening is chrome-level only.
