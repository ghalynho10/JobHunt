# 0006. Entry page and link metadata

**Date**: 2026-08-28
**Status**: In Progress

## Summary

This spec is the build spec for the front door: the page at `/`, and what a pasted link to it looks like. It ports `docs/design/JobHuntLanding.tsx` onto feature 5's component set, carries forward the composition decisions spec 0005 already made rather than re deciding them, and settles the four things that spec left open: how many times the match bar appears, what happens to the over signalled sign in band, what the sign in buttons do before real auth exists, and where the social preview image comes from.

Three things on the prototype turned out to be wrong rather than merely generic, and this spec corrects all of them: the "What's real today" card claims four working features that do not exist, it also promises one that is not even planned, and every one of the page's three most important controls points at `#`. The page now says only what is true, and it ships no client JavaScript at all.

## Requirements

**User stories**:

- As a recruiter opening a pasted link, I want the card that unfurls in Slack or a message to show a real product rather than a bare domain, so that the link is worth clicking.
- As a friend the author sent this to, I want the page to tell me plainly what works today and what does not, so that I am not promised something that is not built.
- As the author, I want the page to be the first real consumer of the design system, so that spec 0005's components are proved against a genuine page and not only against the preview route.
- As a developer building any later screen, I want the header, footer and logo to already exist as components, so that the second page does not invent its own.

**Acceptance criteria**:

- **AC-1**: Every part of the page renders through spec 0005's base components. The page's own code contains no hand composed rounded and bordered container, no hand written match bar, and no `.eyebrow` or `.mono-label` class. `pnpm lint` passes, including the `no-restricted-syntax` rule from spec 0005.
- **AC-2**: The five body sections carry exactly the rhythm tiers spec 0005's `rationale.md` assigned: hero `generous`, how it works `compact`, the reasoning `generous`, about `standard`, sign in `standard`.
- **AC-3**: Section backgrounds run `paper`, `sunken`, `sunken`, `paper`, then the dark band. Exactly one hairline divider renders on the whole page, between the two `sunken` sections; every other boundary is carried by the background change alone, per spec 0005's adjacency rule.
- **AC-4**: The route renders zero client JavaScript. No file it reaches carries `"use client"`, there is no scroll reveal, and there is no mobile menu holding state. The three in page anchors are hidden below `md`, and the header's sign in jump link is present at every width.
- **AC-5**: Both comparison cards render as flat `Card`s on `bg-paper`, styled identically to each other. The "What's real today" status card is also `tone="flat"`. The hero result card is the only elevated `Card` on the page.
- **AC-6**: The sign in band uses the same left aligned, full width content measure as every other section. Its dark background is its only distinguishing axis: it is neither centred nor narrowed.
- **AC-7**: No sign in control on the page is a link. The two provider controls render as labels carrying the `Chip` status variant, beside a line saying accounts open with feature 7. The header's "Sign in" is an in page anchor to that band and is a working link at every width. This criterion is deliberately environment independent: it holds on production, preview and locally alike, because the page never links to `/sign-in` at all.
- **AC-8**: The "What's real today" card is true in **both** its lists. Nothing sits under `working` that is not shipped, so profile, filtered search, ranked results with reasoning and application tracking all move to `planned`. And nothing sits under `planned` that is not actually planned, so `email digests` is removed: its only trace in the repo is the "Scheduled push digest" line in the deferred ideas list at the end of `docs/scope/scope.md`, which is an idea held back, not a planned feature. `a no sign in demo account` stays, because it is a real scope feature (31, Seeded demo account).
- **AC-9**: The hero result card is visibly labelled as an illustration, so it cannot be read as live data. The label is a `Text` eyebrow at the top of `Card.Header`, and the wrapping `<figure>` carries an `aria-label` saying the same thing. The label is NOT put in the `figcaption`: the prototype's `figcaption` already holds the job role (`JobHuntLanding.tsx` line 211), HTML allows only one per `<figure>`, and the role is the genuine caption.
- **AC-10**: The page sets a title and a description, and `metadataBase` resolves from `canonicalSiteUrl` in `src/lib/origin.ts`, never from a hard coded string and never from `currentOrigin()`.
- **AC-11**: `src/app/opengraph-image.tsx` produces a 1200 by 630 pixel PNG at build time, showing the JobHunt mark, the page headline, and the match chip, drawn on the brand token values, and exports `alt`, `size` and `contentType`.
- **AC-12**: `robots` stays `index: false, follow: false` in `src/app/layout.tsx`, and no `robots.ts` or `robots.txt` is added anywhere.
- **AC-13**: The footer holds the lockup on the left and the copyright on the right, with the centre slot deliberately empty and reserved.
- **AC-14**: The page holds up from 320 pixels to 1440 pixels with no horizontal overflow, every control is reachable by keyboard with a visible focus ring, and every decorative icon is `aria-hidden` (WCAG 2.2 AA).
- **AC-15**: The Space Grotesk font file committed for the image generator sits beside its own licence file in the repo, and that licence permits redistributing the font inside this repository.
- **AC-16**: A test fails if any colour hard coded in `opengraph-image.tsx` drifts from its token in `src/app/globals.css`. The guarded set is named, not left to the test author's judgement: `--paper`, `--ink`, `--muted`, `--accent-300` and `--primary-800`. The test asserts every one of the five, so it cannot pass by checking a single easy value.
- **AC-17**: The hero card's "Apply on the real posting" control is not a link either (`JobHuntLanding.tsx` line 259 has it as `href="#"`). It renders as `Text` with the `ExternalLinkIcon`, inside `Card.Footer`. Together with **AC-7** this gives the page one rule with no exceptions: nothing that cannot work is a link, and an example listing has nothing real to apply to.

