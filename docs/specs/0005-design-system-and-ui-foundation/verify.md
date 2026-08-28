# Verify: design system & UI foundation · spec 0005 · updated 2026-08-27
_Steps derived from spec 0005 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

All UI steps run against `/ui-preview`, which renders every base component at
every variant. Set `UI_PREVIEW_ENABLED=true` in `.env.local` first, or the route
404s by design.

## Commands

- [ ] `pnpm build`, then grep the emitted stylesheet under `.next/static/chunks/*.css` for `bg-primary-300` → expect **0 matches**, proving Tailwind still scans only `src` and is not compiling the unbuilt prototype in `docs/design/` into shipped CSS  → AC-1
- [ ] `printf '%s' 'export function P(){return <div className="rounded-2xl border border-line p-6"/>}' > src/app/probe.tsx && npx eslint src/app/probe.tsx; rm src/app/probe.tsx` → expect the `no-restricted-syntax` error naming `Card`. A pass here means the rule has gone vacuous  → AC-15
- [ ] `pnpm typecheck && pnpm lint && pnpm test` → all green  → AC-15
- [ ] Remove `UI_PREVIEW_ENABLED` from `.env.local`, `pnpm build`, `PORT=3111 pnpm start`, then `curl -o /dev/null -w '%{http_code}' localhost:3111/ui-preview` → expect **404**, and `/` still **200**

## UI / manual

Run at 1440px unless a step says otherwise.

- [ ] Read the computed `font-size` of each register on `/ui-preview` → expect exactly: `h1` 64px, `h2` 30px, `h3` 20px, eyebrow 12px, `monoLabel` 13px, `monoData` 13px, tertiary button 17px. **Do not eyeball this**: the failure mode is `tailwind-merge` silently dropping a custom `text-*` size as if it were a colour, which renders every register at body size and still looks deliberate  → AC-2, AC-6
- [ ] Read the computed `color` of the tertiary button → expect `rgb(25, 70, 70)` (`primary-800`), not ink. Same failure mode as above, in the other direction  → AC-6, AC-15
- [ ] Narrow the window below 640px and re-read body `font-size` → expect 17px above the breakpoint and 16px below it  → AC-2
- [ ] Confirm the eyebrow labels ("YOUR MATCH", "MATCHED", "MISSING") render in tracked sans caps, and the salary line and the skill gap notes render in mono → the two registers must not be swapped  → AC-6
- [ ] Compare the two cards in the 60/40 grid → the left is shadow led with a hint of border, the right is border led with no shadow. Neither carries both  → AC-3
- [ ] Confirm the left column is visibly wider than the right at `lg`, and that both stack to one column below it  → AC-8
- [ ] Count the cells in both match bars → expect 6 filled + 2 outline, and 8 filled + 3 outline, on the same page from the same component  → AC-7
- [ ] Walk the four sections top to bottom → expect three distinct vertical rhythms, `paper` then `sunken` then `sunken` then `paper`, with a hairline divider ONLY between the two adjacent `sunken` sections  → AC-4, AC-5
- [ ] Confirm no element animates on load. The match cell stagger is the only motion, and it runs once  → AC-9
- [ ] Confirm all five icons render: check, dashed gap circle, GitHub, Google (in its four brand colours), external link  → AC-11

### Keyboard and focus

- [ ] Tab from the top of `/ui-preview` to the bottom → expect 8 stops in visual order, each with a 2px teal (`rgb(41, 115, 115)`) ring at 2px offset, and the disabled button skipped  → AC-13
- [ ] Read the computed `outline-color` in the same tick as focusing a control → expect the full teal immediately, not a partly faded value. A fade means `outline-color` has crept back into the button's `transition-property`  → AC-13
- [ ] Confirm every control has an accessible name (`aria-label` or visible text)  → AC-13

### Media preferences

- [ ] Emulate `prefers-contrast: more` → expect `--line` and `--muted` to both become `#474a51`, and the eyebrow, the divider and the missing match cells to darken with them  → AC-12
- [ ] Emulate `forced-colors: active` → expect both cards to keep a visible border (the elevated card's shadow is discarded, so the border is its only edge), and the matched cells to stay distinguishable from the missing cells by fill  → AC-12
- [ ] Emulate `prefers-reduced-motion: reduce` → expect the match cell animation duration to collapse to effectively zero  → AC-9, AC-12

### Responsive

- [ ] At 320px, confirm zero horizontal overflow on every element under `main`  → AC-14
- [ ] At 320px, confirm the card footer stacks (attribution below the action) and the attribution block measures exactly 116 by 23 pixels. Adzuna's terms make this a licensing floor, not a layout preference, so a compressed block is a real failure  → AC-10, AC-14
- [ ] At 1440px, confirm the same footer is a single `justify-between` row  → AC-10

## Acceptance-criteria coverage

- AC-1 covered by the stylesheet grep and by reading the tokens in `src/app/globals.css`
- AC-2 covered by the computed font size and breakpoint steps
- AC-3 covered by the two card idioms step
- AC-4, AC-5 covered by the four section walk
- AC-6 covered by the register steps and the tertiary colour step
- AC-7 covered by the two match bar proportions step
- AC-8 covered by the 60/40 grid step
- AC-9 covered by the no entrance animation step and the reduced motion emulation
- AC-10 covered by the two footer steps at 320px and 1440px
- AC-11 covered by the icon set step
- AC-12 covered by the three media preference emulations
- AC-13 covered by the three keyboard and focus steps
- AC-14 covered by the two 320px steps
- AC-15 covered by the lint probe, the typecheck and lint command, and the tertiary colour step

## Not covered here

- The real Adzuna attribution content and its two link targets. This feature builds the slot only; feature 11 supplies the asset and the links, and owns verifying them against Adzuna's terms.
- `MatchBar`'s `matched` and `total` sources. Both are always caller supplied, from the scoring feature (feature 14) or fixture data, so there is no source to verify at this layer.
