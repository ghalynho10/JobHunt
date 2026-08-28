# 0005. Design system and UI foundation

**Date**: 2026-08-27
**Status**: In Progress

## Summary

This spec ports the already settled colour palette and type scale into a real Tailwind v4 token layer, and defines the base components (Card, Button, Chip, Text, MatchBar, Section, and the icon set) every later screen builds from. It also fixes the structural gap a verified composition review found in the landing page prototype: the page background and card background are too close in lightness to separate anything, which forced one container idiom, one divider idea, and a flat, uniform rhythm across the whole page. Once this lands, feature 6 (the landing page port) and feature 11 (the first real results card) build against a real component set instead of copying the prototype's patterns forward.

## Requirements

**User stories**:
- As a developer building any screen after this feature, I want a token layer and a base component set so that I never have to hand compose a card, button, or badge from raw Tailwind classes.
- As a user of any screen, I want visible focus, real labels, and layouts that hold up from phone to desktop, so the product is usable regardless of device or input method.
- As the product owner, I want the Adzuna attribution requirement designed into the card shape now, so the results card (feature 11) never has to retrofit it.

**Acceptance criteria**:
- **AC-1**: The seven token colour palette from `brand-tokens.md` is ported into `src/app/globals.css` as raw channel values in `:root`, mapped through a non-inline `@theme`, replacing the current placeholder `--background`/`--foreground` tokens. One further token, `--surface-sunken`, is added beyond the seven: the composition review names the page background as the one open exception to the otherwise settled palette, and this token is squarely inside that exception (see AC-5).
- **AC-2**: Space Grotesk and JetBrains Mono are loaded (`next/font/google` in `src/app/layout.tsx`) and mapped into the `@theme` as `--font-sans`/`--font-mono`. The type scale (ratio 1.25) is encoded as concrete Tailwind v4 theme values, not open ranges: display `clamp(2.5rem, 5vw, 4rem)` (40 to 64px), h2 30px, h3 20px, body 16px below `sm` and 17px at `sm` and above, small 13px, caption 12px.
- **AC-3**: Two container idioms exist as variants of a base `Card` component: elevated (shadow led, minimal or no border) and flat (border led, no shadow), both with consistent internal padding so no card is under padded relative to its importance.
- **AC-4**: A three tier section rhythm scale (compact, standard, generous) exists as a reusable `Section` component prop, replacing a uniform spacing value applied everywhere.
- **AC-5**: Section level background alternation is a documented, deliberate convention between `paper` (`#FFFAFB`) and the new `--surface-sunken` token (roughly `oklch(0.965 0.006 3)`, about 3.5% lighter than paper, a real, visible gap unlike the 1% paper/surface gap the review flagged), and the hairline divider renders only where two adjacent sections share the same background.
- **AC-6**: A `Text` base component encodes the mono usage rule: mono reserved for written reasoning and literal data (skill gap notes, the summary line, salaries, dates, scores); decorative labels (eyebrows, section micro labels, filter chips, step numerals, status badges) render in tracked sans serif caps. The old global `.eyebrow`/`.mono-label` CSS classes are retired.
- **AC-7**: A `MatchBar` base component accepts `matched` and `total` number props and derives its own segmented cell rendering, so no page ever hand copies the bar at a different proportion.
- **AC-8**: A 60/40 asymmetric grid ratio is available for primary/secondary two column layouts, distinct from the equal fraction grids reserved for genuinely equal peer content.
- **AC-9**: No component applies a default entrance or reveal animation. `prefers-reduced-motion` is respected everywhere motion exists, and the match cell stagger is the only sanctioned default motion; any future entrance animation must be justified against that precedent.
- **AC-10**: The `Card` component's footer slot accepts an optional `attribution` node beside the primary action link, laid out `justify-between` and wrapping to a stacked layout before a 116 by 23 pixel block would otherwise compress. This feature builds and tests the slot mechanism only; the real Adzuna attribution content is built in feature 11 (see `## Follow-up`).
- **AC-11**: `CheckIcon`, `GapIcon`, `GitHubIcon`, `GoogleIcon`, and an `ExternalLinkIcon` exist as named, reusable base components.
- **AC-12**: `:focus-visible`, `forced-colors`, `prefers-contrast`, and `prefers-reduced-motion` are handled with native Tailwind v4 CSS, with no bespoke JavaScript media query handling.
- **AC-13**: Every base component is reachable by keyboard, shows a visible focus indicator, and carries a real accessible label (WCAG 2.2 AA).
- **AC-14**: Every base component holds up responsively from phone width to desktop, designed desktop first per the project's standing rule.
- **AC-15**: Component variants (`Card`, `Button`, `Chip`, `Text`, `Section`, `Heading`) are managed through `tailwind-variants`, verified compatible with Tailwind v4.

