# Landing page composition review

**Target:** `docs/design/JobHuntLanding.tsx` (413 lines)
**Date:** 2026-08-27
**Scope:** Composition and layout only. Palette and colour tokens are settled
and out of review, with one exception (page background, at the end).
**Method:** Full read of the file; every line number below verified by grep,
not recalled.

**Constraints held fixed**

- The results page must carry a 116x23px Adzuna attribution block on every job
  card per Adzuna's terms. Treated as non-negotiable.
- Palette and colour tokens from `docs/design/brand-tokens.md` are settled.

---

## Tropes that are absent

Worth recording before anything is cut, so they are not "fixed" by mistake.

- **No icon tiles above headings.** The steps section uses mono numerals
  `01/02/03` over a `border-t-2` rule (lines 275-306). The only `h-11 w-11`
  rounded box in the file is the mobile menu button (line 155).
- **The page is not everything-centred.** `text-center` appears exactly twice:
  a mobile button (line 170) and the CTA band (line 377).

---

## TELLS

Things that read as generic or AI-generated regardless of execution quality.
The safe default choice. **This is the list that matters.**

### 1. Uniform section rhythm — every section is `py-20`

Lines 268, 317, 346, 377 (`py-20 sm:py-24`, the only variation, and only at
one breakpoint). Hero is `pb-20 pt-14 sm:pt-20` (line 179).

Four sections at one vertical measure. Nothing on the page gets more room
because it matters more. This is the strongest structural tell in the file:
the page has no hierarchy in its vertical dimension, only a metronome.

### 2. Every section is the same width, in the same container, six times

`mx-auto max-w-6xl px-5 sm:px-8` at lines 130, 179, 268, 317, 346, 403. One
measure for header, hero, three sections, and footer. The CTA at `max-w-3xl`
(line 377) is the sole exception.

### 3. Hairline rule between every section

`border-t border-line` at lines 267, 316, 345, 402. Sections divided by a 1px
line is the default when nothing else is separating them, and here nothing
else is (see the background note below).

### 4. The eyebrow to h2 formula, character-identical three times

`<p className="eyebrow">` then
`<h2 className="mt-3 text-[30px] font-semibold leading-[1.15] tracking-[-0.01em]">`
at lines 270-271, 319-320, 349-350. The hero opens the same way (line 182).

Every section announces itself with a small label above a 30px heading. Same
size, same tracking, same `mt-3`, every time.

### 5. The 01/02/03 three-across step grid

Lines 274-311. `sm:grid-cols-3`, three equal columns, three identical
`border-t-2 border-primary-800 pt-5` treatments (lines 275, 287, 305), each
with a mono numeral, a 19px h3, a 15px body. Three equal steps at three equal
weights. The heading names the trope outright: "Three steps, no black box."
(line 271).

### 6. The us-vs-them two-card comparison

Lines 324-340. Left card "Most tools" renders the strawman in `text-muted`
grey with a flat percentage bar (lines 325-331); right card "JobHunt" gets the
accent highlight and a drop shadow the left card does not have (lines
334-337). The thumb on the scale is applied by formula — grey the competitor,
shadow yourself — rather than by an idea about what the difference actually
looks like.

### 7. The centred dark CTA band as the closer

Lines 376-399. `bg-primary-800` + `max-w-3xl` + `text-center`, holding h2,
supporting line (`mx-auto max-w-[46ch]`, line 380), two buttons, and a small
"or try the demo" line (line 394).

The most templated block on the modern web. Compounded by being the *only*
centred, *only* narrow, and *only* dark block on the page, so it reads as
pasted in rather than as a deliberate change of register.

### 8. One card shell, four times, no variation

`rounded-2xl border border-line` at lines 206, 325, 334, 358. Every piece of
content that is not running prose becomes a bordered rounded rectangle at the
same radius. There is no second container idea anywhere in the file.

### 9. The same evidence bar three times, one of them hand-copied

`MatchBar` (lines 82-93) renders at line 221 (hero) and line 337 (comparison
card), with a longhand near-duplicate at lines 293-300 (step 02).

The product's single best visual idea is spent three times without variation.
By the third showing it carries no new information.

### 10. Chip-cluster as filler texture

`flex flex-wrap gap-1.5` at lines 225, 237, 279. The third (lines 279-285) is
five `aria-hidden` pills reading "Location / Remote / hybrid / Seniority /
Salary / Job type" — decoration shaped like UI, added to give a column
something to look at.

### 11. Reveal-on-scroll on everything

18 `data-reveal` attributes: lines 104, 182, 183, 186, 190, 206, 269, 275,
287, 305, 318, 325, 334, 348, 358, 378, 383, 394. An effect applied to every
block is not an effect.

