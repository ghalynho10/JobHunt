# Review, feat/entry-page-and-link-metadata, 2026-08-28

**Reviewed by**: Claude Sonnet 5 (author on Opus)
**Scope**: 36 files, branch vs `main` (merge base `25c160b5`)
**Verdict**: Approve with nits

## Summary

This is the entry page (spec 0006) ported onto spec 0005's design system: five composed sections, a header/footer, a new `Logo` component, and a build-time generated OG image. The change is disciplined about its own binding rules — every hand-composed container goes through `Card`, the page carries exactly one hairline and one elevated card as required, no control that cannot act is rendered as a link, and the reduced-motion bug fix in `globals.css` (zeroing `animation-delay`, not just `animation-duration`) is complete and correctly locked by a regression test. `pnpm lint`, `pnpm typecheck`, `pnpm test` (273 tests) and `pnpm build` all ran clean during this review, and a targeted spot-check of the `tailwind-variants` merge behaviour that `sign-in-band.tsx` relies on confirmed it works as documented. The one real weakness is in test rigor rather than in the shipped code: the test that's supposed to guard the sign-in band's one non-standard composition trick doesn't actually exercise the mechanism it names, and two new modules (`entry-header.tsx`, `entry-footer.tsx`) have no dedicated unit tests of their own.

## Minor

### 🟡 The AC-6 "dark ground" test never exercises the mechanism it claims to guard, `src/features/entry-page/sign-in-band.test.ts:31-33`

**Problem**: `sign-in-band.tsx` omits `background` from its `<Section>` call and instead overrides it with `className="bg-primary-800 scroll-mt-16"`, relying on `tailwind-variants`' `twMerge` to make the caller's `className` beat the component's `defaultVariants.background = "paper"`. The file's own header comment calls this out as load-bearing: "The `className` wins over the variant through `tailwind-merge`, and this is the only place on the page that does it." The test written to protect it is:
```ts
const band = renderDeep(SignInBand(), [Section, Heading, Text]);
const section = findByType(band, Section);
expect(classesOf(section)).toContain("bg-primary-800");
```
Because `Section` is in `renderDeep`'s `stopAt` list, `Section` is never actually invoked — `section` is the raw, unrendered `<Section className="bg-primary-800 scroll-mt-16" .../>` element exactly as `sign-in-band.tsx` wrote it. `classesOf` reads `element.props.className` directly, so this assertion is just re-reading the JSX literal back at itself; it never calls the real `section()` `tv` function that does the merge, and so never proves that `bg-primary-800` actually beats the default `bg-paper` in the final class list. A regression in `Section`'s merge order, or in the `tv` config, would leave this test green while the band silently rendered light instead of dark.

