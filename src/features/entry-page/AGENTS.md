# src/features/entry-page

The public page at `/`, and the parts of the link card that are not the route itself. Built by feature 6, governed by [spec 0006](../../../docs/specs/0006-entry-page-and-link-metadata/index.md), which is `Accepted`.

## What lives here

One module per body section, plus the two shell pieces and the two things more than one section needs. The route itself is [src/app/(marketing)/page.tsx](<../../app/(marketing)/page.tsx>), and it is composition only: the order of the sections, and nothing else.

| File | What it owns |
|---|---|
| [entry-header.tsx](entry-header.tsx) | The sticky header: the home lockup, three in page anchors, the sign in jump |
| [entry-footer.tsx](entry-footer.tsx) | The footer: the lockup, the two legal links, the copyright |
| [hero-section.tsx](hero-section.tsx) | The claim, the sign in state, and the example result card |
| [how-it-works-section.tsx](how-it-works-section.tsx) | The three steps |
| [reasoning-section.tsx](reasoning-section.tsx) | The two comparison cards, and the page's only hairline |
| [about-section.tsx](about-section.tsx) | The prose, and the "what's real today" status card |
| [sign-in-band.tsx](sign-in-band.tsx) | The dark closing band |
| [provider-forms.tsx](../auth/provider-forms.tsx) | The two provider controls, which are real submit forms owned by `src/features/auth/`, not by this feature |
| [score-badge.tsx](score-badge.tsx) | The amber score pill, used by the hero and the comparison |
| [og-tokens.ts](og-tokens.ts) | The brand colours the social preview image draws with, and their token names |

The image generator itself is [src/app/opengraph-image.tsx](../../app/opengraph-image.tsx), because it is a Next.js metadata file convention and has to sit beside the route. Only its colour values live here.

## Rules that are easy to break by accident

- **Nothing that cannot work is a link.** The rule survives feature 7, but it now applies to one control rather than three, so read it carefully before changing either half. The example card's apply control still renders as `Text`, never as `Button` or an anchor, because an example listing has nothing real to apply to. The two provider controls are now real `<form action={...}>` submits, since sign in works: spec 0006 AC-7 was superseded by spec 0007 AC-16, and `COPY-1` plus both `soon` chips were deleted rather than reworded, because they were false for every visitor the moment sign in shipped. `page.test.ts` carries both halves separately, including raw `<a>` in its anchor query, so a regression on either fails the suite rather than shipping.
- **The footer's centre slot is spoken for.** Feature 6 deliberately left it empty and reserved it, and spec 0009 AC-18 filled it with the Terms and Privacy links. It is not free space again: those two links are the only route to the notices from every public page, and `page.test.ts` asserts the slot holds them and nothing else. The old occupant was a "Built with Next.js, TypeScript, and Tailwind" line, a stack brag in the page's most privileged position, which is what the slot must never go back to.
- **No `"use client"` in this tree, ever.** The page is a static prerender and nothing here may change that. Real interactivity opens its own narrow boundary in the feature that needs it and says why.
- **The status card in `about-section.tsx` is a promise, not copy.** Nothing may sit under `working` that `docs/scope/scope.md` does not mark `done`, and nothing under `planned` without a real scope row. Features 9, 11, 12 and 14 each carry a line in their own `Done when` requiring them to move their claim across when they ship. No test guards the truth of it, deliberately: the source is prose, so a test would only encode the same reading twice.
- **The example card's numbers derive from one list.** `MATCHED_SKILLS` and `MISSING_SKILLS` in `hero-section.tsx` produce the score badge, the match bar, both chip clusters, the per skill gap notes and the summary sentence. Never hand write a count into the copy: that shipped once, and editing the skills left a written "8 of 11" behind next to a bar that said something else.
- **Page level invariants are caller enforced, so tests carry them.** Exactly one `divider="hairline"`, exactly one `tone="elevated"`, and the rhythm and background of all five sections are asserted in [page.test.ts](<../../app/(marketing)/page.test.ts>). No component can see its siblings, so nothing else catches a second hairline.
- **The dark band overrides `Section`'s `background` variant through a `className`.** It is the only place on the page that does, and `sign-in-band.test.ts` asserts the RESOLVED class list rather than the prop, because asserting the prop proves only that the band asked.
- **Amber is the score and nothing else.** `score-badge.tsx` is the one consumer of `--accent-300` here, and its sizes come from the locked type scale, never an arbitrary value.

## Testing

Tests sit beside each module and run in the unit project (`pnpm test`), the `node` environment with no jsdom, per spec 0004 and the same reasoning as the design system: every module here is a stateless server component, so calling it is its whole behaviour.

A page test invokes its own section modules and stops at the design system, using `renderDeep` from [test/helpers/react-element.ts](../../../test/helpers/react-element.ts), so `Section` and `Card` stay elements carrying the props the acceptance criteria are written against.

Anything needing a real browser (computed rhythm, focus rings, overflow at 320 pixels, media preferences, and whether a pasted link actually unfurls) is not faked here. It lives in [verify.md](../../../docs/specs/0006-entry-page-and-link-metadata/verify.md) and is proved by `/check verify`.

_Drafted by /sync from the introducing change, worth a quick human pass._
