# Verify: apply redirect and application record · spec 0014 · written 2026-09-05

_Steps derived from spec 0014's acceptance criteria and every row of its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

**Run 2026-09-05, twice. 61 of 63 steps ticked, 2 left open on purpose.** The first pass found AC-10 failing and is recorded in `## What /check verify measured`; `/debug` fixed it, `/architect` amended the specs, and the second pass re-drove every step whose method or expected result changed plus a fresh end to end pass, since the fix is in `src/proxy.ts` and that runs on every request. **The two unticked steps are not failures**, they are the two nobody has been able to exercise: forcing `readAppliedJobIds` to fail needs a privilege change this environment refuses, and the forced database failure on a zero row removal is only half covered by the suite (the zero row case is tested, a driver level failure is not). Both are named in the report and belong to `/test`._

**Setup.** These need a signed in session and the local stack (`pnpm db:start`). A session can be minted without a browser handshake the way the integration suite does it (`test/helpers/session.ts`), then its cookie set on `localhost`. Real `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` must be in `.env.local` for any step that reaches Adzuna.

**Two steps must run against a production build, not `pnpm dev`.** They are marked. `pnpm dev` sends `Cache-Control: no-cache, must-revalidate` so the browser answers navigations from its own cache, which is what made feature 11's back navigation measurement wrong and briefly disproved a correct spec. Run `pnpm build && pnpm start` for those two.

## UI and manual

