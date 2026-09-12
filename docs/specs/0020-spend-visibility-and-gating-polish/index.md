# 0020. Spend visibility and gating polish

**Date**: 2026-09-11 (revised 2026-09-12)
**Status**: In Progress

## Summary

This spec lets a signed in user see their own job search usage against their weekly cap, right on the search page, before a refusal ever surprises them. The two other goals feature 28 named, gating a new call type by default and keeping the kill switch a last resort, are already true of the code as it stands today, verified line by line rather than assumed, so this spec builds only the one thing that was actually missing. It also fixes a stale claim in the privacy notice about the same tables this one makes visible.

**Revised 2026-09-12, after `/check verify` drove the built feature.** The first version left one thing undecided: what the line should show on a render that runs a search, when that search's own call has not been counted yet. The built code read usage and ran the search as siblings, so the search render always showed the count from before its own search. At the cap boundary that is not a rounding error, it is the failure this spec exists to prevent: an account at 24 of 25 ran its last allowed search, the page said `Searches used this week: 24 of 25`, and the next search was refused. The revision decides that question: `SearchPage` awaits the search and hands the result to `UsageNotice` as a prop, so the one existing read cannot run until the search has been counted. It also corrects AC-10, which claimed to fix two user facing sentences when only one of the two is rendered anywhere.

## Requirements

**User stories**:
- As a signed in user, I want to see my own remaining search allowance before I search, so a refusal is information I already had, not a surprise.
- As the operator, I want the privacy notice to keep describing these two tables accurately, so it never states something the code has stopped doing.

