

User wants:
1. Keep landing page layout/structure intact — only polish copy (human voice, consistent punctuation), no section restructuring.
2. In `desirable-assets`, soften the "throw if nothing passes filters" rule so the panel doesn't go permanently empty.

## Plan

### Part 1 — Landing page: copy polish only (no layout changes)

Keep every section, grid, component, and asset import exactly as-is in `src/pages/LandingPage.tsx`. Only edit text strings:

- **Punctuation consistency**: pick one style and apply throughout — sentence case for headings, single em-dash spacing (` — `), no trailing periods on short labels/CTAs, periods on full-sentence body copy, Oxford commas on, no double spaces.
- **De-AI-ify phrasing**: replace generic marketing phrases ("institutional-grade", "powered by", "leverage", "harness", "unlock", "next-generation", "seamlessly", "cutting-edge") with concrete, human, slightly opinionated lines.
- **Hero subline**: rewrite once to sound like a person wrote it, not a pitch deck.
- **Stats strip numbers**: keep the strip and layout, but swap fabricated-sounding figures for honest, defensible ones (or rephrase as qualitative).
- **Principles block**: keep 4-bullet layout, rewrite each bullet in plain language (no consultant abstractions).
- **How-it-works steps**: keep 6-step layout, rewrite each step's title + description in concrete terms (name the actual engine where relevant).
- **Features grid**: keep all cards, rewrite each card's copy in user-voice ("You see…" / "You get…").
- **Final CTA**: rewrite tagline + button text to sound human.

No JSX structure, no className, no imports, no asset swaps. Pure string edits.

### Part 2 — Desirable Assets: don't go empty

In `supabase/functions/desirable-assets/index.ts`, the previous pass added hard `throw` when AI returns 0 candidates or when 0 survive scoring. Risk: panel becomes permanently blank during quiet windows or if scoring is too strict.

Fix:
- Keep the "no fabricated tickers" rule (no `ELITE_FALLBACK_UNIVERSE` re-introduction).
- **Relax scoring filters progressively** if too few survive — instead of failing, lower the quality threshold in steps until at least N candidates pass (still using only AI-generated tickers, still real prices).
- If the AI itself returns 0 candidates → re-prompt once with a relaxed instruction ("return at least 8 high-quality large-cap names") before throwing.
- Only throw as the absolute last resort, with a clear, user-facing message the panel can display.

This keeps integrity (no mock tickers, no fabricated prices, no template prose) while ensuring the panel almost always renders real content.

### Files touched

- `src/pages/LandingPage.tsx` — copy-only edits (no layout/structure changes)
- `supabase/functions/desirable-assets/index.ts` — progressive filter relaxation + AI retry, no fallback universe

Deploy: `desirable-assets`.

