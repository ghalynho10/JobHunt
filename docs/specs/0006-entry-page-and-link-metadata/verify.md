# Verify: entry page & link metadata · spec 0006 · updated 2026-08-28

_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

**Scope of this file so far.** Only the thin thread (build plan steps 1 to 3) is built, so these steps cover the logo, the link metadata and the generated preview card. Steps for the five body sections are appended when steps 4 to 11 land, and the criteria they prove are listed as not yet covered at the bottom.

## UI / manual

- [ ] Deploy the branch to a preview, then paste the preview URL into Slack **and** into iMessage → both render a 1200 by 630 card showing the JobHunt lockup, the headline "Shows its work, not just a score." and the amber `8 / 11` chip → AC-11
- [ ] In that same paste → the card appears at all, despite `robots: index false` in `layout.tsx`. Spec 0006 records this as inferred rather than verified, so this step is what settles it; if a client shows no card, the noindex directive is the first suspect → AC-12
- [ ] View source on the **preview** deployment (not production) → `og:image` is an absolute URL on the **production** origin, not the branch preview URL → AC-10. This is the value sourcing edge: `metadataBase` reads `canonicalSiteUrl`, and a build wired to `currentOrigin()` instead would look correct on production, where the two are equal, and be wrong everywhere else
- [ ] Same source view → `<title>` is `JobHunt`, the description is the one in the spec's `## Copy`, and `twitter:card` is `summary_large_image` → AC-10
- [ ] Load the page at 320 pixels wide → the header shows the lockup and the Sign in control and no nav anchors; nothing overflows horizontally → AC-4, AC-14
- [ ] At 320 pixels, activate Sign in → the page jumps to the sign in band. It is a real link and must not 404 → AC-4, AC-7
- [ ] At 1024 pixels or wider → the three nav anchors (How it works, The reasoning, About) are visible and each jumps to its section → AC-4
- [ ] Tab from the top of the page → the logo link, then each nav anchor, then Sign in, each showing a visible teal focus ring that appears instantly rather than fading in → AC-14
- [ ] With a screen reader → the header logo announces once, as the link's name ("JobHunt home"), not twice; the footer logo announces as "JobHunt" → AC-14
- [ ] Footer → the lockup on the left and `© Ghaly Nicolas Jules` on the right, with nothing in the centre slot (reserved for feature 21) → AC-13
- [ ] Look at the page at 1440 pixels → the header sits on a visibly different tone from the hero below it, with no hairline rule between them → AC-3

## Commands

- [ ] `pnpm build` → succeeds, and the route table lists `/opengraph-image` as `○ (Static)`, confirming the card is generated once at build time rather than per request → AC-11
- [ ] `mv assets/SpaceGrotesk-SemiBold.ttf /tmp && pnpm build` → the build FAILS with an error naming `assets/SpaceGrotesk-SemiBold.ttf`. It must not succeed: `next/og` bundles `Geist-Regular.ttf` and would otherwise ship an off brand card silently. Restore the file afterwards → AC-15
- [ ] `ls assets/` → the `.ttf` sits beside `SpaceGrotesk-OFL.txt`, and that file is the SIL Open Font License 1.1 → AC-15
- [ ] Change `--accent-300` in `src/app/globals.css` only, then `pnpm test` → `og-tokens.test.ts` fails. Revert → AC-16
- [ ] Change one rectangle in `docs/design/logo/mark.svg`, then `pnpm test` → `logo.test.ts` fails the drift guard. Revert → AC-1
- [ ] `grep -rn "use client" src/app src/features src/components` → no match anywhere in the entry page's tree → AC-4
- [ ] `pnpm lint` → clean at `--max-warnings=0`, which is what enforces the no hand composed container rule → AC-1
- [ ] `pnpm test` → all unit tests pass → AC-1, AC-16

## Acceptance-criteria coverage

Covered by the steps above: AC-1 (partly, lint plus the logo drift guard) · AC-3 (partly, the header boundary only) · AC-4 · AC-7 (partly, the header's jump link only) · AC-10 · AC-11 · AC-12 · AC-13 · AC-14 (partly, header and footer only) · AC-15 · AC-16.

**Not yet covered, because the code is not built** (build plan steps 4 to 11): AC-2 (section rhythm tiers), AC-3 in full (the single hairline across all five sections), AC-5 (card idioms), AC-6 (the sign in band's axes), AC-7 in full (the provider controls and the band), AC-8 (the status card's two lists), AC-9 (the hero card's example label), AC-17 (the apply control). Append their steps when those milestones land.
