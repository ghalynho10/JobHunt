# Verify: apply redirect and application record · spec 0014 · written 2026-09-05

_Steps derived from spec 0014's acceptance criteria and every row of its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Nothing here has been run yet._

**Setup.** These need a signed in session and the local stack (`pnpm db:start`). A session can be minted without a browser handshake the way the integration suite does it (`test/helpers/session.ts`), then its cookie set on `localhost`. Real `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` must be in `.env.local` for any step that reaches Adzuna.

**Two steps must run against a production build, not `pnpm dev`.** They are marked. `pnpm dev` sends `Cache-Control: no-cache, must-revalidate` so the browser answers navigations from its own cache, which is what made feature 11's back navigation measurement wrong and briefly disproved a correct spec. Run `pnpm build && pnpm start` for those two.

## UI and manual

- [ ] A result card shows `View the posting` and `Mark as applied` as two distinct controls → AC-1
- [ ] Click `View the posting`, return, and query `application` directly: zero rows. Opening a posting records nothing → AC-1
- [ ] Click `Mark as applied` on a real listing → exactly one row lands. Eleven values come from the listing (`source_job_id`, `job_title`, `company_name`, `job_location`, `job_url`, `job_description`, `posted_at`, `salary_min`, `salary_max`, `salary_currency`, `salary_is_predicted`) and each matches what the card displayed; `source` comes from `ADZUNA_SOURCE` and `profile_id` from claims; the three timestamps come from the database → AC-2
- [ ] That same click flips the card to its applied state with the control disabled, without the page re-rendering and without a second Adzuna request → AC-9
- [ ] `profile_id` on that row equals the signed in user's own id, and no form field carried it → AC-2
- [ ] Reload `/applications`: the row is still listed, and no Adzuna request was made (check the network tab and the `job_search` counter) → AC-3
- [ ] Press `Mark as applied` twice on the same listing from two tabs → one row only, and the second attempt shows its own message rather than a generic error → AC-4
- [ ] Delete the caller's `profile` row, then attempt an apply → a visible message naming the profile, carrying a working link to `/profile`, and no raw database error text anywhere on screen → AC-5
- [ ] Apply to a listing whose salary is predicted → `/applications` shows `(estimated)` beside the figure and the Jobsworth badge, and its link target is `http://www.adzuna.co.uk/jobs/salary-predictor.html` with the mouseover text `Salary estimate powered by Adzuna Jobsworth` → AC-7
- [ ] Apply to a listing with a stated salary → `/applications` shows neither the `(estimated)` label nor the Jobsworth badge → AC-7
- [ ] Apply to a listing with no salary at all → the row's `salary_is_predicted` is `null`, and no salary line renders → AC-6, AC-7
- [ ] With three applications listed, count three separate `Jobs by Adzuna` attribution blocks, one per row, not one per page → AC-8
- [ ] Read each attribution's `href` out of the live DOM: the word `Jobs` and the Adzuna mark both point at `https://www.adzuna.com`, and the block is at least 116 by 23 pixels → AC-8
- [ ] With zero applications, `/applications` shows no attribution block at all → AC-8
- [ ] Search again for a job already applied to → the card is visibly marked as applied and its `Mark as applied` control is disabled → AC-9
- [ ] **Production build. READ `## What the build measured` AT THE BOTTOM FIRST: this step's method changed.** Note the `job_search` counters, run one search, mark two results applied, re-read them → they moved by exactly one search, not three. Must be driven from a real browser; a hand built `POST` cannot dispatch the action → AC-10
- [ ] **Production build. See `## What the build measured`.** With the network tab open, mark a result applied → no request to `api.adzuna.com` is made → AC-10
- [ ] **Production build, and this is the step the design's main risk lives in.** Run a search, then leave the tab idle until the access token has expired (or shorten the token lifetime locally to force it), then mark a result applied → the counter still moves by zero, no `Set-Cookie` comes back on the action response, and no second `search.run` span appears. A fresh session passing tells you nothing about this case → AC-10, AC-20
- [ ] Read the apply action's source → it builds its client by passing a read only adapter to `createClient()`, and the reason is written at the call site rather than only in the spec → AC-20
- [ ] **The stale build case, and it costs more than the spec first assumed. See `## What the build measured`.** Apply, then run `pnpm build` again to rotate the encryption key, then press the apply control on the page still open from before → a visible message (`COPY-7`), not a silent no operation and not an unhandled framework error. **Also re-read the `job_search` counters across that press**: a refused dispatch was observed falling back to re-rendering `/search`, which spends a call, so confirm whether the reader is charged for a failure they did not cause → AC-21
- [ ] Force `readAppliedJobIds` to fail, then run a search → the page says the applied state could not be read (`COPY-8`). It must NOT render twenty cards as not applied, which would silently claim something false → AC-9
- [ ] Feed the apply action a listing whose `postedAt` is `"last Tuesday"` → refused by `listingSnapshotSchema` as `validation_failed` before any insert, so no Postgres `22007` reaches Sentry as `database_unavailable` → AC-2
- [ ] Remove an application → the list re-renders without it immediately, confirming `removeApplication` does revalidate and that the apply action's deviation was not copied into it → AC-11
- [ ] Visit the removal confirmation URL directly without submitting → the row is still there. The URL mutates nothing → AC-11
- [ ] The confirmation question names the job title and company, not a bare "are you sure" → AC-11
- [ ] Submit the confirmation → the row is gone from `/applications` and from the table → AC-11
- [ ] Reach the whole apply and remove flow by keyboard alone, with a visible focus ring at every stop, and confirm the disabled applied control is announced as disabled rather than merely looking it → AC-1, AC-9, AC-11
- [ ] `/applications` with no rows keeps its existing sentence and shows a working link to `/search` → AC-17
- [ ] Apply to three jobs in a known order → `/applications` lists them newest applied first, and each row shows title, company, location, salary, snippet, posted date, applied date and a working link out → AC-18
- [ ] The entry page's "What's real today" card lists `application tracking` under `working` and no longer under `planned` → AC-16
- [ ] `/applications` renders correctly at a narrow viewport, and its `Card` containers come from `src/components/ui/` rather than being composed by hand → AC-18

