# Verify: entry page & link metadata · spec 0006 · updated 2026-08-28

_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

**Scope of this file so far.** Only the thin thread (build plan steps 1 to 3) is built, so these steps cover the logo, the link metadata and the generated preview card. Steps for the five body sections are appended when steps 4 to 11 land, and the criteria they prove are listed as not yet covered at the bottom.

## UI / manual

> **A protected preview URL cannot be used for the unfurl checks below.** Verified on 2026-08-28: this project has Vercel deployment protection on, so a preview URL answers an unauthenticated request with `302` to `vercel.com/sso-api`. A Slack or iMessage unfurler is exactly such a request, so it sees no `og:` tags and renders no card, for a reason that has nothing to do with this code. Do the unfurl checks one of these ways instead: on the **production** URL after merge (verified reachable and unprotected, `200`), or on a preview with protection bypassed for that URL. Do not read "no card appeared" on a raw protected preview as a failure of AC-11.

- [ ] On an unprotected URL (production after merge, or a bypassed preview), paste it into Slack **and** into iMessage → both render a 1200 by 630 card showing the JobHunt lockup, the headline "Shows its work, not just a score." and the amber `8 / 11` chip → AC-11 · **not run:** blocked by deployment protection, see the note above. Waiting on production or a bypass
- [ ] In that same paste → the card appears at all, despite `robots: index false` in `layout.tsx`. Spec 0006 records this as inferred rather than verified, so this step is what settles it. Rule out the protection redirect first (above), then treat noindex as the next suspect → AC-12 · **not run:** same block as the step above
> **`og:image` is expected to point at whatever host built it, including a preview host. That is correct, not a bug.** Next.js overrides `metadataBase` for a static metadata route file, which `opengraph-image.tsx` is, whatever `metadataBase` is set to. Verified in the installed source at `node_modules/next/dist/lib/metadata/resolvers/resolve-opengraph.js`, the `isRelativeUrl && (!metadataBase || isStaticMetadataRouteFile)` branch, whose comment states the intent: the image should be "properly discovered across different environments" without per environment `process.env` checks. It has to work this way, because production does not serve this route at all until the branch merges. **Do not "fix" `opengraph-image.tsx` or `src/lib/origin.ts` over this.**

- [x] View source on a **preview** deployment, in a browser where you are signed in to Vercel so protection lets you through → `og:image` is a fully qualified absolute URL ending `/opengraph-image`, on **that deployment's own host**. What is being checked is that the route resolves to a real absolute URL on the host serving it, not that it names any particular origin → AC-11 · confirmed 2026-08-28 against the signed in preview
- [x] Open that `og:image` URL directly in the same signed in browser → it returns the 1200 by 630 PNG, showing the JobHunt lockup, the headline and the amber `8 / 11` chip. This is the check that the route actually produces an image, independent of any unfurler → AC-11 · confirmed 2026-08-28 against the signed in preview, the image opened directly and shows the lockup, the headline and the 8 / 11 chip
- [ ] Repeat both after merge, on production → the same, resolved to the production host → AC-11 · **not run:** nothing to repeat on production until this branch merges. Blocked alongside the two unfurl steps
- [x] Same source view → `<title>` is `JobHunt`, the description is the one in the spec's `## Copy`, and `twitter:card` is `summary_large_image` → AC-10 · confirmed 2026-08-28 against the signed in preview: `<title>`, the description and `twitter:card` all match
- [x] Load the page at 320 pixels wide → the header shows the lockup and the Sign in control and no nav anchors; nothing overflows horizontally → AC-4, AC-14 · confirmed 2026-08-28 against the signed in preview
- [ ] At 320 pixels, activate Sign in → the page jumps to the sign in band. It is a real link and must not 404 → AC-4, AC-7 · **partly done 2026-08-28:** the URL correctly changes to `#start` with no 404, so the link half holds. The other half is unverifiable until build step 9 creates the sign in band to jump to
- [x] At 1024 pixels or wider → the three nav anchors (How it works, The reasoning, About) are visible and each jumps to its section → AC-4 · confirmed 2026-08-28 against the signed in preview
- [x] Tab from the top of the page → the logo link, then each nav anchor, then Sign in, each showing a visible teal focus ring that appears instantly rather than fading in → AC-14 · confirmed 2026-08-28 against the signed in preview: the whole tab order, logo link then each nav anchor then Sign in, each with a visible ring
- [x] With a screen reader → the header logo announces once, as the link's name ("JobHunt home"), not twice; the footer logo announces as "JobHunt" → AC-14 · confirmed 2026-08-28 against the signed in preview, VoiceOver announced the header logo once as "JobHunt home" and the footer logo as "JobHunt"
- [x] Footer → the lockup on the left and `© Ghaly Nicolas Jules` on the right, with nothing in the centre slot (reserved for feature 21) → AC-13 · confirmed 2026-08-28 against the signed in preview
- [x] Look at the page at 1440 pixels → the header sits on a visibly different tone from the hero below it, with no hairline rule between them → AC-3 · confirmed 2026-08-28 against the signed in preview