**Acceptance criteria**:
- **AC-1**: A signed in user visiting `/search` sees their own `job_search` usage against their account week cap (for example "18 of 25 searches used this week") on every render of that page, bare visit or with results, read live from the database rather than a client held or hardcoded number. **On a render that runs a search, the number counts that search.** A render may never show a figure that predates its own call, because the one moment the line is read hardest is straight after a search, and a number that lags by one tells a person at their last allowed search that another remains. This covers the account week window only, the one reason a person's own past searches affect; the other four refusal reasons (the two app wide caps and the two kill switch states) are not previewed here and stay exactly as legible as they already are, a plain sentence at the moment of refusal.
- **AC-2**: The shown number is `usage_gate_counter.consumed_count`, never `attempt_count`. `attempt_count` also counts refused attempts, which spent no budget, so showing it would overstate how much of the cap is actually gone.
- **AC-3**: A caller with no `usage_gate_counter` row yet for the current week, nobody has searched this week, sees the cap's full remaining amount (for example "0 of 25"), never an error and never a newly created row. The read path performs no insert or update of any kind, unlike `check_usage_gate` itself.
- **AC-4**: The read path computes the account week's `period_start` with the exact same UTC expression `check_usage_gate` uses, `pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'utc')::date` (schema qualified, since the new function is `set search_path = ''` too), so the number shown and the number enforced can never disagree at a week boundary.
- **AC-5**: The cap value shown is read live from `usage_cap`, never a literal in application code, so an operator's no deploy change to the cap shows up on the next render.
- **AC-6**: A failure to read usage renders a visible inline notice and does not block the search form or the rest of the page from rendering. No silent zero, no silent hiding.
- **AC-7**: The read function derives the caller's account from `auth.uid()` inside itself, never from a parameter, and the TypeScript wrapper verifies the caller with `getClaims()` before calling it, the same defense in depth pattern `checkUsageGate()` already uses. One account's usage is never visible to another.
- **AC-8**: No new grant is added on `usage_gate_counter`; it stays reachable only through a `security definer` function, by construction. `usage_cap`'s existing `select` grant to `service_role`, for dashboard debugging, is unchanged.
- **AC-9**: v1 shows `job_search` usage only, and this is a proven choice, not a deferred one. `src/features/search/adzuna.ts`'s `RESULTS_PER_PAGE` is exported so a test can import the real value rather than a copied literal. That test, run against the real `usage_cap` rows (an integration test, since the caps are no deploy editable per AC-5 and a unit test could only pin the migration's seed values), asserts that `ai_scoring`'s and `ai_check`'s own caps stay at or above `job_search`'s own cap times `RESULTS_PER_PAGE`, for all three window scopes (account week, global day, global month), not only the one this feature displays. That arithmetic is what guarantees `job_search`'s own cap always binds at or before either AI tier's, so showing it alone tells the whole truth about what will actually stop the caller. The test failing, or an operator changing a cap value so it no longer holds, is the signal to revisit this scope.
- **AC-10**: `src/features/legal/stored-fields.ts`'s description of `usage_cap` and of `usage_gate_counter.call_type` no longer states or implies these tables count job search calls only. Migration `20260906120000_model_client_router_usage_cap.sql` added `ai_scoring` and `ai_check` rows to the same tables, and neither description was updated to say so. **Corrected 2026-09-12: only ONE of the two is user facing.** This criterion and the Summary both used to say "two sentences in the privacy notice", which is wrong and was caught by `/check verify` reading the rendered page rather than the source. `usage_gate_counter.call_type`'s `describedAs` does render on `/privacy`. `usage_cap`'s text is `NON_PERSONAL_TABLES[].why`, whose only reader is `src/features/legal/stored-fields.test.ts`; it reaches no user facing surface at all. Both corrections are still required, because the registry is what a later reader of the codebase trusts, but only the `call_type` one can be confirmed by reading `/privacy`, and the `usage_cap` one must be confirmed at its source.
- **AC-11**: On a render that runs a search, `UsageNotice`'s read is ordered after that search by a data dependency, not by statement order. `SearchPage` awaits `searchListings()` and passes the resolved result to `UsageNotice` as a prop; the `get_job_search_usage_summary()` call lives inside `UsageNotice`, so it cannot begin until that prop exists. A refactor cannot reorder it without moving the read out of the component and back up the tree.
- **AC-12**: One mechanism serves every render. The number always comes from `get_job_search_usage_summary()`, on the bare visit and the search render alike. There is no second source and therefore no rule deciding which applies, which is what keeps the five refusal reasons, `validation_failed`, and every failure path correct without a special case for each.
- **AC-13**: The figure shown after a search that was allowed counts that search; the figure shown after a search that was refused, for any of the five reasons, is unchanged by it, which is the true position in both cases. The boundary case is the test that matters: an account one below its cap runs its last allowed search, and the line must read the post increment figure, never the figure that implies another search remains.
- **AC-14**: A search that passes the gate and then fails at Adzuna still shows the incremented figure. This is the path where somebody spent budget and got nothing, so a line that under reported here would be wrong in the most costly direction. It falls out of AC-11 for free, since the read runs after the search resolves whatever the outcome, and it is stated separately because `withUsageGate()` discards the gate decision on that path and an implementation carrying the number through the decision instead would silently lose it.
- **AC-15**: An integration test proves `anon` cannot execute either `security definer` function, `check_usage_gate` and `get_job_search_usage_summary`. Neither grant is pinned by any test today: spec 0011's scenarios exercise the wrapper's session handling rather than the grant, and this feature's own function had its ACL checked once by hand during verification, which proves nothing about tomorrow. This criterion is kept from the dropped gate option because the gap it closes was never specific to that option.

Clauses 2 and 3 of feature 28's own Done when, gating a new call type by default and the kill switch staying a last resort, are verified already true against the running code (see Context) and need no acceptance criteria here, since nothing is being built for them.

## Decision

**Chosen option**: Option 1: a new, strictly read only `security definer` function.

A signed in user's own usage reaches the page through a new Postgres function, `get_job_search_usage_summary`, that mirrors `check_usage_gate`'s own shape: it derives the caller from `auth.uid()` internally, computes `period_start` with the identical expression, and returns only `job_search`'s account week window `consumed_count` and the matching `cap_value`. It takes no parameter: a cross check on this design found that a `call_type` parameter would let any signed in caller read `usage_cap` and the `configured` state for a call type this feature never shows, a wider readable surface than the unchanged table grants suggest. The function reads `job_search` only, by construction, the same closed by design treatment `UsageGateReason` already gets in `gate.ts`; showing a second call type later is a spec change, not a parameter another caller could reach. Neither `usage_gate_counter` nor `usage_cap` gets a new grant or a new row level security policy.

### Second decision, added 2026-09-12: where the number comes from on a search render

**Chosen option**: `SearchPage` awaits the search, and `UsageNotice` reads for itself afterwards, held in that order by a data dependency.

