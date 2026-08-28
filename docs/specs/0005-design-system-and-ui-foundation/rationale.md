# 0005. Design system and UI foundation, rationale

## Context

`src/app/globals.css` still holds the Next.js scaffold's placeholder tokens (plain `--background`/`--foreground`), not the seven token palette recorded in `docs/design/brand-tokens.md`. No base component exists in `src/` yet. The only real evidence of what the product should look like is a standalone prototype, `docs/design/JobHuntLanding.tsx`, built against Tailwind v3 conventions and never ported.

A verified composition review of that prototype (`docs/design/landing-composition-review.md`) found thirteen "tells" (patterns that read as generic regardless of execution quality) and ten weaknesses, nearly all tracing back to one structural gap: `--bg` (`#FFFAFB`) and `--surface` (`#FFFFFF`) differ by about 1% in lightness, so fill separates nothing. With no tonal separation available, `border border-line` becomes the only way to mark something as a container (repeated at four places), and a hairline `border-t` becomes the only way to mark a section boundary (repeated at four more). The same shortage of visual moves shows up as: every section sized at the same `py-20` regardless of what it holds, every grid an equal fraction even where the two sides are not peers, and the page's one real differentiator (the mono register carrying the per skill match reasoning) diluted across 28 mostly decorative uses of the same typeface.

Two binding constraints shape how any fix lands in code. First, Adzuna's terms require a 116 by 23 pixel attribution block on every displayed job card; the hero card in the prototype is the shape the results card will inherit from, and as drawn has no reserved place for it. Second, Tailwind v4 removed the JavaScript config file, so the token layer must be raw channel values in `:root` mapped through a non-inline `@theme` (an inline `@theme` bakes values in at build time and would block runtime theming if a dark mode is ever added), and the accessibility rules (`prefers-contrast`, `forced-colors`, `prefers-reduced-motion`, `:focus-visible`) belong in native CSS, not hand rolled JavaScript media query checks.

Scope feature 5 ("Design system and UI foundation") is the one feature every later screen depends on: it sets the responsive posture and accessibility floor for the whole product. Feature 6 (porting the landing page itself) and feature 11 (the first real results card, which inherits the hero card's shape) both build on whatever this spec decides. Getting the container, rhythm, and divider vocabulary right here is the leverage point: fixing it after two more features have copied the prototype's patterns costs far more than fixing it before either exists.

## Options considered

The individual design decisions (the container idiom, the rhythm scale, the divider vocabulary, the mono usage rule, the grid ratio, the motion rule, the Adzuna slot, the component API) were walked one at a time with the engineer across four rounds of questions; each is recorded with its reasoning in `## Rationale` below. What remains a genuine open choice at the spec level is how strictly the resulting standard gets enforced, since this is a cross cutting decision that every later feature must follow.

### Option 1: Component API is the enforcement mechanism, new code only

The base components (`Card`, `Button`, `Chip`, `Text`, `MatchBar`, `Section`, the icon set) are the only sanctioned way to render these patterns. A future PR that hand composes `rounded-2xl border border-line` instead of using `Card` is primarily a code review finding, not a lint failure; a cross check of the drafted spec later added one narrow, cheaply scoped ESLint rule matching Tell #8's exact shape (see `## Rationale`'s Cross check note), but that is a small addition to this option, not Option 2's broader approach. No existing code in `src/` needs migrating, since `globals.css` is still a placeholder and no component exists yet; the only place the old patterns actually live is the standalone prototype, which feature 6 ports onto this system rather than this feature retrofitting it.

**Pros**:
- Matches the project's size (one engineer) and existing tooling investment; no broad, general purpose lint infrastructure to build and maintain.
- The component API itself is a strong constraint: once `Card` only exposes `elevated`/`flat` variants, there is no third idiom to accidentally introduce without editing the component.

**Cons**:
- Nothing stops a hand rolled Tailwind string from slipping through if review is rushed; enforcement is a human process, not a compiler or CI gate.

### Option 2: Add a custom ESLint rule restricting raw utility class combinations in JSX

Write a lint rule that flags known "shadow" patterns (e.g. `rounded-2xl` plus `border` composed outside `src/components/ui`) so a violation fails CI the same way the existing `no-restricted-imports` rule catches a secret key import.

**Pros**:
- Enforced automatically, the strongest mechanism available per the project's own tooling rules (root `AGENTS.md`'s `## Tooling` already uses this pattern for a different binding rule).

**Cons**:
- A visual pattern rule is far more brittle than an import path rule: it either over matches (flags legitimate one off compositions) or under matches (misses a new way to spell the same violation), and building and maintaining it is disproportionate effort for a solo engineered project with two consumers of this system so far (features 6 and 11).

### Option 3: Document only, rely entirely on review convention

Write the spec, ship the components, and leave enforcement to whatever the engineer notices in their own review.

**Pros**:
- Zero additional process or tooling cost.

**Cons**:
- Provides no more structure than the prototype already had; the exact failure this spec exists to fix (three different class strings for one "SOON" badge) happened without any deliberate standard in place, so "no standard, just discipline" is close to a repeat of the status quo.

