# 0011. Usage gating and kill switch

**Date**: 2026-09-02
**Status**: In Progress

## Summary

This spec builds the budget that stops the app from spending more on outside job listing calls than it can afford, and the alert that proves the safety net actually works. Every outbound Adzuna (the job listing source) search call passes through one atomic database check first: does the caller's own weekly count, the app's daily count, and the app's monthly count all still have room. If any is full, or the operator has thrown the emergency kill switch built in feature 3, the call is refused with a plain reason instead of running. The check also builds this project's first alert rule, one that is proven to fire with a real forced test, not just written down.

## Context

Adzuna, the job listing source feature 11 will call, licenses this app a fixed monthly budget of calls. Nothing in the app currently stops a bug, a loop, or a burst of interest from spending that budget past what Adzuna allows, and past what this stays free to run. The risk is named directly in the project's scope: uncontrolled external cost during unemployment, only removable by a deliberate decision that the risk is acceptable, never by skipping this for time.

The budget is against a single API key shared by every user, so a cap on one account protects nothing in aggregate: twenty enthusiastic friends can drain the shared monthly ceiling as easily as one heavy user. Two different kinds of limit are therefore both load bearing, a personal ceiling that is fair to one user and a shared ceiling that protects the key itself, and both must hold together under concurrent requests, since two calls landing at once must never both slip past a limit that only checked itself once.

Feature 3 already built the piece this spec assumes rather than re-decides: a single row in Postgres, read through one module, flipped from the Supabase dashboard with no deploy, and treated as switched on whenever the read itself fails. This spec's job is everything downstream of that: the per call budget check, and the observability that proves a total failure of either mechanism is seen rather than silently endured. Spec 0001's own error model names this feature by number as the place its first alert rule gets built, because a rate alert defined on paper and never proven to fire is indistinguishable from no alert at all, which is exactly the failure this project exists to learn from.

## Requirements

**User stories**:
- As the operator, I want a per account and app wide budget on outside job search calls, so a bug or a burst of interest cannot run past the source's terms or run up cost while I am unemployed.
- As a signed in user, I want a plain reason when a search is blocked, so I know it is a budget limit rather than something broken.
- As the operator, I want the failure alert proven to fire for real, so a total, silent denial cannot happen here the way it did on the project this one learns from.