`searchListings()` lifts out of `SearchResults` and into `SearchPage`, which awaits it. The resolved result passes down to `UsageNotice` as a prop. `UsageNotice` keeps its own `get_job_search_usage_summary()` call and performs it inside itself, which means it cannot run until the prop exists, which means it cannot run until the search has resolved and its gate call has committed. One mechanism covers every render: the bare visit, the allowed search, all five refusals, and every failure.

**What makes this correct, and why it is not the page level sequencing that was rejected.** The two look alike and are not. Sequencing put the ordering in the order of two statements inside `SearchPage`, where a later edit folding the usage read into that page's existing `Promise.all` would silently undo it. Here the ordering is held by a **data dependency**: `UsageNotice` cannot render until `SearchPage`'s `await` resolves, because its prop is that awaited value, and the read lives inside the component. There is no statement to reorder. Undoing this would mean hoisting the read out of `UsageNotice` and back up the tree, which is a deliberate structural change rather than a plausible tidy up. That distinction is the whole reason this option was chosen over sequencing, and anyone revisiting it should see the difference before treating the two as the same idea.

The underlying read is correct for the same reason sequencing was: PostgREST commits each RPC before it responds and this project runs no read replica, so a read issued after `searchListings()` resolves cannot miss the increment. Read after commit is not a race. What was missing before was anything forcing the read to happen after; the data dependency supplies it.

**Why the gate returning its own count was dropped, which is the non obvious part.** The obvious framing, that `check_usage_gate` already computes the new `consumed_count` atomically and could just return it, is genuinely attractive and will be proposed again by anyone who has not read this paragraph. It was chosen first, then dropped on one fact found by a cross check: **returning the count from the gate does not remove the second read, it adds a first one.** Three paths have no gate figure to return, verified in the code rather than reasoned about:

- Both kill switch refusals return at `src/lib/usage-gating/gate.ts:135` and `:139`, before the `.rpc()` call at `:149`. Two of the five refusal reasons never reach the SQL function at all.
- `validation_failed` (both search fields blank) returns from `searchListings()` before its `withUsageGate()` call, so no gate call happens on a render that `hasQuery` still reports as a search.
- `withUsageGate()` discards the decision when the wrapped call fails (`src/lib/usage-gating/with-usage-gate.ts:50`), so a search that passed the gate, spent budget, and then failed at Adzuna loses the figure entirely. That is the one path where a person paid for nothing, which is precisely where the number matters most.

On all of those, `UsageNotice` has to read for itself regardless. So the gate option ships two mechanisms plus a rule choosing between them, and pays for that with a drop and recreate of the atomic gate (Postgres cannot change a return type in place), an amendment to `Accepted` spec 0011, two fields on `UsageGateDecision` that `ai_scoring` and `ai_check` carry and ignore, and edits to four test files whose assertions pin the decision shape exactly. Its remaining advantage is provenance, knowing what one specific call cost rather than what the counter now reads, and no surface in this product consumes that. The cost is real and the benefit is currently unused, so it was dropped. If a future feature genuinely needs per call provenance, that is the moment to revisit it, not before.

A second collision would have made the gate option worse still: naming its output columns `consumed_count` and `cap_value` clashes with the six unqualified references to `consumed_count` already in the function body, and plpgsql raises `column reference "consumed_count" is ambiguous` at runtime. Reproduced against this project's own database. Recorded here so a later revisit starts from the real cost.

**How the prop satisfies lint, decided here rather than left to the build.** The prop is deliberately never read: its only job is to be an awaited value, so that TypeScript refuses to render `UsageNotice` before `SearchPage`'s `await` has resolved. That shape trips `@typescript-eslint/no-unused-vars`, which is on at warn for this file, and `pnpm lint` runs `--max-warnings=0`, so it fails the build. Three resolutions were checked against the real config rather than argued about, and two of them are dead:

- Renaming to `_searchResult` does **not** work. The rule is configured as a bare severity with no options, so no `argsIgnorePattern` exists and the underscore has no meaning to it. Verified by linting the exact shape: `'_searchResult' is defined but never used`. This is a mechanical fact, not a style preference, and it is recorded because the underscore is the first thing anyone will try.
- An `eslint-disable` comment would be the first in `src/`. There is no house precedent, and creating one to silence a rule that is correctly describing the code is the wrong direction.
- **Chosen: `void searchResult;` as the component's first statement, with a comment saying why.** It is a real reference, so the rule is satisfied with no disable and no rename (verified: lints clean). It keeps the prop required and awaited, so the type level guarantee survives intact, which is the property the whole option rests on.

