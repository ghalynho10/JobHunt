# Verify: terms & privacy notices · spec 0009 · updated 2026-09-01

_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

**Scope of this file.** The code is complete: both pages, both registries, every guard test, and both links. What is NOT done is the second half of build plan step 6, which needs a deployment on `usejobhunt.dev` and Google Cloud console access. Those steps are marked **engineer** below and are the only reason this feature is not finished. Everything else here is a re proof, not a first proof.

**Where to run.** Steps marked **local** run against `pnpm dev`. Steps marked **deployed** need the pages live on `usejobhunt.dev`, because Google will not accept a `vercel.app` address as an authorised domain and a policy URL it cannot reach is the whole reason this feature exists.

## Commands

- [x] `pnpm test` → 523 tests pass, including the five guards in `src/features/legal/` → AC-4, AC-5, AC-6, AC-14, AC-23
- [x] `pnpm build` → `/terms` and `/privacy` both show `○ (Static)` in the route table, never `ƒ` → AC-1
- [x] `pnpm lint && pnpm typecheck` → both clean → AC-1

**The guards are only worth running if they can fail.** Each was proved to fail when the thing it guards actually drifts, and a re proof is cheap. Break one at a time, confirm the named test fails, then restore:

- [x] Add `ADZUNA_APP_KEY: process.env.ADZUNA_APP_KEY,` to the `runtimeEnv` block in `src/env.ts` → `recipients.test.ts` fails with "leaves no key unclassified" → AC-5
- [x] Add a column to a personal data table's `Row` in `src/lib/supabase/database.types.ts` → `stored-fields.test.ts` fails naming that column → AC-23
- [x] Add a whole new table to that file → `stored-fields.test.ts` fails with "leaves no table unclassified" → AC-23
- [x] Flip `userInfo: false` to `true` in `src/sentry.server.config.ts` → `sentry-claim.test.ts` fails with "sends no user identity" → AC-4
- [x] Add `"@vercel/analytics"` to `package.json` dependencies → `no-tracking.test.ts` fails → AC-14. **Restore `pnpm-lock.yaml` and run `pnpm install --frozen-lockfile` afterwards**: `pnpm` rewrites the lockfile and installs the package for real while you are doing this
- [x] Add `"use client";` to the top of `src/features/legal/privacy-notice.tsx` → `client-boundary.test.ts` fails → AC-1, AC-19

## UI / manual: the pages themselves

- [x] **local** Visit `/privacy` → the notice renders with one `h1`, headings in order, and no console error → AC-1, AC-20
- [x] **local** Visit `/terms` → same → AC-1, AC-20
- [x] **local** On both pages, open the network tab and reload → no JavaScript chunk is fetched for the page's own content, and disabling JavaScript entirely leaves both fully readable → AC-1
- [x] **local** Tab through `/privacy` from the top → every link takes focus in reading order and shows a visible ring, including the `mailto:` link at the end → AC-20
- [x] **local** Narrow the window to 320 pixels wide → neither page scrolls horizontally and no bullet list overflows → AC-20
- [x] **local** View source on `/privacy` → `<meta name="robots">` allows indexing, and the page title is `Privacy notice · JobHunt` → AC-17, AC-20
- [x] **local** View source on `/` → robots is still `noindex`, so the exception did not widen beyond the two legal pages → AC-17
- [x] **local** Click Terms and then Privacy in the entry page footer → both load → AC-18
- [x] **local** Visit `/sign-in` signed out → the acceptance line sits below both provider buttons, and both of its links work → AC-19

## UI / manual: the claims a reader came for

Each of these is a claim somebody could check and find wrong, which is the failure this feature exists to avoid.

