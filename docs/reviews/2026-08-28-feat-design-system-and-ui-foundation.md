# Review, feat/design-system-and-ui-foundation, 2026-08-28

**Reviewed by**: Claude Sonnet 5 (author on Claude)
**Scope**: 29 files, branch vs `main` (merge base `6862671`)
**Verdict**: Approve with nits

## Summary

This lands the Tailwind v4 token layer and the twelve-component base set spec 0005 calls for: `Text`, `Heading`, `Button`, `Card`, `Chip`, `MatchBar`, `Section`, and the icon set, all typed through a project-configured `tailwind-variants` instance. The work is unusually well documented — every non-obvious decision carries a comment naming the spec clause or the bug it fixes — and the two bugs the author flagged (the `tailwind-merge` size-vs-colour collision, and Tailwind v4 scanning `docs/`) are real, correctly diagnosed, and each has a regression test that fails against the naive fix. `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass clean (166 tests). The one real gap is `Button`: its type signature allows `disabled` and `href` together but the component silently drops `disabled` in that branch, which is the kind of silent failure AGENTS.md forbids in a component every later screen will reuse. Two smaller items — the elevated `Card`'s border-plus-shadow reading against the spec's key invariant, and the unspecced `UI_PREVIEW_ENABLED` variable — are both defensible as built, but leave the spec text out of sync with the code.

## Major

### 🟠 `Button` silently ignores `disabled` when `href` is set, `src/components/ui/button.tsx:227`
**Problem**: `ButtonProps` types `disabled` and `href` as two independent optional fields, so `Button({ href: "...", disabled: true })` type-checks. But `disabled` is only read inside the `href === undefined` branch (line ~249); the anchor and `Link` branches (lines 264–283) never look at it. Neither anchor branch adds `aria-disabled`, `tabIndex={-1}`, or `pointer-events-none` — an `<a>` has no native `disabled` attribute, so there is no free equivalent. The caller's requested state is accepted and thrown away with no warning, no test, and no type error.
**Why it matters**: `Button` is the one sanctioned control in the system (spec 0005, `## Decision`); every later "Apply" or navigation link goes through it. A plausible near-term case — disabling an "Apply" link for an expired posting — will compile, render a fully clickable, fully styled-as-normal link, and look correct in code review. This is exactly the shape AGENTS.md's "no silent failures" rule and "store raw and format at render" spirit rule out: a value that reads like it did something and did nothing.
**Suggested fix**: Either implement a real disabled-link state on the anchor/`Link` branches (`aria-disabled="true"`, `tabIndex={-1}`, a `pointer-events-none` style, and drop `href`'s navigation via an `onClick` guard is not an option here since this is a server component — so the simplest fix is to render a `<span>`/non-interactive element with the disabled visual treatment instead of an `<a>` when `disabled && href`), or narrow the type to a discriminated union so `disabled` is only assignable when `href` is absent, making the combination a compile error instead of a silent no-op. Add a test either way.

## Minor

### 🟡 Elevated `Card`'s border reading against the spec's key invariant, `src/components/ui/card.tsx:469-473`, `docs/specs/0005-design-system-and-ui-foundation/index.md:83`
**Problem**: The spec's `## Component design` table explicitly sanctions "elevated (shadow led, **minimal or no border**)", but the `## Key invariants` bullet says "A Card never mixes the elevated and flat idioms on the same instance (no shadow plus border together)." The code gives `elevated` both a shadow and `border border-line/25`.
**Assessment**: I read this as compliant, not a violation. The invariant's practical target — confirmed by the ESLint rule and Tell #8 it exists to catch — is a full-strength `border-line` composed with a shadow, i.e., the flat idiom's border reused on an elevated card. `border-line/25` is a 25%-opacity hint, not the flat idiom's line; `card.test.ts`'s own invariant test (`"never leads with a border AND a shadow on the same card"`) checks for the literal `border-line` class (no opacity suffix) and correctly finds it absent on `elevated`. The component table's own "minimal... border" clause anticipates exactly this. That said, the spec's two clauses are in real tension as worded, and a future reader skimming only the invariants bullet will flag this as a bug the way the author flagged it here.
**Suggested fix**: Tighten the invariant bullet's wording (e.g., "no full-strength `border-line` together with a shadow; a low-opacity edge hint on the elevated card is not the flat idiom") so the two clauses stop reading as contradictory. Documentation only, no code change needed.

### 🟡 `UI_PREVIEW_ENABLED` is a real deviation from "Configuration required: None", `src/env.ts:38-50`, `docs/specs/0005-design-system-and-ui-foundation/index.md:90`
**Problem**: The spec states plainly "**Configuration required**: None. No new environment variables or credentials," but the change adds `UI_PREVIEW_ENABLED` plus a whole new gated route (`/ui-preview`).
**Assessment**: The implementation itself is sound and, importantly, not improvised: it is a line-for-line copy of the existing `DEV_SESSION_ENABLED` gate on `src/app/(marketing)/sign-in/page.tsx` (`notFound()` on a false default, fails closed on production, independent of `NODE_ENV`). Building a page to exercise AC-13/AC-14's keyboard/contrast/responsive passes is a reasonable reading of build plan step 12, and gating it is clearly better than shipping an ungated internal page. This is acceptable engineering judgement, not scope creep worth blocking on.
**Suggested fix**: Update the spec's "Configuration required" line (and ideally note the `/ui-preview` route under `## Component design` or `## Build plan`) so the written spec matches what shipped. Cheap to fix, and the project's own reflexes/standing rules treat spec-vs-code drift as worth catching.

## Nits

- ⚪ `src/components/ui/card.tsx:503-508`: the `forced-colors:border forced-colors:border-[CanvasText]` pair is spliced into the `className` merge argument via string interpolation rather than being declared in the `tv()` `base` array like every other cross-cutting utility in this file. Works today, but it means CardRoot is doing ad hoc string concatenation that the rest of the component (and every other component in this PR) avoids by keeping everything inside `tv()`. Moving it into `base: [...]` would be more consistent with the rest of the codebase's style, and would drop the local `className ?? ""` fallback entirely (tv already handles an undefined `className`).
- ⚪ `src/components/ui/button.tsx:184-188`: the `compoundVariants` array recomputes `tertiary`'s padding for `md` and `sm` separately; a `size` variant with an explicit `tertiary` sub-branch (or a shared constant) would read slightly more directly, though the current form is easy enough to follow.

## Strengths

- The `tv.ts` bug (spec 0005's own words: "before this file, `Text` variant `eyebrow`... shipped 17px grey text instead of 12px") is exactly the kind of invisible, silent-looking-correct defect the project's rules exist to prevent, and the fix is verified two ways: `tv.test.ts`'s "vacuousness check" pins the stock `tv` actually failing (so the test can't rot into a tautology), and `text.test.ts` separately re-proves the composed component keeps both classes after any future refactor of where the merge happens.
- `MatchBar` throwing on non-integer/out-of-range `matched`/`total` rather than clamping is a correct, deliberate application of AGENTS.md's "errors are values, but a programmer bug should still throw" rule — clamping would have produced a bar that "looks like a valid score," which is precisely the silent failure the project forbids.
- The `@import "tailwindcss" source(none)` plus scoped `@source "../../src"` fix for the second bug (Tailwind scanning `docs/design/JobHuntLanding.tsx` into the shipped stylesheet) is verified with a concrete, falsifiable claim in the comment ("Verified by finding `bg-primary-300` and `bg-accent-300` in the compiled CSS while no file under `src` used either"), which is the right standard of evidence for this kind of build-tool bug.
- Consistent accessibility discipline across the whole set: `:focus-visible` is centralized once in `globals.css` rather than per component, every decorative icon carries `aria-hidden`, `MatchBar` gets a real `role="img"` name (replacing the prototype's `aria-hidden` on the bar), and `forced-colors`/`prefers-contrast`/`prefers-reduced-motion` are handled natively per AC-12 with no bespoke JS.

## Test coverage

Coverage is thorough for a components-as-functions strategy, and that strategy is the right call given spec 0004's constraint: every component here is a stateless server component with no effects, so calling it directly and inspecting the returned element tree covers its entire behavior; the genuinely browser-dependent assertions (computed sizes, focus rings, actual wrap points) are correctly deferred to `verify.md`/`/check verify` rather than faked with a jsdom shim that spec 0004 deliberately doesn't install yet. `test/helpers/react-element.ts` is a clean, minimal implementation of exactly what's needed and no more.

The one gap is the `disabled` + `href` combination on `Button` flagged above — untested, and the code path it would exercise doesn't do what the type signature implies. Everything else in scope (the two container idioms' shadow/border exclusivity, the divider adjacency rule, `MatchBar`'s cell derivation and stagger, the icon set's `aria-hidden`/`currentColor` contract, the `tv.ts` merge fix and its own vacuousness check) has a test that would fail if the guarantee it names were broken.

## Gates run

- `pnpm typecheck`: passes
- `pnpm lint`: passes (`--max-warnings=0`)
- `pnpm test`: 166 tests passing across 16 files
