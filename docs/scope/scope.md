# Scope: JobHunt

A multi user job search web app: enter a profile, search real listings, see them ranked with the reasoning shown, click through to apply, and record that you applied. Free, no billing, built for the author's own job search plus a few friends and recruiters evaluating it as a portfolio piece.

**Build approach:** Tracer Bullet (prove the whole pipe works end to end, narrow but real, before building any single part of it fully).
**Workflow:** Beta (after `/develop`: `/check verify`, then `/test`). Four features carry a `· GA` tag and also get a fresh model `/check review` plus `/document`.

_You are in charge. Every box below is a **suggestion**, not a gate: run any, skip any, and mark a feature `done` when you decide it is. The workflow records what you actually did (including "skipped"), it never requires a step. The one thing it asks is that a load bearing decision be written down (a spec), not that any check be run._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Deployment & environments | Foundation | done |
| 4 | Data model | Foundation | done |
| 5 | Design system & UI foundation | Foundation | done |
| 6 | Entry page & link metadata | Foundation | in-progress |
| 7 | Auth & per user isolation | Foundation | planned |
| 8 | Test foundation | Foundation | done |
| 9 | Profile entry | Slice 1 | planned |
| 10 | Usage gating & kill switch | Slice 1 | planned |
| 11 | Job search & results list | Slice 1 | planned |
| 12 | Apply redirect & application record | Slice 1 | planned |
| 13 | Model client router | Slice 2 | planned |
| 14 | Fit scoring with shown reasoning | Slice 2 | planned |
| 15 | Eval ground truth set | Slice 2 | planned |
| 16 | Eval harness runner | Slice 2 | planned |
| 17 | Cross vendor self check | Slice 2 | planned |
| 18 | Structured search filters | Slice 3 | planned |
| 19 | Listing data quality | Slice 3 | planned |
| 20 | Guided application capture | Slice 4 | planned |
| 21 | Terms & privacy notices | Slice 5 | planned |
| 22 | Discard with reason | v1.5 | planned |
| 23 | Applications dashboard | v1.5 | planned |
| 24 | Master resume | v1.5 | planned |
| 25 | Resume tailoring per job | v1.5 | planned |
| 26 | Profile depth & completeness | v1.5 | planned |
| 27 | Auth remainder | v1.5 | planned |
| 28 | Spend visibility & gating polish | v1.5 | planned |
| 29 | Product analytics | v1.5 | planned |
| 30 | Company research, lite | v1.5 | planned |
| 31 | Seeded demo account | v1.5 | planned |

## Foundation

### 1. Stack & architecture · done
Record the stack already chosen (backend and auth platform, framework, styling) as a real architecture spec, then scaffold a project that boots, and close what the brief left open: exact OAuth providers, directory layout, language strictness, and where the model tier configuration lives.
**Done when:** the architecture decision is written down with what was rejected and why, and an empty scaffold boots locally and passes a clean build and a protected page reads one row from Supabase through the real server client and renders it, proving the framework, client, session, policy and error path all connect. The deployed leg of that same thread belongs to feature 3, which cannot be proved before a real URL exists.
_spec [0001](../specs/0001-stack-and-architecture/index.md) · code in `src/`, `supabase/`_
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Verify it: `/check verify stack & architecture`
- [x] Test it: `/test stack & architecture` · done 2026-08-27, once feature 8 made it possible. Nine tests lock the two rules that outlived the manual steps: binding rule 6 in [src/proxy.test.ts](../../src/proxy.test.ts) (five unit tests, no stack needed, so the rule is checked on every `pnpm test`) and DW-4 in [test/integration/protected-route.test.ts](../../test/integration/protected-route.test.ts) (four against the real local stack with real minted sessions). Both were checked for vacuousness rather than trusted: making the proxy redirect fails it in both directions (anonymous and signed in), and removing the layout's guard fails both DW-4 tests. **The rest of [verify.md](../specs/0001-stack-and-architecture/verify.md) expired rather than went untested**, and that is the reason it is not locked here: DW-3's steps drove the `scaffold_check` table feature 4 dropped, and DW-1 plus the wrong password step drive scaffolding features 6 and 7 delete, so pinning them would freeze code the plan removes. DW-2 is CI's job, and DW-5 was already locked by feature 8's isolation test.

### 2. Coding standards & tooling · done
Capture the conventions and tooling from the real scaffolded project, then install them, so every line written after this follows one standard rather than drifting per feature.
**Done when:** root `AGENTS.md` reflects the real stack, and lint, format, type checking and a pre commit hook all run clean on the scaffold.
_tooling recorded in root [AGENTS.md](../../AGENTS.md) `## Tooling` · code in `eslint.config.mjs`, `.prettierrc.json`, `.prettierignore`, `.lintstagedrc.json`, `.husky/pre-commit`, `.github/workflows/ci.yml`_
- [x] Capture conventions + tooling choices: `/audit`
- [x] Build it: `/develop tooling`
  - [x] ESLint flat config: Next core web vitals plus TypeScript, `jsx-a11y` strict raised to errors (binding rule 8)
  - [x] The `src/lib/supabase/secret.ts` import block from `src/app/**` (binding rule 1), proven to fire on relative and type only imports
  - [x] Prettier plus `eslint-config-prettier`, with a repo wide format check
  - [x] Pre commit hook: husky plus lint-staged on staged files, then a project wide type check
  - [x] CI: GitHub Actions on push and pull request running lint, format check, type check and build; no test job until feature 8
- [ ] Verify it: `/check verify coding standards & tooling` · **skipped**, called done after the build. The build self checked every Done when clause and proved both binding rules fire; the durable steps are in [verify.md](../specs/0001-stack-and-architecture/verify.md) under the feature 2 heading.