- [x] **local** Read the stored field list on `/privacy` against `supabase/migrations/20260825162457_data_model.sql` → every column in a personal data table appears, described in plain words → AC-2
- [x] **local** Confirm `created_at` and `updated_at` are named for every table that has them, rather than skipped as plumbing → AC-2
- [x] **local** Read the recipient list → Supabase, Vercel, Sentry, Google and GitHub, each with what it receives and why. No sixth company, and nothing named that `recipients.ts` does not hold → AC-3, AC-6
- [x] **local** Confirm the notice says Sentry receives no personal data, then read `src/sentry.server.config.ts` and `src/instrumentation-client.ts` and confirm `userInfo: false`, `httpBodies: []`, `cookies: false` in both → AC-4
- [x] **local** Confirm the retention section says there is no fixed period and that dormant accounts are not deleted automatically → AC-7
- [x] **local** Confirm deletion is phrased as a request to an address, never as a control the reader can operate, since self serve deletion is feature 27 and does not exist → AC-8, AC-10
- [x] **local** Confirm the notice names JobHunt, Ghaly Nicolas Jules, and the United States → AC-11
- [x] **local** Confirm each lawful basis is named WITH its purpose (contract necessity for identity, profile and application data; legitimate interest for error monitoring), and that all six rights are listed with how to exercise each → AC-12
- [x] **local** Confirm the Google section says what is received, what it is used for, where it is stored and that it is shared with nobody; and that the four negatives are stated plainly. Confirm the words "Limited Use" appear nowhere, which is deliberate → AC-13
- [x] **local** Confirm the cookie section names the session cookie as strictly necessary and states there is no analytics and no tracking → AC-14
- [x] **local** Read the terms and confirm all four settled clauses are present and complete: the three acceptable use rules, the five licence limits (non exclusive, limited to operating the service, ends on deletion, not sublicensable, not for training), as is with no warranty and no cap figure, and change by update in place with no advance notice → AC-15
- [x] **local** Confirm the governing law clause writes "State of Georgia, United States of America" in full, not the bare word → AC-15
- [x] **local** Confirm both pages carry the effective date and say the published version is the one that applies → AC-16

## Value sourcing: one step per row of the spec's table

The design time gate only checked that each value HAS a named source. These steps exercise the source, which is the only thing that catches a value wired to the wrong one.

**Two steps below are deliberately still unticked after the 2026-09-01 run, and neither is an AC failure.**

The `pnpm db:types` step is written too broadly and needs narrowing. Its `git diff` is NOT empty, but the difference is entirely in the generated `Functions` block, where the applied database has `before_user_created_hook` and `provider_display_name` from feature 7 and the committed file does not. The `Tables` block, which is the only part the field registry and the AC-23 guard read, is byte identical to the applied schema, so **AC-23's guarantee holds**. The staleness is a real but separate issue belonging to feature 7. Narrow this step to diff the `Tables` block alone, and regenerate the committed types under feature 7.

The Google sign in step needs a throwaway Google account, which this check did not create. The identity field list is sourced from spec 0007 and was corroborated from the live consent screen, whose OAuth request carries `scope=email profile` and nothing more, which is exactly the three fields the notice names.