## Commands

- [ ] `pnpm test` green, including the privacy notice drift guard → AC-15
- [ ] `pnpm test:integration` green against the real local stack with real policies → AC-2, AC-4, AC-5
- [ ] `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` all green
- [ ] Temporarily remove the `salary_is_predicted` entry from `STORED_FIELDS` → `pnpm test` fails with the guard's own message naming the column. Restore it. This proves the guard has teeth rather than assuming it → AC-15
- [ ] Insert directly, bypassing the app: `salary_is_predicted` set with no salary figure → refused by `application_predicted_pairing` → AC-6
- [ ] Insert directly: a salary figure with `salary_is_predicted` null → refused by the same constraint → AC-6
- [ ] Insert directly: a duplicate `(profile_id, source, source_job_id)` → refused by the unique constraint, proving the guarantee holds for a caller that never checked → AC-4
- [ ] Insert directly: an `application` naming a `profile_id` that does not exist → refused by the foreign key → AC-5
- [ ] As user A, attempt to select, update and delete user B's application row → all four refused by row level security → AC-19
- [ ] Feed the parser an Adzuna item with an empty `title`, then one with an empty `company.display_name`, then one with an empty `id` → each dropped as a bad row, and a batch where every item is bad still reports `response_malformed` → AC-13
- [ ] **Partly observed already, see `## What the build measured`.** View source on a rendered results page (the **served HTML**, not the JavaScript bundle) and search it for the snapshot field names the card never prints → they are not present in plain text anywhere the action's payload travels. **Read this step's history before running it**: the first version grepped the built client bundle, where the closure never lands at all, so it would have passed identically against unencrypted `.bind()` arguments. That is the verify step shape `docs/reflexes.md` records as having escaped twice → AC-2
- [ ] Every one of `application.record`, `application.remove`, `application.read_list` and `search.read_applied` appears in `docs/observability/spans.md` and opens as the first statement of its operation, above every guard clause → AC-14
- [ ] Force a database failure during a remove that matches zero rows → a reported failure, not a silent success → AC-11

## Value sourcing

Each row of the spec's Value sourcing table, checked against what the running app actually does.

- [ ] `profile_id` comes from verified claims, never a form field → AC-2
- [ ] `source` is imported from `src/features/search/adzuna.ts` rather than re declared as a second string literal → AC-2
- [ ] `job_description` holds the snippet the card displayed, not a full posting body → AC-12
- [ ] `salary_is_predicted` is `null` and not `false` when neither salary figure is present → AC-6
- [ ] `applied_at`, `created_at` and `updated_at` are set by the database, and no application code writes `updated_at` → AC-2
- [ ] The duplicate message is `validation_failed` at `expected` severity in Sentry, never `database_unavailable` → AC-4
- [ ] The missing profile message is `record_not_found` at `expected` severity → AC-5
- [ ] The remove statement narrows by the caller's own `profile_id` in the statement itself, in addition to row level security → AC-11, AC-19
- [ ] The applied marker read is filtered to the `source_job_id` values actually rendered, not the caller's whole application history → AC-9
- [ ] The attribution link target is read from the `ADZUNA_ATTRIBUTION_URL` export, not from a second copy of the URL and not from the module private `ATTRIBUTION_DOMAIN_BY_COUNTRY` map → AC-8
- [ ] Neither feature imports from the other: `src/features/applications/` imports the attribution components, the formatters and the Adzuna constants from their shared homes, and so does `src/features/search/` → AC-7, AC-8, AC-18
- [ ] `applied_at` renders as an absolute date and `posted_at` as a relative one, with `now` injected rather than read inside the component → AC-18
- [ ] The applications feature's `ActionState` carries a distinct applied state, so a successful apply is never indistinguishable from a form that was never submitted → AC-9

