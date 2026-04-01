# Plan: Add Palantir Blueprint Theme Toggle

## Overview

Add a "Theme" button at bottom-right that toggles between the current dark theme and a Palantir Blueprint-inspired theme. The Palantir theme is a dark-mode variant with distinct characteristics: deep navy-charcoal backgrounds (not pure black), blue-tinted accents, slightly more rounded corners, and Blueprint-style color semantics.and everything looks powerful and strong like a data driven war room data deep.

## Current System

- ThemeToggle exists at bottom-left toggling light/dark via `.light` class
- All colors use CSS custom properties (HSL) in `:root` and `.light`
- The toggle persists to `localStorage("entropy-theme")`

## Changes

### 1. `src/index.css` — Add `.palantir` theme class

Add a new `.palantir` class block alongside `:root` and `.light` that overrides ALL CSS custom properties:

- **Background**: Deep navy-charcoal (`220 20% 7%`) instead of pure black
- **Card/Surface**: Slightly blue-tinted darks (`220 18% 10%`, `220 16% 13%`)
- **Primary**: Blueprint blue accent (`210 100% 56%`) — the signature Palantir blue
- **Border**: Blue-tinted edges (`220 15% 18%`)
- **Gain/Loss**: Same green/red but slightly desaturated for professional feel
- **Glass**: Blue-tinted glass effects instead of neutral gray
- **Radius**: Slightly larger (`0.25rem`) for Blueprint feel
- **Scrollbar/Selection**: Blue-tinted to match

### 2. `src/components/ThemeToggle.tsx` — Convert to 3-way toggle

- Rename to support 3 themes: `dark` (default), `light`, `palantir`
- Move to bottom-right (`right-3` instead