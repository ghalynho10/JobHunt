# 0006 · Rationale

The decision record for [index.md](index.md): why the entry page is built this way, what else was weighed, and how every finding in the composition review was disposed of. `/develop` does not read this file.

## Context

> ⚠️ Premise note: the task was framed as a port, which reads as mechanical. It is not. Tracing every value the page must display back to a named source turned up two statements on the prototype that are false rather than merely generic: the "What's real today" card lists profile, filtered search, ranked results with reasoning and application tracking under `working`, and all four are `planned` in the scope; and the page's two most important controls are `href="#"`. The page's own About copy promises "Anything not built yet is labeled as such on this page, not implied", so these are not style problems, they are the page contradicting itself. Correcting them is part of this build, not a follow up.

JobHunt has no front door. `src/app/(marketing)/page.tsx` is a scaffold placeholder whose own comment says feature 6 replaces it. What exists instead is `docs/design/JobHuntLanding.tsx`, a 413 line prototype that was written before the design system, marked `"use client"`, and built entirely from hand composed Tailwind. It was then reviewed: `docs/design/landing-composition-review.md` read the whole file and recorded thirteen "tells" (patterns that read as generic regardless of how well they are executed) and ten weaknesses, every line number verified by grep rather than recalled.

Spec 0005 answered the structural half of that review. It found that nearly every finding traced back to one gap, `paper` and `surface` differing by about 1% in lightness so that fill separates nothing, and built the vocabulary that removes it: two container idioms split by elevation, a three tier rhythm scale, a new `--surface-sunken` token for section level alternation, a 60/40 grid utility, and a motion rule. It also assigned several of the review's findings to feature 6 by name and, in its `rationale.md`, made composition decisions for this page that were never carried into `index.md`.

That split is the reason this spec exists in the shape it does. A reader of spec 0005's `index.md` alone would conclude that only two findings were assigned to feature 6, would treat the rhythm tiers as an open question, and would re decide them. The tiers are not open: `rationale.md` line 54 assigns all five, and records that collapsing "How it works" and "About" into one tier was explicitly rejected because a three tier scale only earns its complexity if all three are used.

The audience shapes everything else. This is not a public marketing page and it is not indexed. It is a link the author pastes to friends and to recruiters evaluating the work, which means the unfurled card is often seen before the page is, and it means the page is read by people who will check whether its claims are true. There is no real authentication yet: feature 7 builds OAuth, and the only sign in route today is the development only session mint that spec 0002 has calling `notFound()` outside development.

## Options considered

### Option 1: Port onto the component set, carrying spec 0005's composition decisions forward

Rebuild the page from the prototype's content using only spec 0005's components, treating the rhythm, divider, container and grid decisions in that spec's `rationale.md` as settled, and deciding only what it left open.

**Pros**:

- The decisions that were already deliberated with the engineer stay deliberated. Nothing is silently re litigated by a later session that read only `index.md`.
- The design system gets a real consumer. A catalogue route proves each component in isolation; a genuine page is where an awkward API surfaces.
- Scoped tightly enough to finish. The open set is four questions, not thirteen.

**Cons**:

- It inherits decisions made against a prototype rather than against a built page. If a tier assignment turns out wrong in practice, it is now recorded in two specs instead of one.
- Some findings survive. Tell #2 (one measure for every section) and Tell #9 (the match bar three times) are carried forward rather than fixed, so the review is answered in part, not in full.

### Option 2: Redesign the page against the review's full findings

Treat all thirteen tells as a work list and rebuild the composition from scratch, changing sections, their order, and their content where the review implies it.

**Pros**:

- The only path that answers the review completely. Tells #2, #5, #9 and #10 all get real fixes rather than a recorded decision to live with them.
- The page would stop being a port and become a designed thing, which is what the front door of a portfolio piece arguably deserves.

**Cons**:

- It discards deliberated work. Spec 0005's rhythm and background decisions were made with the engineer against this exact composition; a redesign voids them and the conversation happens twice.
- The review itself does not ask for this. Its closing section says "No redesign proposed here" and gives an ordering for acting on the findings, which presumes the composition survives.
- Far more scope than the scope row describes, on a feature whose actual purpose is to stop the front door being a placeholder.

### Option 3: Ship the metadata only, defer the page until after feature 7

Set the title, description, preview image and robots directive against the existing scaffold page, and port the real composition once sign in works.

**Pros**:

- Removes the awkwardness this spec has to design around: a front door whose primary control does nothing.
- Very small. The link card, which is the part with the most reach per unit of work, lands immediately.

**Cons**:

