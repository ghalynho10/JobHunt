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
(one Adzuna search, up to 16 `ai_scoring` calls, up to 16 chained `ai_check` calls), so run it
once and check everything against that one run rather than re-running per step.

## UI / manual

- [ ] Open `/demo` in a browser with no session at all (a private window). Expect the results,
      with no redirect and no sign in prompt anywhere → AC-1
- [ ] With the network tab open, reload `/demo` several times. Expect no request to Adzuna and no
      model call, and expect `usage_gate_counter` to be unchanged (read it through
      `test/helpers/database.ts` or `psql`, never the Data API, which cannot see that table at
      all) → AC-2
- [ ] Pick any card and search the real employer's name on Adzuna or the open web. Expect a real
      company and a real posting, not an invented one → AC-3, AC-19
- [ ] Confirm no control anywhere on `/demo` submits anything: no form, no button that posts, no
      Server Action. The only interactive elements are the two profile links → AC-4
- [ ] Visit `/demo`, `/demo?persona=backend-engineer`, `/demo?persona=frontend-engineer`,
      `/demo?persona=`, `/demo?persona=nonsense` and
      `/demo?persona=backend-engineer&persona=frontend-engineer`. Expect the named profile for
      the two valid slugs and the backend engineer for every other case, never an error → AC-5
- [ ] Read the served HTML (not the accessibility tree) and confirm the active profile carries
      `aria-current="page"`. `Text` silently drops `aria-*` props and TypeScript cannot catch it,
      so this has to be read off the wire → AC-5
- [ ] Count the cards under each profile. Expect the same count and the same listings under both,
      with the bands differing → AC-6
- [ ] Check the card order under one profile against `demo_result`'s own rows: best band first,
      and within one band ascending `sort_order` → AC-7
- [ ] On one card confirm every element AC-8 names is present, and confirm there is no "view the
      posting" link and no apply button of any kind, disabled or otherwise, only the plain
      sentence → AC-8
- [ ] Confirm every card carries the "Jobs by Adzuna" attribution (the word "Jobs" and the
      wordmark, both hyperlinked). On a card whose `salary_is_predicted` is true, confirm the
      `(estimated)` label and the Jobsworth attribution appear together; on one where it is
      false, confirm neither does → AC-9
- [ ] Read every sentence on the page and confirm none claims the listings are samples,
      fabricated, or prepared in advance. Check the page metadata description and the `<h1>` too,
      not only the visible prose → AC-10
- [ ] Confirm the served HTML carries `noindex` for this page specifically, not only from the
      site wide default → AC-11
- [ ] Break the read deliberately (revoke `select` on `demo_result` from `service_role`, or point
      the app at an unreachable database). Expect a 200 with the failure sentence, never a 500 or
      an empty list, and expect wording distinct from AC-15's → AC-12
- [ ] Confirm the entry page hero still does NOT link to `/demo` and the status card still shows
      the demo as planned. This is deliberately unbuilt in this pass → AC-13
- [ ] Confirm the page shows the search query the results answer and the date of the last
      refresh, and that both match `demo_refresh`'s own row → AC-14
- [ ] Confirm both candidates' full profiles render: summary, every skill, every work history
      entry with its dates, and the preferences. Compare against `DEMO_PERSONAS` in
      `personas.ts` field by field, since that constant is what the scorer was actually given →
      AC-14
- [ ] On a database where the migration is applied and no refresh has ever run
      (`demo_refresh.refreshed_at is null`), expect the "not refreshed yet" state, worded
      distinctly from AC-12's failure, on a normal 200, with the candidate profiles still shown →
      AC-15
- [ ] On every card confirm the compact line naming the other candidate and their band for the
      same listing, and confirm it matches what switching `?persona=` actually shows → AC-16
- [ ] Find a card whose band is `weak_match` or `not_a_match` and confirm the employer name,
      title and description render exactly as on any other card, unhidden and unaltered → AC-19

## Commands

- [ ] `curl -X POST http://localhost:3000/api/demo/refresh` with no header, and again with a wrong
      secret. Expect 401 both times, and expect `usage_gate_counter` unchanged, proving nothing
      was spent before the refusal → AC-18
