

# Institutional UI Refinement Plan

## Problem
The current UI has inconsistencies that break the institutional terminal feel: rounded corners where there should be sharp edges, inconsistent spacing, scrollbar visibility issues, mobile layout not dense enough, and several polish gaps across panels, cards, and interactive elements.

## Changes

### 1. Global CSS Refinements (`src/index.css`)
- Reduce `--radius` from `0.375rem` to `0.125rem` for razor-sharp institutional corners
- Tighten scrollbar thumb to 3px with darker track
- Add `selection` color styling (white text on dark highlight)
- Add utility class `.institutional-input` for consistent form inputs across the app
- Improve `glass-panel` with tighter blur values and crisper borders
- Add smooth momentum scrolling with `-webkit-overflow-scrolling: touch` on all overflow containers
- Add `.no-touch-bounce` to prevent iOS bounce on fixed panels

### 2. Header Tightening (`src/components/Header.tsx`)
- Reduce header height from `h-14` to `h-12` on desktop
- Tighten market status indicators spacing
- Make currency selector more compact with sharper styling
- Ensure sign-out button is more subtle

### 3. Tab Navigation Polish (`src/pages/Index.tsx`)
- Remove rounded corners from active tab indicator, use bottom-border highlight instead (Bloomberg-style)
- Tighten tab padding and reduce gap
- Make LIVE indicator smaller and more subtle
- On mobile: ensure tabs scroll smoothly with snap points
- Fix `pb-8 sm:pb-6` on main content to use exact status bar height offset
- Add `scroll-snap-type: x mandatory` to mobile tab strip

### 4. Ticker Strip Refinement (`src/components/terminal/TickerStrip.tsx`)
- Reduce vertical padding from `py-1` to `py-0.5`
- Tighten font sizes and gaps between elements
- Add subtle separator dots instead of border-r
- Ensure sparklines render crisply at 1px stroke

### 5. PanelWrapper Polish (`src/components/terminal/PanelWrapper.tsx`)
- Remove rounded corners (`rounded` -> no rounding)
- Make title bar more compact (reduce py)
- Sharper expand/collapse icons
- Remove `overflow-hidden` causing clipping issues

### 6. System Status Bar (`src/components/terminal/SystemStatusBar.tsx`)
- Tighten to exactly 24px height
- Reduce font to 8px consistently
- Add left-edge colored status pip (green = all systems nominal)
- Ensure it doesn't overlap mobile content

### 7. Mobile-Specific Improvements
- Dashboard mobile stacked layout: reduce padding from `p-2` to `p-1.5`, tighten `space-y` gaps
- Ensure all cards use sharp corners on mobile
- Fix bottom padding to account for status bar (use `pb-10` consistently)
- Make StockInput more compact on mobile
- Tab bar: add horizontal scroll snap for precise tab switching

### 8. Card & Component Corners
- Update `src/components/ui/card.tsx`: change `rounded-lg` to `rounded-sm`
- Update `src/components/StockSummary.tsx`: change `rounded-xl` to `rounded-sm`
- Audit all components using `rounded-xl`, `rounded-lg`, `rounded-2xl` and flatten to `rounded-sm` or `rounded`

### 9. Button Refinement (`src/components/ui/button.tsx`)
- Change default rounded from `rounded-md` to `rounded-sm`
- Tighten default height from `h-10` to `h-9`

### 10. Auth Page (`src/pages/AuthPage.tsx`)
- Sharpen card corners
- Reduce button border radius
- Make the page feel like a secure terminal login, not a consumer app

## Files Modified
- `src/index.css` — global radius, scrollbar, selection, scroll snap
- `src/components/ui/card.tsx` — sharp corners
- `src/components/ui/button.tsx` — sharp corners, tighter sizing
- `src/components/Header.tsx` — compact header
- `src/pages/Index.tsx` — tab nav, mobile layout, spacing
- `src/components/terminal/TickerStrip.tsx` — tighter density
- `src/components/terminal/PanelWrapper.tsx` — sharp edges, compact title
- `src/components/terminal/SystemStatusBar.tsx` — 24px bar, tighter metrics
- `src/components/StockSummary.tsx` — sharp corners
- `src/pages/AuthPage.tsx` — institutional login styling