- It puts a real preview card in front of a scaffold page, which makes the link worse, not better. The card promises a product and the click delivers a placeholder paragraph.
- The design system stays unproven against a real composition until feature 11, so an awkward component API is found by the results card instead of by the cheap page.
- It defers rather than removes the problem: feature 7 then carries both the auth build and the whole page port.

## Rationale

Option 1 is chosen because the forces in Context point one way. The decisions this page needs were mostly made already, in a conversation with the engineer, recorded in a spec that is `Accepted`. The failure mode worth designing against is not that those decisions were wrong; it is that they are invisible to anyone reading the file `/develop` actually loads. So the work here is to carry them into a build spec, name them as carried rather than invented, and spend the deliberation on the genuinely open four.

Option 2 was rejected on the review's own authority. A document that reads a file line by line and then writes "No redesign proposed here" is telling you its findings are corrections, not a brief. Acting on it as a brief would also void deliberated work, and the review's suggested ordering (fix the rhythm first, the match bar second) presumes the sections stay.

Option 3 was rejected because it inverts the value. The preview card exists to make a click worth making; shipping it in front of a placeholder spends the page's one reach mechanism on a disappointment.

**On the four open questions.** The engineer settled all four. Two deserve their reasoning recorded because a later reader will otherwise assume they were oversights.

The match bar stays at three appearances. The review calls this its second priority, so keeping it is a deliberate cost. What is fixed is the divergent hand copy at step 02, which rendered at 6/8 against the component's 8/11 and would have drifted further; it now goes through `MatchBar` like the other two. What is not fixed is the repetition itself. The judgement is that a bar shown three times from one component is a bounded, visible cost, while removing a showing changes what a section communicates, and the section that would lose it is the one explaining how the product works.

The sign in controls are not links on any environment. The alternative, pointing them at `/sign-in`, would have satisfied the scope's "sign in is reachable from it" on paper while giving production a 404 as its primary call to action, for exactly the audience the scope names. The project's own rule that a failure is never a default that reads like success settles it: a labelled control saying accounts open shortly is honest everywhere, and the page already uses that pattern for the demo. **AC-7** is therefore written to be environment independent rather than quietly true only in development.

**On the preview image.** Generating it from code rather than committing a PNG follows the same reasoning the project applied to its type scale: a value duplicated in two places drifts, so guard it. The generator has to duplicate colour literals because it takes inline styles and cannot read Tailwind classes, and **AC-16** puts a drift test on that duplication in the same shape `tv.test.ts` already uses to catch the type scale drifting from `globals.css`. The font file is the real cost: a binary third party asset in the repository, whose licence has to permit being there. That is why it is a numbered build step with a licence check attached, not a footnote.

**On the logo.** Spec 0005 parked logo work with the words "per the engineer's explicit constraint". The engineer lifted that constraint in this spec's design conversation, deliberately and by name; it was not inferred from the fact that a page needs a logo. Recording who lifted it matters, because the next reader of spec 0005's `## Follow-up` will otherwise find a constraint that appears to have been ignored.

**On the mobile menu, which this spec decides rather than carries.** A cross check of this spec caught the Evidence table crediting the menu's removal to spec 0005. It does not say that. Its "Server components by default" paragraph names both the menu toggle and the reveal observer as the two things in the prototype needing `"use client"`, and then retires exactly one of them: "the reveal on scroll behaviour is the one being retired as a blanket default". The menu was left open. Dropping it is a decision made here, and the reason is that the menu exists to hold three in page anchors, which does not justify the page's only client boundary. Below `md` those anchors are hidden and the header keeps the sign in jump link, so nothing becomes unreachable. That correction matters out of proportion to its size: this spec's whole method is carrying decisions forward accurately, so a carry claimed where none exists is the one defect that undermines the rest.

**On what is being accepted rather than fixed.** Tell #2 (one container measure, six times) is now the `Section` component's decision rather than a per instance repetition, and changing it would mean giving `Section` a width variant that no other page has asked for. That is a real carry forward, not an oversight, and it is named here so a later reviewer finds it recorded rather than missed.

## Evidence: every review finding, and what happens to it

Read against `docs/design/landing-composition-review.md`. "Settled in 0005" means the decision was made in spec 0005 and this spec only applies it.

### Tells

