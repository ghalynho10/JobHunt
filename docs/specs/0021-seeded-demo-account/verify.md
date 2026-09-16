# 0021. Seeded demo account, verify

> **Superseded 2026-09-14, kept for history rather than deleted.** Every step below was written
> and run against the fabricated design (`index.md`'s acceptance criteria as they read before
> 2026-09-14): a hand seeded, never changing table, no Adzuna or model call ever, no Adzuna
> attribution, no write path of any kind. That design is reworked; see `index.md`'s struck through
> acceptance criteria and `rationale.md`'s "Rework, 2026-09-14" section for what replaced it and
> why. These steps still prove what they proved on the day they ran, against the code that existed
> then; they do not describe the product today. A fresh `verify.md` pass against the current
> acceptance criteria (AC-1 through AC-19) is owed before the next `/check verify seeded demo
> account` run, recorded in `index.md`'s Follow-up.

Steps a real browser or a real database connection has to confirm; nothing here is provable by
reading the code alone.

- [x] In a fully signed out browser, visit `/demo` directly. It renders with no redirect to
      `/sign-in` and no session cookie set. Verifies **AC-1**.
- [x] Using `test/helpers/database.ts`, read the `usage_gate_counter` (or `usage_cap`) rows for
      the `job_search` and `ai_scoring` call types before and after visiting `/demo`. Confirm
      neither moved. Absence of a log line is not evidence on its own (a real request could still
      have happened and gone unlogged), but a real Adzuna search or scoring call cannot happen
      anywhere in this app without moving one of these counters, so this is the check that would
      actually catch it. Verifies **AC-2**.
- [x] Read every seeded company name, title, and description on both profiles out loud. None of
      them could be mistaken for a real employer or a real posting. Verifies **AC-3**.
- [x] Grep `src/app/(marketing)/demo/` and `src/features/demo/` for any Server Action, any
      `insert`, `update`, or `delete` call, or any form `action`. None exist. Verifies **AC-4**.
- [x] Using `test/helpers/database.ts` (never the Data API), confirm `demo_result` holds rows for
      both `backend-engineer` and `product-designer`. Then confirm a plain `supabase-js` client
      built with the publishable key gets a hard permission denial reading `demo_result`, not an
      empty result: with no grant to `anon` or `authenticated`, Postgres refuses the read outright
      before row level security is ever consulted, which is a different, stronger failure than
      "zero rows returned". Verifies the row level security and grant half of **AC-4**.
- [x] Visit `/demo?persona=product-designer`, then `/demo` with no param, then
      `/demo?persona=not-a-real-slug`. The first shows that profile's results, the second and
      third both show the same first profile. Verifies **AC-5**.
- [x] Find the two shared title and company pairs ("Platform Engineer" at "Fictional Fintech Co"
      and "Founding Product Engineer" at "Faux Systems Inc") across both profiles. Confirm the
      band, matched skills, not mentioned skills, and reasoning genuinely differ between the two,
      not just the band label. Verifies **AC-6**.
- [x] Within one profile's list, confirm the bands read best to worst top to bottom. Verifies
      **AC-7**.
- [x] On one card carrying a salary, confirm it renders as a plain figure with no "(estimated)"
      label. Confirm no card carries a "View the posting" link or a clickable apply control.
      Verifies **AC-8**.
- [x] Search the rendered page for the Adzuna logo and for the salary predictor's attribution
      mark. Neither appears anywhere on `/demo`. Verifies **AC-9**.
- [x] Confirm the sample data banner is visible without scrolling on a typical viewport. Verifies
      **AC-10**.
- [ ] Fetch `/demo`'s response headers on a real deployment and confirm `X-Robots-Tag` or the
      rendered `<meta name="robots">` says `noindex`, inherited from the root layout with no
      override on this route. Verifies **AC-11**.
- [x] In a local environment, temporarily revoke `service_role`'s `select` grant on
      `demo_result` (rather than editing `SUPABASE_SECRET_KEY` itself, which risks failing
      `env.ts`'s own boot time format validation and crashing the app before this feature's code
      ever runs). Visit `/demo`, confirm it answers 200 and shows the visible failure message
      rather than a blank or partially rendered page, then restore the grant. Verifies **AC-12**.
- [ ] On the live entry page, confirm the hero's link to `/demo` is a real, working `<a>` element
      (not `Text`), and confirm the about section's status card lists the demo under `working`
      rather than `planned`. Verifies **AC-13**.

