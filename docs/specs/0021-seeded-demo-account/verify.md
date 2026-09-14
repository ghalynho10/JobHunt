# 0021. Seeded demo account, verify

Steps a real browser or a real database connection has to confirm; nothing here is provable by
reading the code alone.

- [ ] In a fully signed out browser, visit `/demo` directly. It renders with no redirect to
      `/sign-in` and no session cookie set. Verifies **AC-1**.
- [ ] Using `test/helpers/database.ts`, read the `usage_gate_counter` (or `usage_cap`) rows for
      the `job_search` and `ai_scoring` call types before and after visiting `/demo`. Confirm
      neither moved. Absence of a log line is not evidence on its own (a real request could still
      have happened and gone unlogged), but a real Adzuna search or scoring call cannot happen
      anywhere in this app without moving one of these counters, so this is the check that would
      actually catch it. Verifies **AC-2**.
- [ ] Read every seeded company name, title, and description on both profiles out loud. None of
      them could be mistaken for a real employer or a real posting. Verifies **AC-3**.
- [ ] Grep `src/app/(marketing)/demo/` and `src/features/demo/` for any Server Action, any
      `insert`, `update`, or `delete` call, or any form `action`. None exist. Verifies **AC-4**.
- [ ] Using `test/helpers/database.ts` (never the Data API), confirm `demo_result` holds rows for
      both `backend-engineer` and `product-designer`. Then confirm a plain `supabase-js` client
      built with the publishable key gets a hard permission denial reading `demo_result`, not an
      empty result: with no grant to `anon` or `authenticated`, Postgres refuses the read outright
      before row level security is ever consulted, which is a different, stronger failure than
      "zero rows returned". Verifies the row level security and grant half of **AC-4**.
- [ ] Visit `/demo?persona=product-designer`, then `/demo` with no param, then
      `/demo?persona=not-a-real-slug`. The first shows that profile's results, the second and
      third both show the same first profile. Verifies **AC-5**.
- [ ] Find the two shared title and company pairs ("Platform Engineer" at "Fictional Fintech Co"
      and "Founding Product Engineer" at "Faux Systems Inc") across both profiles. Confirm the
      band, matched skills, not mentioned skills, and reasoning genuinely differ between the two,
      not just the band label. Verifies **AC-6**.
- [ ] Within one profile's list, confirm the bands read best to worst top to bottom. Verifies
      **AC-7**.
- [ ] On one card carrying a salary, confirm it renders as a plain figure with no "(estimated)"
      label. Confirm no card carries a "View the posting" link or a clickable apply control.
      Verifies **AC-8**.
- [ ] Search the rendered page for the Adzuna logo and for the salary predictor's attribution
      mark. Neither appears anywhere on `/demo`. Verifies **AC-9**.
- [ ] Confirm the sample data banner is visible without scrolling on a typical viewport. Verifies
      **AC-10**.
- [ ] Fetch `/demo`'s response headers on a real deployment and confirm `X-Robots-Tag` or the
      rendered `<meta name="robots">` says `noindex`, inherited from the root layout with no
      override on this route. Verifies **AC-11**.
- [ ] In a local environment, temporarily revoke `service_role`'s `select` grant on
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

- [ ] Visit `/demo?persona=` (empty value) and `/demo?persona=backend-engineer&persona=product-designer`
      (repeated param). Both show the `backend-engineer` profile. The repeated case defaulting
      rather than taking the first value is deliberate and differs from `/search`, which takes
      the first. Verifies the remaining two shapes of **AC-5**.
- [ ] In the rendered switcher, confirm the active profile is NOT a link: it is a `span` carrying
      `aria-current="page"`, and only the other profile is an `<a>`. Check this in the served
      HTML, not by eye, because `Text` silently drops an `aria-current` passed to it and
      TypeScript does not catch that (it skips prop checking for any hyphenated JSX attribute).
      This was a real defect in the first version of the page. Verifies the switcher rows of the
      Value sourcing table.
- [ ] Across the twelve seeded rows, confirm all four `salaryText()` shapes render and one row
      renders none: a range (`$165,000 to $195,000`), a one sided minimum (`from $140,000`), a
      one sided maximum (`up to $210,000`), an equal min and max collapsing to one figure
      (`$158,000`, not "$158,000 to $158,000"), and a row with no salary line at all. The seed
      data carries all five cases on purpose so this is checkable without editing it.
- [ ] Confirm the not mentioned section's caption is `SCORING_COPY.notMentionedCaption` byte for
      byte, and that every seeded `description_snippet` is genuinely cut off (each ends with an
      ellipsis mid sentence). The caption claims the posting shows only part of the description;
      on `/demo` that is true only by construction, so a seed row rewritten as a complete
      description would make the reused caption false.
- [ ] Confirm no card renders a relative posted date and none renders a sponsorship chip. Both
      are omitted deliberately, not missed: the demo has no meaningful posted time and no
      sponsorship claim to make.
