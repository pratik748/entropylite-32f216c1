---
name: Proof Card
description: One-tap shareable PNG of a winning position with the EntropyLite signal that called it — appears as a Trophy button on any portfolio row with PnL ≥ +5%
type: feature
---

# Proof Card

Triggered from `PortfolioPanel`: a small Trophy icon appears next to the Trash icon on any analyzed position with `pnlPct ≥ 5`. Clicking it opens `ProofCard` (modal, portaled to body) which renders a beautiful 4:5 share card containing:

- Ticker + "divergence." headline
- Massive PnL % (emerald glow for wins, rose for losses)
- Days held (computed from `stock.createdAt` → `user_portfolios.created_at`)
- "The Call" line — derived from `analysis.suggestion + confidence + riskLevel`
- Optional verdict quote
- User's display name (from `auth.user_metadata.full_name | name | preferred_username | email-prefix`)
- entropylite.in branding

Export: `html-to-image` (toPng, pixelRatio 2, backgroundColor #0a0a0a).
Share: X intent URL + WhatsApp `wa.me` deeplink + Copy text + Download PNG.

Hardcoded hex colors inside the exported card are intentional — `html-to-image` strips CSS variables, so the card uses raw colors for export fidelity (same pattern as `EntropyBrief`).

`PortfolioStock.createdAt` was added and populated in `useCloudPortfolio` from the existing `user_portfolios.created_at` column.
