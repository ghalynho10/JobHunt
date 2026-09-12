# 0020. Spend visibility and gating polish

**Date**: 2026-09-11
**Status**: Proposed

## Summary

This spec lets a signed in user see their own job search usage against their weekly cap, right on the search page, before a refusal ever surprises them. The two other goals feature 28 named, gating a new call type by default and keeping the kill switch a last resort, are already true of the code as it stands today, verified line by line rather than assumed, so this spec builds only the one thing that was actually missing. It also fixes two sentences in the privacy notice that quietly went stale when a later feature started using the same tables this one now makes visible.

## Requirements

**User stories**:
- As a signed in user, I want to see my own remaining search allowance before I search, so a refusal is information I already had, not a surprise.
- As the operator, I want the privacy notice to keep describing these two tables accurately, so it never states something the code has stopped doing.

**Acceptance criteria**:
- **AC-1**: A signed in user visiting `/search` sees their own `job_search` usage against their account week cap (for example "18 of 25 searches used this week") on every render of that page, bare visit or with results, read live from the database rather than a client held or hardcoded number. This covers the account week window only, the one reason a person's own past searches affect; the other four refusal reasons (the two app wide caps and the two kill switch states) are not previewed here and stay exactly as legible as they already are, a plain sentence at the moment of refusal.
- **AC-2**: The shown number is `usage_gate_counter.consumed_count`, never `attempt_count`. `attempt_count` also counts refused attempts, which spent no budget, so showing it would overstate how much of the cap is actually gone.
- **AC-3**: A caller with no `usage_gate_counter` row yet for the current week, nobody has searched this week, sees the cap's full remaining amount (for example "0 of 25"), never an error and never a newly created row. The read path performs no insert or update of any kind, unlike `check_usage_gate` itself.
- **AC-4**: The read path computes the account week's `period_start` with the exact same UTC expression `check_usage_gate` uses, `pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'utc')::date` (schema qualified, since the new function is `set search_path = ''` too), so the number shown and the number enforced can never disagree at a week boundary.
- **AC-5**: The cap value shown is read live from `usage_cap`, never a literal in application code, so an operator's no deploy change to the cap shows up on the next render.
- **AC-6**: A failure to read usage renders a visible inline notice and does not block the search form or the rest of the page from rendering. No silent zero, no silent hiding.
- **AC-7**: The read function derives the caller's account from `auth.uid()` inside itself, never from a parameter, and the TypeScript wrapper verifies the caller with `getClaims()` before calling it, the same defense in depth pattern `checkUsageGate()` already uses. One account's usage is never visible to another.
- **AC-8**: No new grant is added on `usage_gate_counter`; it stays reachable only through a `security definer` function, by construction. `usage_cap`'s existing `select` grant to `service_role`, for dashboard debugging, is unchanged.
- **AC-9**: v1 shows `job_search` usage only, and this is a proven choice, not a deferred one. `src/features/search/adzuna.ts`'s `RESULTS_PER_PAGE` is exported so a test can import the real value rather than a copied literal. That test, run against the real `usage_cap` rows (an integration test, since the caps are no deploy editable per AC-5 and a unit test could only pin the migration's seed values), asserts that `ai_scoring`'s and `ai_check`'s own caps stay at or above `job_search`'s own cap times `RESULTS_PER_PAGE`, for all three window scopes (account week, global day, global month), not only the one this feature displays. That arithmetic is what guarantees `job_search`'s own cap always binds at or before either AI tier's, so showing it alone tells the whole truth about what will actually stop the caller. The test failing, or an operator changing a cap value so it no longer holds, is the signal to revisit this scope.
- **AC-10**: `src/features/legal/stored-fields.ts`'s description of `usage_cap` and of `usage_gate_counter.call_type` no longer states or implies these tables count job search calls only. Migration `20260906120000_model_client_router_usage_cap.sql` added `ai_scoring` and `ai_check` rows to the same tables, and neither description was updated to say so.

Clauses 2 and 3 of feature 28's own Done when, gating a new call type by default and the kill switch staying a last resort, are verified already true against the running code (see Context) and need no acceptance criteria here, since nothing is being built for them.

## Decision

