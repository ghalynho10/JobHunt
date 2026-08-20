# JobHunt — brand tokens

A reusable design system for JobHunt, a job-search tool whose ranking
"shows its work": every match score decomposes into matched skills and
gap skills, and the reasoning is written out in the open.

## Concept

**"An instrument, not a billboard."** JobHunt is precise, evidence-based,
and restrained. The visual language borrows from a well-kept record:
warm near-white paper, near-black ink, a calibrated teal for matched
evidence, a slate for structure, and a single warm amber reserved for
the score itself.

## Palette

Three roles carry the color. The **teal primary** marks evidence (filled
= matched). The **slate neutral** carries structure and gaps (outlined =
missing). The **amber accent** marks the score (highlight). Gaps are
never red.

| Token | Hex | OKLCH | Role |
|---|---|---|---|
| `--bg` | `#FFFAFB` | `oklch(0.989 0.005 3)` | page background (warm paper) |
| `--surface` | `#FFFFFF` | `oklch(1.000 0 0)` | cards, panels |
| `--fg` | `#1A1A1A` | `oklch(0.218 0.000 90)` | primary text (ink) |
| `--muted` | `#6B717E` | `oklch(0.548 0.021 266)` | secondary text, gap state |
| `--secondary` | `#474A51` | `oklch(0.409 0.012 266)` | heavier secondary text, block headers |
| `--border` | `#6B717E` | `oklch(0.548 0.021 266)` | borders, dividers |
| `--primary` | `#297373` | `oklch(0.511 0.072 195)` | icons, matched evidence |
| `--primary-deep` | `#194646` | `oklch(0.363 0.049 195)` | buttons, primary actions |
| `--primary-light` | `#98DADA` | `oklch(0.844 0.066 196)` | chip / badge backgrounds |
| `--accent` | `#FCD581` | `oklch(0.889 0.112 85)` | highlights, scores (the one accent) |