## Added by /develop, 2026-09-13

Steps for the value sourcing rows the list above does not name individually, plus two things
this build settled that change how the list above should be read.

### What this build covers, and what it does not

**AC-13 is not built.** Spec 0021's build plan step 6 sequences it with marking feature 31
`done`, because `about-section.tsx`'s own doc comment forbids anything sitting under `working`
that `docs/scope/scope.md` does not mark `done`. So a `/check verify` run against this build
covers **AC-1 to AC-12 only**, and must leave **AC-13 unticked rather than passing it by
inspection**.

The close-out pass that builds AC-13 has to verify AC-13 itself: that the hero's link actually
resolves to a working `/demo`, and that the status card's text genuinely moved from `PLANNED` to
`WORKING`. Not that the edit was made, that it landed. This is the exact shape the 2026-09-01
reflex in `docs/reflexes.md` was written for: feature 7's clause to retire the entry page's
placeholder sat unmet under a `done` row, and the live homepage told every visitor that nothing
worked for two days after sign in shipped, because nothing in the feature's own code area
prompts that edit and no test covers it.

**AC-11 is now an explicit override, not an inheritance.** The AC-11 step above says to confirm
`noindex` is inherited "from the root layout with no override on this route". That is no longer
true and the change is deliberate: `src/app/(marketing)/demo/page.tsx` sets
`robots: { index: false, follow: false }` in its own `metadata`. The root layout's site wide
`index: false` is documented in `layout.tsx` as holding "at least until accounts open", and
`/privacy` and `/terms` have already opted back in, so a page relying on that default would
become indexable the day somebody flips it. Verify the rendered `<meta name="robots">` says
`noindex, nofollow`; do not treat the presence of the local override as drift to remove.

### Value sourcing steps

- [x] Visit `/demo?persona=` (empty value) and `/demo?persona=backend-engineer&persona=product-designer`
      (repeated param). Both show the `backend-engineer` profile. The repeated case defaulting
      rather than taking the first value is deliberate and differs from `/search`, which takes
      the first. Verifies the remaining two shapes of **AC-5**.
- [x] In the rendered switcher, confirm the active profile is NOT a link: it is a `span` carrying
      `aria-current="page"`, and only the other profile is an `<a>`. Check this in the served
      HTML, not by eye, because `Text` silently drops an `aria-current` passed to it and
      TypeScript does not catch that (it skips prop checking for any hyphenated JSX attribute).
      This was a real defect in the first version of the page. Verifies the switcher rows of the
      Value sourcing table.
- [x] Across the twelve seeded rows, confirm all four `salaryText()` shapes render and one row
      renders none: a range (`$165,000 to $195,000`), a one sided minimum (`from $140,000`), a
      one sided maximum (`up to $210,000`), an equal min and max collapsing to one figure
      (`$158,000`, not "$158,000 to $158,000"), and a row with no salary line at all. The seed
      data carries all five cases on purpose so this is checkable without editing it.
- [x] Confirm the not mentioned section's caption is `SCORING_COPY.notMentionedCaption` byte for
      byte, and that every seeded `description_snippet` is genuinely cut off (each ends with an
      ellipsis mid sentence). The caption claims the posting shows only part of the description;
      on `/demo` that is true only by construction, so a seed row rewritten as a complete
      description would make the reused caption false.
- [x] Confirm no card renders a relative posted date and none renders a sponsorship chip. Both
      are omitted deliberately, not missed: the demo has no meaningful posted time and no
      sponsorship claim to make.

---

# 0021. Seeded demo account, verify: the real data version · updated 2026-09-14

_Steps derived from `index.md`'s acceptance criteria AC-1 to AC-19 as they read after the
2026-09-14 rework, plus one step per row of its **Value sourcing** table. `/check verify` runs
these; `/test` locks the durable ones. The section above this line is the superseded fabricated
design pass, kept for history. This section supersedes it in full._

**Before any step below**: a refresh must have run at least once, or every results step reads
AC-15's empty state instead of what it is checking. `POST /api/demo/refresh` spends real money
(~~one Adzuna search~~ two Adzuna searches since 2026-09-15, up to 16 `ai_scoring` calls, up to 16 chained `ai_check` calls), so run it
once and check everything against that one run rather than re-running per step.

## UI / manual

- [x] Open `/demo` in a browser with no session at all (a private window). Expect the results,
      with no redirect and no sign in prompt anywhere → AC-1