## Rationale

**Option 1 is the right level of enforcement for where this project is.** The component API itself is the load bearing constraint (Option 1's "no third idiom to introduce without editing the component" point); a custom lint rule (Option 2) would be solving a coordination problem this project does not yet have; solo engineer, two known consumers of the system. Revisit if the team grows past one engineer (see Follow up).

**Container idiom (Tell #8, the background note).** The engineer chose two container idioms split by elevation over a third neutral token or a section level alternation rule, specifically because it lands two fixes at once: the hero card becomes the shadow led, elevated idiom, which both gives it a second container language and directly answers Weakness #3 (the hero card was the most important object on the page with the least internal padding). The comparison cards stay flat and identical to each other on purpose, because Tell #6 already names the shadow difference between them as the "thumb on the scale" mechanism; removing that shadow (the Comparison Parity decision) means the "JobHunt" card at line 334 must also move onto `bg-paper` like its neighbour, since without the shadow it would otherwise sit invisibly on the same `bg-surface` tone as its own section. This is carried into `## Component design`'s Card variants and flagged again in `## Follow-up` for feature 6.

**Rhythm scale (Tell #1, the strongest structural finding).** A three tier scale only earns its complexity if all three tiers are used; the engineer explicitly rejected collapsing "How it works" and "About" into the same tier for this reason. Hero and the reasoning section (the page's one real idea) get the generous tier; the CTA deliberately stays at standard rather than generous, since Tell #7 already flags it as over signalled (the only centred, only narrow, only dark block) and stacking more vertical room on top would add a fourth axis of specialness instead of fixing the one that exists. How it works, the most templated section per Tell #5, gets compact; About, which carries real proof (the "what's real today" panel), gets standard.

**Divider vocabulary (Tell #3) and background alternation.** Background shift is the primary divider mechanism, composing with (not replacing) the elevation based container idiom: alternation differentiates sections, elevation differentiates cards inside them. The hairline is kept only as a fallback for two adjacent sections that happen to share a background. This generalises the one place the prototype already does this correctly (the review's own finding: the reasoning section flips to `bg-surface` and its card to `bg-paper`, "the inversion working around the same 1% gap").

A cross check of the drafted spec caught that this decision, as first written, alternated between `paper` and the existing `surface` token, the same pair the review's own math puts about 1% apart in lightness: the exact gap that makes fill separate nothing, applied to section boundaries instead of cards. Brought back to the engineer, who added one new token, `--surface-sunken` (roughly `oklch(0.965 0.006 3)`, about 3.5% lighter than paper, a gap large enough to actually read), used only for section level alternation; `paper` and `surface` keep their existing roles (page canvas, card fill) untouched. This is a narrower move than the third neutral token the engineer declined earlier for card separation: the composition review explicitly carves out the page background as the one open exception to the otherwise settled palette ("Palette and colour tokens... are settled and out of review, with one exception (page background, at the end)"), so a section background token sits inside that exception, where a card fill token would not have. The engineer also rejected relying on the rhythm scale alone to carry section boundaries, since About and CTA already sit adjacent at the same `standard` rhythm tier, a real collision now, not a hypothetical one a future page might hit.

**Mono ratio (the page's stated differentiator).** Mono is reserved for written reasoning and literal data (the skill gap notes, the `//` summary, salaries, dates, scores); decorative labels (eyebrows, section micro labels, filter chips, step numerals, the "SOON" badge) move to tracked sans serif caps. The engineer tied this directly to Weakness #1: landing the boundary is only real if the step 02 hand copied `MatchBar` duplicate (at 6/8 instead of the component's 8/11) collapses onto the actual `MatchBar` component in the same motion, which is why `MatchBar` takes `matched`/`total` props rather than being hard coded to one proportion.

**Grid asymmetry (Tell #13).** A 60/40 ratio token was chosen over a more extreme 65/35 or 2:1 specifically to protect Tell #9's finding (`MatchBar` is the page's single best visual idea) from being compressed inside a narrower secondary column; equal fraction grids stay reserved for genuinely equal peers (the three steps, the two comparison cards), so the asymmetric ratio only ever applies where one side is not a peer.

**Motion rule (Tell #11).** Dropping the blanket scroll reveal in favour of a stated principle, rather than a numeric quota of "how many sections may animate", was chosen because a quota still has to be re litigated by every future component with no test to apply; the match cell stagger stays as the concrete precedent (it visualises the score assembling, which is information, not decoration) against which any future motion request is checked.

**Adzuna slot.** Same row, `justify-between`, wrapping to a stacked layout at narrow widths, was chosen as a compliance decision, not just a layout one: it is the only option where the 116 by 23 pixel block never compresses below spec at any viewport width, avoids adding a fixed extra row to every card on what will become a long results list, and keeps the attribution visually tied to the specific listing's apply action.

**Variant tooling.** `tailwind-variants` was proposed for its type checked variant props and compound component slots (needed for a `Card` with header/body/footer regions), verified against its own documentation to officially support Tailwind v4 ("TV does not depend on a specific Tailwind major version"), with two concrete setup notes: CSS `@source` directives replace the removed JavaScript `content` config, and the `responsiveVariants` option is gone in favour of using Tailwind's responsive prefixes directly inside variant class strings. Both notes are accounted for in `## Build plan`.

**Server components by default.** The base components carry no client side state (no `useState`, no `useEffect`); only the mobile menu toggle and the reveal on scroll observer in the current prototype needed `"use client"`, and the reveal on scroll behaviour is the one being retired as a blanket default. Per the `vercel-react-best-practices` community skill's rendering guidance, every base component in this spec ships as a plain Server Component; a consuming feature adds its own client boundary only where it introduces real interactivity, never the base component itself.

**Cross check.** An independent model read the drafted spec before the engineer confirmed it and found several implementation gaps that would otherwise have been left for `/develop` to invent: no stated font loading mechanism, `Button`'s `tertiary` variant having no way to actually render as a link, `Card`'s compound slots living only in prose, the type scale's ranges never resolved to concrete values, no stated mechanism for the 60/40 grid under Tailwind v4's CSS only theme, and the `MatchBar` cell stagger animation being hard coded to eight cells when the component now takes an arbitrary `total`. All were folded directly into `## Component design` and `## Build plan` as implementation completions of decisions already made, not reopened as new decisions. It also flagged that a narrow, cheaply scoped lint rule (matching Tell #8's exact shape) was available and being left out in favour of review alone; the engineer's Option 1 in `## Options considered` still stands as the primary mechanism, with that one rule added alongside it in `## Standard definition`.

**Two corrections after the build, from the fresh model review (2026 08 28).** Both changed the spec text, not the code; the code was already built and verified. Findings in `docs/reviews/2026-08-28-feat-design-system-and-ui-foundation.md`.

The first is the `Card` key invariant. It read "no shadow plus border together", which contradicted the component design table three paragraphs above it, where the elevated card is defined as "shadow led, minimal or no border". The code gives the elevated card a shadow plus a 25% opacity edge hint, so a reader checking the code against the invariant alone would report a violation, and the reviewer confirmed that is exactly what happens. The invariant was reworded to say what it always meant: what is ruled out is the flat idiom's full strength `border-line` carrying a shadow as well, which is the Tell #8 shape the whole two idiom split exists to prevent. A low opacity edge on an elevated card is part of that idiom, not a breach of it. The wording was the defect, so the wording was fixed; `card.test.ts` already encoded the correct reading, checking for the bare `border-line` class rather than any border at all.

The second is `## Configuration required`, which said "None. No new environment variables or credentials." That was true when the spec was written and false by the time the feature shipped. Build plan step 12 asks for a keyboard, focus and responsive pass over every component, and that pass needs a surface: a page rendering every component at every variant. The build added one at `/ui-preview`, gated behind a new `UI_PREVIEW_ENABLED` variable following the same fail closed shape spec 0002 established for `DEV_SESSION_ENABLED`. The alternative considered and rejected was building the page, running the pass, and deleting it, which would have left AC-13 and AC-14 with nothing to re-verify against on any later run, including the `/check verify` run that has to be repeatable. Recording the variable here rather than leaving the spec claiming none keeps the spec honest about what a fresh checkout has to set, which is the whole job of that field.

A cross check on a second model then found three more things in the same family, all folded in: the first draft of the reworded invariant attributed "minimal or no border" to the component inventory table when the phrase is AC-3's (the table says "minimal border", which is the shipped form, since the elevated card always carries the hint); the new configuration paragraph described the intended Preview value in prose instead of the per environment table spec 0002 established, so the table is now there and the unverified Preview value is a `## Follow-up` item rather than a silent claim; and several props that shipped were named nowhere in the spec, most importantly `Button`'s union forbidding `disabled` beside `href`. That last one matters beyond tidiness: `## Decision` makes the component API itself the enforcement mechanism, so a prop the spec never names is a rule nothing can be enforced against.

## References

**Project sources**:
- `docs/design/brand-tokens.md`, the settled seven token palette, type scale, and the Tailwind v4 port notes
- `docs/design/landing-composition-review.md`, the verified diagnosis this spec responds to (Tells #1, #3, #4, #5, #6, #8, #9, #11, #12, #13 and Weaknesses #1 through #10 are cited by number above)
- root `AGENTS.md`, the Tailwind v4 non-inline `@theme` constraint, the WCAG 2.2 AA rule, the folder by feature and named export rules
- `docs/scope/scope.md`, feature 5's done when criteria (tokens, type scale, base components, keyboard reachable with visible focus, responsive phone to desktop)
- the `vercel-react-best-practices` community skill (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`), consulted for the server component by default guidance

**Practices & standards**:
- WCAG 2.2 AA success criteria for focus visibility and non text contrast
- the `prefers-reduced-motion`, `forced-colors`, and `prefers-contrast` CSS media features as the native mechanism for the project's accessibility rules, rather than hand rolled JavaScript checks
- `tailwind-variants`, verified against its own documentation to officially support Tailwind v4
