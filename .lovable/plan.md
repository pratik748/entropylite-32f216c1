

# Theme Overhaul: Aggressive Institutional Power

The uploaded logo has a sharp, angular, dark aesthetic — jagged edges, high contrast black/white, raw power. The current theme is soft blue glass. The new theme must match the logo's energy: **pure black foundation, stark white typography, razor-sharp edges, minimal color — monochromatic dominance with surgical accent colors**.

## Design Direction

- **Background**: True black (0% lightness), not dark blue-gray
- **Typography**: Pure white primary, cool gray secondaries — high contrast
- **Accent**: Shift from blue (210°) to a colder, more aggressive ice-white/silver tone — primary interactions become stark white or pale silver instead of blue
- **Borders**: Sharper, thinner, more visible — 1px solid with higher contrast
- **Glass panels**: Darker, less blur, more opacity — feel solid and heavy, not airy
- **Radius**: Reduce from 0.75rem to 0.375rem — sharper corners matching the angular logo
- **Gain/Loss colors**: Keep green/red but make them more neon/electric for contrast against true black
- **Glow effects**: Replace blue glows with white/silver glows — cold, clinical

## CSS Variable Changes (index.css `:root`)

| Token | Current | New |
|-------|---------|-----|
| `--background` | `220 15% 4%` | `0 0% 2%` |
| `--foreground` | `210 20% 95%` | `0 0% 96%` |
| `--card` | `220 14% 7%` | `0 0% 5%` |
| `--primary` | `210 100% 60%` | `0 0% 92%` (silver-white) |
| `--primary-foreground` | `220 15% 4%` | `0 0% 3%` |
| `--secondary` | `220 12% 12%` | `0 0% 9%` |
| `--muted` | `220 12% 10%` | `0 0% 8%` |
| `--muted-foreground` | `210 8% 45%` | `0 0% 42%` |
| `--border` | `220 12% 13%` | `0 0% 12%` |
| `--accent` | `220 12% 15%` | `0 0% 13%` |
| `--ring` | `210 100% 60%` | `0 0% 80%` |
| `--surface-1/2/3` | Blue-gray | Pure neutral gray |
| `--glass-*` | Blue-tinted | Neutral/white-tinted |
| `--glow-*` | Blue | White/silver |
| `--radius` | `0.75rem` | `0.375rem` |
| `--info` | `210 100% 60%` | `210 60% 55%` (subtle cold blue for data) |
| `--gain` | Keep but boost saturation | `152 90% 45%` |
| `--loss` | Keep but boost saturation | `0 90% 55%` |

## Files Modified

| File | Change |
|------|--------|
| `src/index.css` | Rewrite `:root` variables, update glass utilities, glow effects, scrollbar colors to match monochrome theme |
| `src/components/Header.tsx` | Replace the current logo image with the new uploaded logo (`src/assets/entropy-logo.png` already exists with the black-bg version); add the tagline "Economic Neural Trading & Risk Optimisation via Predictive Yield" as subtle subtext |
| `src/assets/entropy-logo-white.png` | Copy the uploaded white-on-transparent logo for use on dark backgrounds |

## Logo Integration

The uploaded image is white text on white background. The existing `src/assets/entropy-logo.png` is the same logo on black background — perfect for the dark theme. Will use the existing asset in the Header, replacing the current `/lovable-uploads/` image.

## Result

The entire platform will feel like a **black-ops trading terminal** — cold, sharp, monochromatic, with surgical green/red data overlays. The logo's aggressive angular energy will be reflected in every panel, border, and interaction across the UI.