- [x] With the network tab open, reload `/demo` several times. Expect no request to Adzuna and no
      model call, and expect `usage_gate_counter` to be unchanged (read it through
      `test/helpers/database.ts` or `psql`, never the Data API, which cannot see that table at
      all) → AC-2
- [x] Pick any card and search the real employer's name on Adzuna or the open web. Expect a real
      company and a real posting, not an invented one → AC-3, AC-19
- [x] Confirm no control anywhere on `/demo` submits anything: no form, no button that posts, no
      Server Action. The only interactive elements are the two profile links → AC-4
- [x] Visit `/demo`, `/demo?persona=backend-engineer`, `/demo?persona=frontend-engineer`,
      `/demo?persona=`, `/demo?persona=nonsense` and
      `/demo?persona=backend-engineer&persona=frontend-engineer`. Expect the named profile for
      the two valid slugs and the backend engineer for every other case, never an error → AC-5
- [x] Read the served HTML (not the accessibility tree) and confirm the active profile carries
      `aria-current="page"`. `Text` silently drops `aria-*` props and TypeScript cannot catch it,
      so this has to be read off the wire → AC-5
- [x] Count the cards under each profile. Expect the same count and the same listings under both,
      with the bands differing → AC-6
- [x] Check the card order under one profile against `demo_result`'s own rows: best band first,
      and within one band ascending `sort_order` → AC-7
- [x] On one card confirm every element AC-8 names is present, and confirm there is no "view the
      posting" link and no apply button of any kind, disabled or otherwise, only the plain
      sentence → AC-8
- [x] Confirm every card carries the "Jobs by Adzuna" attribution (the word "Jobs" and the
      wordmark, both hyperlinked). On a card whose `salary_is_predicted` is true, confirm the
      `(estimated)` label and the Jobsworth attribution appear together; on one where it is
      false, confirm neither does → AC-9
- [x] Read every sentence on the page and confirm none claims the listings are samples,
      fabricated, or prepared in advance. Check the page metadata description and the `<h1>` too,
      not only the visible prose → AC-10
- [x] Confirm the served HTML carries `noindex` for this page specifically, not only from the
      site wide default → AC-11
- [x] Break the read deliberately (revoke `select` on `demo_result` from `service_role`, or point
      the app at an unreachable database). Expect a 200 with the failure sentence, never a 500 or
      an empty list, and expect wording distinct from AC-15's → AC-12
- [x] Confirm the entry page hero still does NOT link to `/demo` and the status card still shows
      the demo as planned. This is deliberately unbuilt in this pass → AC-13
- [x] Confirm the page shows ~~the search query~~ both search queries (revised 2026-09-15) the
      results answer and the date of the last refresh, and that both match `demo_refresh`'s own
      row → AC-14
- [x] Confirm both candidates' full profiles render: summary, every skill, every work history
      entry with its dates, and the preferences. Compare against `DEMO_PERSONAS` in
      `personas.ts` field by field, since that constant is what the scorer was actually given →
      AC-14
- [x] On a database where the migration is applied and no refresh has ever run
      (`demo_refresh.refreshed_at is null`), expect the "not refreshed yet" state, worded
      distinctly from AC-12's failure, on a normal 200, with the candidate profiles still shown →
      AC-15
- [x] On every card confirm the compact line naming the other candidate and their band for the
      same listing, and confirm it matches what switching `?persona=` actually shows → AC-16
- [x] Find a card whose band is `weak_match` or `not_a_match` and confirm the employer name,
      title and description render exactly as on any other card, unhidden and unaltered → AC-19

## Commands

- [x] `curl -X POST http://localhost:3000/api/demo/refresh` with no header, and again with a wrong
      secret. Expect 401 both times, and expect `usage_gate_counter` unchanged, proving nothing
      was spent before the refusal → AC-18
- [x] `curl -X POST -H "Authorization: Bearer $DEMO_REFRESH_SECRET" .../api/demo/refresh`. Expect
      200 with `{"refreshed":true,...}`, and expect `job_search` up by exactly ~~1~~ 2 (revised
      2026-09-15, two searches) and `ai_scoring` up by exactly the row count → AC-2, AC-17, AC-18
- [x] Immediately after that refresh, read `demo_result` and confirm every `source_job_id` appears
      under both personas and nowhere twice under one, and that `demo_refresh.refreshed_at` moved
      in the same moment → AC-6, AC-17
