# Memory: index.md
Updated: now

# Project Memory

## Core
Entropy Lite — institutional terminal. Classy, never compare to Bloomberg in user-facing copy.
Landing page uses real screenshots only (no fabricated UI). WebP previews in src/assets/preview-*.webp.
Dashboard header has Brief button → EntropyBrief modal → shareable PNG to X/WhatsApp.
All quant modules MUST consume `useQuantSnapshot` for real σ/μ/VaR — never invent risk proxies.

## Memories
- [Entropy Brief](mem://features/platform-modules/entropy-brief) — Shareable 3-insight card, html-to-image PNG export, X/WhatsApp deeplinks
- [Quantitative Engine](mem://tech/quantitative-engine) — Real historical math (σ, μ, VaR, CVaR, Merton DD) via useQuantSnapshot + quant-engine.ts; powers RiskModeling and MonteCarlo
