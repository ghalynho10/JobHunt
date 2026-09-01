# src/features/legal

The terms and the privacy notice: their words, and the two registries that keep those words true. Built by feature 21, governed by [spec 0009](../../../docs/specs/0009-terms-and-privacy-notices/index.md), which is `Accepted`.

## What lives here

The two routes are [src/app/(marketing)/terms/page.tsx](<../../app/(marketing)/terms/page.tsx>) and [src/app/(marketing)/privacy/page.tsx](<../../app/(marketing)/privacy/page.tsx>), and each is composition plus its own metadata, nothing else. Every word is in this directory.

| File | What it owns |
|---|---|
| [recipients.ts](recipients.ts) | The companies data reaches, and the `src/env.ts` keys that reach each |
| [stored-fields.ts](stored-fields.ts) | Every column of every personal data table, in the words the notice uses |
| [publication.ts](publication.ts) | Who publishes the notices, the contact address, and the effective date |
| [legal-document.tsx](legal-document.tsx) | The shared page shell, plus the prose primitives both notices are built from |
| [privacy-notice.tsx](privacy-notice.tsx) | The privacy notice's clauses |
| [terms-document.tsx](terms-document.tsx) | The terms clauses |
| [acceptance-line.tsx](acceptance-line.tsx) | The line under the provider forms on `/sign-in` |

## Rules that are easy to break by accident

- **The page renders the registry; it never restates it.** No company name and no stored field is typed into the prose. This repository already shipped the other shape once, where `hero-section.tsx` carried a written count beside a list that had moved on. Two tests hold the line: the registries are bound to `src/env.ts` and to the generated database types, and the page tests fail if a registry entry is not printed. A current registry behind a page that says nothing would otherwise pass every guard.
- **A new `src/env.ts` key fails the suite until somebody classifies it.** It goes in a recipient's `envKeys`, or in `ENV_KEYS_WITH_NO_RECIPIENT` with a reason. Do not reach for the second one to make a test pass: it is for a key that genuinely leaves no request, and three do. Features 11, 13 and 14 each add a real recipient here as part of their own build.
- **A migration that adds a column fails the suite until the notice names it.** That is deliberate: the notice claims to list everything stored, and a migration is a far more ordinary event than a new company. A whole new table fails too, until it is classified as personal or not.
- **The Sentry claim lives in another file.** `/privacy` states that Sentry receives no personal data, and that is true only while both Sentry configs keep `userInfo` off, `httpBodies` empty and `cookies` off. Nothing about editing `sentry.server.config.ts` would remind you a legal notice depends on it. [sentry-claim.test.ts](sentry-claim.test.ts) is that reminder, and it also blocks `sendDefaultPii: true`, which switches all three back on from a different line.
- **No `"use client"` in this tree, and none on `/sign-in` either.** Both notices are static prerenders. `/sign-in` is the one at real risk: the obvious way to build an acceptance line is a checkbox, a checkbox needs state, and state would make the whole sign in page a client component. The line is static copy instead, and [client-boundary.test.ts](client-boundary.test.ts) covers all three routes.
- **These two routes are the only indexable pages on the site.** Every other route is `noindex` from the root layout, and these opt back in. That is not for search traffic: Google will not accept a privacy policy URL it cannot reach and read, and the OAuth app stays capped at 100 users for its whole lifetime until it can. **Do not widen it beyond these two**, and do not remove it. Watch the HTTP header as well as the meta tag, since `x-robots-tag` beats the tag and Vercel sets it on preview deployments.
- **Nothing here may describe a control that does not exist.** Deletion is phrased as a request to an address, never as a button, because self serve deletion is feature 27 and has not been built. The same rule governs every claim on both pages: they are written from the code so a reader can check them, and one false sentence costs the credibility of all the rest.
- **No Limited Use affirmation on the privacy notice.** Google's Limited Use requirements govern apps that request restricted scopes; this one asks for `email profile` and nothing more. Affirming a policy that does not apply would be the single unverifiable claim on the page. A test asserts its absence.
- **The effective date is a published fact, not a moment in the reader's day.** It is formatted in UTC explicitly, so it reads the same from Kiritimati to Midway. Bump it only when the text changes materially: bumping it for a typo is what makes it meaningless.

## Testing

Tests sit beside each module and run in the unit project (`pnpm test`), the `node` environment with no jsdom, the same as the design system and the entry page: these are stateless server components, so calling one is its whole behaviour.

Five of the tests here are guards rather than ordinary unit tests. They read source files (`src/env.ts`, the generated database types, both Sentry configs, `package.json`, the route trees) and fail when reality drifts from what the notices claim. Each one carries a non vacuity assertion, because a reader that silently found nothing would turn every check into a comparison of two empty sets and pass cheerfully. **When you change one, break it on purpose first and confirm it fails**; all six were proved that way on 2026-09-01, and the record is in [verify.md](../../../docs/specs/0009-terms-and-privacy-notices/verify.md).

Anything needing a real browser or a real database (focus rings, 320 pixel overflow, the deletion cascade, the live consent screen) is not faked here. It lives in that `verify.md` and is proved by `/check verify`.

_Drafted by /sync from the introducing change, worth a quick human pass._