### 3. Deployment & environments · done
Get the bare scaffold live on a real URL before auth exists, so hosting, environment variables, and the preview versus production split are solved while the app is tiny instead of at the end. The portfolio URL exists from week one, and later OAuth callback work has a known production origin to point at.
**Done when:** a push deploys, the live URL serves the scaffold, secrets are set per environment and never committed, the global kill switch flag is readable from the deployed app, and the feature 1 thread is re run against the live URL so the deployed leg is proved rather than assumed (feature 1 proved every other leg locally).
_spec [0002](../specs/0002-deployment-and-environments/index.md) · code in `src/env.ts`, `src/lib/origin.ts`, `src/lib/kill-switch.ts`, `supabase/migrations/`, `.github/workflows/db-migrate.yml`_
- [x] Design it (spec): `/architect deployment & environments`
- [x] Build it: `/develop deployment & environments`
  - [x] The live thread: two Supabase projects, the validated environment variables, the Vercel project, preview protection (AC-1 to AC-4) · code done (`src/env.ts`, proved to fail a deployed build by name with a DSN missing); all four dashboard confirmations proved directly (`vercel env ls`/`pull`/`inspect`, both Supabase projects' region and Data API setting)
  - [x] Schema delivery: prove the seed's write path by hand against the real project, then the migration workflow for both projects (AC-11) · workflow written, seed made idempotent, and the hand proof (P-1) passed twice against the hosted development project; both the pull request and the merge to `main` runs confirmed green, and a deliberately failing migration proved the workflow fails visibly rather than reporting success
  - [x] The deployed leg proved: both dev sign in guards moved off `NODE_ENV`, the origin resolver, the feature 1 thread re run on a real preview URL as two users (AC-5, AC-10) · both guards and the resolver done, the feature 1 thread ran on preview `f637586` as both dev users each seeing only their own row, and AC-10 closed on production's hard 404 plus the guard proved on a production shaped build; a literal POST of the deployed action itself needs a real sign in page to source a valid action id from, so that one exercise is deferred to feature 7
  - [x] The kill switch: the single row table with no policies, the read module behind the secret key client, its value rendered live and flipped with no deploy (AC-6 to AC-9) · hosted read and the dashboard flip with no deploy both proved on preview `f637586`; the deliberately broken read (AC-8) proved on a production shaped build run twice locally, once with the real secret key and once with a deliberately wrong one, rendering a visible failure rather than a false "stopped"; production's own `app_settings` row confirmed directly in its SQL editor
  - [x] Guardrails: Sentry per environment with split sampling, quota and pause notifications, the uptime monitor, branch protection, the binding rule 1 correction, the rollback procedure (AC-12 to AC-18) · Sentry wiring (including the missing `SENTRY_AUTH_TOKEN` fix), spend notifications, the UptimeRobot real check result, branch protection with both repository changing checks proved and the migration check added, and the AC-18 recovery drill (a real break, promote, and confirmed recovery on `usejobhunt.vercel.app`, under a minute end to end) are all done. **Still open, left for whoever next touches this area**: Supabase's pause warning emails for both projects have not been confirmed to reach a read address (`verify.md` line 162), and a handful of Value sourcing checks that need a caller that does not exist until feature 7 or feature 10 (the Sentry environment tag and release on a real event, the failed read default, and the development DB URL secret's failure mode)
- [x] Verify it: `/check verify deployment & environments` · run across three sessions (2026-08-21 through 2026-08-23), see [verify.md](../specs/0002-deployment-and-environments/verify.md) for the full, evidenced checklist and its acceptance criteria coverage
- [x] Test it: `/test deployment & environments` · done 2026-08-27, once feature 8 removed the reason it was skipped. Twenty two tests over the code half: [src/lib/kill-switch.test.ts](../../src/lib/kill-switch.test.ts) (fail closed, invariant 3, every failure kind), [src/lib/origin.test.ts](../../src/lib/origin.test.ts) (the four branches plus the preview that throws rather than guessing), [src/env.test.ts](../../src/env.test.ts) (AC-13 both ways, AC-14, the contract failing by name, the CI escape hatch) and [test/integration/kill-switch.test.ts](../../test/integration/kill-switch.test.ts) (AC-8 and AC-9 against the real stack). Three claims were checked for vacuousness rather than trusted: inverting the fail closed line fails four tests across both projects, and disabling the AC-13 requirement fails its test. **This box covers the code and nothing else, deliberately.** Most of this feature is configuration, so AC-1 to AC-6, AC-10 to AC-12 and AC-15 to AC-18 stay manual in [verify.md](../specs/0002-deployment-and-environments/verify.md) permanently, and no suite can ever lock them. **AC-7 (a dashboard flip read live, with no deploy) is the one automatable looking criterion still not covered**: the migration grants `service_role` `select` only, so the application's own client cannot write the row, and flipping it would need a privileged database connection the test layer does not have.