**Chosen option**: Option 1: a new, strictly read only `security definer` function.

A signed in user's own usage reaches the page through a new Postgres function, `get_job_search_usage_summary`, that mirrors `check_usage_gate`'s own shape: it derives the caller from `auth.uid()` internally, computes `period_start` with the identical expression, and returns only `job_search`'s account week window `consumed_count` and the matching `cap_value`. It takes no parameter: a cross check on this design found that a `call_type` parameter would let any signed in caller read `usage_cap` and the `configured` state for a call type this feature never shows, a wider readable surface than the unchanged table grants suggest. The function reads `job_search` only, by construction, the same closed by design treatment `UsageGateReason` already gets in `gate.ts`; showing a second call type later is a spec change, not a parameter another caller could reach. Neither `usage_gate_counter` nor `usage_cap` gets a new grant or a new row level security policy.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Feature design

**Data model sketch**: no new tables and no new columns. Both `usage_cap` and `usage_gate_counter` keep row level security enabled and forced with zero policies, exactly as spec 0011 shipped them; this feature adds one new function, nothing else, to their read surface.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `get_job_search_usage_summary` (Postgres function, called through `.rpc()`) | RPC | none | `configured: boolean`, `consumed_count: integer \| null`, `cap_value: integer \| null`, `period_start: date \| null` | `authenticated`, `security definer`, `auth.uid()` read internally, never a client supplied identity | never raises to signal a normal outcome; `configured: false` means `job_search` is missing one or more of its three `usage_cap` rows, the same all or nothing rule `check_usage_gate` already applies |
| `getJobSearchUsageSummary()` (`src/lib/usage-gating/queries.ts`) | server function | none | `Result<{ consumedCount: number; capValue: number; periodStart: string }>` | verifies the caller with `getClaims()` before calling the RPC | `session_missing`, `usage_gate_misconfigured`, `database_unavailable` |

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
| where it renders | placement on the page | `src/app/(app)/search/page.tsx`, inside `SearchPage`, above the `hasQuery` conditional (today's lines 77 to 93), so it renders on a bare visit and with results alike, never only after a search |

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
- Showing `job_search` alone is correct only because of today's cap values, not as a structural guarantee: `ai_scoring` and `ai_check` each spend at most one call per listing, `RESULTS_PER_PAGE` (20) listings are fetched per search, and both AI tiers' account week caps (500) equal `job_search`'s own account week cap (25) times 20. A test pins this relationship (AC-9); if either side of it ever changes, the test fails and this scope decision needs a fresh look, not a silent drift.

**Security model**: identical in shape to `check_usage_gate`'s own. `get_job_search_usage_summary` is `security definer`, `set search_path = ''`, `execute` revoked from `public` and granted to `authenticated` only. The account scope is `auth.uid()`, read inside the function, never a client supplied value; `getJobSearchUsageSummary()` additionally verifies the caller with `getClaims()` first, the same defense in depth every existing reader in this codebase already follows. A signed out caller never reaches `getJobSearchUsageSummary()` at all.

**Configuration required**: none. No new environment variable and no new secret.

**Critical test scenarios**, driven through the Data API with a real minted test session, matching spec 0011's own convention, never through `test/helpers/database.ts` as the acting identity:
- Happy path: a minted account with some `job_search` usage already recorded this week reads back the exact `consumed_count` and `cap_value` through the real RPC, verifies **AC-1**, **AC-2**, **AC-5**.
- Read only proof: a fresh minted account with no `job_search` calls this week reads back `consumed_count = 0`, and a direct database check afterward (via `test/helpers/database.ts`, only to observe, never to act as the caller) confirms no `usage_gate_counter` row was created as a side effect of the read, verifies **AC-3**.
- Week boundary consistency: the two `period_start` expressions, this function's and `check_usage_gate`'s, are proven to agree for the same instant, verifies **AC-4**.
- Auth: a caller with no valid session gets `session_missing` before any RPC call happens, and a second account can never read a first account's usage, verifies **AC-7**.
- Failure case: a forced RPC failure renders the visible inline notice and the search form still renders underneath it, verifies **AC-6**.
- Integration test, against the real `usage_cap` rows: the cap arithmetic invariant behind **AC-9**, `ai_scoring`'s and `ai_check`'s caps each at or above `job_search`'s own cap times `RESULTS_PER_PAGE`, checked for all three window scopes (account week, global day, global month), not only the one this feature displays.

## Build plan

Tracer Bullet, this project's own build approach: the whole read path, database to page, is built as one thin end to end slice, since the display scope decision (job_search only) already keeps this to a single counter.

1. Migration: add `get_job_search_usage_summary()`, taking no parameter, `security definer`, read only, matching `check_usage_gate`'s hardening (`set search_path = ''`, `execute` revoked from `public`, granted to `authenticated`), and its `period_start` expression exactly. No new grant on `usage_gate_counter`. Satisfies **AC-3**, **AC-4**, **AC-7**, **AC-8**.
2. Build `getJobSearchUsageSummary()` in `src/lib/usage-gating/queries.ts`: `getClaims()` verification, the RPC call wrapped in `attempt()`, the response parsed with Zod rather than trusted (matching `gate.ts`'s own treatment of `check_usage_gate`'s row), a named span `usage_gate.read_summary` opened first and registered in `docs/observability/spans.md` (binding rule 3). Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-7**.
3. Write `COPY-1` and `COPY-2`. Satisfies **AC-1**, **AC-6**.
4. Build the rendered notice in `src/features/search/`, calling `getJobSearchUsageSummary()` and wired into `SearchPage` above the `hasQuery` conditional in `src/app/(app)/search/page.tsx`, a plain `await`, no `Suspense` boundary of its own since the read is fast and unrelated to the slower scoring path already Suspended below it. Satisfies **AC-1**, **AC-6**.
5. Export `RESULTS_PER_PAGE` from `src/features/search/adzuna.ts`, then write the cap arithmetic invariant test as an integration test that reads the real `usage_cap` rows through the Data API (never the direct database helper) and imports the real `RESULTS_PER_PAGE`, asserting the relationship for all three window scopes. Satisfies **AC-9**.
6. Correct `src/features/legal/stored-fields.ts` lines 76 and 370 so neither claims or implies `usage_cap` or `usage_gate_counter.call_type` count job search calls only. Satisfies **AC-10**.
7. Integration tests: the Critical test scenarios above, covering **AC-1** through **AC-8**.

## Consequences

**Positive**:
- A refusal on `/search` is never the first time a person learns they were close to their cap; the number is already on the same page, every time.
- Both usage gating tables keep the exact access shape spec 0011 gave them: no policy, no grant beyond one `security definer` function per table's read need. A future reviewer still finds one true sentence per table, not two competing ones.
- Clauses 2 and 3 of feature 28's Done when close with no new code, verified rather than assumed, which is itself the artifact worth keeping (see rationale.md).

**Negative / tradeoffs**:
- The account week cap is now read on every `/search` render, bare visits included, not only when a search actually runs. At this app's real volume this is a negligible cost, matching the reasoning spec 0011 itself already applied to the gate's own row locks.
- `job_search` alone is shown by a values dependent argument, not a structural one (see AC-9's invariant test). If Adzuna's `RESULTS_PER_PAGE`, `job_search`'s own cap, or either AI tier's cap changes, this scope decision must be revisited, not assumed to still hold.
- If this ever grows to show `ai_scoring` or `ai_check` usage too, a location decided for `job_search` alone (the search page) may need to move; accepted here as a small, later cost rather than a reason to build for that case now.

**Neutral**:
- The privacy notice correction (AC-10) is a factual fix uncovered while designing this feature, not a new decision inside spec 0009's territory; spec 0009 itself is untouched.

## Follow-up

- [ ] The retention rule spec 0011's own follow up flagged for `usage_gate_counter` (rows accumulate with no pruning) stays open. It is a privacy and storage question in its own right and deserves its own deliberate pass rather than riding along on this feature's read path.
- [ ] If a future feature shows `ai_scoring` or `ai_check` usage too, revisit where it lives: this spec kept it on `/search` deliberately, on the reasoning in rationale.md, not as a placeholder decision.

## Rationale

Full reasoning, the options weighed, and the sourced verification behind clauses 2 and 3: see [rationale.md](rationale.md).
