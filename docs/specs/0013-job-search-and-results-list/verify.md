# Verify: job search and results list · spec 0013 · updated 2026-09-04

_Steps derived from spec 0013's acceptance criteria and every row of its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Several steps below were already driven during the build, against the real local stack and the real Adzuna API, and each says so with what was actually observed. They are left unticked deliberately: `/check verify` is a separate pass on a separate run, and a step ticked by the person who wrote the code proves less than one re-run against a fresh state.

**Setup.** These need a signed in session and the local stack (`pnpm db:start`, `pnpm dev`). A session can be minted without a browser handshake the way the integration suite does it (`test/helpers/session.ts`), then its cookie set on `localhost`. Real `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` must be in `.env.local` for any step that reaches Adzuna.

## UI / manual

- [ ] Sign in, visit `/search` with a `job_preference` row holding `desired_titles[0] = "software engineer"` and `desired_locations[0] = "Boston"` → both fields prefill with those exact values, no results render, and no `usage_gate_counter` row is created or incremented for `job_search` (check the table before and after) → AC-9
- [ ] Visit `/search` as a caller with **no** `job_preference` row → both fields render blank, not a placeholder or a dash, and still no gate spend → AC-9
- [ ] Visit `/search` as a caller whose `desired_titles` is an empty array → the title field is blank rather than erroring → AC-9
- [ ] Submit the form with a real title and location → the URL becomes `/search?q=...&where=...`, real Adzuna listings render, at most 20 of them, and the page ships no client JavaScript for search (view source: the results are in the server rendered HTML) → AC-1
- [ ] Submit with **both** fields empty → `COPY-3` renders in a `role="alert"`, no Adzuna call is made (no new `usage_gate_counter` increment), and no results or attribution appear → AC-2
- [ ] Search a title that matches nothing (e.g. `zzzznosuchjobtitlezzzz`) → `COPY-4` renders, and it carries **no** `role="alert"`, since an empty result is an ordinary outcome and not a failure → AC-4
- [ ] Confirm the empty state is visually and structurally distinct from both the refusal and failure states (no alert role, different sentence) → AC-4
- [ ] Engage the kill switch (`update public.app_settings set kill_switch_enabled = true where id = 1`), then search → the exact `kill_switch_engaged` sentence from `src/lib/usage-gating/copy.ts` renders verbatim, no Adzuna call runs, and zero attribution blocks appear. **Restore the switch afterwards.** Observed during the build → AC-3
- [ ] Exhaust an account's weekly `job_search` cap, then search → the exact `account_week_cap_reached` sentence renders, verbatim from the same map, and no Adzuna call runs → AC-3
- [ ] Restart the app with a deliberately wrong `ADZUNA_APP_KEY` and search → `COPY-5` renders inside a `role="alert"`, distinct from the empty state. Observed during the build → AC-5
- [ ] Force a timeout (throttle or block `api.adzuna.com`) and search → the same failure state renders, and Sentry shows `external_service_failed`, not `response_malformed` → AC-5
- [ ] Serve Adzuna a body that is valid JSON but not the expected shape → the failure state renders and Sentry shows `response_malformed` → AC-5
- [ ] Serve a batch where one listing of several fails its own item parse → the remaining listings render normally and only the bad one disappears; the page does **not** fail → AC-1, AC-5
- [ ] Serve a batch where **every** listing fails its item parse → the failure state renders with `response_malformed` → AC-5
- [ ] On a page of results, count the "Jobs by Adzuna" attribution blocks → exactly one per rendered listing, never one per screen. Observed during the build: 20 blocks for 20 cards → AC-6
- [ ] Measure each attribution block's rendered box (`getBoundingClientRect`) → every one is at least 116 by 23 CSS pixels. Observed during the build: smallest 125.6 by 23 → AC-6
- [ ] Repeat that measurement at a 320 pixel viewport → the floor still holds and the page has no horizontal overflow (`scrollWidth === innerWidth`). Observed during the build → AC-6
- [ ] Click the word "Jobs", then click the Adzuna logo → both open `https://www.adzuna.com`, and the logo carries a real accessible name ("Adzuna") rather than being `aria-hidden` → AC-6
- [ ] Find a listing with a predicted salary → the figure is followed by "(estimated)", and a Jobsworth block sits beside it: an icon measuring exactly 20 by 20, the words "Adzuna Jobsworth", both linked to `http://www.adzuna.co.uk/jobs/salary-predictor.html`, with the mouseover text "Salary estimate powered by Adzuna Jobsworth". Observed during the build → AC-7
- [ ] Find a listing with a **stated** salary → it shows neither "(estimated)" nor any Jobsworth block. Observed during the build (one of twenty) → AC-7
- [ ] Find a listing with no salary at all → no salary line, no "(estimated)", no Jobsworth block, and no dash or placeholder standing in for the figure → AC-7, invariant 7
- [ ] On one result, confirm all of: title, company, location, a relative posted date, a salary range when present, and a description snippet → AC-8
- [ ] Click "View the posting" → it opens the real source posting in a **new tab**, carries `rel="noopener noreferrer"`, and its accessible name names that specific job rather than being the generic visible label → AC-8
- [ ] Confirm a listing missing an optional field (no location, or no snippet) simply omits that row rather than rendering an empty one → invariant 7
- [ ] Note the `usage_gate_counter` value, then reload the results URL, press browser back onto it, and open the same URL in a fresh tab → each is one further gate check and one further Adzuna call, never zero and never two. This cost is intended (Consequences), and this step exists to confirm it is exactly one per render → AC-10
- [ ] Visit `/search?q=a&q=b` → only the first value is used; the two are not joined into one term → security model
- [ ] Visit `/search?q=...` while signed **out** → the `(app)` layout guard sends the visitor to sign in, and no Adzuna call runs → security model
- [ ] Keyboard only: tab through the form and one result card → both fields reach focus with a visible ring and a real label, the submit button is reachable, and both attribution links and the posting link are reachable in order → WCAG 2.2 AA
- [ ] Load `/` signed out → the "What's real today" card lists `filtered search` under **working** and not under `planned` → AC-12
- [ ] Load `/privacy` → Adzuna appears in the recipients list with what it receives and why → AC-11