### 4. Data model · done · GA
The core entities every later feature reads and writes: users, profile with skills and flat work history, stated job preferences, application records and their captured answers. Search results deliberately do not persist. A wrong data model is the most expensive thing to redo, so it is decided once, explicitly, before any feature depends on it.
**Done when:** the schema, keys, constraints and per user row level policies are applied and live, a query as one user cannot return another user's rows, and every value is stored raw with formatting left to render time.
_spec [0003](../specs/0003-data-model/index.md) · code in `supabase/migrations/`, `supabase/seed.sql`, `src/features/profile/`, `src/lib/supabase/database.types.ts`_
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model` · landed in two pull requests, [#9](https://github.com/ghalynho10/JobHunt/pull/9) the create and [#10](https://github.com/ghalynho10/JobHunt/pull/10) the drop, both merged 2026-08-25. All sixteen acceptance criteria proved
  - [x] The schema migration: the shared timestamp trigger, six tables with their checks and unique constraints, an explicit grant per table, and the twenty three policies (AC-1, AC-2, AC-4, AC-5, AC-6, AC-9 to AC-12)
  - [x] Fixtures and types: the seed grows a profile for each of the two synthetic users plus a third carrying none, then `database.types.ts` is regenerated from the applied schema (AC-3, AC-14, AC-15)
  - [x] The replacement read: `readOwnProfile()` with its named span and Zod parse, the span registered, the health page repointed off `scaffold_check` (AC-14, AC-15)
  - [x] Proved against the real project: isolation both ways, the `with check` refusals, every constraint, the privilege check, and the preview confirmed as all three seeded users (AC-2 to AC-11, AC-14) · done 2026-08-25 on pull request [#9](https://github.com/ghalynho10/JobHunt/pull/9). The sweep in [verify.sql](../specs/0003-data-model/verify.sql) ran against the hosted development project with zero failures, and all three seeded users were driven through the preview page: dev-one and dev-two each saw only their own profile, dev-three saw the named `record_not_found` failure rather than an empty page
  - [x] Expand then contract: merge, confirm production is serving the new read, and only then drop `scaffold_check` in a second pull request (AC-13, AC-16) · pull request [#9](https://github.com/ghalynho10/JobHunt/pull/9) merged 2026-08-25, its production migration run succeeded and the production deployment built from that merge went live on `usejobhunt.vercel.app`. [verify-production.sql](../specs/0003-data-model/verify-production.sql) confirmed the six tables, forced row level security, the twenty three policies and the privilege gate on the production database. Only then was the drop written, in a second pull request. Pull request [#10](https://github.com/ghalynho10/JobHunt/pull/10) then dropped it, merged 2026-08-25 as `3a56243`, its own production migration run succeeded, and `scaffold_check` now reads `gone` on local, development and production alike. AC-13 closed
- [x] Verify it: `/check verify data model` · all sixteen acceptance criteria proved fresh on 2026-08-25: local (`verify.sql`, 83/83 pass), the browser driven sign in states, and production (`verify-production.sql`, run directly by the engineer, all lines pass, `scaffold_check` confirmed gone)
- [x] Test it: `/test data model` · done 2026-08-27. Five tests in [test/integration/profile-read.test.ts](../../test/integration/profile-read.test.ts) against the real local stack, covering the code half of **AC-14** (the row the caller wrote, `record_not_found` for a signed in user with no profile, `session_missing` for no session at all, and one user seeing nothing of another's) and **AC-15**. Two claims were checked for vacuousness rather than trusted: swapping the Zod parse for a type assertion fails the AC-15 test with `expected null to be undefined`, and misnaming the missing profile failure fails the AC-14 test. **The schema half was deliberately not ported**, by decision this run: AC-1 to AC-13 and AC-16 are proved by [verify.sql](../specs/0003-data-model/verify.sql) at 83 of 83 and by [verify-production.sql](../specs/0003-data-model/verify-production.sql), and rewriting 83 SQL checks in TypeScript would duplicate a better proof in a worse language. The aimed slice the fresh model review then asked for IS covered, in [test/integration/data-model-constraints.test.ts](../../test/integration/data-model-constraints.test.ts): four tests on a SECOND table besides `profile`, proving AC-4's `with check` trap in both directions (an update onto another user's row changes zero rows and does not raise, while moving a row under another profile is refused with 42501) and AC-7 in both directions (a duplicate is refused with 23505, and a different user may still apply to the same listing, which is what the constraint leading with `profile_id` buys). The remaining checks stay a manual `verify.sql` run rather than a CI gate, worth revisiting when feature 9 and feature 12 build the write paths that hit them through real code.
- [x] Review it (fresh model): `/check review data model` · run 2026-08-27 on Sonnet 5 (author was Opus), over the implementation as merged at `3a56243`, 13 files. Verdict **Changes requested**: no blockers, one major, one minor, two nits. Findings in [2026-08-27-feat-data-model.md](../reviews/2026-08-27-feat-data-model.md). The major is that five of the six tables' constraints have no automated regression test, which the reviewer raised knowing it was a recorded decision; it proposes a two test slice rather than the full port, and **that slice was acted on the same day**, see the `Test it` line above. The minor (the missing doc comment on the `Profile` type export) was fixed the same day, a comment only change to [queries.ts](../../src/features/profile/queries.ts). Every finding from the review is now closed. The minor is the missing doc comment on the `Profile` type export. Both nits are cosmetic and already resolved by later commits.
- [ ] Document it: `/document data model` · **left unticked because the normal route is closed, not because the work was skipped.** Every other box on this feature is closed. `/document pr` writes a pull request description from a branch's commits and diff, and feature 4's implementation did not merge from a branch this workflow ever ran it against: the schema, the 23 policies and `readOwnProfile()` landed in pull request [#9](https://github.com/ghalynho10/JobHunt/pull/9) (the create) and pull request [#10](https://github.com/ghalynho10/JobHunt/pull/10) (the drop of `scaffold_check`), both merged 2026-08-25 and both now closed, so there is no open pull request left to write that description against. The pull request opened from `test/data-model` on 2026-08-27 is **not a substitute**: it documents this feature's tests and its fresh model review, and says nothing about the schema or the row level policies, which is the part a reader of feature 4 would actually need. What would close it, if it is ever worth doing retroactively: `/document changelog` or `/document release-note`, neither of which needs an open pull request, run over the merged range `9f55797..3a56243`. Recorded rather than ticked so a later reader can tell a route that was never available from a step that was ducked.

### 5. Design system & UI foundation · done
Port the locked visual decisions (seven token palette, finalized logo, Space Grotesk and JetBrains Mono typography) into a real token layer and a set of base components. These are inherited decisions, not open questions. Sets the responsive posture and the accessibility floor for every screen built after this.
**Done when:** the tokens, type scale and base components exist as code; every base component is keyboard reachable with a visible focus state and a proper label; and the components hold up from phone width to desktop.
_spec [0005](../specs/0005-design-system-and-ui-foundation/index.md) · code in `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/`, `eslint.config.mjs`_
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Token layer: the seven token palette plus the new `--surface-sunken` token, font loading, the type scale, and the native accessibility CSS (`:focus-visible`, `forced-colors`, `prefers-contrast`, `prefers-reduced-motion`), satisfies AC-1, AC-2, AC-12
  - [x] Tooling and primitives: `tailwind-variants` plus the narrow lint rule, the icon set, `Text`/`Heading`, `Button`, satisfies AC-6, AC-11, AC-15
  - [x] `Card` (elevated/flat, the compound slots, the attribution slot), `Chip`, `MatchBar`, satisfies AC-3, AC-7, AC-9, AC-10
  - [x] `Section` (rhythm, background alternation, divider) and the 60/40 grid utility, satisfies AC-4, AC-5, AC-8
  - [x] Keyboard, focus, and responsive verification pass across every component, satisfies AC-13, AC-14 · run 2026-08-27 in a real browser at 1440px and 320px: all 8 controls keyboard reachable with a 2px teal `:focus-visible` ring and a real name, zero horizontal overflow at 320px, `prefers-contrast: more` / `forced-colors: active` / `prefers-reduced-motion` each confirmed by measured computed style
- [x] Verify it: `/check verify design system & UI foundation` · PASS on 2026-08-27, all 15 acceptance criteria met against the running app at `/ui-preview`. Measured, not eyeballed: the full type scale, both card idioms, both match bar proportions, the 3fr/2fr grid, the three rhythm tiers, the divider adjacency rule across four sections, 8 of 8 controls keyboard reachable with an instant teal ring, zero overflow at 320px with the attribution at exactly 116 by 23, and `prefers-contrast` / `forced-colors` / `prefers-reduced-motion` each confirmed by computed style. One step in `verify.md` was found to be a bad check and is flagged there for replacement; the fact it was meant to prove holds under a corrected canary. Same model wrote the code and ran this, so a fresh model `/check review` is still worth doing.
- [x] Test it: `/test design system & UI foundation` · done 2026-08-28. 113 unit tests across eight files beside the components, all passing. Written in the `node` project with no jsdom and no testing library: every base component here is a stateless server component, so calling it IS its behaviour and the element it returns is its whole output, which keeps spec 0004's just in time install rule intact. The load bearing one is [tv.test.ts](../../src/components/ui/tv.test.ts): it reads the type scale out of `globals.css` and checks the merger keeps each size beside a colour, so a seventh size added to the scale and forgotten in `tv.ts` fails on its own. Three claims were checked for vacuousness rather than trusted: adding `--text-huge` to the scale fails the drift guard, flipping the block to `@theme inline` fails the inline guard, and the stock `tv` straight from the package is asserted to DROP the size, which is the bug the config exists to prevent. What is deliberately not here: anything needing a browser (computed sizes, focus rings, media queries, layout, overflow) stays in [verify.md](../specs/0005-design-system-and-ui-foundation/verify.md), proved by `/check verify`, rather than being faked in jsdom.

### 6. Entry page & link metadata · in-progress
Port the already built and reviewed landing page onto the design token layer. It is the front door for three audiences: the author, a few friends, and recruiters opening a link. Not a public marketing page, but a pasted link has to render as a real product.
**Done when:** the page renders on the real tokens at phone and desktop width; the sign in band is reachable from the header and says plainly that accounts are not open yet, rather than offering a control that leads nowhere (feature 7 turns those into real sign in, and spec 0006 AC-7 holds this on every environment, not just production); page title, description and a social preview image are set; and crawlers are told not to index.
_spec [0006](../specs/0006-entry-page-and-link-metadata/index.md)_
- [x] Design it (spec): `/architect entry page & link metadata` · written 2026-08-28, 17 acceptance criteria. It carries spec 0005's already deliberated composition decisions forward rather than re deciding them, settles the four that spec left open (the match bar count, the over signalled sign in band, what the sign in controls do before feature 7, and where the social preview image comes from), and corrects three untruths found in the prototype while tracing value sources. A cross check on a different model found seven unnamed values, one mis-carried decision and three soundness problems; all were verified against the files and folded in
- [ ] Build it: `/develop entry page & link metadata`
  - [ ] The thin thread: the `Logo` base component, the committed Space Grotesk file and its licence, the generated `opengraph-image.tsx`, page title and description off `canonicalSiteUrl`, a header and footer shell, then a real preview deployment whose link card is confirmed to unfurl, plus the token drift guard, satisfies AC-1, AC-10, AC-11, AC-12, AC-13, AC-15, AC-16
  - [ ] The hero: a `<figure>` wrapping the one elevated `Card`, the example label, `MatchBar` at 8 of 11, the chip clusters, and every dead control rendered inert rather than linked, satisfies AC-5, AC-7, AC-9, AC-17
  - [ ] The argument sections: how it works at `compact` on `sunken` with the hand copied bar collapsed onto the component, and the reasoning at `generous` on `sunken` with both comparison cards flat and identical, carrying the page's single hairline, satisfies AC-1, AC-2, AC-3, AC-5
  - [ ] About and the sign in band: the status card rewritten so nothing claims to work that does not, and the band stripped of its centred and narrow axes while keeping dark, satisfies AC-5, AC-6, AC-8
  - [ ] Compose and pass: replace the scaffold placeholder, then run the keyboard, focus, responsive and reduced motion pass at 320 and 1440 pixels and prove no client JavaScript ships, satisfies AC-1, AC-2, AC-4, AC-14
- [ ] Verify it: `/check verify entry page & link metadata`
- [ ] Test it: `/test entry page & link metadata`

### 7. Auth & per user isolation · needs a decision · GA
OAuth sign in only (Google and GitHub), plus real per user data isolation enforced at the database rather than in application code. OAuth is kept over email and password for v1 because a linked real account is harder to fake for abuse than a burner address, and it removes the need for any transactional email in v1.
**Done when:** a user can sign in and out with either provider on the deployed URL, an authenticated request only ever reaches its own rows, an unauthenticated request to a protected route fails visibly rather than returning empty data that looks like success, and the development only password sign in from feature 1 is deleted, not merely blocked.
- [ ] Design it (spec): `/architect auth & per user isolation`

### 8. Test foundation · done
The fixtures every later test depends on, built once rather than improvised per feature: a development only path that mints a real session without driving a browser, a fixed pool of obviously fake users for proving isolation, and a way to record and replay real responses from external services. This exists because the reference project's worst bug survived six passing tests that all mocked the same wrong assumption.
**Done when:** a test can sign in as user A, write data, switch to user B and prove B cannot see it; an external service can be exercised against a real recorded response rather than a hand written mock; the session path is hard blocked outside development; no fixture contains a real personal identifier; and no recorded fixture carries a credential.
_spec [0004](../specs/0004-test-foundation/index.md) · code in `vitest.config.mts`, `test/`, `src/lib/supabase/server.ts`, `supabase/seed.sql`, `.github/workflows/ci.yml`_
- [x] Design it (spec): `/architect test foundation` · accepted 2026-08-26, after a fresh model review whose findings were folded back into the spec
- [x] Build it: `/develop test foundation` · built 2026-08-26 on branch `feat/test-foundation`; all 13 acceptance criteria covered by 30 unit and 9 integration tests, green against the real local stack (count as of 2026-08-27; it moves with the suite)
  - [x] Vitest scaffolded as two projects (unit, and integration on `node`), the `server-only` alias, `.env.test`, the in memory Sentry transport, and `pnpm test` (AC-5, AC-10)
  - [x] The fixture pool re-minted with valid version 4 UUIDs, the old rows deleted before the new ones are inserted, and the profile parser tightened from `z.guid()` to `z.uuid()` (AC-4, AC-6) · the delete then insert ordering was proved by staging the old pool locally and replaying the seed with `ON_ERROR_STOP=1`, the way db-migrate runs it. Then proved for real: the `Database migrations` workflow applied this seed to the hosted development project on pull request [#18](https://github.com/ghalynho10/JobHunt/pull/18) and passed, so the re-mint landed against the shared project that still held the old pool and was never wiped
  - [x] The session thread: an optional cookie adapter on `createClient()`, the development only mint behind `DEV_SESSION_ENABLED`, and the isolation test proving it against the real local stack (AC-1, AC-3) · the isolation test was checked for vacuousness by disabling row level security on `public.profile`, which failed all four of its assertions, then restored
  - [x] Record and replay with redaction at write time, plus the on demand fixture user mint (AC-2, AC-8, AC-9, AC-11, AC-13) · the GitHub stand in was recorded once from the live API and survives the pre commit hook byte for byte; redaction is proved through a real capture rather than by calling the redactor directly
  - [x] The command split and the CI job running the stack in Docker (AC-7, AC-12) · CI runs the unit suite before the stack starts, so a unit test that grows a database dependency fails there rather than passing on a warm stack. Green on pull request [#18](https://github.com/ghalynho10/JobHunt/pull/18): the `Test (unit, then integration)` job started the stack in Docker and ran both suites in 1m50s. AC-7 was the one criterion that could not be proved locally
- [x] Verify it: `/check verify test foundation` · PASS on 2026-08-27, all 13 acceptance criteria met, see [verify.md](../specs/0004-test-foundation/verify.md) for the evidenced checklist. The first run found AC-8 failing (the record mode warning was emitted and then swallowed by Vitest's console interception, so it never reached a human); fixed by writing it to `process.stderr`, and a regression test now fails if it moves back to `console.warn`. Both proofs were checked for vacuousness: disabling row level security fails five tests, and deleting the committed recording fails four with a message naming the file and the record command
- [ ] Test it: `/test test foundation` · **skipped** 2026-08-27, by decision, not by omission. This feature IS the test layer: it ships 34 tests (25 unit, 9 integration), and `/test` here would mostly mean writing tests for test helpers. What would normally justify the box is already covered another way: the two claims that matter are checked for vacuousness rather than trusted (disabling row level security fails five tests, deleting the committed recording fails four), and the one bug this feature's own verify run found, the record mode warning being swallowed, now has a regression test that fails if it returns to `console.warn`. The durable steps a later `/test` would lock are in [verify.md](../specs/0004-test-foundation/verify.md), all 18 ticked.

## Slice 1: Core loop thread

The thinnest real thread through the whole product, touching every layer and actually working. Real auth, real database, real external search, real UI. Narrow, not faked: results are not ranked yet and filters are minimal, but nothing here is a placeholder to be thrown away.

### 9. Profile entry · needs a decision
A form for the flat profile: personal details, skills, one layer of work history, and stated job preferences. Typed by hand, with no resume upload and no extraction, so it makes no external call at all. Scoring cannot function without this, and the completion test does not start without a way to get profile data in.
**Done when:** a signed in user can create and edit their profile, it survives a reload, validation errors are shown rather than swallowed, the saved shape is exactly what scoring will later read, and the profile form's Server Action is driven once from a test with no browser. That last clause is spec 0001's third runner constraint, deferred to here by spec 0004 because there was no real write path to drive at feature 8; the technique is recorded in that spec's follow up list. Also, this feature moves its own claim (`profile`) from planned to working in the entry page's "What's real today" card (spec 0006, **AC-8**).
- [ ] Design it (spec): `/architect profile entry`

### 10. Usage gating & kill switch · needs a decision · GA
Per account caps on the call types the app actually makes, checked atomically so a burst cannot slip past, failing closed by default, plus a single global kill switch operated from outside the app. Built before the first external call rather than after it. This is here under the named risk rule: the risk is uncontrolled external API cost during unemployment, and it is only removed by deciding that risk is acceptable, never by trimming for time.
**Done when:** the jobs search call type is capped per account and the check is atomic under concurrent calls proven against a real database connection, not a mock; a blocked call tells the user plainly why; flipping the external kill switch stops all gated calls without a deploy; the atomic gate function increments an attempt counter alongside its decision; trace sampling is 1.0 on gated operations; the expected-failure rate alert rule is defined in docs/observability/ and applied; and a forced-failure smoke test proves the alert actually fires.
- [ ] Design it (spec): `/architect usage gating & kill switch`

### 11. Job search & results list · needs a decision
Search real listings by title and location and render them. Deliberately narrow for this slice: the structured filters and the data quality fixes come in Slice 3, and ranking comes in Slice 2. Results are fresh per search and never persist, which is what removes the need for any staleness or expiry state machine.
**Done when:** a signed in user runs a search and sees real listings; the search call goes through the gate from feature 10; a failed or empty search renders a visible state rather than a silent blank; and every screen showing listings carries the required attribution label at no less than 116 by 23 pixels with both the word and the logo linked as the source's terms require. Also, this feature moves its own claim (`filtered search`) from planned to working in the entry page's "What's real today" card (spec 0006, **AC-8**).
- [ ] Design it (spec): `/architect job search & results list`

### 12. Apply redirect & application record
Click a result through to the real posting on the source site, and record that you applied. No auto fill and nothing submitted on the user's behalf. Minimal here: the guided capture questions arrive in Slice 4. This closes the thread and makes the application record the only place a job persists.
**Done when:** a result links out to the real posting in a new tab, marking it applied writes a record tied to that user, the record survives a reload, and the same job applied to twice does not silently create a duplicate. Also, this feature moves its own claim (`application tracking`) from planned to working in the entry page's "What's real today" card (spec 0006, **AC-8**).
- [ ] Build it: `/develop apply redirect & application record`

## Slice 2: Ranking

The differentiator and the answer to the sharpest finding in the reference audits: a scoring feature that shipped, passed every test, and returned a nearly constant meaningless number. Most of the build time belongs here.

### 13. Model client router · needs a decision
One thin client every AI call routes through: tier in, response out, with model and provider read from configuration and never written into a feature. This is what makes the deliberately cross vendor design swappable later. Built here with its first real caller in hand rather than as an empty foundation, because that is what keeps it a router. Watch this one: it is a named place where scope quietly expands into a framework.
**Done when:** two tiers resolve from configuration to two different vendors, a feature calling it names a tier and never a model, swapping a model is a configuration change with no feature code touched, and a provider failure surfaces as a visible error rather than a default that reads as success.
- [ ] Design it (spec): `/architect model client router`

### 14. Fit scoring with shown reasoning · needs a decision · GA
Score a listing against the profile and stated preferences, and show the work: the skills that matched and the skills that are missing, not just a number. The shown reasoning is both the usability point and a built in sanity check against the constant score failure mode. The spec defines the scoring bands, which is what makes the eval ranges in feature 15 meaningful.
**Done when:** scoring uses an anchored band rubric rather than an open numeric range; results across genuinely different listings spread across bands instead of clustering; every score displays its matched and missing skills; a scoring failure is visible and never writes a record that reports success; and an optional sponsorship signal is scored when the posting states one. Also, this feature moves its own claim (`ranked results with reasoning`) from planned to working in the entry page's "What's real today" card (spec 0006, **AC-8**).
- [ ] Design it (spec): `/architect fit scoring with shown reasoning`

### 15. Eval ground truth set · needs a decision
The authored content the harness needs and does not get for free: several realistic profile archetypes beyond the author's own, matching job postings across a range of fit levels, and a decided expected band for each pair. Real writing work, budgeted as its own line rather than discovered mid build. The bands are fixed from the rubric before any model output is looked at, so the set measures the scorer instead of describing it.
**Done when:** the archetypes cover clearly different career shapes, the pairs span the full band range including deliberate poor fits, every expected band was set before seeing any real output, and the set lives in version control as data rather than inside test code.
- [ ] Design it (spec): `/architect eval ground truth set`

### 16. Eval harness runner
Run every ground truth pair against the current scoring configuration and report which fell outside their expected band. Run it whenever the scoring prompt or the model changes, so a swap is checked rather than hoped about.
**Done when:** one command runs the whole set and prints a per pair pass or fail with the actual score, a regression on any pair is visible in the output, and the run works against a changed model with no code edit.
- [ ] Build it: `/develop eval harness runner`

### 17. Cross vendor self check · needs a decision · GA
A genuine verification pass, not a bigger prompt: does the stated reasoning actually cite skills present in both the listing and the profile. It runs on a different vendor than the bulk scoring pass, because checking a model's work with the same model defeats the point of having a check. The same principle as cross model code review, applied one layer down inside the pipeline.
**Done when:** the check runs on a demonstrably different vendor than the scoring tier; a fabricated skill in the reasoning is caught; a caught result is surfaced to the user rather than silently dropped or silently kept; and the check's own failure is visible rather than treated as a pass.
- [ ] Design it (spec): `/architect cross vendor self check`

## Slice 3: Search depth

### 18. Structured search filters · needs a decision
Thicken the search segment: seniority, remote or hybrid, job type, salary range, and listing recency, on top of the title and location already there. The underlying source already supports most of these; the gap in the reference project was its own implementation. There is no structured remote field, so remote is handled by a text heuristic over title and description for now.
**Done when:** each filter changes the result set as stated, filter state is reflected in the URL so a search is shareable and survives a reload, the remote heuristic's limits are visible to the user rather than presented as certain, and a repeat search does not wipe the visible results.
- [ ] Design it (spec): `/architect structured search filters`

### 19. Listing data quality · needs a decision
Fix the known problems in the incoming listing data rather than switching sources: the same job appearing under different identifiers, a salary rendered as a range from a number to itself, and occasional ungrounded outlier figures. The dedup key is the risky part: key on the wrong field and a genuinely different real result disappears silently.
**Done when:** genuine duplicates collapse into one result while two distinct roles at the same company stay distinct, a single salary figure renders as a figure rather than a fake range, outliers are handled visibly rather than shown as fact, and the dedup key is exercised by a test that would fail if it hid a real result.
- [ ] Design it (spec): `/architect listing data quality`

## Slice 4: Tracking depth

### 20. Guided application capture · needs a decision
Thicken the tracking segment: when a user marks a job applied, walk them through a small set of preset questions and save their own typed answers. Hand typed, never AI generated. This is what later makes the dashboard and the discard signal worth anything.
**Done when:** marking applied opens the guided flow, answers save against the application record and are editable afterwards, an abandoned flow still leaves a valid applied record, and nothing in the flow makes an external call.
- [ ] Design it (spec): `/architect guided application capture`

## Slice 5: Launch readiness

### 21. Terms & privacy notices · Alpha
A plain terms page and a privacy notice saying what is stored, why, and how to have it deleted. Owed the day the first person other than the author signs in, because real resumes and personal details are in the database from Slice 1 onward. Written against the actual data model rather than from a template, so it is accurate.
**Done when:** both pages exist and are linked from the entry page and from sign in, the privacy notice names the real stored fields and the real third parties data reaches, and a user can find out how to request deletion.
- [ ] Build it: `/develop terms & privacy notices`

## v1.5

Sequenced immediately after the v1 loop ships and is actually used, not deferred indefinitely. Several of these depend on something in v1 existing first.

### 22. Discard with reason · needs a decision
Discard a result with a reason from a fixed list, and let that softly adjust future ranking for that user only, with no learning across users. Needs scoring live to have anything to adjust. Deliberately soft: nothing is hidden by a score threshold, because a slightly miscalibrated model would then silently bury results worth seeing.
**Done when:** a discard records a reason, the adjustment is per user only, its effect on a later score is explainable to the user, and nothing is ever filtered out of view without the user choosing it.
- [ ] Design it (spec): `/architect discard with reason`

### 23. Applications dashboard · needs a decision
Applications grouped by status and a response rate, both computed directly from the tracked records. Kept clearly separate from product usage analytics, which measure something else entirely.
**Done when:** counts and rate are derived from real records rather than stored as a snapshot, an empty account renders a meaningful empty state, and the page never presents product analytics numbers as application numbers.
- [ ] Design it (spec): `/architect applications dashboard`

### 24. Master resume · needs a decision
One canonical resume as the single source of truth, from which every tailored version is regenerated fresh rather than edited in place.
**Done when:** the canonical version is editable and versioned, a tailored version is always regenerated from it rather than from a previous tailoring, and each generated version is saved as a snapshot tied to its application record.
- [ ] Design it (spec): `/architect master resume`

### 25. Resume tailoring per job · needs a decision
Generate a resume tailored to a specific listing, showing the fit score alongside with no hard gate. Ships with the numeral verification pattern carried forward from the reference project: a deterministic check after generation that drops any bullet containing a number not present in the user's own profile data. Needs the application record and the master resume live first.
**Done when:** a tailored version generates against a real listing, any bullet with an unsupported number is dropped by a deterministic check rather than by asking a model to behave, the result is attached to its application record, and a generation failure is visible.
- [ ] Design it (spec): `/architect resume tailoring per job`

### 26. Profile depth & completeness · needs a decision
Replace the flat one row per job history with nested roles containing sub projects, so a research assistant project stops having to masquerade as a standalone employer. Adds honest completeness signalling: say what is actually missing, not a vague percentage. Also brings resume upload with extraction, with its accuracy limits shown rather than assumed.
**Done when:** a role can contain sub projects and renders correctly, completeness names the specific missing pieces, extraction results are shown for review before being saved, and the migration from the flat shape loses nothing.
- [ ] Design it (spec): `/architect profile depth & completeness`

### 27. Auth remainder · needs a decision
Email and password sign up as an alternative for people without a Google or GitHub account, password reset, session expiry handling, and an account settings screen. Deferred out of v1 because it pulls in a transactional email service and a verification flow that OAuth alone does not need.
**Done when:** a user can sign up and reset a password by email, an expired session is handled visibly rather than as a silent failure, account settings covers deletion, and the isolation guarantees hold identically for both sign in paths.
- [ ] Design it (spec): `/architect auth remainder`

### 28. Spend visibility & gating polish
Surface actual usage against the caps so the limits are legible rather than a surprise, and extend gating past the two call types v1 covers as new call types arrive.
**Done when:** a user can see their own usage against their cap, any newly added call type is gated by default rather than by remembering to add it, and the external kill switch remains the last resort it was built to be.
- [ ] Build it: `/develop spend visibility & gating polish`

### 29. Product analytics · needs a decision
Product usage analytics, kept conceptually and technically separate from the dashboard's own computed application statistics. The reference project's own documentation was caught conflating the two.
**Done when:** the events that matter are instrumented, nothing personally identifying leaves the app without a decision recorded about it, and the analytics surface is never presented as application statistics.
- [ ] Design it (spec): `/architect product analytics`

### 30. Company research, lite · needs a decision
Company level facts only, one fetch plus one summarize call, cached with a long lifetime. No agent loop and no browser automation decision yet. **Open flag:** confirm that a plain fetch actually retrieves usable content from real company sites before designing around it, since many render their content in the browser.
**Done when:** the fetch is proven against real sites before the feature is built out, cached results are reused rather than refetched, a site that cannot be read says so plainly instead of returning an empty summary, and the summarize call is gated like every other AI call.
- [ ] Design it (spec): `/architect company research, lite`

### 31. Seeded demo account · needs a decision
A pre populated account reachable without signing up: a fake profile, applications across every status, discard history and a populated dashboard. Solves real demo friction, since a freshly created empty account shows a recruiter nothing. Needs the dashboard to exist first, because it seeds one.
**Done when:** a visitor reaches it without signing up, every seeded value is obviously fake, a visitor cannot corrupt it for the next visitor, and it makes no external paid call.
- [ ] Design it (spec): `/architect seeded demo account`

## Deferred

Out of scope for this build pass, kept so the plan stays honest.

- **Tailoring and discard trends**: tailoring activity over time and discard reason patterns, the most honest signal about what the ranking is getting wrong · needs a decision
- **Company research, full**: role specific synthesis tied to the listing being viewed, an adaptive extraction loop, a grounding check, and the browser automation choice made against pricing real at that time · needs a decision
- **Fuller tailoring verification**: verification beyond the numeral only pattern · needs a decision
- **Scheduled push digest**: a genuinely different interaction model from the pull based app, worth real consideration once v1 is stable · needs a decision
- **Supplementary remote jobs source**: only if the text heuristic for remote proves too weak in practice · needs a decision
- **Retrieval tool over job search history**: a separate later project; its relationship to this app's multi user database is explicitly unresolved · needs a decision
- **Custom domain**: the production URL is a free `vercel.app` subdomain, chosen on cost. Moving to a custom domain later means updating three redirect lists (Google, GitHub, Supabase) plus one Vercel setting, and is cheapest to do before feature 7 wires OAuth rather than after. `from spec 0002`
- **Supabase Branching, a database per pull request**: the best isolation answer available, rejected in spec 0002 on cost alone since it needs a paid plan. Revisit if this project ever has a budget, or if the free projects pausing becomes a real drag. `from spec 0002`
- **Alert rule drift detection**: a scheduled diff between Sentry's live alert rules and the definitions in `docs/observability/`, so a rule that is edited or deleted in the Sentry interface is caught. Blocks nothing in v1; the forced failure smoke test in feature 10 is the load bearing half. `from spec 0001`

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow-up enrolled |
| `in-progress` (building) | `/develop` | milestone sub-boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | the boxes you ran are ticked, ones you skipped are recorded as skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the *suggested* point to call it done, never a gate; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre-workflow) and `dropped` (de-scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· GA`, `· Alpha`) overrides the project default `**Workflow:**` tier for that one feature; no tag = inherit. The **effective tier** (tag if set, else default) is the *recommended* verification depth; every skill reads it the same way to suggest the next step and to shape the closing boxes. Those boxes are suggestions you run or skip; skipping never blocks `done`.
- **Workflow** (header line) is the project default tier, the stages each feature *suggests* running **after** `/develop`: **Prototype** = nothing; **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. `done` is your call, not gated on these; a skipped stage is recorded as skipped.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.