**Acceptance criteria**:
- **AC-1**: A `job_search` call attempt is decided by one atomic database function that checks three windows together in the same call: the caller's own weekly count, the app wide daily count, and the app wide monthly count. Proven atomic under concurrent calls against a real database connection, not a mock.
- **AC-2**: An attempt that would put any one of the three windows over its cap is refused, and refusing consumes no budget in any of the three windows. The attempt is still counted (see AC-9) in every window it was checked against, whether it was allowed or refused.
- **AC-3**: A refusal names one reason from a closed set (`account_week_cap_reached`, `global_day_cap_reached`, `global_month_cap_reached`). When more than one window is over at once, the reason names the caller's own window before either app wide window, because that is the one the person can act on themselves.
- **AC-4**: An engaged kill switch refuses the call before the atomic window check ever runs, reading `readKillSwitch()` (feature 3) directly rather than a second reader of `app_settings`. It reports one of two reasons, never collapsed into one: `kill_switch_engaged` when the read succeeded and the switch reads on, `kill_switch_unavailable` when the read itself failed. Both fail the call closed; only the reason differs, because a deliberate flip and a broken read must never look identical to the person on the other end, the same distinction spec 0002 already protects for the switch's own dashboard rendering.
- **AC-5**: A refusal, for any of the five reasons (AC-3's three plus AC-4's two), is never reported through `failure()`. It is a successful decision whose answer is no: `success({ allowed: false, reason })`. A refusal that were reported as a failure would mark the gate's own span failed every time the system works exactly as designed, corrupting the one ratio AC-10's alert depends on.
- **AC-6**: An unrecognised `call_type`, or a `call_type` missing any one of its three required `usage_cap` rows (account/week, global/day, global/month; partial configuration is treated the same as none), is reported through `failure()` with a new `FailureKind` member, `usage_gate_misconfigured`, severity `unexpected`. The atomic function never raises to signal this: it returns `configured: boolean` as an ordinary output column, since a Postgres exception surfaced through `.rpc()` arrives at the Supabase client as `{ data: null, error }`, not a thrown exception, and would otherwise pass straight through `attempt()` as an unparsed success, the same trap `readKillSwitch()`'s own comments document. `configured: false` is what `checkUsageGate()` maps to this failure; the `allowed`/`reason` columns carry no meaning when `configured` is false.
- **AC-7**: The named span for the whole gate operation, `usage_gate.check`, opens as the first statement, before the kill switch pre-check and before anything else, including the `getClaims()` identity check in AC-13. A kill switch left engaged, a broken kill switch read, or the gate function itself failing outright, is a total denial, and a span opened later would leave that exact failure with no denominator.
- **AC-8**: Trace sampling is 1.0 on `usage_gate.check` in production (already provided by the existing `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` configuration from spec 0002).
- **AC-9**: Every call that reaches the atomic gate function increments an attempt counter inside that same function, unconditionally, regardless of the decision, so a hammered and blocked window is distinguishable from a quiet one purely from the stored counters, independent of Sentry.
- **AC-10**: Two failure rate alert rules, both written down in `docs/observability/` and configured in Sentry, since a kill switch outage and a gate outage are different failures with different spans (see the Key invariants note on `kill_switch.read`'s own span). Configured 2026-09-03 in the one `jobhunt` Sentry project (org `ghalys-org`) as four metric monitors: the two rules times the `development` and `production` environments, two environment-scoped copies of each rule in a single project — there is no separate Sentry project per environment; spec 0002 index line 79 records the setup as "an organisation and a project", and environments are separated by the `environment` tag. Each monitor is dataset `Spans`, visualize `failure_rate()`, interval `1 day`, High priority Above `0.2`, Medium Above `0.19`, Resolve default, and each has an alert connected that notifies `mghalynho@gmail.com` on all four issue triggers. The design wanted a ratio with an absolute attempt floor — at the global monthly ceiling of 2,000 calls this app averages under 3 calls an hour, so a floor reachable inside a single hour would only ever cross during an actively searching session, staying silent on an ordinary quiet day exactly when a real misconfiguration would too — but Sentry's Threshold form has no attempt floor: Threshold is a bare value on the metric with no minimum sample count anywhere in the form (verified in the form on 2026-09-03), so a lone failure in a quiet 24 hour window reads as 100%, and the 1 day interval is the partial mitigation. A follow-up below considers an absolute count threshold instead, which would give a natural floor at this app's volume. Sentry also requires two priority thresholds where this spec defines one: Medium is pinned at 0.19, just under High's 0.2, so the two fire together rather than expressing a second alerting policy no document describes (recorded 2026-09-03). Revisit the numbers if traffic ever grows enough to change that assumption. The alert query filters by failure kind (carried in the `failure.kind` span attribute `failure()` sets), not "any failed span": the `usage_gate.check` monitors filter `span.description:usage_gate.check` and `failure.kind is not session_missing`, which keeps the intended numerator — `usage_gate_misconfigured` and `database_unavailable`, the unexpected kinds this span can carry — because AC-5's five refusal reasons are successes that never mark the span failed in the first place, and `session_missing` is the one expected failure excluded by name (a caller with an expired token is not evidence the gate is broken); the `kill_switch.read` monitors filter `span.description:kill_switch.read` only, their numerator its own existing, unchanged failure kinds. The attribute exists specifically because the span's status message, which `failure()` also sets, is not a queryable field in Sentry: verified 2026-09-02 against a real forced failure, a failed span carries `span.status: internal_error` in the dashboard and nothing naming which kind failed, so a rule cannot filter by kind against the status alone (`docs/experiments/0011-usage-gating-and-kill-switch.md`). A metric monitor detects but does not notify: creating one creates no alert, and the Connected Alerts list stays empty until an alert is attached by hand — the first firing on 2026-09-03 produced a Critical issue with nothing delivered, which is why AC-11's smoke test must confirm the connection and `docs/reflexes.md` now carries the standing rule.
- **AC-11**: A forced failure smoke test, run locally against the development Supabase project and the `development` environment of the one `jobhunt` Sentry project, never the `production` environment of that same project and never a Vercel Preview deployment (Preview samples at 0.1, so roughly nine in ten forced failures there would never be captured, per `docs/observability/README.md`), proves the whole chain: the span records a failure, sampling captures it, the fingerprint groups it, the threshold is crossed, an alert is connected to the monitor, and a real alert is delivered. The connected alert half is load bearing: a metric monitor detects but does not notify, and the first firing on 2026-09-03 produced a Critical issue, correctly assigned, with nothing delivered because the monitor's Connected Alerts list was empty — exactly the failure this criterion exists to catch, and one a paper review of the alert rule passes every time (recorded in `docs/experiments/0011-usage-gating-and-kill-switch.md`). The temporary call this test adds must load `/profile`, never `/health`: Sentry's project level inbound filter "Filter out health check transactions" discards `/health`'s entire transaction, and every span nested inside it, at ingest, while error events raised on the same request are unaffected by that filter and arrive normally. A smoke test run against `/health` therefore shows the error event landing while `usage_gate.check` never appears, which reads as a broken span when nothing is wrong with it (confirmed 2026-09-03, `docs/experiments/0011-usage-gating-and-kill-switch.md`).
- **AC-12**: The three cap values (25 per account per week, 66 app wide per day, 2000 app wide per month, for `job_search`) live in a database configuration table editable with no deploy, not as a literal in code, matching the kill switch's own no deploy operating model.
- **AC-13**: The account scope is keyed on a session verified with `getClaims()`, matching the pattern already used everywhere else in this codebase (`proxy.ts`, `(app)/layout.tsx`, `profile/queries.ts`, `profile/actions.ts`), never `getSession()`, which reads the cookie's contents without verifying them against the auth server, and never a raw, unverified cookie read of any other kind. A forged session on this path spends someone else's budget, not just reads someone else's data.
- **AC-14**: A database failure while reading the cap configuration or writing the counters fails closed: the call is refused, matching the project's named risk rule and the kill switch's own existing fail closed default. `checkUsageGate()` inspects the `.rpc()` response's own `error` field before reading `configured`, `allowed`, or `reason`: a non null `error` maps to `database_unavailable`, and `data: null` with no `error` is itself also treated as `database_unavailable` rather than as an absent decision. This matters beyond AC-6's misconfigured case: a genuine database fault (a statement timeout, a lock timeout, a revoked grant, a dropped table) arrives through the same `{ data: null, error }` channel as an ordinary refusal, not as a thrown exception, so `attempt()` catches nothing and code that reads only the output columns would see `data: null` and make no decision at all, which is a silent open, not a fail closed one.
- **AC-15**: Both new tables (`usage_cap`, `usage_gate_counter`) have row level security enabled and forced, matching every existing table in the schema, even though neither carries a policy yet.

## Options considered

### Option 1: Two sequential steps, kill switch pre-check then one atomic multi window function

Reuse `readKillSwitch()` unchanged as a first, separate step. Only if the switch reads off does a single `SECURITY DEFINER` Postgres function run: it takes no caller supplied identity, derives the account from `auth.uid()` internally, and in one transaction checks and updates all three windows (account week, global day, global month) with a fixed lock order.

**Pros**:
- No second code path reads `app_settings`; spec 0002's binding rule 4 ("only `kill-switch.ts` reads `app_settings`") stays true without amendment.
- The atomic function stays narrowly about the budget, which is the one part that genuinely needs multi row, multi window atomicity.

**Cons**:
- Two sequential calls means a kill switch flipped on between the read and the window check lets one call through. Accepted rather than engineered around: the switch is a stop the bleeding lever operated by a human, not a transactional guarantee, and the gap is a single call, not a sustained leak.

### Option 2: Fold the kill switch read into the same atomic function

One `SECURITY DEFINER` function reads `app_settings` directly (by virtue of running as its owner) in the same transaction as the window checks, so kill switch and budget are one indivisible decision with no gap at all.

**Pros**:
- Removes the small race window Option 1 accepts.
- One round trip instead of two.

**Cons**:
- A second code path now reads `app_settings`, which is exactly what spec 0002's binding rule 4 was written to prevent, and that rule would need to be amended rather than simply obeyed.
- The gate function's job grows from "the budget decision" to "the budget and kill switch decision," which is a wider blast radius for one function to own.

### Option 3: Application level counting (read then write in TypeScript)

Read the current count, compare to the cap, then write the incremented value back, all in application code rather than one database statement.

**Pros**:
- No `SECURITY DEFINER` function to write and no `plpgsql` to review.

**Cons**:
- Not atomic. Two concurrent requests can both read the same pre increment count, both decide they are under the cap, and both write, letting one over budget call through, which directly violates spec 0001's own binding rule that atomic work is one statement in the database, naming this exact gate as the reason the rule exists.

## Decision

**Chosen option**: Option 1: Two sequential steps, kill switch pre-check then one atomic multi window function.

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`) · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`)