## Decision

**Chosen option**: Option 1: Port onto the component set, carrying spec 0005's composition decisions forward unchanged.

The page is rebuilt from the prototype's content and copy, composed entirely from spec 0005's components, with the rhythm, divider, container and grid decisions taken as already settled in that spec's `rationale.md` rather than reopened here. This spec decides only what that one left open, and corrects the two places where the prototype's copy is untrue.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`)

## Rationale

Reasoning, the options weighed, and the finding by finding adjudication of the composition review: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: Not applicable. The page persists nothing, reads no table, and holds no state. The result card's contents are fixed illustrative copy that lives in the page's own module, not a fixture loaded from anywhere.

**State transitions**: Not applicable. No entity, no lifecycle.

**API surface**: No new endpoint. The page is a statically prerendered Server Component at `/` in the `(marketing)` group, whose layout checks no session.

| Route | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/` | GET | none | the page | public, no session | none; a non 200 is what the uptime monitor from spec 0002 reports on |
| `/opengraph-image` | GET | none | 1200 by 630 PNG | public | a missing font file throws, naming the file and how to get it. That is **the explicit guard in `opengraph-image.tsx`, not Next.js behaviour**: `next/og` bundles `Geist-Regular.ttf` and silently falls back to it, so without the guard the build succeeds and ships an off brand card. See that file's own header comment. Do not remove the guard on the belief that the framework already fails here |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render page | section rhythm tier, per section | spec 0005 `rationale.md`, the Rhythm scale paragraph; carried forward, not re decided |
| Render page | section background and divider, per section | this spec, AC-3, applying spec 0005's adjacency rule |
| Render page | headline, subhead, section copy | `docs/design/JobHuntLanding.tsx`, unchanged except where AC-7 and AC-8 require it |
| Render page | hero card contents (company, role, location, salary, skills, reasoning lines) | `docs/design/JobHuntLanding.tsx`, fixed illustrative copy, labelled as such per AC-9 |
| Render page | `MatchBar` proportions | the caller, per spec 0005 AC-7: hero and comparison card pass `matched={8} total={11}`, step 02 passes `matched={6} total={8}` |
| Render page | "what's real today" working and planned lists | `docs/scope/scope.md`, the At a glance status column, read at build time by a human, not programmatically |
| Render page | sign in control state | this spec, AC-7: not a link until feature 7 ships |
| Render page | lockup artwork | `docs/design/logo/lockup.svg`, moved into `src/components/ui/logo.tsx` |
| Page metadata | `metadataBase` | `canonicalSiteUrl` in `src/lib/origin.ts`, which is `NEXT_PUBLIC_SITE_URL` |
| Page metadata | title, description | this spec, `## Copy` below |
| Page metadata | `robots` | `src/app/layout.tsx`, already set; unchanged |
| OG image | 1200 by 630 dimensions | `size` export in `src/app/opengraph-image.tsx` |
| OG image | typeface bytes | `assets/SpaceGrotesk-SemiBold.ttf`, committed, read with `readFile` at build |
| OG image | mark artwork | drawn inline as SVG rectangles in the image JSX, taken from `docs/design/logo/mark.svg` |
| OG image | colour values | literal values duplicated from `src/app/globals.css`, guarded against drift by AC-16 |
| OG image | headline text | this spec, `COPY-3` in `## Copy` |
| OG image | match chip value | literal `8 / 11`, the same proportion the hero card shows, this spec |
| OG image | alt text | `alt` export in `src/app/opengraph-image.tsx` |
| Render page | hero card example label | this spec, `COPY-2` |
| Render page | sign in explanation line | this spec, `COPY-1` |
| Render page | footer copyright | this spec, `COPY-4` |
| Render page | apply control, on an example listing | this spec, **AC-17**: inert `Text`, no destination, because an example listing has none |

