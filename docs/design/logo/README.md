# JobHunt logo

Bracket mark + Space Grotesk SemiBold wordmark. Flat, single-color, no gradients.

## Files

| File | Contents |
|---|---|
| `mark.svg` | Symbol alone. 32-unit master grid, transparent, `fill="currentColor"` |
| `wordmark.svg` | "JobHunt" as **outlined vector paths** — one `<path>`, no `<text>`, no font reference of any kind. Renders identically with or without Space Grotesk installed |
| `lockup.svg` | Mark + outlined wordmark, recommended optical spacing |
| `favicon.svg` | Dedicated 16px pixel-grid cut (redrawn for that size, not scaled) |
| `mark-512.png`, `mark-192.png`, `mark-32.png` | Raster fallbacks, teal `#297373` (the 32px is the 16px cut at 2×) |
| `preview.html` | Render check — see below |

Color: all four SVGs inherit `currentColor`. Set `color` on a parent, or replace `currentColor` with a hex.
Note `currentColor` does **not** inherit when an SVG is loaded through `<img src>` — inline the markup, or keep hex-filled copies for those slots.

### How the wordmark outlines were produced

Space Grotesk ships no static SemiBold, so the 600 instance was generated from the upstream variable font
(`google/fonts → ofl/spacegrotesk/SpaceGrotesk[wght].ttf`) by applying its `gvar` deltas at `wght=600`
(normalized 0.825 after the `avar` map), then converting the quadratic contours to SVG path data.
Two checks were run: instancing at `wght=500` reproduces the shipped static Medium to within 1 unit per 1000,
and the generated paths pixel-match a browser rendering of the real webfont. Advances include the font's own kerning
plus −2% tracking. viewBox equals the true path bounding box, so nothing can clip.

To edit the wordmark, re-run that generation — outlines are not re-typeable text.

## Sizing

- **Minimum size: 16px.** Below 16px it stops resolving — use a plain solid square instead.
- Use `favicon.svg` at **any size ≤ 24px**; `mark.svg` above that.
- At 16 / 32 / 48px keep the mark on whole pixels — no half-pixel offsets, no fractional scaling.
- Wordmark minimum: 14px cap height (≈80px wide). Lockup minimum: 96px wide.

## Clear space

- **4 master units on all sides** = ⅛ of the mark's height. At 32px that is 4px; at 512px, 64px.
- App-icon tile: mark at 68% of tile width, optically centered.
- Lockup: mark height = cap height of the word; gap between them = ¼ of mark height (both baked into `lockup.svg`).

## Approved color pairs

| Mark | Background |
|---|---|
| `#297373` teal | `#FFFAFB` light |
| `#FCD581` amber | `#1A1A1A` dark |
| `#1A1A1A` dark | `#FFFAFB` light, or `#FCD581` amber |
| `#FFFAFB` light | `#297373` teal, or `#1A1A1A` dark |

One color per instance, always. `#6B717E` slate is for UI text only — never the mark.

## Misuse

- No gradients, shadows, glows, strokes, or outline-only versions.
- No two-tone mark — the core is never a different color from the brackets.
- Never rotate, mirror, or skew. The brackets read top-left / bottom-right only.
- Don't add the other two corners, or change arm length, thickness, or the gap to the core.
- Don't scale the 32-unit master down for small sizes — switch to the 16px cut.
- Don't place the mark on a photo, a busy pattern, or a color outside the table above; use a solid tile.
- Don't re-set the wordmark in another typeface, re-track it, or use all caps.
- Don't stack the mark above or below the word; horizontal lockup only.
- Don't enclose the mark in a circle, or put a tagline inside the clear-space zone.

## Running the render check

`preview.html` inlines the shipped SVG **source** rather than loading it via `<img>`, so what you see is the
actual markup and `currentColor` is exercised.

**Run it on a machine without Space Grotesk installed** (or with the font disabled). A machine that has the font
locally cannot detect a font-dependency regression — a broken asset would silently look correct. The page probes
`document.fonts.check()` and tells you which case you are in; it also renders a grey "canary" line as live
`<text>` in Space Grotesk, which should visibly fall back to a system sans on a clean machine while the
outlined wordmark above it stays exact.