Contrast gates (WCAG 2.x relative luminance, verified computationally):
`--fg` on `--bg` = 16.84:1; `--muted` on `--bg` = 4.74:1;
`--secondary` on `--bg` = 8.59:1; white text on `--primary-deep` = 10.47:1
(paper `#FFFAFB` instead of pure white: 10.13:1); `--fg` on `--accent` = 12.41:1.
`--primary` is used for large icons / evidence fills only (3:1 floor);
body-sized text should use `--primary-deep` on light backgrounds.
Use `--secondary` for text that must be read (per-skill notes, the `//`
summary line, block headers like "Matched" / "Missing" / "What's real
today"); keep `--muted` for quiet labels, chips, and eyebrows.

## Tailwind scales (50–900)

`primary` = teal, `accent` = amber. Anchors `300 / 600 / 800` are the
verified hex values; the rest are derived to interpolate evenly.

```js
primary: {
  50:  '#F0F6F6', 100: '#DEEEEE', 200: '#C2E1E1', 300: '#98DADA',
  400: '#66BABA', 500: '#429A9A', 600: '#297373', 700: '#205B5B',
  800: '#194646', 900: '#123434',
},
accent: {
  50:  '#FFF9EC', 100: '#FDF1D3', 200: '#FBE4AB', 300: '#FCD581',
  400: '#F7C55C', 500: '#EDAB33', 600: '#D58F1E', 700: '#AF7017',
  800: '#8C5718', 900: '#714617',
},
```

Role mapping on the landing page: buttons = `primary-800`, icons and the
logo mark = `primary-600`, chip backgrounds = `primary-300` (with
`primary-800` text), the score = `accent-300` behind `ink` text.

On the dark sign-in band (`primary-800` background): headings and body use
`paper`, OAuth buttons invert (primary becomes `paper`/`ink`, outline
becomes a light border + `paper` text), and muted/secondary text uses
`primary-300` — never `muted`, which fails AA on `#194646` (2.14).
`primary-300` measures 6.67 and passes with margin.

## Application-status colors

Locked now for the dashboard; not used on the landing page. All four
pass WCAG AA (8.2–12.4). Pair `Applied` and `Offer` with icons or
labels, not color alone — the weakest pair under colorblind simulation.

| Status | Hex | OKLCH | Text color |
|---|---|---|---|
| Applied | `#2A526F` | `oklch(0.423 0.066 242)` | `#FFFFFF` |
| Interviewing | `#FCD581` | `oklch(0.889 0.112 85)` | `#1A1A1A` |
| Offer | `#6B2E52` | `oklch(0.397 0.098 346)` | `#FFFFFF` |
| Rejected | `#733D26` | `oklch(0.423 0.083 43)` | `#FFFFFF` |

## Type pairing

Two typefaces, locked — do not introduce a third.

- **Display (headings):** Space Grotesk 600 — the same face the outlined
  wordmark was generated from, so the page and logo are one system.
- **Mono (labels, IDs, salaries, scores, step numbers):** JetBrains Mono
  (400 / 500 / 600) — where the precision signal earns its keep.
- **Body:** Space Grotesk (400). Chosen over JetBrains Mono because a
  mono face is too wide and even-set for paragraph-length reading.

Scale (ratio 1.25): display 40–64, h2 30, h3 20, body 16–17, small 13,
caption 12. Caps labels track `0.08em`; display tracks `-0.02em`;
mono UI labels `0.02em`. Body line length capped at `65ch`.

## Signature element

The **fill-vs-outline grammar**, now three parts:

1. **Teal fill + check = matched.** A solid teal cell, a filled skill
   chip with a check.
2. **Outline / dashed = missing.** A hairline cell, a dashed-circle gap
   chip. Never red.
3. **Amber = the score.** The number itself sits on a warm amber
   highlight, so "8 / 11" reads as the outcome the teal cells add up to.

One grammar, three scales: the logo (filled bracket tile beside a dashed
empty tile), the segmented match bar, and every skill chip. This is the
thing people remember.

## Token reference — needs translation to Tailwind v4

**This block is v3-shaped and does not drop in as written.** Tailwind v4
removed the JavaScript config file; customization lives in CSS via the
`@theme` directive. The values below are correct and verified — the
*format* is what needs porting. Feature 5 (design system & UI
foundation) owns that translation.

Two constraints for the port:

- Use raw channel values in `:root`, mapped by a **non-inline** `@theme`.
  `@theme inline` bakes values in at build time, which breaks runtime
  theme switching if dark mode is ever added.
- v4 supports `prefers-contrast`, `forced-colors`, `prefers-reduced-motion`
  and `:focus-visible` directly in CSS. The accessibility rules below
  should land there rather than in bespoke media queries.

```js
theme: {
  extend: {
    colors: {
      paper:   '#FFFAFB',
      surface: '#FFFFFF',
      ink:     '#1A1A1A',
      muted:   '#6B717E',
      secondary: '#474A51',
      line:    '#6B717E',
      primary: {
        50:  '#F0F6F6', 100: '#DEEEEE', 200: '#C2E1E1', 300: '#98DADA',
        400: '#66BABA', 500: '#429A9A', 600: '#297373', 700: '#205B5B',
        800: '#194646', 900: '#123434',
      },
      accent: {
        50:  '#FFF9EC', 100: '#FDF1D3', 200: '#FBE4AB', 300: '#FCD581',
        400: '#F7C55C', 500: '#EDAB33', 600: '#D58F1E', 700: '#AF7017',
        800: '#8C5718', 900: '#714617',
      },
    },
    fontFamily: {
      sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
  },
}
```

## Global CSS — v3-era, port decision needed

These helpers were written against Tailwind v3 conventions. They work as
raw CSS, but feature 5's port should **decide** whether each stays raw or
becomes a v4 variant rather than copying them across because they already
exist. The `@media (prefers-reduced-motion: reduce)` block is the clearest
case: v4 supports that condition directly, so hand-rolling it duplicates
something the framework now provides. Same question applies to
`:focus-visible`.

```css
:root { --focus: #297373; }
:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

.eyebrow {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px; font-weight: 500; letter-spacing: 0.08em;
  text-transform: uppercase; color: #6B717E;
}
.mono-label {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px; font-weight: 500; letter-spacing: 0.02em;
}

.js [data-reveal] { opacity: 0; transform: translateY(14px); transition: opacity .6s ease, transform .6s ease; }
.js [data-reveal].revealed { opacity: 1; transform: none; }

.match-cell { animation: cell-in .5s both; transform-origin: left center; }
.match-cell:nth-child(1) { animation-delay: .05s }
.match-cell:nth-child(2) { animation-delay: .10s }
.match-cell:nth-child(3) { animation-delay: .15s }
.match-cell:nth-child(4) { animation-delay: .20s }
.match-cell:nth-child(5) { animation-delay: .25s }
.match-cell:nth-child(6) { animation-delay: .30s }
.match-cell:nth-child(7) { animation-delay: .35s }
.match-cell:nth-child(8) { animation-delay: .40s }
@keyframes cell-in { from { opacity: 0; transform: scaleX(.35); } to { opacity: 1; transform: scaleX(1); } }

@media (prefers-reduced-motion: reduce) {
  .js [data-reveal] { opacity: 1; transform: none; transition: none; }
  .match-cell { animation: none; }
}
```

## Build notes

- The static `jobhunt-landing.html` loads `cdn.tailwindcss.com` for live
  preview only. That script compiles CSS in the browser, logs its own
  production warning, and must not ship. In the real Next.js build the
  tokens move into a CSS `@theme` block in `globals.css` (see the
  translation note above — there is no `tailwind.config.js` in v4) and
  the CDN `<script>` is removed. The HTML file carries a comment at that
  exact line.
- **Tailwind version:** v4 (4.3.x as of July 2026). The static landing
  page and this document were both written against v3 conventions.

## Results-page requirements (not this landing page)

- **Adzuna attribution — per advert, not per screen.** Adzuna's terms
  require that *each displayed advert* carry a "Jobs by Adzuna" label at
  least 116 × 23 px, with the word "Jobs" hyperlinked to adzuna.co.uk (or
  the relevant local domain) and the word "Adzuna" rendered as the Adzuna
  logo image, also hyperlinked. This is a per-result-card requirement, so
  it is a component-level layout constraint rather than a footer credit —
  at twenty cards on a results page, 116 × 23 px is real space to design
  around. Not needed on the landing page. Logo images: adzuna.co.uk/press.html
- **Jobsworth salary estimates carry a separate requirement** if
  displayed: a 20 × 20 px icon plus the words "Adzuna Jobsworth", both
  linked to the salary predictor page, with mouseover text "Salary
  estimate powered by Adzuna Jobsworth". Confirm whether salary figures
  in search results count as Jobsworth estimates before rendering them.
