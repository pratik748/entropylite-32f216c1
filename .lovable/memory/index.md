# Memory: index.md
Updated: now

# Project Memory

## Core
Entropy Lite — institutional terminal. Classy, never compare to Bloomberg in user-facing copy.
Landing page uses real screenshots only (no fabricated UI). WebP previews in src/assets/preview-*.webp.
Dashboard header has Brief button → EntropyBrief modal → shareable PNG to X/WhatsApp.
All quant modules MUST consume `useQuantSnapshot` for real σ/μ/VaR — never invent risk proxies.
UI direction: modern-minimal. Softer radius (0.5rem), calmer borders, breathing-room spacing. Density stays inside panels, chrome stays soft.

## Memories
- [Entropy Brief](mem://features/platform-modules/entropy-brief) — Shareable 3-insight card, html-to-image PNG export, X/WhatsApp deeplinks
- [Ensemble Consensus](mem://features/platform-modules/ensemble-consensus) — Shared inverse-variance + Platt-calibrated gate in `_shared/ensemble.ts`; STAND_ASIDE when calibratedProb<58% or agreement<55%; wired into direct-profit + desirable-assets; UI shows calibrated win-prob bar and per-engine ✓/✗
- [TWRD Veracity Layer](mem://features/platform-modules/twrd-veracity-layer) — Truth-weighted gate T(x,t) over signals; tables twrd_*; wired into reflexivity-engine + risk-intelligence; TruthBadge UI
- [AI prompt standards](mem://tech/ai-prompt-standards) — All system prompts must use the 5-block structure: role, reasoning framework, calibration rules, guardrails, output contract
- [Quantitative Engine](mem://tech/quantitative-engine) — Real historical math (σ, μ, VaR, CVaR, Merton DD) via useQuantSnapshot + quant-engine.ts; powers RiskModeling and MonteCarlo
- [Refined modern-minimal direction](mem://style/refined-modern-minimal) — Token softening, new utility classes, mobile defaults, shell polish (April 2026)