## Decision

**Chosen option**: Component API as the enforcement mechanism, new code only (Option 1 in the full options record).

The base components listed under `## Component design` are the only sanctioned way to render these patterns; a future hand rolled Tailwind composition duplicating one of them is a code review finding. No existing production code needs migrating, since `globals.css` is still a placeholder and no component exists in `src/` yet.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`)

## Rationale

Full reasoning, the options considered, and the decision by decision walk through the composition review's findings: see `rationale.md`.

## Component design

Every component below lives at `src/components/ui/<kebab-case-name>.tsx`, one file per component, named exports only, per `AGENTS.md`'s folder by feature rule (anything shared across features moves to `src/components/ui`).

**Token model**:

| Token group | Values | Source |
|---|---|---|
| Colour | `paper`, `surface`, `ink`, `muted`, `secondary`, `line`, `primary` (50 to 900), `accent` (50 to 900) | ported as is from `brand-tokens.md` |
| Colour, section background | `--surface-sunken`, roughly `oklch(0.965 0.006 3)` | new, this spec; the one token added beyond the settled seven, inside the review's own page background exception |
| Font | `sans` = Space Grotesk, `mono` = JetBrains Mono | loaded via `next/font/google` in `src/app/layout.tsx`, mapped into `@theme` as `--font-sans`/`--font-mono` |
| Type scale | display `clamp(2.5rem, 5vw, 4rem)`, h2 30px, h3 20px, body 16px below `sm` / 17px at `sm`+, small 13px, caption 12px | ratio 1.25, concrete values, this spec |
| Section rhythm | `compact` = `py-12 sm:py-16`, `standard` = `py-20 sm:py-24`, `generous` = `py-32 sm:py-40` | new, this spec; registered as `--spacing-section-compact`/`standard`/`generous` in `@theme` |
| Grid ratio | `60/40` for primary/secondary two column layouts, via a `@utility grid-split { grid-template-columns: 3fr 2fr }` applied at `lg`, single column below | new, this spec |

**Component inventory**:

| Component | Variants / props | Notes |
|---|---|---|
| `Text` | `variant`: `eyebrow` \| `monoLabel` \| `monoData` \| `body` \| `muted` | retires `.eyebrow`/`.mono-label`; `eyebrow`/labels are sans tracked caps, `monoData` is the reasoning register |
| `Heading` | `level`: `1` \| `2` \| `3` (maps to the locked type scale) | server component, `tailwind-variants` for the size mapping |
| `Button` | `variant`: `primary` \| `secondary` \| `tertiary`; `size`: `md` \| `sm`; `href?: string`; `external?: boolean`; `label?: string`; and `disabled` / `type`, button shape only | renders `<a href>` (with `rel="noopener noreferrer"` when external) when `href` is given, `<button type="button">` otherwise; primary = filled `primary-800`, secondary = outline, tertiary = text link with icon |
| `Card`, `Card.Header`, `Card.Body`, `Card.Footer(attribution?: ReactNode)` | `tone`: `elevated` \| `flat` | elevated = shadow led, minimal border, `p-6 sm:p-7`; flat = border led, no shadow, `bg-paper` when its section background is `sunken`; `Card.Footer` lays its children and `attribution` out `flex flex-wrap items-center justify-between gap-4`, wrapping to a stacked layout below `sm` |
| `Chip` | `state`: `matched` \| `missing` \| `status` | matched = teal fill + `CheckIcon`; missing = outline + dashed `GapIcon`; status = the "SOON" pattern, one definition |
| `MatchBar` | `matched: number`, `total: number` | derives segment counts itself; the cell stagger uses a `style={{ "--i": i }}` custom property with `animation-delay: calc(var(--i) * 50ms)`, not a fixed `nth-child` list, so it stays correct at any `total` |
| `Section` | `weight`: `compact` \| `standard` \| `generous`; `background`: `paper` \| `sunken`; `divider`: `hairline` \| `none` | composes rhythm, background alternation, and the divider rule; `divider` is set explicitly by the caller per the adjacency rule (hairline only between two sections of the same background) |
| Icon set | `CheckIcon`, `GapIcon`, `GitHubIcon`, `GoogleIcon`, `ExternalLinkIcon` | plain SVG, no client boundary |

**Component API rules the table above cannot carry in a cell**:

- **`Button` props are a union, not one flat object, and `disabled` is forbidden on the link shape.** HTML has no disabled anchor: no attribute, `disabled:` styling never matches, and the link stays clickable and in the tab order. So `disabled` beside `href` is a COMPILE ERROR, not a prop that gets dropped. A caller who wants a link the reader cannot follow does not want a disabled link; they want no link, so render the label with `Text` and say why it is unavailable. `external` is likewise forbidden without an `href`, and `type` is forbidden with one. (This rule was added after the 2026 08 28 review found the earlier flat prop type accepted `disabled` beside `href` and silently discarded it.)
- **`Card` takes an `as` prop** (`div` \| `article` \| `section` \| `li`, default `div`) so a card that is a real landmark, such as one job result in a list, says so in the markup rather than being a styled `div`.
- **Accessible name overrides.** `Button` and `MatchBar` each take an optional `label`, and `Section` takes an optional `label` plus an `id`. These exist for AC-13: twenty result cards all reading "Apply" need distinct names, a bar beside text that already states the score should not read it twice, and a section whose heading does not identify it needs one in the landmark list. `Section`'s `id` is the anchor target for an in page link.

**Value sourcing**:

| Component | Value | Source |
|---|---|---|
| `MatchBar` | `matched`, `total` | passed by the caller; sourced from the scoring feature (feature 14) once it exists, or fixture data until then |
| `Card.Footer` attribution | a slot for the future Adzuna "Jobs by Adzuna" block | not built by this feature; feature 11 supplies the real image asset and its two link targets (adzuna.co.uk for "Jobs", the Adzuna logo image for "Adzuna") when it builds the first real results card |
| `Card` footer apply link | the real posting URL | sourced from the job listing entity feature 11 defines; not decided by this spec |

**Key invariants**:
- A `Card` is one idiom or the other, never a blend: the flat idiom's full strength `border-line` never appears together with a shadow. The elevated card's low opacity edge hint (`border-line/25`) IS part of the elevated idiom, and is what **AC-3** permits as "minimal or no border" (the component inventory table below records the shipped form of that, "minimal border", since the elevated card always carries the hint and never zero border); it is not a border led treatment and does not breach this rule. The shape being ruled out is the one Tell #8 named, a full hairline box that has also been given a shadow.
- Two adjacent `Section`s with the same `background` render a `hairline` divider; two adjacent sections with different backgrounds render `none`.
- `MatchBar` never renders with a hand written cell count; `matched` and `total` are always the only inputs.
- No component ships a default entrance animation.

**Security model**: Not applicable. This feature ships no data access, no authentication, and no Server Actions; every component here is presentational.

**Configuration required**: One variable, `UI_PREVIEW_ENABLED`, declared in `src/env.ts` and defaulting to false. It gates the component preview route at `/ui-preview` (see the `## Build plan` step 12), which renders every base component at every variant so the keyboard, focus, contrast and responsive passes have a real surface to run against, now and on every later re-check. The route calls `notFound()` when the variable is not explicitly true, so production, which never sets it, is blocked by absence rather than by a label a build tool chooses. It is deliberately NOT tied to `DEV_SESSION_ENABLED`, which feature 7 deletes along with the development only sign in, nor to `NODE_ENV`, which a Vercel Preview build labels `production` and where the page is genuinely wanted. No credentials.