- [x] Force a refusal: set the `ai_scoring` global day cap in `usage_cap` to ~~a value below the row
      count~~ the UTC day's `ai_scoring` global `consumed_count` plus a number smaller than the row
      count, read exactly as the 2026-09-15 section's **Reading and setting a day cap** describes
      (with `call_type = 'ai_scoring'`; revised 2026-09-15, since a cap below the row count is
      already exhausted on any day with earlier scoring calls, and refuses the first call instead
      of one mid run), then refresh. Expect a non 200 naming the gate, `demo_result` byte for byte
      unchanged, `refreshed_at` unmoved, and the Sentry event at info level rather than error →
      AC-17
- [x] Force a check failure: make the `ai_check` vendor unreachable (a bad key, or an unroutable
      base URL) while `ai_scoring` still works, then refresh. Expect the same all or nothing
      abort with nothing written → AC-17
- [x] Confirm `demo_result` and `demo_refresh` both report `relrowsecurity` and
      `relforcerowsecurity` true with zero policies, and that neither `anon` nor `authenticated`
      holds any privilege on either → AC-4
- [x] Query `demo_result` with the publishable key through the Data API. Expect a permission
      denial, not an empty result → AC-4

## Value sourcing

One step per row of `index.md`'s **Value sourcing** table, each varying the input so a wrong
source shows up rather than reading the same as a right one.

- [x] Which profile's rows show: request each of the six `?persona=` cases above and confirm the
      rendered rows change with the slug, not with anything else
- [x] The switcher links and both profiles: edit a skill in `personas.ts`, reload, and confirm the
      page changes without any database write. It is a constant, not a read · **covered by a test
      instead, 2026-09-16**: `src/app/(marketing)/demo/page.test.ts` replaces `DEMO_PERSONAS` with
      an edited copy and compares two whole renders, which is this step run mechanically, and
      proves the no database half the reload could not: with `readDemoPage()` returning a
      `Failure`, both candidates still render in full
- [x] Card facts: change one `demo_result` row's `title`, `location`, `salary_currency` and
      `salary_is_predicted` directly in the database, reload, and confirm each change appears
- [x] Snippet truncation: set one row's `description_snippet` to a complete sentence with no
      trailing ellipsis and confirm the "only shows part of the description" caption disappears
      for that card while the "Not mentioned" heading stays. Restore it and confirm the caption
      returns. This is derived at render, never assumed
- [x] Ungrounded skills: set one row's `ungrounded_skills` to a name that is NOT in its
      `matched_skills`, reload, and confirm the removed skills sentence names it and the reasoning
      caveat appears. Set it back to empty and confirm both disappear
- [x] The other candidate's band: change the sibling row's `band` directly and confirm only the
      compact line moves, not the card's own badge. Then delete the sibling row entirely and
      confirm the page shows AC-12's failure rather than silently hiding the line
- [x] Attributions: flip one row's `salary_is_predicted` and confirm the `(estimated)` label and
      the Jobsworth attribution appear and disappear TOGETHER, never one without the other
- [x] Query line and refresh time: change `demo_refresh.~~search_title~~ search_titles` (both
      elements, revised 2026-09-15) and `search_location` directly and confirm every part of the
      sentence follows, including the nationwide wording when `search_location` is null
- [x] The two empty states: set `refreshed_at` to null with rows still present and confirm AC-15's
      state; then restore it and delete every row and confirm AC-12's failure instead. The two
      must not be reachable from each other
- [ ] ~~Which listings the refresh keeps: run a refresh and compare the stored `sort_order` against
      Adzuna's own returned order for the same query, confirming no reordering and no gap where a
      duplicate was dropped~~ · **SUPERSEDED 2026-09-15** by the kept walk step in the section
      below
- [x] The scoring inputs: confirm the prompt the refresh sends carries the persona constant
      unchanged, not a re-derived or re-bounded copy · **covered by a test instead, 2026-09-16**:
      `src/features/demo/scoring-prompt.test.ts` replaces `callTier()` alone, drives the real
      `scoreListings()` chain for each persona, and compares the captured prompt byte for byte
      against `buildScoringPrompt(persona.profile, listing)`. It does NOT pin `refresh.ts`'s own
      `scoreListings(persona.profile, ...)` argument, which stays a review concern
- [x] The refresh's own session: confirm the `ai_scoring` and `job_search` account scope counters
      move under `demo-refresh@example.test`'s own profile id and not under any real user's