## Standing rules this scope was written under

Carried from the idea brief, so `/architect` and `/develop` inherit them without re reading it:

- **The v1 completion test.** v1 is done when a user can enter a profile, search, see ranked results with the reasoning shown, click through to apply, and record that they applied. Check every proposed addition against this, not against whether it is individually reasonable.
- **The named risk retention rule.** Anything in scope because of a specific named real risk (features 10 and 7 here) is removed only by explicitly deciding that risk is acceptable, never as a side effect of trimming for time.
- **Search results never persist.** Only an applied record, and later a discard, makes a job stick. This is what avoids a staleness state machine. Accepted trade off: jobs merely seen but not acted on are not deduplicated against, deliberately, to avoid a growing seen jobs ledger.
- **No silent failures anywhere.** A failed fetch, a failed auth check or a failed scoring call is visible, never swallowed into a default that looks like success.
- **Real dependency tests.** Every external dependency gets at least one test that actually calls it or replays a real recorded response, never a mock encoding the same assumption as the code under test.
- **Quality, not just shape.** Anything that scores, ranks or generates needs expected ranges, not only schema validation. A schema check proves shape, not usefulness.
- **Raw in, formatted at render.** Store raw values; a formatted string frozen into a column cannot be fixed by fixing the formatter.
- **Cross model review before merge**, and cross vendor self check inside the AI pipeline: the same principle at two layers.
- **Fixtures never carry real personal data.** Obviously fake identifiers only, even for convenience.
- **No billing.** Cost exposure is handled by usage gating, not monetization.
- **Responsive throughout, designed desktop first**, and WCAG 2.2 AA on the v1 loop.
- **Write the data and control flow from memory** at the end of each feature before calling it done. Understanding erodes silently under scope pressure, and a stated intention does not catch that.
