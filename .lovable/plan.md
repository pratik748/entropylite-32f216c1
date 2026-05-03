## Goal

Rewrite `src/pages/LandingPage.tsx` so the page reads like a narrative — tension → awakening → immersion → proof → weapon → power → control → identity → inevitability — without removing a single technical block. Apple + hedge fund + war room. Short sentences. Heavy whitespace. Keep the existing minimal black-on-white aesthetic.

Nothing is removed. The existing terminal screenshot, `FeatureGallery`, `MathResearch`, FAQ, founding-access reassurance, and footer all stay. Only copy, ordering, and a few framing wrappers change.

## New Section Order

```text
1. HERO — Tension first
2. THE SHIFT — Principles reframed as awakenings
3. THE EXPERIENCE — Terminal screenshot as "layers of perception"
4. UNDER THE HOOD — Math/models (existing MathResearch, reframed intro)
5. CLANK — Standalone weapon section (new)
6. THE STACK — 12 layers, progressive reveal
7. THE PIPELINE — 6 stages reframed "from chaos to decision"
8. IDENTITY SHIFT — "You're not trading. You're operating."
9. CTA — Inevitability + FAQ + final dark CTA
```

## Section-by-Section Copy

**1. HERO (rewrite, keep logo + stats + CTA)**
- Eyebrow badge: keep "Free during founding access · No credit card"
- H1: "Every trade you've taken / was already too late."  (second line in `text-black/45`)
- Sub-paragraph (3 short lines, generous leading):
  - "Markets move before you act."
  - "Information arrives delayed."
  - "Retail reacts. Institutions position."
- Closing line above CTA:
  - "EntropyLite doesn't tell you what will happen. It shows you what *can* happen — before the market decides."
- Primary CTA label: **Enter the Terminal** (replaces "Sign In Free")
- Keep secondary "See what is inside"
- Keep stats strip unchanged

**2. THE SHIFT (replaces "Principles")**
- Eyebrow: "The shift"
- H2: "You were taught to predict."
- Lead paragraph:
  - "But markets don't move on predictions."
  - "They move on pressure. On positioning. On constraints."
- Reframe each of the 4 PRINCIPLES as a realization. Keep current `desc` text but rewrite `title` as a first-person realization:
  - "Forecasts are fiction. Distributions are real."
  - "Structure moves price. Narrative explains it later."
  - "The system learns from me, not the crowd."
  - "Twelve engines. One quiet surface."
- CTA underneath: "Step inside →"

**3. THE EXPERIENCE (rewrite intro of the terminal preview block)**
- Eyebrow: "The experience"
- H2: "This is what you see when you stop guessing."
- Sub: "Four layers of perception, surfaced at once."
- Keep the dashboardPreview image unchanged.
- Relabel the four mini-captions as *layers of perception* (not "features"):
  - "Layer 01 — Live portfolio" / current desc
  - "Layer 02 — Probability" / Monte Carlo desc
  - "Layer 03 — Risk surface" / VaR/CVaR desc
  - "Layer 04 — Flow" / institutional flow desc
- Keep `<FeatureGallery />` immediately after with new lead-in heading: "Every surface, captured live."

**4. UNDER THE HOOD (wrap MathResearch)**
- Add a short intro band above `<MathResearch />`:
  - Eyebrow: "Proof"
  - H2: "This isn't opinion. This is math."
  - Sub: "Monte Carlo. VaR / CVaR. Merton. Ornstein–Uhlenbeck. Run on real history, not vibes."
- `<MathResearch />` itself unchanged.

**5. CLANK (new dedicated section — major addition)**
- Full-width, dark band (`bg-black text-white`) to make it feel like a weapon reveal.
- Eyebrow (white/40): "CLANK"
- H2 (white): "Sometimes markets stop being probabilistic."
- Giant follow-up line in muted white: "They lock."
- Three short stacked statements:
  - "CLANK detects deterministic windows."
  - "Structural inevitabilities — gamma walls, ETF rebalances, liquidity vacuums."
  - "When the math collapses to one outcome, you see it first."
- Footnote line: "Constraint detection across liquidity, positioning and dealer gamma."
- CTA: "See CLANK live →" (goes to /dashboard)

**6. THE STACK (replaces "Twelve intelligence layers" grid intro)**
- Eyebrow: "The stack"
- H2: "While you're looking at one chart, twelve systems are already running."
- Keep the existing 9-card FEATURES grid (the layers). Rename heading sub: "Each one a separate engine. Composed into one read."

**7. THE PIPELINE (rewrite intro of HOW_IT_WORKS)**
- Eyebrow: "The pipeline"
- H2: "From chaos. To decision."
- Sub: "Six stages. Always running. You see only the conclusion."
- Keep the 6 HOW_IT_WORKS items unchanged.
- CTA stays.

**8. IDENTITY SHIFT (new tight band between pipeline and FAQ)**
- White section, lots of whitespace, centered.
- One line, large: "You're not trading anymore."
- Below in muted: "You're operating."
- No CTA — silence holds the weight.

**9. CTA / INEVITABILITY (rewrite final dark CTA + keep FAQ above it)**
- Keep "Why now / risk reversal" trio (no card, 30s setup, founding) unchanged.
- Keep FAQ section unchanged.
- Final dark CTA copy:
  - H2: "Most people will keep reacting."
  - Sub: "You don't have to."
  - Primary CTA: **Enter EntropyLite**
  - Keep founding-pricing footnote.

## Implementation Notes (technical)

- Single file edit: `src/pages/LandingPage.tsx`.
- Update the `PRINCIPLES` array titles; keep descriptions.
- Replace section header copy blocks; keep all JSX structure for grids, cards, image, CTAs.
- Add new CLANK `<section>` between MathResearch and the FEATURES grid. Use existing tokens (`bg-black text-white`, `font-mono text-[10px] tracking-[0.3em]`).
- Add new IDENTITY `<section>` between the "Why now" risk-reversal block and FAQ.
- Update document.title to: `"EntropyLite | See what the market hasn't decided yet"` and meta description to match the new hook.
- No new dependencies, no asset changes, no route changes.
- Mobile sticky CTA label updated to "Enter the Terminal".

## What Is NOT Changed

- `FeatureGallery.tsx`, `MathResearch.tsx`, `PublicNav`, footer, FAQ content, stats, dashboard image, founding-access reassurance trio, routes, auth redirect logic.
- All math, models, formulas, layer count, pipeline steps remain intact.

## Outcome

The page reads top-to-bottom as a single arc that makes the visitor feel a power shift, while every institutional proof point a serious reader needs is still on the page — just reframed as revelation instead of a feature list.