The runner up was to pass the search **promise** rather than the awaited value and `await` it inside `UsageNotice`, which uses the prop honestly and reads more naturally. It was not chosen because it converts the guarantee from something the type system enforces into a single deletable line, which is a smaller version of the fragility this option was picked to avoid. `void` looks stranger and holds the guarantee harder; on a codebase that already explains its load bearing lines in comments, that is the better trade.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Feature design

**Data model sketch**: no new tables and no new columns. Both `usage_cap` and `usage_gate_counter` keep row level security enabled and forced with zero policies, exactly as spec 0011 shipped them; this feature adds one new function, nothing else, to their read surface.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `get_job_search_usage_summary` (Postgres function, called through `.rpc()`) | RPC | none | `configured: boolean`, `consumed_count: integer \| null`, `cap_value: integer \| null`, `period_start: date \| null` | `authenticated`, `security definer`, `auth.uid()` read internally, never a client supplied identity | never raises to signal a normal outcome; `configured: false` means `job_search` is missing one or more of its three `usage_cap` rows, the same all or nothing rule `check_usage_gate` already applies |
| `getJobSearchUsageSummary()` (`src/lib/usage-gating/queries.ts`) | server function | none | `Result<{ consumedCount: number; capValue: number; periodStart: string }>` | verifies the caller with `getClaims()` before calling the RPC | `session_missing`, `usage_gate_misconfigured`, `database_unavailable` |
| `searchListings()` (`src/features/search/adzuna.ts`) | server function | `{ title, location }` | unchanged. No signature change: the whole point of the chosen option is that the number does not travel with the search result | unchanged | unchanged |
| `UsageNotice` (`src/features/search/usage-notice.tsx`) | server component | `searchResult`, the awaited result of this render's search, or `undefined` on a bare visit | the rendered line, or `COPY-2` | its own `getJobSearchUsageSummary()` call, which verifies the caller | unchanged. The prop is what orders the read (AC-11); the component does not read any value out of it |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `getJobSearchUsageSummary()` | `consumed_count` for `job_search`, account week | `usage_gate_counter.consumed_count` where `call_type = 'job_search'`, `scope = 'account'`, `profile_id = auth.uid()` (derived inside the function), `period = 'week'`, `period_start` computed with the identical UTC expression `check_usage_gate` uses |
| `getJobSearchUsageSummary()` | `cap_value` for `job_search`, account week | `usage_cap.cap_value` where `call_type = 'job_search'`, `scope = 'account'`, `period = 'week'` |
| `getJobSearchUsageSummary()` | `configured` flag | whether `job_search` still has all three required `usage_cap` rows (account/week, global/day, global/month), the same all or nothing check `check_usage_gate` performs, even though only the account/week value is ever returned |
| `getJobSearchUsageSummary()` | account identity | `auth.uid()`, read inside the `security definer` function itself, never a parameter |
| `getJobSearchUsageSummary()` (TS wrapper) | caller verification | `getClaims()`, run before the RPC call, matching `checkUsageGate()`'s own pattern |
| the rendered line | the sentence shown | `COPY-1` below, interpolating `consumedCount` and `capValue` |
| the failure state | the sentence shown | `COPY-2` below |
| where it renders | placement on the page | `src/app/(app)/search/page.tsx`, inside `SearchPage`, above the `hasQuery` conditional (the conditional begins at today's line 94; re read rather than trusting that number, since the revision below moves this code), so it renders on a bare visit and with results alike, never only after a search |
| the line, on EVERY render | `consumedCount`, `capValue` | `get_job_search_usage_summary()`, always. One source, no branch (AC-12). What differs between a bare visit and a search render is only WHEN the call runs, never where the number comes from |
| the ordering of that read against this render's own search | the guarantee itself | the `searchResult` prop on `UsageNotice` (AC-11). `SearchPage` awaits `searchListings()`, so the prop cannot exist until the gate call has committed, and the read lives inside the component that receives it. Nothing is read OUT of the prop; its only job is to exist |
| the figure beside a refusal, for any of the five reasons | `consumedCount` | the same read. A refusal consumed nothing, so the current value is already the correct one, including on the two kill switch reasons that never reach `check_usage_gate` at all |
| the figure after a search that spent budget then failed at Adzuna | `consumedCount` | the same read, which runs after `searchListings()` resolves whatever its outcome, so the increment is included (AC-14) |

**Copy**: text left for the engineer to write, matching the convention this project already uses for user facing sentences.

| Slot | Shown when | Text |
|---|---|---|
| `COPY-1` | usage read succeeds | _to be written; must name the window (this week), state consumed against cap with the two real numbers, and read as ambient status rather than a warning_ |
| `COPY-2` | usage read fails | _to be written; must say the number could not be loaded right now, and must not imply zero usage or a working search is also broken_ |

**Key invariants**:
- The read path is strictly read only. `get_job_search_usage_summary` contains no `insert`, `update`, or `delete` statement anywhere in its body, unlike `check_usage_gate`, which upserts window rows into existence as part of deciding.
- `period_start` is computed with the exact same expression `check_usage_gate` uses. If the two ever diverge, the number shown and the number enforced disagree at the one moment, a week boundary, a usage display is most likely to be read.
- The comparison always uses `consumed_count`, never `attempt_count` (AC-2).
- `usage_gate_counter` stays reachable only through a `security definer` function, by construction: this migration adds no grant to `anon`, `authenticated`, or `service_role` on that table. `usage_cap` keeps its existing, unrelated `select` grant to `service_role` for dashboard debugging; the new function reads it through its own definer privilege, not through a widened grant. These are two different facts about two different tables, not one shared claim.
- A render never displays a usage figure that predates its own search. This is the invariant the whole 2026-09-12 revision exists to hold.
- The `searchResult` prop is never read, and that is correct, not an oversight. `void searchResult;` is what keeps lint quiet; deleting that line to "clean up" takes the prop with it and the guarantee with the prop.
- What holds it is the `searchResult` prop, not the order of statements. If `UsageNotice`'s read is ever hoisted out of the component, or the prop stops being an awaited value, the guarantee is gone even though the code still looks right. That is the one edit a reviewer of this feature should watch for.
- `UsageNotice` has exactly one read, used on every path. A second source appearing here, for any reason, reintroduces the class of bug this revision fixed, because two sources need a rule choosing between them and that rule is where the missed paths hide.
- Neither `security definer` function is executable by `anon`. Pinned by a test (AC-15) rather than by a grant somebody read once.
- Showing `job_search` alone is correct only because of today's cap values, not as a structural guarantee: `ai_scoring` and `ai_check` each spend at most one call per listing, `RESULTS_PER_PAGE` (20) listings are fetched per search, and both AI tiers' account week caps (500) equal `job_search`'s own account week cap (25) times 20. A test pins this relationship (AC-9); if either side of it ever changes, the test fails and this scope decision needs a fresh look, not a silent drift.

**Security model**: identical in shape to `check_usage_gate`'s own. `get_job_search_usage_summary` is `security definer`, `set search_path = ''`, `execute` revoked from `public` and granted to `authenticated` only. The account scope is `auth.uid()`, read inside the function, never a client supplied value; `getJobSearchUsageSummary()` additionally verifies the caller with `getClaims()` first, the same defense in depth every existing reader in this codebase already follows. A signed out caller never reaches `getJobSearchUsageSummary()` at all.

The 2026-09-12 revision changes no security property at all. No function is created, altered, or recreated; no grant moves; `check_usage_gate` is not touched. The change is entirely in which React component performs an existing call and when. The one security item it adds is AC-15's test, which pins a grant that was already correct but unproven on both `security definer` functions.

**Configuration required**: none. No new environment variable and no new secret.

**Critical test scenarios**, driven through the Data API with a real minted test session, matching spec 0011's own convention, never through `test/helpers/database.ts` as the acting identity:
- Happy path: a minted account with some `job_search` usage already recorded this week reads back the exact `consumed_count` and `cap_value` through the real RPC, verifies **AC-1**, **AC-2**, **AC-5**.
- Read only proof: a fresh minted account with no `job_search` calls this week reads back `consumed_count = 0`, and a direct database check afterward (via `test/helpers/database.ts`, only to observe, never to act as the caller) confirms no `usage_gate_counter` row was created as a side effect of the read, verifies **AC-3**.
- Week boundary consistency: the two `period_start` expressions, this function's and `check_usage_gate`'s, are proven to agree for the same instant, verifies **AC-4**.
- Auth: a caller with no valid session gets `session_missing` before any RPC call happens, and a second account can never read a first account's usage, verifies **AC-7**.
- Failure case: a forced RPC failure renders the visible inline notice and the search form still renders underneath it, verifies **AC-6**.
- The boundary case, driven end to end, verifies **AC-11**, **AC-13**. An account seeded to one below its cap runs its last allowed search; the rendered line must read the post increment figure (`25 of 25`, not `24 of 25`), and the following search must be refused. This is the exact scenario `/check verify` used to find the defect on 2026-09-11, so it is the one that proves the fix rather than merely exercising it. A test that only asserts the number moved would pass against the old code too.
- Bare visit, verifies **AC-12**: the line renders with no search having run, through the same read.
- A refused search render, verifies **AC-13**'s refused half: the figure is unchanged and states the true cap position beside the refusal. Drive at least one KILL SWITCH refusal here, not only a cap refusal, because the kill switch path never reaches `check_usage_gate` and is the path the dropped option would have got wrong.
- A search that passes the gate and then fails at Adzuna, verifies **AC-14**: the figure includes the increment even though the search returned a failure and the gate decision was discarded.
- Grant retention, verifies **AC-15**: `anon` cannot execute `check_usage_gate` or `get_job_search_usage_summary`.
- Integration test, against the real `usage_cap` rows: the cap arithmetic invariant behind **AC-9**, `ai_scoring`'s and `ai_check`'s caps each at or above `job_search`'s own cap times `RESULTS_PER_PAGE`, checked for all three window scopes (account week, global day, global month), not only the one this feature displays.

## Build plan

Tracer Bullet, this project's own build approach: the whole read path, database to page, is built as one thin end to end slice, since the display scope decision (job_search only) already keeps this to a single counter.

1. [x] Migration: add `get_job_search_usage_summary()`, taking no parameter, `security definer`, read only, matching `check_usage_gate`'s hardening (`set search_path = ''`, `execute` revoked from `public`, granted to `authenticated`), and its `period_start` expression exactly. No new grant on `usage_gate_counter`. Satisfies **AC-3**, **AC-4**, **AC-7**, **AC-8**.
2. [x] Build `getJobSearchUsageSummary()` in `src/lib/usage-gating/queries.ts`: `getClaims()` verification, the RPC call wrapped in `attempt()`, the response parsed with Zod rather than trusted (matching `gate.ts`'s own treatment of `check_usage_gate`'s row), a named span `usage_gate.read_summary` opened first and registered in `docs/observability/spans.md` (binding rule 3). Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-7**.
3. [x] Write `COPY-1` and `COPY-2`. Satisfies **AC-1**, **AC-6**.
4. [x] Build the rendered notice in `src/features/search/`, calling `getJobSearchUsageSummary()` and wired into `SearchPage` above the `hasQuery` conditional in `src/app/(app)/search/page.tsx`, a plain `await`, no `Suspense` boundary of its own since the read is fast and unrelated to the slower scoring path already Suspended below it. Satisfies **AC-1**, **AC-6**.
5. [x] Export `RESULTS_PER_PAGE` from `src/features/search/adzuna.ts`, then write the cap arithmetic invariant test as an integration test that reads the real `usage_cap` rows through the Data API (never the direct database helper) and imports the real `RESULTS_PER_PAGE`, asserting the relationship for all three window scopes. Satisfies **AC-9**.
6. [x] Correct `src/features/legal/stored-fields.ts` lines 76 and 370 so neither claims or implies `usage_cap` or `usage_gate_counter.call_type` count job search calls only. Satisfies **AC-10**.
7. [x] Integration tests: the Critical test scenarios above, covering **AC-1** through **AC-8**.

### Revision slice, added 2026-09-12

Steps 1 to 7 above are built and committed. These continue the same Tracer Bullet thread: the path already runs end to end, so this slice moves one segment of it rather than standing anything new up beside it. No migration, no SQL change, no new function.

8. [ ] Lift the search call and pass it down: move `await searchListings()` from `SearchResults` into `SearchPage`, give `UsageNotice` a `searchResult` prop carrying that awaited value (`undefined` on a bare visit), and pass the already resolved result into `SearchResults` rather than letting it fetch. `UsageNotice` keeps its own `getJobSearchUsageSummary()` call, unchanged, inside itself. Nothing reads a value out of the prop; it exists to order the render, so the component opens with `void searchResult;` and a comment saying why (see the Decision: the underscore rename does not work here and a disable comment would be the first in `src/`). Satisfies **AC-1**, **AC-11**, **AC-12**, **AC-13**, **AC-14**.
9. [ ] Tests: the boundary case end to end, a kill switch refusal render, a search that fails at Adzuna after passing the gate, and the bare visit. Each asserts the rendered figure, not just that a read happened. Satisfies **AC-11**, **AC-12**, **AC-13**, **AC-14**.
10. [ ] Add the grant test for both `security definer` functions, `check_usage_gate` and `get_job_search_usage_summary`, asserting `anon` is refused. Satisfies **AC-15**.
11. [ ] Correct the `usage_cap` half of AC-10 at its source and confirm it there rather than on `/privacy`, since `NON_PERSONAL_TABLES[].why` renders nowhere. Already applied in the shipped code; this step is the confirmation, not a new edit. Satisfies **AC-10**.

## Consequences

**Positive**:
- A refusal on `/search` is never the first time a person learns they were close to their cap; the number is already on the same page, every time.
- Both usage gating tables keep the exact access shape spec 0011 gave them: no policy, no grant beyond one `security definer` function per table's read need. A future reviewer still finds one true sentence per table, not two competing ones.
- Clauses 2 and 3 of feature 28's Done when close with no new code, verified rather than assumed, which is itself the artifact worth keeping (see rationale.md).

**Negative / tradeoffs**:
- The account week cap is now read on every `/search` render, bare visits included, not only when a search actually runs. At this app's real volume this is a negligible cost, matching the reasoning spec 0011 itself already applied to the gate's own row locks.
- `job_search` alone is shown by a values dependent argument, not a structural one (see AC-9's invariant test). If Adzuna's `RESULTS_PER_PAGE`, `job_search`'s own cap, or either AI tier's cap changes, this scope decision must be revisited, not assumed to still hold.
- If this ever grows to show `ai_scoring` or `ai_check` usage too, a location decided for `job_search` alone (the search page) may need to move; accepted here as a small, later cost rather than a reason to build for that case now.

Added 2026-09-12, from the revision:

- `searchListings()` moves up into `SearchPage`, and `SearchResults` becomes a component that receives its data rather than fetching it. That is a real change to a file several specs describe, and their line references (this spec's own included) go stale the moment it lands.
- The correctness of this feature now rests on a property that is invisible at the call site: that `UsageNotice`'s read lives inside `UsageNotice`. Someone optimising the page could hoist it for perfectly good reasons and silently reintroduce the bug. The invariants list says so, and the boundary test is what would catch it, which is why that test asserts the rendered figure rather than that a read occurred.
- One extra round trip on a search render, the summary read after the Adzuna call. Negligible against an 8 second Adzuna timeout on a page that already blocks on it.
- The gate still cannot tell anyone what a single call cost. If a later feature needs that (a per call spend breakdown, an audit line), it will have to reopen the option dropped here and pay the cost then, with the collision and grant hazards this spec recorded.

**Neutral**:
- The privacy notice correction (AC-10) is a factual fix uncovered while designing this feature, not a new decision inside spec 0009's territory; spec 0009 itself is untouched.

## Follow-up

- [ ] Line references in this spec and in spec 0013 point into `src/app/(app)/search/page.tsx` by number (154, 92, 94, 243). Step 8 moves that code. Re read them rather than trusting them once the revision lands; the 2026-09-01 reflex about follow up items being the stalest part of a spec applies to these first.
- [ ] The `usage_cap` half of AC-10 corrects a string no user ever sees (`NON_PERSONAL_TABLES[].why`, read only by `stored-fields.test.ts`). Worth asking separately whether that registry should reach `/privacy` at all, or whether its `why` field is documentation for the codebase and should say so. Not decided here.

- [ ] The retention rule spec 0011's own follow up flagged for `usage_gate_counter` (rows accumulate with no pruning) stays open. It is a privacy and storage question in its own right and deserves its own deliberate pass rather than riding along on this feature's read path.
- [ ] If a future feature shows `ai_scoring` or `ai_check` usage too, revisit where it lives: this spec kept it on `/search` deliberately, on the reasoning in rationale.md, not as a placeholder decision.

## Rationale

Full reasoning, the options weighed, and the sourced verification behind clauses 2 and 3: see [rationale.md](rationale.md).