Set in **Vercel**, per environment, in the same shape spec 0002 uses:

| Variable | Production | Preview | Local `.env.local` | Purpose |
|---|---|---|---|---|
| `UI_PREVIEW_ENABLED` | **not set** | `true` | `true` | Renders the component preview at `/ui-preview`. Defaults to false, so production is blocked by absence |

The Local column is committed as an example in `.env.example`. The Preview value was confirmed set in the Vercel dashboard by the engineer on 2026 08 28, which is how it is known: no automated check reads that dashboard, so this line is the record.

**Critical test scenarios**:
- Keyboard only pass over every base component (`Button`, `Card`'s interactive regions, `Chip`, `Section` anchors) confirms focus order and visible focus, verifies **AC-13**.
- `MatchBar` rendered with `matched={6} total={8}` and `matched={8} total={11}` in the same page confirms both proportions render correctly from the same component, verifies **AC-7**.
- `forced-colors: active` and `prefers-contrast: more` emulation confirms borders and text remain visible without relying on shadow or fill alone, verifies **AC-12**.
- `Card.Footer` rendered with a 116 by 23 pixel placeholder block at 320px width confirms the row wraps to a stacked layout rather than compressing it, verifies **AC-10**.

## Standard definition

**Canonical pattern**:
```tsx
// The one right way to compose a container and a section
<Section weight="generous" background="sunken" divider="none">
  <Card tone="flat">
    <Card.Footer attribution={<AdzunaAttribution />}>
      <Button variant="tertiary" href="https://example.com/the-real-posting">
        Apply on the real posting
      </Button>
    </Card.Footer>
  </Card>
</Section>
```
Never: `<div className="border-t border-line"><div className="rounded-2xl border border-line p-6">...`

**Replaces**:
- Hand rolled `rounded-2xl border border-line` composed per instance (Tell #8)
- Uniform `py-20` on every section regardless of what it holds (Tell #1)
- Hairline `border-t border-line` as the only divider mechanism (Tell #3)
- Mono applied by default to any data shaped or label shaped content (Tell #4)
- A hand copied `MatchBar` at a different proportion (Weakness #1)
- Per instance "SOON" badge class strings (Weakness #2)

**Enforcement**: The component API is the primary mechanism; code review catches a hand rolled composition duplicating a base component's job. Alongside that, one narrow ESLint `no-restricted-syntax` rule flags the exact shape Tell #8 named (a `rounded-2xl`/`rounded-xl` class paired with `border` in a `className` literal outside `src/components/ui/`), configured in `eslint.config.mjs` next to the existing `no-restricted-imports` override. See `## Decision` and `rationale.md` for why a broader, general purpose lint rule is not adopted at this project's current size.

**Rollout**: New code only. There is no existing production code in `src/` to migrate. `docs/design/JobHuntLanding.tsx` is ported onto this system by feature 6, not retrofitted here.

**Exceptions**: The dark sign in band (`bg-primary-800`) uses the inverted text and button treatments `brand-tokens.md` already documents for that surface; this is a recorded exception, not a violation.

## Build plan

1. Port the seven token palette plus the new `--surface-sunken` token into `src/app/globals.css` as a non-inline `@theme`, and load Space Grotesk/JetBrains Mono via `next/font/google` in `src/app/layout.tsx`, mapped as `--font-sans`/`--font-mono`, replacing the placeholder tokens, satisfies **AC-1**
2. Encode the type scale as concrete Tailwind v4 theme values (the `clamp()` display size, the fixed h2/h3/small/caption sizes, the `sm` breakpoint body size), satisfies **AC-2**
3. Add native `:focus-visible`, `forced-colors`, `prefers-contrast`, and `prefers-reduced-motion` CSS, porting the existing focus outline and adding explicit borders and heavier contrast under those media features, satisfies **AC-12**
4. Install `tailwind-variants`, wire its Tailwind v4 `@source` scanning, and add the narrow `no-restricted-syntax` ESLint rule from `## Standard definition`, satisfies **AC-15**
5. Build the icon set (`CheckIcon`, `GapIcon`, `GitHubIcon`, `GoogleIcon`, `ExternalLinkIcon`) as plain server components, satisfies **AC-11**
6. Build the `Text` and `Heading` components, retiring the old `.eyebrow`/`.mono-label` CSS classes, satisfies **AC-6**, **AC-15**
7. Build the `Button` component (primary, secondary, tertiary variants, the `href` link affordance), satisfies **AC-15**
8. Build the `Card` component (elevated, flat variants, consistent padding, `Card.Header`/`Body`/`Footer`, the `Footer`'s `attribution` slot tested against a placeholder block), satisfies **AC-3**, **AC-10**
9. Build the `Chip` component (matched, missing, status variants), collapsing the three hand written "SOON" class strings into one, satisfies **AC-15**
10. Build the `MatchBar` component with `matched`/`total` props and the custom property based cell stagger, satisfies **AC-7**, **AC-9**
11. Build the `Section` component (rhythm, background, divider) and the 60/40 asymmetric grid utility, satisfies **AC-4**, **AC-5**, **AC-8**, **AC-15**
12. Build the gated preview route at `src/app/(marketing)/ui-preview/page.tsx`, rendering every component above at every variant behind `UI_PREVIEW_ENABLED` (see `## Configuration required`), then run the keyboard, focus, `prefers-reduced-motion`, and responsive pass against it, satisfies **AC-13**, **AC-14**. The same surface is what step 3's `forced-colors` and `prefers-contrast` checks are exercised against too; those remain **AC-12**'s and are not re-tagged here

## Consequences

**Positive**:
- Every later screen (feature 6's landing page, feature 11's results card) builds against a real, consistent component set instead of copying the prototype's patterns forward.
- The mono register regains the meaning the review found it had lost; the "SOON" badge and the `MatchBar` duplicate stop drifting because there is only one definition of each.
- The accessibility floor (focus, forced colors, contrast, reduced motion) is codified once in CSS rather than reimplemented per page.

**Negative / tradeoffs**:
- `tailwind-variants` is a new runtime dependency; it requires `@source` directives instead of the removed JavaScript `content` config, a Tailwind v4 specific setup detail.
- Building twelve components up front is more initial work than directly porting the prototype's JSX; feature 6 pays this cost back by not having to fix the same tells twice.
- The elevated/flat split is now a real constraint: a flat `Card` can never grow a shadow without breaking the two idiom rule the review's findings depend on.
- The 60/40 grid ratio is a project wide default; a future page that genuinely needs a different weighting has to consciously deviate from it, not just reach for a new fraction.

**Neutral**:
- `docs/design/JobHuntLanding.tsx` remains an unbuilt reference until feature 6 ports it onto this system.
- The reasoning section's existing background inversion becomes the template for the alternation convention rather than staying a one off exception.
- `--surface-sunken` is a deliberate, narrow addition to the settled seven token palette, justified by the composition review's own page background exception; it is not open for reinterpretation the way the rest of the palette is.

## Follow-up

- [ ] Feature 6 (entry page and link metadata) ports `docs/design/JobHuntLanding.tsx` onto this system, including collapsing the step 02 hand copied `MatchBar` (Weakness #1) onto the real component and removing the shadow from the "JobHunt" comparison card (Tell #6) so both comparison cards share the flat idiom identically.
- [ ] Confirm the exact Adzuna "Jobs by Adzuna" attribution image asset and link targets when feature 11 (job search and results list) builds the first real results card using the `Card.Footer` `attribution` slot.
- [ ] Logo mark integration is out of scope for this feature per the engineer's explicit constraint; revisit when that work is scheduled.
- [ ] If the project grows past a single engineer, reconsider a broader, general purpose lint rule (or a compile time check) covering more of the base component API, beyond the one narrow `no-restricted-syntax` rule and the review convention this spec adopts.

## References

**Project sources**:
- `docs/design/brand-tokens.md`, the settled colour palette and type scale
- `docs/design/landing-composition-review.md`, the verified composition diagnosis
- root `AGENTS.md`, the Tailwind v4 and WCAG 2.2 AA rules
- `docs/scope/scope.md`, feature 5's done when criteria
- the `vercel-react-best-practices` community skill

**Practices & standards**:
- WCAG 2.2 AA focus visibility and non text contrast
- native CSS `prefers-reduced-motion`, `forced-colors`, `prefers-contrast`
- `tailwind-variants`, verified compatible with Tailwind v4