**Copy**:

- Title: `JobHunt`, with a `template` of `%s · JobHunt` so later pages inherit the suffix.
- Description: `Ranks real job openings against your profile and shows which skills matched, which are missing, and why. Not a score you have to take on trust.`
- OG image alt: `JobHunt. Shows its work, not just a score. An example match of 8 out of 11 skills.` It describes what the card actually renders (the mark, the `COPY-3` headline, the match chip), because alt text is what a screen reader user gets instead of the image. If `COPY-3` ever changes, this changes with it.

The four strings below are user facing product voice rather than technical values, so they were written by the engineer rather than invented here. **All four are now final** (written 2026-08-28) and the build uses them verbatim. Changing one later is a copy change, not a spec decision, but **AC-7**, **AC-9**, **AC-11** and **AC-13** each depend on the string being present.

- **`COPY-1`, the sign in line** (**AC-7**), shown beside the two provider controls in both the hero and the sign in band. It must say that accounts are not open yet without using an internal feature number. `Sign in isn't live yet. Coming soon with Google and GitHub.`
- **`COPY-2`, the example label** (**AC-9**), the `Text` eyebrow on the hero card and the `<figure>`'s `aria-label`. `Example result`.
- **`COPY-3`, the OG image headline** (**AC-11**), the line set in Space Grotesk on the preview card. It may differ from the page's h1, because a link card is read at a glance and the h1 is not. `Shows its work, not just a score.`
- **`COPY-4`, the footer copyright** (**AC-13**). `© Ghaly Nicolas Jules`, with no year. A hard coded year goes stale silently and a year computed at build time makes two builds of the same commit differ, so neither is offered as the default.

**Smaller composition calls** (settled by this spec so the build does not have to invent them; each names the review finding it answers):