## Rationale

Option 3 is ruled out first and hardest: spec 0001 names this exact gate, by feature number, as the reason its atomicity rule exists at all, so a read then write split across application code is not a stylistic preference here, it is the specific failure the rule was written against.

Between Option 1 and Option 2, the deciding force is spec 0002's binding rule 4, which is not a style note but a security boundary: `app_settings` has exactly one reader today, and that is auditable precisely because it is singular. Option 2 buys back a race window measured in milliseconds, between a human operated switch and the next request, at the cost of a rule written specifically to keep this table's read surface small. The race Option 1 accepts is bounded and visible (one extra call, once, only during the exact moment someone is already flipping the switch by hand) while the rule Option 2 would break is a standing architectural guarantee that every future reader of `app_settings` has to be checked against. Reuse of an already built, already tested module also costs nothing here, since `readKillSwitch()` already has its own fail closed handling; Option 2 would have to reimplement that logic inside a second, harder to test `plpgsql` function.

## Feature design

**Data model sketch**:

`usage_cap` (configuration, admin editable with no deploy):
| Column | Type | Notes |
|---|---|---|
| `call_type` | `text` | not null, e.g. `job_search`. Free text, not a fixed database enum, so a new call type is one inserted row, never a migration. |
| `scope` | `text` | not null, check in (`account`, `global`) |
| `period` | `text` | not null, check in (`day`, `week`, `month`) |
| `cap_value` | `integer` | not null, check `cap_value >= 0` and `cap_value <= 100000`. Zero is allowed on purpose: it refuses every call of that type outright, a per call type kill switch, distinct from feature 3's app wide one. |
| `updated_at` | `timestamptz` | not null, trigger maintained, matching `app_settings`'s own trigger |