- [x] A result card shows `View the posting` and `Mark as applied` as two distinct controls → AC-1
- [x] Click `View the posting`, return, and query `application` directly: zero rows. Opening a posting records nothing → AC-1
- [x] Click `Mark as applied` on a real listing → exactly one row lands. Eleven values come from the listing (`source_job_id`, `job_title`, `company_name`, `job_location`, `job_url`, `job_description`, `posted_at`, `salary_min`, `salary_max`, `salary_currency`, `salary_is_predicted`) and each matches what the card displayed; `source` comes from `ADZUNA_SOURCE` and `profile_id` from claims; the three timestamps come from the database → AC-2
- [x] That same click flips the card to its applied state with the control disabled, without the page re-rendering and without a second Adzuna request → AC-9
- [x] `profile_id` on that row equals the signed in user's own id, and no form field carried it → AC-2
- [x] Reload `/applications`: the row is still listed, and no Adzuna request was made (check the network tab and the `job_search` counter) → AC-3
- [x] Press `Mark as applied` twice on the same listing from two tabs → one row only, and the second attempt shows its own message rather than a generic error → AC-4
- [x] Delete the caller's `profile` row, then attempt an apply → a visible message naming the profile, carrying a working link to `/profile`, and no raw database error text anywhere on screen → AC-5
- [x] Apply to a listing whose salary is predicted → `/applications` shows `(estimated)` beside the figure and the Jobsworth badge, and its link target is `http://www.adzuna.co.uk/jobs/salary-predictor.html` with the mouseover text `Salary estimate powered by Adzuna Jobsworth` → AC-7
- [x] Apply to a listing with a stated salary → `/applications` shows neither the `(estimated)` label nor the Jobsworth badge → AC-7
- [x] Apply to a listing with no salary at all → the row's `salary_is_predicted` is `null`, and no salary line renders → AC-6, AC-7
- [x] With three applications listed, count three separate `Jobs by Adzuna` attribution blocks, one per row, not one per page → AC-8
- [x] Read each attribution's `href` out of the live DOM: the word `Jobs` and the Adzuna mark both point at `https://www.adzuna.com`, and the block is at least 116 by 23 pixels → AC-8
- [x] With zero applications, `/applications` shows no attribution block at all → AC-8
- [x] Search again for a job already applied to → the card is visibly marked as applied and its `Mark as applied` control is disabled → AC-9
- [x] **Production build. READ `## What the build measured` AT THE BOTTOM FIRST: this step's method changed.** Note the `job_search` counters, run one search, mark two results applied, re-read them → they moved by exactly one search, not three. Must be driven from a real browser; a hand built `POST` cannot dispatch the action → AC-10
- [x] **Production build. See `## What the build measured`.** With the network tab open, mark a result applied → no request to `api.adzuna.com` is made → AC-10
- [x] **Production build, and this is the step the design's main risk lives in. It found a real bug on 2026-09-05; read `## What /check verify measured` before running it.** Run a search, let every prefetch settle, then expire the stored access token (push `expires_at` into the past, or shorten the token lifetime locally), then mark a result applied → the `job_search` counters move by zero and no `x-action-revalidated` header comes back on the action response. **Two method notes, both learned the hard way.** The action `POST` must be the FIRST request after expiry: any ordinary request arriving first, a nav prefetch included, refreshes the session and heals the case before the click, which is exactly how this hid. And do not assert "no `Set-Cookie` on the action response" as the original step did: the proxy legitimately sets one on ordinary requests, so the counter is the honest signal → AC-10, AC-20a
- [x] Read the apply action's source → it builds its client by passing a read only adapter to `createClient()`, and the reason is written at the call site rather than only in the spec → AC-20
- [x] Read `src/proxy.ts` → its `setAll` returns before writing the refreshed cookie onto the response when the request carries `next-action`, the branch reads no route, and the reason plus the trade are written at the branch → AC-20a
- [x] **The stale build case. `rm -rf .next` BEFORE the rebuild or this step silently proves nothing.** Open a results page, then run `rm -rf .next && pnpm build` and restart the server, then press the apply control on the page still open from before → the server logs `Failed to find Server Action`, the browser gets a `404`, and `COPY-7` renders beside a control that stays enabled. Also re-read the `job_search` counters across that press: they must not move. **Why the wipe matters**: `next build` over a populated `.next` reuses the previous `server-reference-manifest.json`, so the encryption key never rotates, the open page is never stale, and the apply simply succeeds. A run on 2026-09-05 did exactly that and concluded the key does not rotate at all; three clean builds then gave three different keys → AC-21
- [ ] Force `readAppliedJobIds` to fail, then run a search → the page says the applied state could not be read (`COPY-8`). It must NOT render twenty cards as not applied, which would silently claim something false → AC-9
- [x] Feed the apply action a listing whose `postedAt` is `"last Tuesday"` → refused by `listingSnapshotSchema` as `validation_failed` before any insert, so no Postgres `22007` reaches Sentry as `database_unavailable` → AC-2
- [x] Remove an application → the list re-renders without it immediately, confirming `removeApplication` does revalidate and that the apply action's deviation was not copied into it → AC-11
- [x] Visit the removal confirmation URL directly without submitting → the row is still there. The URL mutates nothing → AC-11
- [x] The confirmation question names the job title and company, not a bare "are you sure" → AC-11
- [x] Submit the confirmation → the row is gone from `/applications` and from the table → AC-11
- [x] Reach the whole apply and remove flow by keyboard alone, with a visible focus ring at every stop, and confirm the disabled applied control is announced as disabled rather than merely looking it → AC-1, AC-9, AC-11
- [x] `/applications` with no rows keeps its existing sentence and shows a working link to `/search` → AC-17
- [x] Apply to three jobs in a known order → `/applications` lists them newest applied first, and each row shows title, company, location, salary, snippet, posted date, applied date and a working link out → AC-18
- [x] The entry page's "What's real today" card lists `application tracking` under `working` and no longer under `planned` → AC-16
- [x] `/applications` renders correctly at a narrow viewport, and its `Card` containers come from `src/components/ui/` rather than being composed by hand → AC-18

## Commands