- [ ] Run `pnpm db:reset` then `pnpm db:types`, and confirm `git diff src/lib/supabase/database.types.ts` is empty → the field list is bound to the APPLIED schema, not to a stale generated file → AC-2, AC-23
- [ ] Sign in with Google on a fresh account, then read `auth.users` for that row → the email address, display name and avatar URL are there and are the three the notice names, with nothing else populated → AC-2
- [x] Confirm each of the five recipient entries on the page came from `recipients.ts` by changing one `receives` string and reloading → the page text changes, proving the prose is rendered and not restated → AC-3, AC-6
- [x] Confirm the Sentry claim's source is the running configuration, not the file: read the deployed environment's Sentry settings rather than only the committed config → AC-4. **Verified a stronger way on 2026-09-01**: the two Sentry configs reference only `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `NEXT_PUBLIC_VERCEL_ENV` and `NODE_ENV`, so no environment variable can reach `userInfo`, `httpBodies` or `cookies`. Those three are hardcoded in committed source, which makes the running configuration the deployed commit, and the guard test covers it. The only `sendDefaultPii` mentions in `src/` are inside that guard test
- [x] Confirm the retention words on the page match nothing in the code, because retention is a decision with no mechanism behind it, and that no scheduled job deletes anything → AC-7
- [x] **engineer** Send a real message to `contact@usejobhunt.dev` from an address outside the domain, and confirm it arrives in a mailbox that is read. Do this at verify time rather than trusting the 2026-09-01 setup date: an address that stops delivering does so silently, which invariant 4 names as the failure → AC-9. **Done by the engineer on 2026-09-01 and confirmed by them.** Not independently observed here, because reading the mailbox is not something this check should do; the delivery path was corroborated instead, by DNS: Zoho MX at priorities 10, 20 and 50, plus `v=spf1 include:zohomail.com ~all`
- [x] Delete a test account's `auth.users` row directly and confirm every row in `profile`, `profile_skill`, `work_experience`, `job_preference`, `application` and `application_answer` for that person is gone → the notice's cascade claim is true in the direction it is written → AC-10
- [x] Confirm the responsible party, country, contact address and effective date all come from `publication.ts` by changing one and seeing both pages move together → AC-8, AC-11, AC-16
- [x] Confirm the rights list and the lawful basis are the ones the spec settled, since both are decided rather than derived → AC-12
- [x] Read Vercel's own Privacy Notice and confirm it still says IP address and IP derived location data, and still does not confirm user agent, which the page deliberately does not claim → AC-3
- [x] Confirm the session cookie the notice describes is the one `src/proxy.ts` refreshes, and that no other cookie is set on a signed out visit to `/privacy` → AC-14
- [x] Change `EFFECTIVE_DATE` in `publication.ts` and reload both pages → both dates move, and they read the same in a non UTC time zone, because the date is a published fact and not a moment in the reader's day → AC-16

## Deployment and the Google console

**These are the only steps standing between this feature and `done`.** Everything above is proved.

- [x] **deployed** Confirm `https://usejobhunt.dev/privacy` and `https://usejobhunt.dev/terms` both load over HTTPS on the apex domain, not a `vercel.app` address → AC-21
- [x] **deployed** Run `curl -sI https://usejobhunt.dev/privacy | grep -i x-robots-tag` and confirm it returns NOTHING → AC-17, AC-21. **This is the step that catches a silent failure, and it was found while checking the preview for pull request 67.** Vercel puts `x-robots-tag: noindex` on preview deployments, and an HTTP header beats the `<meta name="robots">` tag the page sets. If production ever carried that header, both pages would look perfect in view source while Google refused the policy URL, and the failure would read as a console problem rather than a header one. Run the same check on `/terms`
- [x] **deployed, engineer** In the Google Cloud console, add `usejobhunt.dev` as an authorized domain → AC-21
- [x] **deployed, engineer** Put both live URLs in the consent screen's privacy policy and terms of service fields → AC-21
- [x] **deployed, engineer** Move the app out of Testing and publish it → the 100 user cap is lifted. Confirm the cap is gone rather than assuming the button worked, because Google counts that cap over the app's whole lifetime and it never resets → AC-21
- [x] **deployed, engineer** Submit brand verification → AC-22
- [x] **deployed, engineer** After verification completes, run a real sign in and confirm the consent screen names JobHunt rather than the Supabase host → AC-22. This closes the finding spec 0007 recorded on 2026-08-30

## Acceptance-criteria coverage

- AC-1 covered by the build route table, the page render steps and the client boundary guard
- AC-2 covered by the field list read against the migration, the timestamp step and the `db:types` step
- AC-3 covered by the recipient list read, the registry render step and the Vercel notice re read
- AC-4 covered by the Sentry claim step, the guard break step and the running configuration step
- AC-5 covered by the `ADZUNA_APP_KEY` break step
- AC-6 covered by the recipient list read and the registry render step
- AC-7 covered by the retention read and the no mechanism step
- AC-8 covered by the deletion phrasing step and the `publication.ts` source step
- AC-9 covered by the real message to the published address · **engineer, not yet done**
- AC-10 covered by the deletion phrasing step and the real cascade deletion step
- AC-11 covered by the responsible party read and the `publication.ts` source step
- AC-12 covered by the lawful basis and rights reads
- AC-13 covered by the Google section read, the four negatives and the Limited Use absence check
- AC-14 covered by the cookie read, the analytics break step and the cookie source step
- AC-15 covered by the four settled clauses read and the governing law step
- AC-16 covered by the effective date reads and the `EFFECTIVE_DATE` source step
- AC-17 covered by the two view source steps, one on a legal page and one on `/`, plus the deployed `x-robots-tag` header check, because the header beats the meta tag
- AC-18 covered by the footer link step
- AC-19 covered by the sign in page step and the client boundary guard
- AC-20 covered by the outline, keyboard, 320 pixel and metadata steps
- AC-21 covered by the three console steps · **engineer, not yet done**
- AC-22 covered by the brand verification steps · **engineer, not yet done**
- AC-23 covered by the two `stored-fields.test.ts` break steps and the `db:types` step