| # | Finding | Disposition |
|---|---|---|
| 1 | Uniform `py-20` on every section | **Fixed.** Settled in 0005 `rationale.md` line 54, applied here as **AC-2** |
| 2 | One container measure, six times | **Carried forward.** Now `Section`'s single decision rather than six repetitions; see Rationale |
| 3 | Hairline between every section | **Fixed.** Settled in 0005 line 56, applied here as **AC-3**: exactly one hairline remains |
| 4 | Eyebrow to h2 formula, three times | **Fixed.** Eyebrow kept only on the two `generous` sections, so it marks the peaks |
| 5 | The 01/02/03 three across grid | **Carried forward, deliberately.** 0005 line 62 reserves equal fractions for these three steps; line 54 compresses the section to `compact` |
| 6 | Comparison card shadow as thumb on the scale | **Fixed.** Settled in 0005 line 52, applied as **AC-5**, including moving the JobHunt card onto `bg-paper` |
| 7 | Centred dark CTA band | **Fixed here.** Two of three axes removed: no longer centred, no longer narrow. Dark stays, per 0005's recorded exception. **AC-6** |
| 8 | One card shell, four times | **Fixed.** 0005's two idioms: hero elevated, comparison and status cards flat. **AC-5** |
| 9 | Match bar spent three times | **Carried forward, by the engineer's decision.** Weakness #1's hand copy is fixed; the repetition is accepted. See Rationale |
| 10 | Chip cluster as filler texture | **Fixed here.** The five `aria-hidden` pills in step 01 are deleted |
| 11 | Reveal on scroll on everything | **Split.** The reveal is **carried** from 0005's Motion rule paragraph. Dropping the mobile menu is **decided here**, not carried: 0005's "Server components by default" paragraph names both the menu toggle and the reveal observer as needing `"use client"` and retires only the reveal. Both land in **AC-4**. See Rationale |
| 12 | Hero split at 1.05fr/0.95fr | **Fixed.** The `grid-split` utility (3fr/2fr) replaces it |
| 13 | Every grid an equal division | **Fixed where it was wrong.** Hero becomes 60/40; the steps and comparison cards stay equal, which 0005 line 62 reserves for genuine peers |

### Weaknesses

| # | Finding | Disposition |
|---|---|---|
| 1 | Step 02 bar is a longhand `MatchBar` copy at 6/8 | **Fixed.** Goes through the component. **AC-1**, build step 6 |
| 2 | "SOON" badge written three ways | **Fixed.** Settled in 0005: the `Chip` status variant is the one definition |
| 3 | Hero card has the least internal padding | **Fixed.** Settled in 0005 line 52: the elevated idiom's padding |
| 4 | Five hairline levels inside the hero card | **Fixed here.** `Card.Header` / `Body` / `Footer` replace the two hand drawn rules |
| 5 | Comparison bars: same height, different radius | **Fixed here.** The percentage bar is redrawn as a visibly different object |
| 6 | The two bars do not align across the gutter | **Fixed here,** by #5: they are no longer the same object, so alignment is no longer expected |
| 7 | Hero subhead at `54ch` against the specified `65ch` | **Fixed here.** All prose uses the `brand-tokens.md` measure through `Text` |
| 8 | `max-w-[16ch]` sets the h1 wrap by character count | **Fixed here.** Removed; the headline wraps on its own |
| 9 | Footer's best position holds a stack brag | **Fixed here.** Centre slot emptied and reserved for feature 21. **AC-13** |
| 10 | Both primary controls are `href="#"` | **Fixed here.** **AC-7**: they are labelled controls, not links, until feature 7 |

### Untruths found while tracing value sources

Neither of these is in the composition review, which was explicitly scoped to composition and layout. Both were found by working through every value the page displays and asking where it comes from.

| Finding | Where | Disposition |
|---|---|---|
| The status card lists four features as `working` that are all `planned` in the scope | prototype lines 371 to 378 | **Fixed. AC-8.** Ownership for keeping it true is assigned to features 9, 11, 12 and 14, each of which now carries the requirement in its own `Done when` |
| The same card's `planned` list promises `email digests`, which is not a planned feature | prototype line 377 | **Fixed. AC-8.** Removed. Its only trace is the "Scheduled push digest" line in the deferred ideas list, an idea held back rather than planned work. `a no sign in demo account` stays, being feature 31 |
| The hero result card shows fictional data with nothing marking it as an illustration | prototype lines 206 to 262 | **Fixed. AC-9.** Labelled by a `Text` eyebrow in `Card.Header` plus an `aria-label` on the `<figure>`. Not the `figcaption`, which already holds the job role at line 211 and may appear only once |
| A third control, "Apply on the real posting", is also `href="#"` | prototype line 259 | **Fixed. AC-17.** The review's Weakness #10 names all three dead links; an earlier draft of this spec covered only the two sign in controls |

## Cross check