- [x] The route's authorisation: confirm a secret differing only in length is refused with a 401
      and not a 500, which is what the SHA-256 digest comparison exists to guarantee

## Acceptance-criteria coverage

AC-1 · AC-2 (two steps) · AC-3 · AC-4 (three steps) · AC-5 (two steps) · AC-6 (two steps) ·
AC-7 · AC-8 · AC-9 · AC-10 · AC-11 · AC-12 · AC-13 · AC-14 (two steps) · AC-15 · AC-16 · AC-17
(four steps) · AC-18 (two steps) · AC-19. Every row of the Value sourcing table has its own step
above.

---

## Revision, 2026-09-15: two searches, the kept walk, refresh outcomes

_Steps for `index.md`'s 2026-09-15 revision: the two fixed queries, the per search kept walk, the
**Refresh outcomes** table, and Build plan step 10. Where a step above conflicts, this section
wins; the steps above it that changed are struck through in place._

**Reading and setting a day cap, for every step below that sets one** (added 2026-09-15). The
gate keys day counters on the UTC date (`(now() at time zone 'utc')::date`,
`20260902120000_usage_gating.sql` line 142) and refuses when `consumed_count >= cap_value`
(line 227). A refused call still increments `attempt_count`, so `consumed_count` is the column to
read. The UTC day rolls at 20:00 local time, so a read that assumes "today" near then can return
the previous day's row, or zero rows that look like zero calls; `docs/session-notes.md` records
three instances. So read it by an explicit UTC date, through `psql`, never the Data API (which
cannot see `usage_gate_counter` at all), and without `-At`, so psql prints the row count:

```sh
docker exec supabase_db_jobhunt psql -U postgres -d postgres -c "select (now() at time zone 'utc')::date as utc_today;"
docker exec supabase_db_jobhunt psql -U postgres -d postgres -c "select period_start, attempt_count, consumed_count from public.usage_gate_counter where call_type = 'job_search' and scope = 'global' and period = 'day' and period_start = date '<utc_today from the first query>';"
```

`(0 rows)` means nothing was consumed on that UTC day, so `consumed_count` is 0. Set the cap with
`update public.usage_cap set cap_value = <n> where call_type = 'job_search' and scope = 'global'
and period = 'day';`, and note the original value (66) to restore. Check the refresh identity's
own `job_search` account week row the same way first, and confirm its `consumed_count` is below 24
(its cap is 25, and the second search needs room), so the account cap cannot refuse before the
global day cap does. Before driving the refresh, read the UTC date again; if it changed, start
over.

- [x] Read `src/features/demo/refresh.ts` and confirm exactly two searches run, titles
      `"backend engineer"` then `"frontend engineer"`, both with no location → AC-17
- [x] The kept walk, as a unit test over fixture result lists rather than a live refresh, since a
      live search cannot be made to return a duplicate or a short list on demand: a backend list
      of 2 and a frontend list of 6 whose first entry repeats backend's first id. Expect kept
      order backend 1, frontend 2, backend 2, frontend 3, frontend 4, frontend 5 (frontend's repeat
      skipped, backend never topped up), `sort_order` 1 to 6 in that order, and each kept
      listing's `search_title` naming the search that kept it. This tests the exported pure
      `keepListings()` directly, with no mock of `searchListings()`. Break the walk on purpose (let
      frontend borrow backend's unused share, which keeps a seventh listing) and confirm the test
      fails → AC-7, AC-17
- [x] After a real refresh, read `demo_result` for one persona ordered by `sort_order` with its
      `search_title` column, and confirm the titles alternate (`backend engineer`, `frontend
      engineer`, ...) until one search stops, that neither title appears more than 4 times, and
      that the other persona's rows carry the same `search_title` for each `source_job_id` →
      AC-17
- [x] After that refresh, confirm `demo_refresh.search_titles` is exactly
      `{"backend engineer","frontend engineer"}` and that `/demo` renders exactly `These are the
      first results from two searches, up to four from each: "backend engineer" and "frontend
      engineer".` Then set `search_location` to a city directly and confirm ` in <city>` appears
      before the final period → AC-14
- [x] The skill counts: the route's `200` body carries `ownRoleRows`, `ownRoleEmpty`,
      `crossRoleRows` and `crossRoleEmpty`, and `ownRoleRows + crossRoleRows` equals `rows`.
      Recompute all four from `demo_result` with SQL, own role meaning
      `persona_slug = 'backend-engineer' and search_title = 'backend engineer'` or
      `persona_slug = 'frontend-engineer' and search_title = 'frontend engineer'`, and
      `cardinality(matched_skills) = 0` for empty, and confirm they match the body. This is the
      number the Follow-up stopping rule reads, so confirm it moves: set one own role row's
      `matched_skills` to `'{}'` and recompute → Follow-up stopping rule
- [x] The zero kept abort: `keepListings([], [])` returns an empty result (a unit test), and
      reading `refreshDemoResults()` shows that an empty result returns a `Failure` of kind
      `record_not_found`, whose context names both titles, before `replace_demo_results()` is
      reached → AC-17
- [x] A refused second search, driven live on the local stack. The two searches are not identical
      calls: they are two separate gate checks, so the cap can let the first through and refuse
      the second. Record `demo_result` (row count and every `source_job_id`) and
      `demo_refresh.refreshed_at`. Read the UTC day's `job_search` global `consumed_count` (**Reading
      and setting a day cap**, above) and set the cap to that value plus one, so the backend search
      is allowed and the frontend search is refused. Refresh. Expect `503` with `refreshed: false`,
      the global day `consumed_count` up by exactly 1 (the backend search) and `attempt_count` up by
      2, no model call spent (both searches run before any scoring), `demo_result` and
      `refreshed_at` exactly as recorded, an info level Sentry event naming `job_search` and
      `"frontend engineer"`, a `refusedSearch` span attribute of `"frontend engineer"`, and a
      `demo.refresh` span that is not marked failed. This costs one Adzuna search. Restore the cap
      to 66 afterwards → AC-17