- [x] `pnpm test` green, including the privacy notice drift guard → AC-15
- [x] `pnpm test:integration` green against the real local stack with real policies → AC-2, AC-4, AC-5
- [x] `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm build` all green
- [x] Temporarily remove the `salary_is_predicted` entry from `STORED_FIELDS` → `pnpm test` fails with the guard's own message naming the column. Restore it. This proves the guard has teeth rather than assuming it → AC-15
- [x] Insert directly, bypassing the app: `salary_is_predicted` set with no salary figure → refused by `application_predicted_pairing` → AC-6
- [x] Insert directly: a salary figure with `salary_is_predicted` null → refused by the same constraint → AC-6
- [x] Insert directly: a duplicate `(profile_id, source, source_job_id)` → refused by the unique constraint, proving the guarantee holds for a caller that never checked → AC-4
- [x] Insert directly: an `application` naming a `profile_id` that does not exist → refused by the foreign key → AC-5
- [x] As user A, attempt to select, update and delete user B's application row → all four refused by row level security → AC-19
- [x] Feed the parser an Adzuna item with an empty `title`, then one with an empty `company.display_name`, then one with an empty `id` → each dropped as a bad row, and a batch where every item is bad still reports `response_malformed` → AC-13
- [x] **Partly observed already, see `## What the build measured`.** View source on a rendered results page (the **served HTML**, not the JavaScript bundle) and search it for the snapshot field names the card never prints → they are not present in plain text anywhere the action's payload travels. **Read this step's history before running it**: the first version grepped the built client bundle, where the closure never lands at all, so it would have passed identically against unencrypted `.bind()` arguments. That is the verify step shape `docs/reflexes.md` records as having escaped twice → AC-2
- [x] Every one of `application.record`, `application.remove`, `application.read_list` and `search.read_applied` appears in `docs/observability/spans.md` and opens as the first statement of its operation, above every guard clause → AC-14
- [ ] Force a database failure during a remove that matches zero rows → a reported failure, not a silent success → AC-11

## Value sourcing

Each row of the spec's Value sourcing table, checked against what the running app actually does.

- [x] `profile_id` comes from verified claims, never a form field → AC-2
- [x] `source` is imported from `ADZUNA_SOURCE` in `src/lib/adzuna.ts` rather than re declared as a second string literal → AC-2
- [x] `job_description` holds the snippet the card displayed, not a full posting body → AC-12
- [x] `salary_is_predicted` is `null` and not `false` when neither salary figure is present → AC-6
- [x] `applied_at`, `created_at` and `updated_at` are set by the database, and no application code writes `updated_at` → AC-2
- [x] The duplicate message is `validation_failed` at `expected` severity in Sentry, never `database_unavailable` → AC-4
- [x] The missing profile message is `record_not_found` at `expected` severity → AC-5
- [x] The remove statement narrows by the caller's own `profile_id` in the statement itself, in addition to row level security → AC-11, AC-19
- [x] The applied marker read is filtered to the `source_job_id` values actually rendered, not the caller's whole application history → AC-9
- [x] The attribution link target is read from the `ADZUNA_ATTRIBUTION_URL` export, not from a second copy of the URL and not from the module private `ATTRIBUTION_DOMAIN_BY_COUNTRY` map → AC-8
- [x] Neither feature imports from the other: `src/features/applications/` imports the attribution components, the formatters and the Adzuna constants from their shared homes, and so does `src/features/search/` → AC-7, AC-8, AC-18
- [x] `applied_at` renders as an absolute date and `posted_at` as a relative one, with `now` injected rather than read inside the component → AC-18
- [x] The applications feature's `ActionState` carries a distinct applied state, so a successful apply is never indistinguishable from a form that was never submitted → AC-9

## Cross spec corrections

- [x] Spec 0003's `job_description` claim is corrected at **both** line 118 and line 262 → AC-12
- [x] Spec 0013's Follow-up item naming only line 118 is itself updated to name both → AC-12
- [x] Spec 0013's Decision at line 42 carries a visible note that the no client JavaScript claim no longer holds in full → AC-12
- [x] Spec 0013's `Listing` table records the non empty guarantee on `sourceJobId`, `title` and `companyName` (rows 71 to 73 today; the correction pass's own block quote shifted them down from 63 to 65, so search by field name rather than by line) → AC-13
- [x] Spec 0003's Follow-up items at lines 274 and 275 are ticked, naming AC-5 and AC-6 as what closed them → AC-5, AC-6

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