Primary key `(call_type, scope, period)`. Seed rows for `job_search`: `(account, week, 25)`, `(global, day, 66)`, `(global, month, 2000)`. All three are required together: the gate function treats a `call_type` missing any one of its three rows the same as a `call_type` with none at all, `configured: false` (AC-6), never a partial cap that silently does nothing. `enable row level security` and `force row level security`, no policy yet, matching `app_settings`'s own pattern: nothing under `src/app` should read this table directly, since only the gate function needs it. `revoke all from anon, authenticated`; grant `select` to `service_role` only, for dashboard debugging without a direct database connection.

`usage_gate_counter` (the atomic counters):
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` | primary key, default `gen_random_uuid()` |
| `call_type` | `text` | not null |
| `scope` | `text` | not null, check in (`account`, `global`) |
| `profile_id` | `uuid` | references `profile(id)` on delete cascade. Check: `(scope = 'account') = (profile_id is not null)`, so an account row always names its owner and a global row never does. |
| `period` | `text` | not null, check in (`day`, `week`, `month`) |
| `period_start` | `date` | not null, the window's start, computed in UTC explicitly, never left to the session's own time zone setting: `(now() at time zone 'utc')::date` for `day`, `date_trunc('week', now() at time zone 'utc')::date` for the ISO week starting Monday, `date_trunc('month', now() at time zone 'utc')::date` for `month` |
| `attempt_count` | `integer` | not null default 0, check `>= 0`. Incremented unconditionally by the gate function, on every call that reaches it, whether allowed or refused. |
| `consumed_count` | `integer` | not null default 0, check `>= 0`. Incremented only when the call is allowed; this is the column compared against `usage_cap.cap_value`. |
| `updated_at` | `timestamptz` | not null, trigger maintained |

Two partial unique indexes, since a plain unique constraint over a nullable `profile_id` would let two `global` rows exist for one window (SQL treats `null` as distinct from `null`): `(call_type, profile_id, period, period_start) where scope = 'account'` and `(call_type, period, period_start) where scope = 'global'`. Every `ON CONFLICT` clause in the gate function must repeat the matching `WHERE`, or Postgres refuses the statement outright ("there is no unique or exclusion constraint matching the ON CONFLICT specification"). `enable row level security` and `force row level security`, no policy yet (feature 28's spend visibility is what eventually reads a user's own rows, and that is a policy owed then, not now). `revoke all from anon, authenticated`, no grant: the `SECURITY DEFINER` gate function is the only reader and writer.

**State transitions**: none. Each window row's two counters only ever increase, and reset by construction the moment a new `period_start` is reached, since that is a new row rather than a mutation of the old one.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `check_usage_gate` (Postgres function, called through `.rpc()`) | RPC | `p_call_type: text` | `configured: boolean`, `allowed: boolean`, `reason: text \| null` | `authenticated`, `SECURITY DEFINER`, `auth.uid()` read internally, never a client supplied identity | never raises to signal a normal outcome; `configured: false` is the misconfigured case, carried as data, not an exception (a Postgres exception surfaced through `.rpc()` arrives as `{ data: null, error }`, not a thrown exception, so `attempt()` would otherwise pass it through as an unparsed success) |
| `checkUsageGate()` (`src/features/usage-gating/gate.ts`) | server function | `callType: string` | `Result<{ allowed: true } \| { allowed: false; reason: UsageGateReason }>` | verifies the caller with `getClaims()` before calling the RPC | `session_missing`, `usage_gate_misconfigured`, `database_unavailable` |

The Postgres function itself, in order: unconditionally bump `attempt_count` on all three window rows (`global` day, `global` month, `account` week, in that fixed lock order, upserting each into existence if the window has no row yet), which is also what takes the row locks; then check `usage_cap` for all three matching rows and return `configured: false` immediately if any is missing; then evaluate all three rows' `consumed_count < cap_value` together; then, only if every one passes, bump `consumed_count` on all three. The reported reason on a refusal is chosen by precedence (account before global), independent of the lock order used to avoid deadlocks. `SECURITY DEFINER` because it writes `global` scope rows no authenticated caller could write under row level security, matching `before_user_created_hook`'s own precedent of a `postgres` owned definer function bypassing forced row level security on a table with no policies (confirmed empirically for this project's hosted `postgres` role in spec 0002's `verify.md`, P-1); `set search_path = ''`, matching every other function in `supabase/migrations/`; `EXECUTE` revoked from `PUBLIC` and granted to `authenticated` only, following `before_user_created_hook`'s own hardening.

`checkUsageGate()` never calls the RPC for a kill switch block: it calls `readKillSwitch()` directly first (not `isKillSwitchEngaged()`'s collapsed boolean, which would lose the distinction AC-4 needs), and only proceeds to `check_usage_gate` once that read succeeds and reports the switch off.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `checkUsageGate()` | the caller's identity for the account window | `getClaims()` inside `checkUsageGate()`, verified, never a parameter |
| `check_usage_gate` (Postgres function) | the account window's owner | `auth.uid()`, read inside the `SECURITY DEFINER` function itself |
| `check_usage_gate` | each window's `period_start` | computed in UTC inside the function from `now()`, never from a client supplied date or the session's time zone setting |
| `check_usage_gate` | the cap each window checks against | `usage_cap.cap_value`, read by `(call_type, scope, period)` |
| refusal reason (AC-3, AC-4) | which of the five reasons is reported | the kill switch pre-check (for `kill_switch_engaged` or `kill_switch_unavailable`) or the account before global precedence rule over the three window results (for the other three) |
| blocked call sentence | the plain, human readable text a caller renders | `src/features/usage-gating/copy.ts`, a `SENTENCES` map keyed by `UsageGateReason`, written by the engineer per the spec's Copy table below, mirroring `src/features/auth/copy.ts`. **Feature 10 owns the reason code and its sentence; rendering that sentence on a real screen is feature 11's work**, since feature 10 ships no search UI itself. |

**Copy**: one slot per `UsageGateReason` member, text left for the engineer to write before `/develop`, the same convention spec 0007 uses (`COPY-2` there stayed blank until its dependency was answered). `/develop` must not invent or reword any of them.

| Slot | Shown when | Text |
|---|---|---|
| `COPY-1` | `account_week_cap_reached` | _to be written; should name the window (a week) and imply it resets, without necessarily stating the exact day_ |
| `COPY-2` | `global_day_cap_reached` | _to be written; the remedy here is "try again tomorrow," and the sentence should not suggest it is the person's own usage that caused it_ |
| `COPY-3` | `global_month_cap_reached` | _to be written; the remedy is materially longer than the other three, and the sentence should not promise a specific date if the exact reset moment is not one the engineer wants to commit to in copy_ |
| `COPY-4` | `kill_switch_engaged` | _to be written; a deliberate, operator initiated pause, not a bug_ |
| `COPY-5` | `kill_switch_unavailable` | _to be written; this one IS a bug from the visitor's point of view, even though the cause is invisible to them; should not claim a specific reset time the way the cap reasons might_ |

**Key invariants**:
- The cap counts outbound API calls, not user facing searches. The gate is called once per outbound Adzuna call. A search that costs more than one call (pagination, a count query, a follow up fetch) consumes that many gate calls, exactly, with no multiplier configured or guessed anywhere in this design. Feature 11 confirms the real shape when it builds the search call; this spec does not depend on that answer.
- A refusal never reduces budget in any window it was checked against, in the same call.
- Every call that reaches the atomic gate function increments `attempt_count`, whether allowed or refused, regardless of the branch. A kill switch block (either reason) never reaches the atomic function (it is refused by the pre-check instead), so it increments no `usage_gate_counter` row. Demand during a kill switch incident stays visible only through the `usage_gate.check` span's own volume in Sentry (AC-7), which in turn depends on trace sampling staying at 1.0 on gated operations (AC-8). If that sampling is ever lowered (spec 0001 flags it as something to revisit as traffic grows), this specific blind spot becomes real, and nothing else warns of it; this coupling is also recorded in `docs/observability/README.md`.
- `usage_gate.check` and `kill_switch.read` are two separate named spans (the second already registered, feature 3), so a kill switch read failure marks only its own span failed, never the parent `usage_gate.check` span. AC-10 therefore alerts on both ratios, not one: a total gate outage and a total kill switch outage are different failures with different causes, and folding them into one span's ratio would have left one of the two invisible.
- A global daily ceiling of 66 bounds any rolling 30 day reading of the monthly cap at or under 2,000, whichever way Adzuna's own month boundary is actually implemented (calendar month or a rolling window; this project's read of Adzuna's docs does not settle which). A global weekly counter is deliberately not built: at 66 a day, a week tops out at 462, which is under Adzuna's own 1,000 a week ceiling by more than half, so a third window and a third row lock on every gate call would check a condition that can never fire. A lower day cap (64) was considered, which would also make the month window provably unreachable (64 × 31 = 1,984), but rejected: the month is the actual licensed ceiling this whole feature protects, not a redundant backstop the way the week is, so it should stay the binding constraint. The day cap exists to close the rolling window gap, not to render the month decorative; see rationale.md.
- Adzuna's 25 calls a minute ceiling is deliberately not gated here. A burst inside one minute is caught by Adzuna's own enforcement, surfacing as `external_service_failed` from the search call itself, not as a gate refusal. If that limit is ever actually hit, the fix is a fourth, minute scoped window in the same `usage_cap` / `usage_gate_counter` shape, not a lower daily cap.
- Every gated call in the whole app takes a row lock on the same two `global` counter rows (day and month), so the gate serialises all gated traffic to one decision committing at a time; this is the price of AC-1's atomicity, not an oversight. At this app's real volume (a handful of users) this ceiling is never approached. If it ever were, the fix is sharding the two `global` rows (hashing into a small fixed number of bucket rows, summed at read time) rather than relaxing the atomicity guarantee.
- Provisioning more than one account, or more than one API key, to expand the effective budget is against the source's terms (inferred from the current terms text, not verified there directly; see References). This gate does not and cannot defend against that; it is a policy constraint on the operator, not a technical one this feature enforces.

**Security model**: The account window is keyed on `auth.uid()`, read inside the `SECURITY DEFINER` function itself, never a client supplied value; `checkUsageGate()` additionally verifies the caller with `getClaims()` before ever calling the function, the same defence in depth pattern every existing Server Action and query in this codebase already follows. `usage_cap` and `usage_gate_counter` are both row level security enabled and forced, with no policy on either yet, so no `authenticated` role reaches them directly, only the `SECURITY DEFINER` function. A signed out caller never reaches `checkUsageGate()` at all; the caller check happens before the gate is ever consulted.

**Configuration required**: none. The three cap values live in `usage_cap`, a database table, per AC-12, not as environment variables.

**Critical test scenarios**, all driven through the Data API with a real minted test session (spec 0004's session mint), never the direct database connection helper (`test/helpers/database.ts`), since that connection carries no `auth.uid()` and would either fail `usage_gate_counter`'s own owner check constraint or need `service_role`, which holds no privilege on this table at all:
- Happy path: a `job_search` call under all three caps is allowed, and `consumed_count` and `attempt_count` both increment on all three window rows, verifies **AC-1**, **AC-9**.
- Failure case: a burst of concurrent calls for the same minted account (sized to what the Data API's own statement timeout allows, not an arbitrary large number), land exactly the account weekly cap's worth of allowed calls and refuse the rest, with every refused call still counted in `attempt_count` and none of them touching `consumed_count`, verifies **AC-1**, **AC-2**.
- Failure case: a call for an unknown `call_type` returns `configured: false` and is refused through `failure()` with `usage_gate_misconfigured`; a call with a `call_type` missing one of its three `usage_cap` rows behaves identically, verifies **AC-6**.
- Failure case: a call blocked by an engaged kill switch reports `success({ allowed: false, reason: "kill_switch_engaged" })`, and a call made with `readKillSwitch()` forced to fail reports `success({ allowed: false, reason: "kill_switch_unavailable" })`, neither ever a `Failure`, verifies **AC-4**, **AC-5**.
- Auth/permission: a caller with no valid session gets `session_missing` before any database call happens, and a request crafted to name another user's `profile_id` cannot spend that user's budget, since the function reads `auth.uid()` itself and takes no caller supplied identity, verifies **AC-13**.

## Build plan

1. Write the migration: `usage_cap` and `usage_gate_counter` with their checks, partial unique indexes, `enable` plus `force row level security`, the explicit grants, the three seed rows for `job_search`, and the `check_usage_gate` function with its fixed lock order, UTC computed windows (including the month formula), the `configured` output column, and `SECURITY DEFINER` hardening comment explaining why, satisfies **AC-1**, **AC-2**, **AC-6**, **AC-9**, **AC-12**, **AC-14**, **AC-15**.
2. Add the `usage_gate_misconfigured` member to `FailureKind` in `src/lib/result.ts`, satisfies **AC-6**.
3. Build `src/features/usage-gating/`: the closed, five member `UsageGateReason` union, `checkUsageGate()` wrapping the `getClaims()` check, the `readKillSwitch()` pre-check (both its engaged and unavailable outcomes), and the RPC call through `attempt()` mapping `configured: false` to `failure()`, and `copy.ts` with `COPY-1` through `COPY-5` left for the engineer to write, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-13**.
4. Register the `usage_gate.check` span in `docs/observability/spans.md`, opened as the first statement of `checkUsageGate()`, before the `getClaims()` check, and update the `kill_switch.read` row there to record that this feature is what wires it into a gated call, satisfies **AC-7**, **AC-8** (sampling is already 1.0 in production from spec 0002; no new configuration needed).
5. Prove the thin end to end thread with the integration tests from Critical test scenarios, all driven through the Data API with a real minted session: allow under cap, refuse over cap with no budget consumed and the attempt still counted, refuse an unknown or partially configured `call_type`, refuse under each of the two kill switch reasons, and the sized concurrent call scenario, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-9**, **AC-13**, **AC-14**.
6. Define both failure rate alert rules in `docs/observability/README.md`: `usage_gate.check`'s (numerator `usage_gate_misconfigured` and `database_unavailable` only, filtered by failure kind, never AC-3/AC-4's five refusal reasons and never `session_missing`) and `kill_switch.read`'s (its own existing failure kinds, unchanged), each dataset `Spans`, visualize `failure_rate()`, interval `1 day`, High priority Above `0.2`, Medium Above `0.19` and Resolve default, with the traffic assumption and the recorded absence of any attempt floor in Sentry's Threshold form stated inline, satisfies **AC-10**.
7. Configure both rules in Sentry against the `jobhunt` project's `development` environment — the four monitors (two rules times the two environments) were configured by hand on 2026-09-03 — then run the forced failure smoke test there, locally, never against a Vercel Preview deployment or the `production` environment: force `usage_gate_misconfigured` deliberately, confirm the span records the failure, sampling captures it (confirm the local sampling rate directly, not by inference from a production shaped build), the fingerprint groups it, the threshold crosses, an alert is connected to the monitor, and a real alert arrives; separately force a `kill_switch.read` failure and confirm its own alert fires too, satisfies **AC-10**, **AC-11**.
8. Configure both alert rules in the `production` environment of the same Sentry project (recorded, not re proven; AC-11 requires the smoke test run in development only), and tick spec 0001's own follow-up item recording that feature 10 has now built binding rule 4's first alert rule.

## Consequences

**Positive**:
- The app can never spend past a shared, licensed budget on outside job listing calls, under concurrent load, without depending on the source's own enforcement as the only backstop.
- This project's first failure rate alert exists and is proven to fire, not just written down, closing the exact gap spec 0001 named this feature to close.
- The gate is generic across `call_type` from day one: feature 13 and 14's model calls add new `usage_cap` rows later, no migration to `usage_gate_counter` or the gate function itself.

**Negative / tradeoffs**:
- A kill switch flipped on between the pre-check read and the atomic window check lets one call through, once, only during that narrow window (Option 1's accepted tradeoff).
- Demand during a kill switch incident is visible only through Sentry span volume, which depends on trace sampling staying at 1.0 on gated operations; lowering that sampling later silently narrows this feature's own visibility during the exact kind of incident it exists to catch.
- Every gated call app wide serialises on the same two `global` counter rows, so the whole app's `job_search` throughput is bounded by however fast one Postgres row lock can be taken, checked, and released in sequence. Not a real constraint at this app's volume; the fix if it ever became one is sharding the `global` rows, not relaxing AC-1.
- Two new tables and one `plpgsql` function are now part of the schema that every future migration and every future `/check verify` pass has to account for.

**Neutral**:
- Deleting an account (feature 31, not yet built) cascades that person's own counter rows away, which resets their personal weekly cap early. The global counters are untouched, so the blast radius stays bounded; this is accepted as a known, self service edge case rather than a defect.
- `cap_value = 0` is a valid configuration, and functions as a per call type kill switch distinct from feature 3's app wide one. Nothing currently sets it that way; it exists as a lever, not a default.

## Follow-up

- [ ] A direct email to Adzuna confirming the multi user reading of their terms is still open (residual from spec 0001's own follow-up list, line 199), and it bears directly on every number in this spec.
- [ ] Feature 28 (spend visibility and gating polish) is the natural owner of a `select` policy on `usage_gate_counter` scoped to a user's own `account` rows, so a person can see their own remaining budget; not built here, since nothing in this feature's own done when clause needs it.
- [ ] `docs/observability/README.md`'s Status section should be rewritten once AC-11's threshold-breach creation delivery is proven (a resolved-issue delivery on 2026-09-03 proved the notification path, not the creation side): it was updated 2026-09-03 to record the four configured monitors and the connected alerts, but the smoke test is still pending and the section says so.
- [ ] Consider an absolute count threshold on the same two spans instead of the bare Threshold value, because Sentry's Threshold form has no minimum sample count and a lone failure in a quiet 24 hour window reads as 100%; a count threshold would give a natural attempt floor at this app's volume (see AC-10, verified 2026-09-03).
- [ ] Once this feature ships, tick spec 0001's follow-up item (index line 190) recording that feature 10 built binding rule 4's first alert rule, including the non production smoke test qualifier that item names and `docs/scope/scope.md`'s own done when wording (line 208) currently drops.
- [ ] Adzuna publishes 2,500 a month under a heading reading "Default API access limits," not as a hard ceiling; whether it can be raised on request is an open question nobody has asked, and is the cheapest lever available if user count grows past what 2,000 a month comfortably serves.

## Rationale

Full reasoning, the options weighed, and sourced references: see [rationale.md](rationale.md).