- **Eyebrow placement (Tell #4).** The eyebrow appears only on the two `generous` sections, hero and the reasoning. How it works and about open on their heading alone. This turns the eyebrow into a marker of the page's two peaks instead of boilerplate above every section, and it costs nothing.
- **Decorative chips (Tell #10).** The five `aria-hidden` pills in step 01 reading "Location / Remote / hybrid / Seniority / Salary / Job type" are deleted. The step's own prose already names those filters, so the pills were texture shaped like UI.
- **Prose measure (Weaknesses #7, #8).** All body copy uses the measure `brand-tokens.md` sets (65ch) through `Text`, replacing the prototype's ad hoc `54ch`, `60ch` and `46ch`. The h1 loses `max-w-[16ch]` and wraps on its own, since a character count sets the break point by accident rather than by sense.
- **Hero card internals (Weakness #4).** The two hand drawn `my-5 border-t` rules inside the hero card are replaced by `Card.Header`, `Card.Body` and `Card.Footer`, so the card has one border, not five levels of hairline at one weight.
- **Comparison bars (Weaknesses #5, #6).** The "Most tools" percentage bar is a different object from `MatchBar` and is drawn to look like one: a single continuous bar, visibly distinct in shape from the segmented match cells, rather than the same height at a different radius. The two cards' bars are no longer expected to align across the gutter, because they are no longer the same object.
- **Twitter card.** `twitter.card` is set to `summary_large_image` in the page metadata. No separate `twitter-image` file is added: the platform is understood to fall back to `og:image`, and a second generated image would be a second thing to keep in sync for no gain. That fallback is **inferred, not verified**, so it is checked by hand in the same pass as the unfurl check (see `## Follow-up`).

**Component inventory**:

| Component | Home | Status |
|---|---|---|
| `Section`, `Card`, `Button`, `Chip`, `Text`, `Heading`, `MatchBar`, the five icons | `src/components/ui/` | exists, spec 0005 |
| `Logo` (`variant`: `lockup` \| `mark`) | `src/components/ui/logo.tsx` | **net new**, and it extends spec 0005's component inventory |
| `EntryHeader`, `EntryFooter`, and one module per body section | `src/features/entry-page/` | net new, feature local |
| the image generator | `src/app/opengraph-image.tsx` | net new |

`Logo` is a base component that spec 0005's inventory does not list, in either its `index.md` table or `src/components/ui/AGENTS.md`. That is deliberate and recorded here: spec 0005 parked logo work by the engineer's own constraint, the engineer lifted that constraint during this spec's design conversation, and `Logo` earns its place in `src/components/ui/` because it has three consumers on day one (header, footer, image generator) and the application shell will be a fourth. A later reader comparing that table against the directory will find one more file than the table lists, and this paragraph is why.

**The hero card's `<figure>` wrapper**: `Card`'s `as` prop accepts `div`, `article`, `section` or `li` (`src/components/ui/card.tsx` line 52) and not `figure`, so the hero card is composed as a plain `<figure>` wrapping `<Card tone="elevated">`. Do **not** widen spec 0005's `as` union for this one caller. The bare `<figure>` carries no rounded or bordered styling of its own, only the `aria-label` from **AC-9**, so it is not a hand composed container and trips neither **AC-1** nor the `no-restricted-syntax` rule, which matches a `rounded-*` class paired with `border` in one `className` literal.

**Key invariants**:

- Exactly one hairline divider exists on the page. A second one means the background alternation was changed without applying spec 0005's adjacency rule.
- The page renders no `"use client"` file. Any future interactivity here opens its own narrow boundary and states why, rather than making the page a client component the way the prototype was.
- Nothing appears under `working` in the status card that is not `done` in `docs/scope/scope.md`. The page's own About copy makes this a promise, not a preference.
- Nothing on the page that cannot work is a link. That covers the two sign in controls and the apply control alike; the header's anchors and the footer are the only real links, and both go somewhere real.
- The elevated card idiom appears exactly once on this page, on the hero result card.
- The font guard in `opengraph-image.tsx` stays. It looks like a redundant `try`/`catch` around a file read and it is not: it is the only thing standing between a missing font and a silently off brand preview card, because `next/og` falls back to its bundled Geist rather than failing. Removing it does not surface an error, it removes one.

**Security model**: The page is public and reads nothing. No session check, no Supabase client, no Server Action, no user data of any kind. It renders no personal data, so no compliance scope applies. Binding rule 6 is untouched: no route handler under `src/app/api/` is added, and the image generator is a metadata file convention, not a data endpoint.

**Observability**: No Sentry span. The project's span rule covers operations whose failure rate matters; a static prerender has no runtime failure rate to alert on, and spec 0002 already points the uptime monitor at this page, which is the truer signal.

**Configuration required**: None. `NEXT_PUBLIC_SITE_URL` already exists and is already validated in `src/env.ts`. No new environment variable, no credential, no third party account.

**Critical test scenarios**. Each is tagged with where it lives, because spec 0005 keeps a clean split between what its unit suite can prove and what only a real browser can, and this feature keeps that split. `automated` means it belongs in the Vitest unit suite and fails in CI. `manual` means it belongs in this spec's `verify.md`, written later by `/check verify`, and no CI job enforces it.

- `automated` Structural: exactly one `divider="hairline"` is passed across the whole composed page, verifies **AC-3**.
- `automated` Drift guard, with its own vacuousness check: changing any one of the five named tokens in `globals.css` without touching `opengraph-image.tsx` must fail the test, verifies **AC-16**.
- `automated` Regression: nothing the route renders carries `"use client"`, verifies **AC-4**.
- `automated` Rhythm and background: each section receives the tier and background this spec assigns, verifies **AC-2**, **AC-3**.
- `automated` No dead controls: no sign in control and no apply control renders as an anchor, verifies **AC-7**, **AC-17**.
- `manual` Happy path: the page renders at 1440 and at 320 pixels with no horizontal overflow and the three rhythm tiers measurably distinct in computed style, verifies **AC-2**, **AC-14**.
- `manual` Keyboard: every control is reachable in order with a visible focus ring, and the header's sign in anchor moves focus to the band, verifies **AC-14**.
- `manual` Link card: the deployed preview URL unfurls with a real 1200 by 630 image, a title and a description, in at least two clients, verifies **AC-10**, **AC-11**.
- `manual` Honesty, both directions: the status card's `working` list contains nothing the scope still marks `planned`, and its `planned` list contains nothing that has no scope row at all. Deliberately a human read: the source is prose in `docs/scope/scope.md`, and a test asserting against it would only encode the same reading twice, verifies **AC-8**.
- `automated` Lint: `pnpm lint` passes with `--max-warnings=0`, which is what actually enforces the no hand composed container rule, verifies **AC-1**.
- `automated` Card idioms: exactly one `tone="elevated"` is rendered on the page, and the comparison and status cards are all `tone="flat"`, verifies **AC-5**.
- `automated` Band: the sign in band renders neither a centring nor a narrowing class, so Tell #7's two removed axes cannot creep back, verifies **AC-6**.
- `automated` Example label: the hero `<figure>` carries its `aria-label` and the `COPY-2` eyebrow is present, verifies **AC-9**.
- `automated` Robots: `layout.tsx` still exports `robots: { index: false, follow: false }`, and no `robots.ts` or `robots.txt` exists anywhere in the repo, verifies **AC-12**.
- `automated` Footer: it renders the lockup and the copyright and nothing between them, verifies **AC-13**.
- `automated` Font licence: the committed `.ttf` has a licence file beside it, so the binary can never land alone, verifies **AC-15**.

## Build plan

Ordered as a Tracer Bullet, the project's recorded build approach. The thin thread here is not a database write, it is the whole link path: a real page at a real URL whose metadata and generated image actually unfurl in a real client. Step 2 proves that end to end while the page is still mostly empty, because a broken image route or a missing font is far cheaper to find before five sections exist than after.

1. Build `Logo` in `src/components/ui/logo.tsx` from `docs/design/logo/lockup.svg` and `mark.svg`, with `lockup` and `mark` variants, a real accessible name, and a test beside it, satisfies **AC-1**.
2. **The thin thread.** Commit `assets/SpaceGrotesk-SemiBold.ttf` beside its licence file after confirming the licence permits it; build `src/app/opengraph-image.tsx` with its `alt`, `size` and `contentType` exports, drawing the mark inline as SVG rectangles; set the page's title, description and `metadataBase` from `canonicalSiteUrl`; and stand up `EntryHeader`, a bare hero `Section`, and `EntryFooter`. Deploy to a Vercel preview and confirm in a real client that the card unfurls. Satisfies **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-15**. The footer's copyright is `COPY-4` and the image headline is `COPY-3`, so both must be written before this step runs.
3. Add the drift guard test asserting the image generator's literal colours still match `globals.css`, and check it is not vacuous by changing a token and watching it fail, satisfies **AC-16**.
4. Thicken the hero: the full copy, a plain `<figure>` wrapping the elevated result `Card`, the `COPY-2` example label as a `Text` eyebrow in `Card.Header`, `MatchBar` at 8 of 11, the matched and missing `Chip` clusters, the reasoning lines, and the inert apply control in `Card.Footer`, laid out on the 60/40 `grid-split`, satisfies **AC-5**, **AC-9**, **AC-17**.
5. Build the sign in controls as non linking labels with the `Chip` status variant, carrying `COPY-1`, in both the hero and the band, and wire the header's anchor to the band, satisfies **AC-7**.
6. Build the "how it works" section at `compact` on `sunken`: three equal columns, `MatchBar` at 6 of 8 in step 02 replacing the hand copied bar, satisfies **AC-1**, **AC-2**.
7. Build the reasoning section at `generous` on `sunken`, with both comparison cards flat on `bg-paper` and identical, and the single hairline divider above it, satisfies **AC-3**, **AC-5**.
8. Build the about section at `standard` on `paper`, with the status card as `tone="flat"` and rewritten so nothing sits under `working` that the scope still calls `planned`, satisfies **AC-5**, **AC-8**.
9. Build the sign in band at `standard`, dark, left aligned and full measure, satisfies **AC-6**.
10. Delete the scaffold placeholder in `src/app/(marketing)/page.tsx` and compose the real page from the section modules, satisfies **AC-1**, **AC-2**.
11. Run the keyboard, focus, responsive and reduced motion pass at 320 and 1440 pixels, and grep the rendered tree for `"use client"`, satisfies **AC-4**, **AC-14**.

## Consequences

**Positive**:

- The design system gets its first real consumer. Spec 0005's components have so far only been exercised by `/ui-preview`, which is a catalogue, not a page; a genuine composition is where an awkward API actually shows up.
- The front door stops lying. Two concrete untruths (four features claimed as working, two dead primary controls) are removed before anyone outside the author sees the page.
- The page ships no client JavaScript, so it is a pure static prerender. That is the cheapest thing to host, the fastest to load, and the easiest to keep correct.
- Header, footer and logo exist as components before the second page needs them, so feature 7's sign in screens and the application shell inherit them rather than reinventing them.

**Negative / tradeoffs**:

- The status card becomes a maintenance point. It is copy that must change every time a feature ships, with nothing enforcing it. Ownership is assigned in `## Follow-up`, but assignment is not enforcement, and this card going stale is the most likely way this page becomes untrue again.
- The image generator duplicates token values as literals, because the generator takes inline styles and cannot read Tailwind classes. AC-16's drift guard catches divergence but does not prevent it.
- A binary font file now lives in the repository. It is small, but it is a redistributed third party asset whose licence has to hold, and it is the first such file the project carries.
- The entry page has no working sign in on any environment until feature 7 lands. That is the honest state of the product, but it means the front door's whole job for now is to explain rather than to convert.
- Tell #9 stays unfixed by choice. The match bar still appears three times, so the review's second priority finding survives this port; what is fixed is the divergent hand copy beneath it, not the repetition.

**Neutral**:

- `Logo` enlarges spec 0005's component inventory by one. That is recorded above and in `## Follow-up` so the design system's own context file can catch up.
- The footer's centre slot is empty on purpose, waiting for feature 21.
- `docs/design/JobHuntLanding.tsx` becomes a historical reference once this ships. It is not deleted by this feature, and it is no longer the page.

## Follow-up

- [x] Ownership for keeping the status card true is assigned. Features **9, 11, 12 and 14** each move their own claim from `planned` to `working` when they ship, and each now carries that sentence in its `Done when` in `docs/scope/scope.md` (applied by `/scope` on 2026-08-28). An earlier draft of this item said "9, 10, 11 and 12", which was wrong in both directions: feature 10 (usage gating) owns no claim on the card, and feature 14 (fit scoring) owns `ranked results with reasoning` and had been left out entirely.
- [ ] `src/components/ui/AGENTS.md`'s file table and spec 0005's component inventory both need a `Logo` row. That is `/sync`'s edit after this feature lands.
- [ ] Spec 0005's `## Follow-up` item "Logo mark integration is out of scope for this feature per the engineer's explicit constraint; revisit when that work is scheduled" is discharged by this spec. The engineer who set that constraint lifted it deliberately during this design conversation; it was not inferred. Tick that box when this feature is done.
- [x] `COPY-1` through `COPY-4` written by the engineer on 2026-08-28. They are final and the build uses them verbatim.
- [ ] Confirm Space Grotesk's licence permits redistributing the font file inside this repository before step 2 commits it. The expectation is SIL Open Font License 1.1, which does permit it, but that is recalled rather than verified and it gates **AC-15**. Check the licence shipped with the font at its source and commit that file alongside the binary.
- [ ] Verify in a real client that `robots: index false` does not suppress the link card. Social unfurlers are generally not search indexers, so it should not, but that is inferred and not verified, and the whole point of **AC-11** dies quietly if it is wrong. Paste the preview URL into Slack and into a message during step 2. Confirm in the same pass that the Twitter card falls back to `og:image` with no `twitter-image` file present, which is the other inferred claim in this spec.
- [ ] Whether Satori (the renderer behind `ImageResponse`) accepts the mark as inline SVG is unverified. If it does not, embed `public/mark-512.png` as a data URI read from disk at build instead. That fallback is decided, so the build does not need to stop and ask.