> **THIS SECOND POINT WAS DISPROVED on 2026-09-05, hours after it was written.** It holds only for the hand built `POST` it was measured on. A real browser against a genuinely stale build gets a `404` and moves no counter; see `## What /check verify measured` below. The point is left standing rather than edited away because the limit it stated on its own evidence is what made it cheap to settle.


## What `/check verify` measured in a real browser, 2026-09-05

_Run against `pnpm build && pnpm start` on port 3100, driven by Playwright with a session minted the way the integration suite mints one (`test/helpers/session.ts`), counters read through the container's own `psql` and never through the Data API. Seven real Adzuna calls were spent out of the 25 weekly. No box above is ticked, because the run found a failure._

### The one that failed, now fixed

> **FIXED the same day by `/debug`, and the spec amended by `/architect`.** Root cause: `src/proxy.ts` wrote the refreshed session cookie onto the action response. It now withholds it on a request carrying the `next-action` header while still handing it to that request's own code. Re-measured against a clean production build: the counter moved only for the page load, the row landed, and no `x-action-revalidated` came back. Locked by `test/integration/proxy-action-refresh.test.ts`, which was proved to fail without the fix. Recorded as spec 0014 **AC-20a**, spec 0008 **AC-10b**, and a third item on spec 0001's binding rule 6 amendment. **The finding below is kept in full as the record of what was measured, not edited away.**

**AC-10 does not hold for a session whose access token has expired, and AC-20's measure is not what closes it.**

Measured twice, both times the same. With a fresh token, an apply moves the `job_search` counters by zero: one search then two applies left all three counter rows at exactly `1`, and the action response carried no `x-action-revalidated` header. With the browser's stored `expires_at` pushed two hours into the past (a real refresh token, which is what a tab idle past expiry holds), the same click moved every counter row by one, twice out of two attempts (`1` to `2`, then `3` to `4`), and the action response carried `x-action-revalidated: 1` plus the `pragma: no-cache` and `expires: 0` pair that `@supabase/ssr` hands its adapter when it writes an auth cookie. A plain navigation with the same expired token moved nothing, so the cost belongs to the apply and not to the refresh.

Those two headers appear on the expired action responses and on no other request in the run, which points at `src/proxy.ts` as the cookie writer: the proxy runs on the action `POST` too, calls `getClaims()`, and copies the library's cache control headers onto the response. `readOnlyCookieAdapter` closes the door inside `recordApplication`, which is a door the measurement never found open. The one that is open is upstream of the action, in a file AC-20 does not mention.

### AC-21 is met, and the step above needs one correction to its method

**`COPY-7` renders on a genuinely stale build, and the reader is NOT charged a search.** A page was opened from one build, then `.next` was wiped, the project rebuilt, and the server restarted on the new build, which is what a deploy does. Pressing the still enabled apply control on that open page: the server logged `Failed to find Server Action "40bd7d37bd..."`, the browser received a `404`, no row was written, the control stayed enabled rather than flipping to a false applied state, and the alert beside it read `This page is out of date. Refresh and try again.` So `ApplyControl`'s catch does its job, and this is now browser verified.

**The counters did not move across that press**, which corrects the second consequence recorded in `## What the build measured`. The counter rows stood at `7` before and `7` after. The refused dispatch answers `404` rather than falling back to re-rendering `/search`, so the hydrated path does not spend a call. The earlier "a stale apply charges the reader a search" observation came from a hand built `POST` without JavaScript, and that fallback is specific to that request shape. **`COPY-7` is worth keeping, but as politeness about a dead button, not as compensation for a stolen call.**

**The step above must wipe `.next` first, and this run got that wrong the first time.** `package.json`'s build script is a plain `next build` with no clean step, and `server-reference-manifest.json` is an ordinary build output that a rebuild over a populated `.next` will reuse. A first pass here rebuilt three times without wiping, read a byte identical `serverActionsEncryptionKey` each time, watched a stale page apply successfully, and concluded that the key does not rotate. It was a measurement artifact: `.next/cache/` still held files from six days earlier. With `rm -rf .next` before each build, three builds gave three different keys (`O8H4/ddK…`, `SH7jNypP…`, `rHntTZMw…`), and the deploy above then produced the refusal on the first try. **The spec's premise was right all along.** Recorded here because the failed version of this measurement is the more instructive one: it produced a confident, wrong finding that read exactly like a real one.