## Cross spec corrections

- [ ] Spec 0003's `job_description` claim is corrected at **both** line 118 and line 262 → AC-12
- [ ] Spec 0013's Follow-up item naming only line 118 is itself updated to name both → AC-12
- [ ] Spec 0013's Decision at line 42 carries a visible note that the no client JavaScript claim no longer holds in full → AC-12
- [ ] Spec 0013's `Listing` table at lines 63 to 65 records the non empty guarantee → AC-13
- [ ] Spec 0003's Follow-up items at lines 274 and 275 are ticked, naming AC-5 and AC-6 as what closed them → AC-5, AC-6

## Acceptance criteria coverage

Every one of the 21 acceptance criteria has at least one step. AC-1, AC-6, AC-7, AC-8, AC-9 and AC-11 each have several, because each carries a case that passes trivially if only its happy path is checked: an apply control that records on view, a predicted flag that writes `false` instead of `null`, an attribution rendered once per page instead of once per advert, and a confirmation URL that mutates on visit would each survive a single step.

**Three steps exist because a cross check found the spec could be wrong in ways every other step passes.** The expired session apply (AC-10, AC-20), the stale build apply (AC-21) and the failed marker read (AC-9) each test a condition that a normal run never reaches, and each was added after the first draft. If time is short, these are the last three to drop, not the first: the rest of this file confirms the feature works, and these three are the ones that would tell you it does not.


## What the build measured, and what it could not

_Added 2026-09-05 by `/develop`, from work done against a real production build on a separate port. This section exists because three steps above were written at design time and turned out to be wrong or incomplete about their own method. Read it before running them._

**Confirmed, with numbers.**

- **The closure is genuinely encrypted (AC-2).** A production build's served results page carries the snapshot as a 1388 character ciphertext field (`$ACTION_21:2`). Neither `sourceJobId` nor `salaryIsPredicted`, the two field names the card never prints, appears anywhere in the HTML. The forty `adzuna.com/land/ad/` URLs that do appear are the visible `View the posting` links, which are meant to be there. This is the encryption claim in the Decision, checked rather than inherited from the docs.
- **A search really does move the counters**, by one per counter row. This matters because the first attempt to measure AC-10 read the counters through the Data API and got zero every time: `usage_gate_counter` deliberately carries no row level security policy (spec 0011), so PostgREST cannot see it, and the probe would have "proved" AC-10 whatever the app did. **Read those counters through the direct connection (`test/helpers/database.ts`) or `psql`, never through the Data API.**

**Not confirmed, and this is the honest gap.**

- **A successful apply's cost was never measured end to end.** Next refuses a hand built action `POST` (`Failed to find Server Action`), so the apply cannot be dispatched from `curl` or `fetch`. Everything that stands behind AC-10 today is indirect: the action's own integration tests, and two unit guards that fail if the read only cookie adapter is removed or if a re-render trigger is added to `recordApplication`'s body. Both regressions were driven on purpose to confirm the guards bite. **The end to end measurement needs a real browser and is genuinely still open.**
- **The expired session case is untouched.** It is the one AC-20 exists for and the one a fresh session cannot reveal.

**Found while measuring, and worth more than the measurement.**

A stale build request does not fail quietly. A production server answering one logs `Failed to find Server Action. This request might be from an older or newer deployment.`, rejects the dispatch **before any of this feature's code runs**, and then falls back to re-rendering `/search`, which re-runs the Adzuna search. Two consequences, neither of which spec 0014 anticipated:

1. **AC-21 is not implementable where the spec put it.** `recordApplication` never executes, so it cannot catch or report this. The catch now sits in `ApplyControl` around the call, which is the only place left. It is **not browser verified**.
2. **A stale apply charges the reader a search.** So `COPY-7` is not merely politeness about a dead button: without it the reader loses one of 25 weekly calls and is told nothing. Worth recording in the spec's Consequences, which `/develop` may not write.