## Commands

- [ ] `pnpm build` → succeeds, and the route table lists `/opengraph-image` as `○ (Static)`, confirming the card is generated once at build time rather than per request → AC-11
- [ ] `mv assets/SpaceGrotesk-SemiBold.ttf /tmp && pnpm build` → the build FAILS with an error naming `assets/SpaceGrotesk-SemiBold.ttf`. It must not succeed: `next/og` bundles `Geist-Regular.ttf` and would otherwise ship an off brand card silently. Restore the file afterwards → AC-15
- [ ] `ls assets/` → the `.ttf` sits beside `SpaceGrotesk-OFL.txt`, and that file is the SIL Open Font License 1.1 → AC-15
- [ ] Change `--accent-300` in `src/app/globals.css` only, then `pnpm test` → `og-tokens.test.ts` fails. Revert → AC-16
- [ ] Change one rectangle in `docs/design/logo/mark.svg`, then `pnpm test` → `logo.test.ts` fails the drift guard. Revert → AC-1
- [ ] `grep -rn "use client" src/app src/features src/components` → no match anywhere in the entry page's tree → AC-4
- [ ] `grep -n "metadataBase" src/app/layout.tsx` → it reads `canonicalSiteUrl` from `src/lib/origin.ts`, never `currentOrigin()` and never a literal → AC-10. This is a source read rather than a browser check on purpose: for the generated image route Next overrides `metadataBase` (see the note above), so the rendered `og:image` cannot evidence this wiring either way. What `metadataBase` does govern is every other absolute URL the app will emit, such as the canonical links and `og:url` that feature 21's Terms and Privacy pages will need, so it still has to be right
- [ ] `pnpm lint` → clean at `--max-warnings=0`, which is what enforces the no hand composed container rule → AC-1
- [ ] `pnpm test` → all unit tests pass → AC-1, AC-16

## Acceptance-criteria coverage

Covered by the steps above: AC-1 (partly, lint plus the logo drift guard) · AC-3 (partly, the header boundary only) · AC-4 · AC-7 (partly, the header's jump link only) · AC-10 · AC-11 · AC-12 · AC-13 · AC-14 (partly, header and footer only) · AC-15 · AC-16.

**Manual pass, 2026-08-28.** Nine of thirteen manual steps confirmed against the signed in preview. **Every step that can be run at this point has been run, and all of them passed.** The four that remain are blocked rather than outstanding: three need either a deployment protection bypass or the branch merged to production, and one needs build step 9 to create the sign in band there is currently nothing to jump to. The reason sits on each line rather than being summarised away, so a later reader can tell a step blocked by circumstance from one that was ducked.

**A note on how AC-10 is proved.** Its two halves are checked in different ways on purpose. The title, description and Twitter card are read off the rendered page. The `metadataBase` half is proved by reading `layout.tsx`, because Next overrides `metadataBase` for the generated image route, so no amount of looking at `og:image` can tell a correct wiring from an incorrect one. An earlier version of this file asked for exactly that impossible check.

**Not yet covered, because the code is not built** (build plan steps 4 to 11): AC-2 (section rhythm tiers), AC-3 in full (the single hairline across all five sections), AC-5 (card idioms), AC-6 (the sign in band's axes), AC-7 in full (the provider controls and the band), AC-8 (the status card's two lists), AC-9 (the hero card's example label), AC-17 (the apply control). Append their steps when those milestones land.