### The two that could not be exercised

- **The failed applied marker read (`COPY-8`, AC-9).** Forcing it needs `readAppliedJobIds` to error, and the only route from outside the code, revoking `select` on `application` from `authenticated`, was refused by this environment. Worth knowing while it stays unproven: **no test covers that branch either.** `src/app/(app)/search/page.test.ts` stubs `readAppliedJobIds` to a success on every path, and nothing anywhere asserts `SEARCH_COPY.appliedReadFailed` renders.
- **A removal that matches zero rows.** Covered by the passing integration test rather than driven here; a bogus `?remove=` id simply renders the ordinary list with no confirmation, which is sane but is not the same check.

### Everything else held, and these are the measurements worth keeping

- One apply wrote one row whose eleven snapshot values each matched what the card displayed, with `profile_id` from claims and `applied_at`, `created_at` and `updated_at` identical and database set.
- `/applications` rendered six rows newest applied first and moved no counter, so the record really does survive without spending a call.
- A second apply to the same job from a second tab wrote no row and said `You've already marked this job applied.` in its own `role="alert"`.
- A caller with no `profile` row (dev-three, used instead of deleting dev-one's row) got `Set up your profile before you can apply to jobs.` with a working link to `/profile`, and no Postgres text anywhere on screen.
- Attribution rendered once per row, never once per page, each block measured at 126 by 28 pixels against the `min-w-[116px] min-h-[23px]` floor, with the word `Jobs` and the mark both at `https://www.adzuna.com`. Jobsworth rendered at exactly 20 by 20 with the words `Adzuna Jobsworth`, `title="Salary estimate powered by Adzuna Jobsworth"`, linked to `http://www.adzuna.co.uk/jobs/salary-predictor.html`.
- A stored non predicted salary rendered the figure with neither `(estimated)` nor the badge; a row with no salary rendered no salary line at all. Both rows were inserted directly to reach states Adzuna's own data did not offer: all twenty listings in the search came back predicted.
- The served production HTML carried twenty opaque payloads of about 1414 characters each and zero plaintext occurrences of `sourceJobId`, `source_job_id`, `salaryIsPredicted` or `salary_is_predicted`. `title` and `companyName` do appear, as `ApplyControl` props, and both are printed on screen.
- Every stop in the apply and remove flow was keyboard reachable with a 2px `rgb(41, 115, 115)` `:focus-visible` ring at 2px offset, both removals were completed by keyboard alone, and an applied control carries a real `disabled` attribute plus a `role="status"` naming the job.
- The privacy notice guard was watched failing first: dropping `salary_is_predicted` from `STORED_FIELDS` failed `stored-fields.test.ts` with its own message naming the column, and the entry restored it.
- Against the live schema: the flag with no salary, the salary with no flag, the duplicate and the absent `profile_id` were each refused, a valid predicted row was accepted as a control, and user A could not select, update, delete or plant a row for user B while user B saw their own.
- The AC-13 empty field cases were driven through `searchListings()` against the recorded fixture: an empty `title`, a whitespace only `title`, an empty `company.display_name` and an empty `id` were each dropped while the good item survived, and a batch where every item had an empty title came back `response_malformed`. **The committed suite has no test for any of these**; the file that proved it was a throwaway and is gone.

### One wording note

The Value sourcing step reading "Neither feature imports from the other" is contradicted by the spec's own Decision. `src/features/search/result-card.tsx` imports `ApplyControl` and `recordApplication` from `src/features/applications/`, which is exactly the inline closure shape the Decision requires. What the step means and what holds is the narrower claim: the attribution components, the formatters and the Adzuna constants each come from their shared home in both features, and neither reaches into the other for them.