- [ ] A vendor failure of the second search (not a refusal): Adzuna itself failing on only the
      second call cannot be forced on a live stack without a mock, which this project's rules
      forbid, so this one is proved by reading. In `refresh.ts`, confirm the frontend search's
      `Failure` returns before `keepListings()` and before `replace_demo_results()`, and carries
      `"frontend engineer"` in its context. If `/develop` adds a seam that lets a test supply the
      two search results, prefer that test and record it here instead → AC-17
- [x] A refusal at the first search, local stack only: read the UTC day's `job_search` global
      `consumed_count` (**Reading and setting a day cap**, above) and set the cap to exactly that
      value, so the next search is refused, then refresh. Expect `503` with `refreshed: false`,
      the global day `consumed_count` unchanged and `attempt_count` up by exactly 1 (the frontend
      search never ran), no model call spent, `demo_result` unchanged, an info level Sentry event
      naming `job_search` and `"backend engineer"`, a `refusedSearch` span attribute of
      `"backend engineer"`, and a `demo.refresh` span that is not marked failed. Restore the cap
      to 66 afterwards → AC-17
- [x] A refusal later in the run (the existing `ai_scoring` cap step above) answers `503`, not
      `500`, and its span is not marked failed; a genuine failure (the existing `ai_check` step
      above) answers `500` and its span is failed. These are the two rows of **Refresh outcomes**
      that differ only in shape, so check both, not one → AC-17
- [x] The migration heading: confirm the `where true` comment in
      `supabase/migrations/20260913120000_demo_result.sql` reads "BREAKS EVERY APPLICATION CALL TO
      THIS FUNCTION, LOCAL OR HOSTED" and that no line in the file still says "PRODUCTION ONLY".
      Then, on the local stack only, drop `where true` temporarily and `pnpm db:reset`, and call
      `replace_demo_results()` through the secret key client (`supabase.rpc`, which goes through
      PostgREST and so through the `authenticator` connection) with `p_results: []` and
      `p_search_titles: ["backend engineer", "frontend engineer"]` (both are required, and a
      missing or one element `p_search_titles` would error on its own check before the delete is
      reached, failing for the wrong reason), so no search or model call is spent: expect
      `DELETE requires a WHERE clause`. The same call from
      `psql` as `postgres` should succeed, which is the difference the comment describes. This
      proves the local half of the heading's claim rather than trusting it; restore the predicate
      and reset afterwards
- [x] Grep `src/`, `supabase/` and `docs/observability/` for `one real search`, `one Adzuna
      search`, `one real Adzuna search`, `whatever one search`, `DEMO_SEARCH_TITLE\b`,
      `searchTitle\b` and `returned rank`, printing the exit status beside the output (never ending
      in `|| echo`). Expect no match describing the demo, and confirm `KEPT_LISTING_COUNT` is `4`
      → Build plan step 10
