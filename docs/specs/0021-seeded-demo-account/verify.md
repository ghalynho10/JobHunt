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