An independent model on a different model family read this spec before the engineer accepted it. It found seven values or decisions whose source the spec never named, one mis-carried decision, and three soundness problems. Every finding was verified against the files before being acted on, and all were folded in.

The one worth recording on its own is the mis-carry, covered in `## Rationale` above: the spec claimed spec 0005 had settled the removal of the mobile menu, and it had not. The most damaging in build terms was structural rather than a matter of attribution: **AC-9** originally required the hero card to be labelled in its `figcaption`, which is impossible, because the prototype's `figcaption` already holds the job role and HTML permits one per `<figure>`. A build agent would have had to invent a resolution. Alongside it, `Card`'s `as` union has no `figure` member, so the spec now says explicitly to wrap rather than to widen an `Accepted` spec's component for a single caller.

The four checks the cross check ran against spec 0005's `rationale.md` and the shipped components (rhythm, divider and background, card idiom, grid) all verified clean, which is the evidence that the carrying forward method works when the bookkeeping is done right.

A third error was found later still, during the build itself. The `## Feature design` API surface table claimed the image route's "build fails loudly if the font file is missing, which is the wanted behaviour". The intent was right and the mechanism was invented: nothing in Next.js does that. `next/og` ships `Geist-Regular.ttf` and falls back to it when no font is supplied, which was verified twice, first by finding the file in `node_modules/next/dist/compiled/@vercel/og/` and then by removing the `fonts` option and watching a build succeed and generate the card anyway. So the spec described a safety net that did not exist, over exactly the failure mode this project's error model exists to prevent: a default that reads like success. The build closed the gap with an explicit guard that throws and names the file, which realises the stated intent rather than changing it, and the table now credits the guard instead of the framework. The lesson generalises past this one row: an acceptance criterion or an errors column that asserts a framework will fail is a claim about someone else's code, and it needs checking like any other.

The user facing copy strings the cross check found missing are deliberately still open, as `COPY-1` through `COPY-4` in `index.md`. The engineer writes those; they are product voice, not a technical value, and inventing them would be the same class of error as inventing a decision.

One further error survived the cross check and was caught later, while `/scope` was applying this spec's follow up items. The follow up assigning ownership of the status card named "features 9, 10, 11 and 12", a range written from the shape of the list rather than by resolving each claim to the feature that owns it. It was wrong twice over: feature 10 (usage gating) has no user visible claim on that card, and feature 14 (fit scoring) owns `ranked results with reasoning` and was omitted. Checking the card against the scope also turned up the `planned` list promising `email digests`, which no scope row backs. Both are recorded in the evidence table above. The lesson is narrow and worth keeping: a plausible looking range of feature numbers gets repeated back as an instruction and then applied literally, so each member has to be resolved against its source before the range is written down.

## References

**Project sources**:

- `docs/specs/0005-design-system-and-ui-foundation/rationale.md`, the source of the rhythm, divider, container, grid and motion decisions this spec carries forward rather than re decides
- `docs/specs/0005-design-system-and-ui-foundation/index.md`, the component inventory, the `Card` invariants, the `Section` adjacency rule, and the two findings it assigned to feature 6 by name
- `docs/design/landing-composition-review.md`, the verified diagnosis every finding above is numbered against
- `docs/design/JobHuntLanding.tsx`, the prototype supplying the composition and the copy
- `docs/design/brand-tokens.md`, the settled palette, type scale and the 65ch body measure
- `docs/specs/0002-deployment-and-environments/index.md`, for `/sign-in` calling `notFound()` outside development, and for the uptime monitor already watching this page
- `src/lib/origin.ts`, which names `canonicalSiteUrl` as the value page metadata must use
- `src/components/ui/AGENTS.md`, the design system's own rules, including that the project has no `design.md`
- root `AGENTS.md`, for the server first rule, the no silent failures rule, the folder by feature rule, and WCAG 2.2 AA
- `docs/scope/scope.md`, feature 6's `Done when`, the `planned` status of features 9, 11, 12 and 14 that **AC-8** depends on, and the deferred ideas list that shows `email digests` is not planned work
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.md`, the installed Next 16.3 documentation for the generated image convention, its `alt` / `size` / `contentType` exports, and the `readFile` font loading pattern
- the `vercel-react-best-practices` community skill, for the server first component posture

**Practices & standards**:

- WCAG 2.2 AA, for focus visibility, keyboard reachability and accessible names
- The Open Graph protocol, and `summary_large_image` as the Twitter card type that falls back to `og:image`
- SIL Open Font License 1.1, the expected licence for Space Grotesk, unverified here and gating **AC-15**
- Static prerendering as the default posture for a page with no request time input