The `prefers-reduced-motion` handling at lines 118-124 is genuinely correct —
this is a composition tell, not an accessibility one.

### 12. Stock hero split, with the asymmetry too small to read

Line 180: `lg:grid-cols-[1.05fr_0.95fr]`. Copy left in canonical order —
eyebrow, headline, subhead, primary and secondary button, tertiary text link
(lines 182-201) — product card right (line 206). A 1.05:0.95 ratio is
52.5/47.5; at that margin the asymmetry reads as a rounding error rather than
a decision.

### 13. Every grid is an equal division

Line 274 `sm:grid-cols-3`, line 324 `md:grid-cols-2`, line 347
`lg:grid-cols-[1fr_1fr]`. Three grids, three different column counts, all
equal fractions. Plus the near-equal hero. No element on the page is given
more width because it deserves more width.

---

## WEAKNESSES

Worse than they could be, but not generic. Lower priority.

| # | Line(s) | Finding |
|---|---------|---------|
| 1 | 293-300 | Step-02 bar is a longhand copy of `MatchBar` at different proportions (6/8 vs the component's 8/11). Divergent duplicate; it will drift. |
| 2 | 141-142, 168, 394 | The "SOON" badge is written three times with three different class strings (`text-muted` present, absent, then `border-primary-300/50`). One badge, three spellings. |
| 3 | 206 | Hero card is `p-5 sm:p-6`, one step tighter than every other card (lines 325 and 334 are `p-6 sm:p-7`, line 358 is `p-6`). The most important object has the least internal air. |
| 4 | 214, 252 | Two `my-5 border-t border-line` dividers inside the hero card, on top of the card's own border and the borders on the "missing" chips (lines 238-244). Five levels of hairline at one weight and one colour inside a single object. |
| 5 | 328-330 vs 337 | Comparison cards use `h-2 rounded-full` for the percentage bar and `h-2 rounded-sm` for the evidence cells. Same height, different radius: they read as one object mis-styled rather than two different objects. |
| 6 | 329 vs 110 | Left card spaces its bar with `mt-4`; the right card's bar carries `mt-3` from inside `MatchBar`. The pair does not align across the gutter, and the offset is set in a component rather than by the section. |
| 7 | 190 | Hero subhead is `max-w-[54ch]`, but `brand-tokens.md:99` specifies body measure capped at `65ch`. Ad hoc. |
| 8 | 186 | `max-w-[16ch]` on the h1 sets the wrap point by character count, not by sense; at `sm:text-[54px]` "Job search that shows its work." breaks mid-phrase. |
| 9 | 405 | The footer's centre slot, under `sm:justify-between`, holds "Built with Next.js, TypeScript, and Tailwind." The most visually privileged position in the footer is a stack brag. |
| 10 | 259, 386, 390 | "Apply on the real posting" and both CTA sign-in buttons are `href="#"`. Not composition, but the page's two most important controls currently go nowhere. |

---

## Adzuna attribution

**No false positives to flag.** This file contains no Adzuna block (verified by
grep) and nothing in it renders the results page. Every finding above stands on
its own.

Forward-looking note: the hero card (lines 206-262) is the visual prototype the
results card will be built from, and as drawn it has no reserved slot for a
116x23px attribution. The only plausible home is the row holding the "Apply on
the real posting" link (line 259), which is currently a lone left-aligned link.

---

## The page background

Set once, on the root: `bg-paper` (line 127), resolving to `--bg: #FFFAFB`,
`oklch(0.989 0.005 3)`, a warm near-white (`brand-tokens.md:24`).

**Is it carrying generic feel? Yes, but not through its hue.** The hue is fine
and mildly distinctive. The problem is the gap between it and
`--surface: #FFFFFF` (`brand-tokens.md:25`): about 1% in lightness.

Every card on the page is `bg-surface` sitting on `bg-paper`, so the fill
difference separates nothing, so `border border-line` is the only thing making
a card a card — lines 206, 325, 334, 358. The same shortage forces the four
`border-t border-line` section dividers.

The background therefore feeds Tells 3 and 8 structurally: with no tonal
separation available, the outlined rounded rectangle becomes the only container
the page can express, and the hairline becomes the only divider.

The one section that breaks the pattern proves it — `#reasoning` sets
`bg-surface` on the section (line 316) and flips its left card to `bg-paper`
(line 325) to stay visible, which is the inversion working around the same 1%
gap.

---

## Suggested ordering

No redesign proposed here. When acting on this:

1. **Tell 1 (section rhythm)** first. Fixing it forces decisions about which
   sections matter, and that cascades into Tells 2, 3, and 13.
2. **Tell 9 (the match bar spent three times)** second. It is the only place
   the page has a real idea to protect.