- [ ] `curl -X POST -H "Authorization: Bearer $DEMO_REFRESH_SECRET" .../api/demo/refresh`. Expect
      200 with `{"refreshed":true,...}`, and expect `job_search` up by exactly 1 and `ai_scoring`
      up by exactly the row count → AC-2, AC-17, AC-18
- [ ] Immediately after that refresh, read `demo_result` and confirm every `source_job_id` appears
      under both personas and nowhere twice under one, and that `demo_refresh.refreshed_at` moved
      in the same moment → AC-6, AC-17
- [ ] Force a refusal: set the `ai_scoring` global day cap in `usage_cap` to a value below the row
      count, then refresh. Expect a non 200 naming the gate, `demo_result` byte for byte
      unchanged, `refreshed_at` unmoved, and the Sentry event at info level rather than error →
      AC-17
- [ ] Force a check failure: make the `ai_check` vendor unreachable (a bad key, or an unroutable
      base URL) while `ai_scoring` still works, then refresh. Expect the same all or nothing
      abort with nothing written → AC-17
- [ ] Confirm `demo_result` and `demo_refresh` both report `relrowsecurity` and
      `relforcerowsecurity` true with zero policies, and that neither `anon` nor `authenticated`
      holds any privilege on either → AC-4
- [ ] Query `demo_result` with the publishable key through the Data API. Expect a permission
      denial, not an empty result → AC-4

## Value sourcing

One step per row of `index.md`'s **Value sourcing** table, each varying the input so a wrong
source shows up rather than reading the same as a right one.

- [ ] Which profile's rows show: request each of the six `?persona=` cases above and confirm the
      rendered rows change with the slug, not with anything else
- [ ] The switcher links and both profiles: edit a skill in `personas.ts`, reload, and confirm the
      page changes without any database write. It is a constant, not a read
- [ ] Card facts: change one `demo_result` row's `title`, `location`, `salary_currency` and
      `salary_is_predicted` directly in the database, reload, and confirm each change appears
- [ ] Snippet truncation: set one row's `description_snippet` to a complete sentence with no
      trailing ellipsis and confirm the "only shows part of the description" caption disappears
      for that card while the "Not mentioned" heading stays. Restore it and confirm the caption
      returns. This is derived at render, never assumed
- [ ] Ungrounded skills: set one row's `ungrounded_skills` to a name that is NOT in its
      `matched_skills`, reload, and confirm the removed skills sentence names it and the reasoning
      caveat appears. Set it back to empty and confirm both disappear
- [ ] The other candidate's band: change the sibling row's `band` directly and confirm only the
      compact line moves, not the card's own badge. Then delete the sibling row entirely and
      confirm the page shows AC-12's failure rather than silently hiding the line
- [ ] Attributions: flip one row's `salary_is_predicted` and confirm the `(estimated)` label and
      the Jobsworth attribution appear and disappear TOGETHER, never one without the other
- [ ] Query line and refresh time: change `demo_refresh.search_title` and `search_location`
      directly and confirm both halves of the sentence follow, including the nationwide wording
      when `search_location` is null
- [ ] The two empty states: set `refreshed_at` to null with rows still present and confirm AC-15's
      state; then restore it and delete every row and confirm AC-12's failure instead. The two
      must not be reachable from each other
- [ ] Which listings the refresh keeps: run a refresh and compare the stored `sort_order` against
      Adzuna's own returned order for the same query, confirming no reordering and no gap where a
      duplicate was dropped
- [ ] The scoring inputs: confirm the prompt the refresh sends carries the persona constant
      unchanged, not a re-derived or re-bounded copy
- [ ] The refresh's own session: confirm the `ai_scoring` and `job_search` account scope counters
      move under `demo-refresh@example.test`'s own profile id and not under any real user's
- [ ] The route's authorisation: confirm a secret differing only in length is refused with a 401
      and not a 500, which is what the SHA-256 digest comparison exists to guarantee

## Acceptance-criteria coverage

AC-1 · AC-2 (two steps) · AC-3 · AC-4 (three steps) · AC-5 (two steps) · AC-6 (two steps) ·
AC-7 · AC-8 · AC-9 · AC-10 · AC-11 · AC-12 · AC-13 · AC-14 (two steps) · AC-15 · AC-16 · AC-17
(four steps) · AC-18 (two steps) · AC-19. Every row of the Value sourcing table has its own step
above.