## Commands

- [ ] `pnpm test` → all unit tests pass, including `src/features/search/adzuna-logo.test.ts` → AC-6
- [ ] `pnpm test:integration` → all integration tests pass against the real stack
- [ ] `pnpm lint && pnpm format:check && pnpm typecheck && pnpm build` → all four clean
- [ ] Break `ADZUNA_WORDMARK_PATH` by one character in `adzuna-logo-geometry.ts`, run `pnpm test` → `adzuna-logo.test.ts` fails. Restore it. Proved on 2026-09-04 → AC-6
- [ ] Remove the `adzuna` entry from `DATA_RECIPIENTS`, run `pnpm test` → `recipients.test.ts` fails on the unclassified `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` keys. Restore it → AC-11
- [ ] Grep `src/app/api/` for any search route → there is none; search never runs through a route handler → Decision
- [ ] Confirm `search.run` and `search.read_prefill` are both registered in `docs/observability/spans.md` and that each opens as the first statement of its function → binding rule 4

## Value sourcing

One step per row of the spec's Value sourcing table, exercising the edge that breaks if the source is wrong.

- [ ] Salary currency: confirm a salary renders as `USD` and that the value comes from `ADZUNA_COUNTRY`, not from Adzuna. Adzuna's response carries **no** currency field at all, so grep the response body for a currency key → there is none. Changing `ADZUNA_COUNTRY` must change the rendered currency → invariant 3
- [ ] Attribution domain: confirm both "Jobs" and the logo point at the domain derived from `ADZUNA_COUNTRY` (`https://www.adzuna.com` for `us`), not a hardcoded string in the component → AC-6
- [ ] Jobsworth link: confirm it is the fixed `adzuna.co.uk` URL and does **not** vary with `ADZUNA_COUNTRY`, since Adzuna's terms state that one without a local domain alternative → AC-7, Follow-up
- [ ] Relative posted date: render a listing whose `created` is under an hour old, one a few days old, and one absent → "posted N hours ago", "posted N days ago", and no date row at all, computed at render and never stored formatted → AC-8
- [ ] Relative posted date across a timezone: run the page with `TZ` set to something far from local (e.g. `Pacific/Kiritimati`) → the relative date stays correct, since it is computed from an elapsed difference rather than from a local calendar day → AC-8
- [ ] Prefill source: change `desired_titles[0]` in the database, reload bare `/search` → the field reflects the new value, proving it reads the row rather than a cached or hardcoded value → AC-9
- [ ] Predicted flag: confirm a listing whose raw `salary_is_predicted` is the **string** `"1"` renders as predicted. Adzuna's own docs example shows a numeric `0`, but the live API returned `"1"` as a string on 2026-09-04, and the schema accepts both. A schema narrowed to the documented numeric form alone would drop every predicted listing → AC-7
- [ ] Inverted salary: serve a listing whose `salary_max` is below its `salary_min` → both figures are dropped rather than rendered inverted, since spec 0003's check constraint would refuse the pair at feature 12's insert → data model

## Acceptance-criteria coverage

- AC-1 · covered by the successful search, the 20 result cap, and the one bad row batch
- AC-2 · covered by the both fields blank step
- AC-3 · covered by the kill switch step and the account week cap step
- AC-4 · covered by the no match step and its distinctness check
- AC-5 · covered by the wrong key, timeout, malformed body, and every item fails steps
- AC-6 · covered by the per listing count, both size measurements, the link targets, and the drift test
- AC-7 · covered by the predicted, stated, and absent salary steps, plus the string flag value sourcing step
- AC-8 · covered by the full field step, the new tab link step, and both relative date steps
- AC-9 · covered by the three prefill steps and the prefill source step
- AC-10 · covered by the reload, back and fresh tab counting step
- AC-11 · covered by the `/privacy` step and the removed entry command step
- AC-12 · covered by the "What's real today" step