I manually verified the actual runtime behavior is correct today (built a standalone repro of `tv.ts`'s config and called `section({ background: undefined, className: "bg-primary-800 scroll-mt-16", ... })`; the result is `"... bg-primary-800 scroll-mt-16"` with `bg-paper` correctly dropped). So there is no live bug — this is a test-adequacy gap on the one binding, non-standard composition rule on the page (AC-6).

**Why it matters**: This is the single place on the page where a variant default is overridden by `className`, called out explicitly as risky in the code's own comments, tied to a binding acceptance criterion (AC-6: "Its dark background is its only distinguishing axis"). The test suite's job is to catch a future regression here, and as written it cannot — it would stay green even if the override stopped working.

**Suggested fix**: Add (or extend) a test that actually invokes `Section({ background: undefined, className: "bg-primary-800 ...", weight: "standard", divider: "none", children: ... })` directly (the way `section.test.ts` already calls `Section({...})` for spec 0005's other cases) and asserts on the resulting `classesOf(...)` that `bg-primary-800` is present and `bg-paper` is not. That exercises the real merge path rather than the JSX source text.

### 🟡 `entry-header.tsx` and `entry-footer.tsx` have no dedicated unit tests, `src/features/entry-page/entry-header.tsx`, `src/features/entry-page/entry-footer.tsx`

**Problem**: Every other new module in this feature (`hero-section`, `how-it-works-section`, `reasoning-section`, `about-section`, `sign-in-band`, `sign-in-controls`, `score-badge`, `og-tokens`) has a same-named `.test.ts` beside it. `entry-header.tsx` and `entry-footer.tsx` do not. Coverage exists only indirectly through `src/app/(marketing)/page.test.ts`, which checks the footer's two-slot structure and that a `Button` with `href="#start"` exists somewhere on the composed page. Header-specific details have no test anywhere: `nav aria-label="Primary"`, the home link's `aria-label="JobHunt home"`, and that the three nav `Button`s and the sign-in `Button` are the ones actually inside `<header>` (as opposed to appearing elsewhere in the page by coincidence).

**Why it matters**: Not a live bug — the missing details are either genuinely CSS/responsive (correctly deferred to `verify.md`) or low-risk static JSX — but it's an inconsistency with how every sibling module in this feature was tested, and a header-only regression (e.g. losing the `aria-label` on the home link, which the project's own `verify.md` had to manually confirm with a screen reader) would go undetected by `pnpm test`.

**Suggested fix**: A short `entry-header.test.ts` and `entry-footer.test.ts` in the same style as the others — assert the nav landmark's `aria-label`, the home link's accessible name, and that the header's real anchors are the ones `page.test.ts` currently only finds at the whole-page level.

## Nits

- ⚪ `src/app/(marketing)/page.tsx:27` and the entry-page spec both describe the route as shipping "no client JavaScript at all" / "zero client JavaScript." What's actually verified (and what AC-4 operationally defines) is narrower and correct: no file reachable from `/` carries `"use client"`. `EntryHeader` and `Button`'s internal navigation both use `next/link`, which is Next's own client component and always ships a small hydration/prefetch runtime regardless of app code — true zero-JS isn't achievable while using `next/link` in the App Router. This doesn't affect anything gated by AC-4 as written, just the surrounding prose overstating it.
- ⚪ `src/features/entry-page/sign-in-controls.tsx:56-60` sets the provider text colour twice (once on the wrapping `<span className={... isDark ? "text-paper" : "text-ink"}>`, again on the nested `<Text className={isDark ? "text-paper" : "text-ink"}>`). Harmless (the icon needs the wrapper's `currentColor`, the `Text` needs its own for a reason that isn't stated), but a one-line comment on why both are needed would save a future reader from "simplifying" one away.

## Strengths

- The `MATCHED_SKILLS`/`MISSING_SKILLS`-derived hero card (`hero-section.tsx`) is a genuinely good fix for the exact defect class the composition review found (a picture disagreeing with the number beside it): every number on the card — score badge, bar, chip counts, per-skill gap notes, and the summary sentence — derives from one pair of arrays, and `hero-section.test.ts` proves the derivation rather than just the output.
- `globals.test.ts`'s reduced-motion regression test is unusually rigorous: it doesn't just check the fixed properties are present, it walks the rest of the stylesheet for any `animation`/`transition` property declared outside the reset block and fails if a future one isn't covered — a real guard against the same class of bug recurring elsewhere in the file, not just the one instance that was found.
- The AC-16 (`og-tokens.test.ts`) and AC-15 drift/licence guards both name the exact set they check (`Object.keys(OG_COLORS)` length asserted at 5) rather than looping over "whatever's there," which is what makes a guard resistant to silently shrinking.

## Test coverage

Unit suite: 273 tests, all green (`pnpm test`), alongside a clean `pnpm lint`, `pnpm typecheck`, and `pnpm build` (confirmed `/opengraph-image` is static in the route table, and a grep of `src/app`, `src/features`, `src/components` confirms the only `"use client"` files are `global-error.tsx` and the unrelated `dev-session/sign-in-form.tsx`, matching the spec's claim). Per-section structural criteria (rhythm, background alternation, single hairline, single elevated card, no dead links) are covered at the composed-page level in `page.test.ts` and again per-module, which is the right split given `Section`/`Card` are the design-system boundary. The two gaps worth naming are covered above: the sign-in band's AC-6 override test doesn't exercise the actual merge path, and `entry-header`/`entry-footer` have no dedicated test file. Everything requiring a real browser (computed sizes, focus rings, media query behaviour, the unfurl checks) is correctly left to `verify.md` rather than faked under `node`, consistent with spec 0004's split.
