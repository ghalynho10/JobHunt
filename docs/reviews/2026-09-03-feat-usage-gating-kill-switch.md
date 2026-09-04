# Review, feat/usage-gating-kill-switch, 2026-09-03

**Reviewed by**: Opus 5 (author model not recorded in the branch; review run on a model that did not write the code)
**Scope**: 22 files, branch vs `main` (merge base `4f4fe49`)
**Verdict**: Changes requested

## Summary

Spec 0011's usage gate is built well where it is hardest: the atomic `plpgsql` function takes a fixed lock order, the partial unique indexes are matched by every `ON CONFLICT` clause, and the concurrency proofs run against the real stack with burst sizes justified against measured pool and timeout numbers rather than guessed. The three design decisions flagged for independent judgment all hold up — the `{ data: null, error: null }` mock is a legitimate transport-boundary mock (I verified the reasoning against `@supabase/postgrest-js` 2.112.3's own `processResponse`), and routing refusals through `success()` is the correct reading of binding rules 1 and 4. Two real problems remain: a signed-in user with no `profile` row makes every gated call fail with `database_unavailable`, which lands straight in the numerator of the alert this feature exists to build; and any authenticated caller can grow `usage_gate_counter` without bound by varying `p_call_type`, because the attempt bump runs before the configuration check. Both are cheap to fix now and expensive to discover in feature 11.

## Major

### 🟠 A signed-in user with no `profile` row fails every gated call as `database_unavailable`, `supabase/migrations/20260902120000_usage_gating.sql:62` and `:159-165`

**Problem**: `usage_gate_counter.profile_id` references `public.profile (id)`, and the account-week upsert is unconditional. But a signed-in user does not necessarily have a `profile` row: `supabase/migrations/20260830230000_before_user_created_hook.sql:24` says so in terms — *"DELIBERATELY NOT ADDED: a trigger on `auth.users` creating a `profile` row"* — and `src/features/profile/actions.ts:510` handles the same absence for work experience. For such a caller `check_usage_gate` raises a foreign key violation (SQLSTATE `23503`), which arrives as `{ data: null, error }` and is mapped by `src/lib/usage-gating/gate.ts:151-159` to `database_unavailable`, severity `unexpected`.

**Why it matters**: three separate harms from one cause. The user is told the database is unreachable when nothing is broken. An error-level Sentry event is raised for an ordinary new-user state. And most seriously, it lands in the numerator of the `usage_gate.check` monitor — `database_unavailable` is one of the two kinds `docs/observability/README.md` names as the intended numerator, and the filter only excludes `session_missing`. A cohort of new users who reach search before saving a profile would page the operator for correct behaviour, which is precisely the corruption AC-5 was written to prevent, arriving through a door AC-5 does not cover. `landingPathFor()` sends a profile-less visitor to `/profile`, but nothing stops them navigating to `/search`, and `src/lib/landing-rule.ts`'s own errored-read branch sends them to `/search` regardless.

The integration suite conceals this rather than catching it: `test/integration/usage-gating.test.ts:42-51` seeds a profile row in `freshSession()` and its doc comment names the behaviour ("an account scoped gate call for a user with no profile row is refused by that foreign key") without asserting it or deciding what it should be. No committed test drives a profile-less caller.

**Suggested fix**: decide it explicitly, then record the decision in spec 0011's Feature design. Three viable shapes: point the FK at `auth.users (id)` instead of `public.profile (id)` (the gate's account scope is an auth identity, not a profile); create the `profile` row at signup after all; or trap `23503` inside `check_usage_gate` and return a distinct outcome that neither reads as a database outage nor enters the alert numerator. Whichever is chosen, add a committed integration test for a minted user with no profile row — the suite already has `mintFixtureUser()` separate from the profile insert, so the case is one call away.

### 🟠 An authenticated caller can create unbounded `usage_gate_counter` rows by varying `p_call_type`, `supabase/migrations/20260902120000_usage_gating.sql:141-165` and `:245`

**Problem**: `grant execute on function public.check_usage_gate(text) to authenticated` makes the RPC directly callable through PostgREST with the publishable key and any valid session. The unconditional attempt bump runs *before* the configuration lookup (lines 141-165, then 167-190), so three rows are inserted and committed for every distinct `p_call_type` string before the function decides it is unconfigured. There is no length limit on `call_type`, no rate limit, no retention policy, and no RLS policy that would bound the write, because the function is `SECURITY DEFINER` and does the writing itself.

**Why it matters**: unbounded storage growth in a table nothing prunes, driven by any account, at whatever rate the caller can issue requests. The rubric's "missing rate limits on expensive endpoints" fits — with the honest caveat that it needs an authenticated Google account on an app capped at 100 users, so the adversarial case is bounded; downgrade to Minor if that threat model is judged acceptable. The accidental case is the more likely one: a typo'd `call_type` shipped in features 13 or 14 permanently pollutes the counter table alongside its `usage_gate_misconfigured` alerts. The diff already demonstrates the mechanism: `test/integration/usage-gating.test.ts:412-428` calls the gate with `"no_such_call_type_at_all"`, and the file's `afterAll` (lines 120-129) deletes only `TEST_CALL_TYPE` rows, so two global counter rows for that junk call type are left in the local database on every single run.

**Suggested fix**: move the three `usage_cap` lookups above the attempt bump and return `configured: false` before inserting anything. AC-9's guarantee ("every call that reaches the atomic gate function increments an attempt counter") stays true for every configured call type, which is the only case where the counter means anything — the attempt count on an unconfigured call type measures nothing and the failure is already alerted on. This contradicts the ordering spec 0011's Feature design states, so amend that paragraph in the same change rather than leaving the code and the spec disagreeing.

## Minor

### 🟡 `external_service_failed` is a third unexpected kind `usage_gate.check` can carry, and neither the spec nor the observability doc says so, `src/lib/usage-gating/gate.ts:89-95`

**Problem**: `getClaims()` is wrapped with `kind: "external_service_failed"`, so a JWKS outage marks the `usage_gate.check` span failed with that kind. AC-10 and `docs/observability/README.md`'s `## Alert rules` both assert the numerator is "`usage_gate_misconfigured` and `database_unavailable`, the unexpected kinds this span can carry". That list is incomplete, and the monitor's filter (`failure.kind is not session_missing`) admits `external_service_failed` into the numerator.

**Why it matters**: the behaviour is arguably right — a JWKS outage *is* a total denial worth alerting on — but the documentation says something false about a rule this project treats as load bearing, and `docs/reflexes.md`'s "verify before you recommend" rule exists for exactly this. A later reader reconciling the doc against the monitor will not be able to.

**Suggested fix**: name the third kind in AC-10 and in the README's `usage_gate.check` bullet, and state deliberately whether it belongs in the numerator (I think it does).

### 🟡 `result.ts`'s severity doc still gives "a usage cap reached" as the example of an `expected` failure, `src/lib/result.ts:16-19`

**Problem**: the `FailureSeverity` doc comment reads *"`expected`: the system worked and the answer was no (a validation error, **a usage cap reached**, an empty search)"*. AC-5 decides the opposite: a cap reached is never a `Failure` at all. This file is modified by this branch, so the contradiction is now internal to the change.

**Why it matters**: the example is the most concrete thing in that doc comment, and it now teaches the exact pattern this feature forbids. A later session building feature 13's model-call gate would follow `result.ts` and get it wrong, and nothing would catch it — `failure()` accepts it and the span goes red.

**Suggested fix**: replace the example with one that is still an `expected` failure under this design (`session_missing` is the obvious candidate, and `checkUsageGate()` already classifies it that way), and add a clause naming the cap refusal as the case that is deliberately *not* a failure, citing AC-5.

### 🟡 The RPC response is not parsed with Zod, unlike its sibling, `src/lib/usage-gating/gate.ts:140-194`

**Problem**: AGENTS.md binding rule 7 parses at every boundary with Zod, and `src/lib/kill-switch.ts:31-35` does exactly that for `app_settings` with a comment explaining why ("The generated database types say what the schema claims; this says what actually arrived"). `checkUsageGate()` hand-checks the same class of boundary instead: `!row.configured`, `row.allowed`, `!row.reason || !isUsageGateReason(row.reason)`.

**Why it matters**: sharpened by the generated types actively lying here. `src/lib/supabase/database.types.ts` types `check_usage_gate`'s return as `{ configured: boolean; allowed: boolean; reason: string }[]`, while the SQL returns `null::boolean` for `allowed` and `null::text` for `reason` on the unconfigured and allowed paths. The current guards happen to be correct, and `!row.reason` on a value TypeScript believes is always `string` is the tell that the type is not to be trusted. A schema would make the nullability explicit and the guard order enforced rather than conventional.

**Suggested fix**: a five-line `z.object({ configured: z.boolean(), allowed: z.boolean().nullable(), reason: z.string().nullable() })` parsed after the `rpcError || !row` check, with the parse failure mapping to `database_unavailable` the way `readKillSwitch()` maps its own to `response_malformed`. The `isUsageGateReason` narrowing can become a `z.enum(USAGE_GATE_REASONS)` at the same time.

### 🟡 The database-fault test mutates global privileges, the same hazard class this branch documents at length elsewhere, `test/integration/usage-gating.test.ts:653` and `:680`

**Problem**: the AC-14 test runs `revoke insert, update on public.usage_gate_counter from postgres`, then restores it in a `finally`. That is process-wide, cross-file state, identical in kind to the `app_settings` flip this branch refuses to commit for exactly that reason. It is safe today only because no other integration file calls `checkUsageGate()` — a fact nothing in the file records.

**Why it matters**: two ways it bites. The first integration file added for feature 11 that calls the gate will fail intermittently, for a reason that looks nothing like its cause (`database_unavailable`, sporadically). The second: if the run is killed between the revoke and the `finally` (Ctrl-C, a CI timeout, an OOM), the local stack is left with the gate permanently broken and the only symptom is a misleading `database_unavailable` from every gated call until someone runs `pnpm db:reset`.

**Suggested fix**: add the same kind of comment the kill switch got — naming that this is global state, that it is safe only while this file is the sole gate caller, and what to do when that stops being true. If the `groupOrder` change under "On the three flagged decisions" is made, this test belongs in that serial group with the kill switch one.

### 🟡 Two `gate.ts` branches have no test, `src/lib/usage-gating/gate.ts:89` and `:185`

**Problem**: the `getClaims()` throw path (producing `external_service_failed`) and the "reason outside the closed set" defensive branch are both uncovered. `TESTS = configured`, and both are error-handling branches.

**Why it matters**: the second one in particular is the branch that decides what happens when the database and the TypeScript union drift apart — for example if a sixth reason is added to the SQL without adding it to `UsageGateReason`. That is a realistic future edit, and the branch that catches it has never run.

**Suggested fix**: two more cases in `gate.test.ts`'s existing mocked harness — `getClaims.mockRejectedValue(...)` for the first, `rpc` returning `{ data: { configured: true, allowed: false, reason: "something_else" }, error: null }` for the second.

### 🟡 `usage_gate_counter` has no retention story, and is now declared a personal-data table, `src/features/legal/stored-fields.ts:52`

**Problem**: rows accumulate one per user per week plus two per day plus two per month, indefinitely. Nothing prunes them, and the only removal path is the `on delete cascade` from account deletion, which is feature 31 and unbuilt.

**Why it matters**: modest on its own, but it compounds Major #2 and it now carries a privacy dimension — the table is listed under "Your job search usage" in the notice, so its rows are personal data the app keeps forever with no stated retention period.

**Suggested fix**: not necessarily work for this feature, but worth a follow-up item in spec 0011 naming feature 28 (which already owns the `select` policy on this table) as the owner of a retention rule.

## Nits

- ⚪ `src/lib/usage-gating/gate.test.ts:40`, `A_KILL_SWITCH_STATE` names the *engaged* state; `KILL_SWITCH_ON` beside the existing `KILL_SWITCH_OFF` would say what it is.
- ⚪ `src/lib/usage-gating/gate.test.ts:99-123`, the doc comment understates how reachable `{ data: null, error: null }` is. In the same `processResponse` of the installed 2.112.3, a **404 with an empty body** also lands there: `JSON.parse("")` throws, the catch sets `status = 204` and returns with both `data` and `error` still `null` (`dist/index.mjs:487-500`). A wrong project URL or an edge proxy 404 produces it, not only a `Prefer: return=minimal` empty 2xx. This makes the defensive branch more valuable than the comment claims, not less.
- ⚪ `test/integration/usage-gating.test.ts:620-630`, "PostgREST turns zero or multiple rows into an `error` (`PGRST116`)" is true of the *server*, but reads as the client-side claim that `gate.test.ts:99-123` explicitly corrects. Attribute it to PostgREST's `Accept: application/vnd.pgrst.object+json` handling so the two comments cannot be read as contradicting each other.
- ⚪ `test/integration/usage-gating.test.ts:412-428`, the unrecognised-`call_type` test leaves two `no_such_call_type_at_all` global rows behind on every run; the `afterAll` cleans only `TEST_CALL_TYPE`.

## On the three flagged decisions

**ONE — the `{ data: null, error: null }` mock in `gate.test.ts:124`. Agreed, and the reasoning verifies.** I read `@supabase/postgrest-js@2.112.3`'s `processResponse` directly (`dist/index.mjs:440-505`). Both halves of the comment's claim are accurate: the client-side `PGRST116` construction is gated on `isMaybeSingle` (line 469), and `isMaybeSingle` is set only by `maybeSingle()` (line 1205), so `.single()` never reaches it; and `if (body === "") {}` on a 2xx (line 450-451) leaves both `data` and `error` at their initial `null`. This mock encodes an HTTP-transport behaviour of a third-party client, not the application's own assumption about its own function — the distinction binding rule 11 turns on. `check_usage_gate`'s guarantee (always exactly one row) is not what is being mocked; the mock deliberately sidesteps it to test what `checkUsageGate()` does when the transport disagrees with that guarantee. That is the correct shape for a boundary test, and driving it through the real stack is impossible by construction, which is the honest reason a unit test is right here. My only note is the nit above: the shape is *more* reachable than the comment says, which strengthens the case for the branch.

**TWO — the kill switch "engaged" path having no committed integration test. The constraint is real and correctly diagnosed, but there is a viable alternative that was missed.** Vitest 4.1.11 (the installed version) supports `test.sequence.groupOrder` on a project: *"Projects with the same group order number will run together, and groups are run from lowest to highest"* (verified in `node_modules/vitest/dist/chunks/reporters.d.DtoKVV2s.d.ts:2618-2626`). A third project in `vitest.config.mts` — say `integration-serial`, including `test/integration/serial/**`, with `sequence: { groupOrder: 1 }` — runs after the default group has fully drained, and alone, because nothing else is in group 1. The switch-flipping file would then race nothing, and the main integration project keeps full file parallelism, so the ~30 second run stays ~30 seconds plus the runtime of that one file. That is materially cheaper than `fileParallelism: false`, which serialises everything. A cruder alternative also works today with no config semantics at all: make `test:integration` two chained `vitest run` invocations, the second scoped to the serial file.

I have verified the option exists and its documented semantics; I have not run it. Two things follow. The absence of the test itself I would rank only **Minor**, given `verify.md:28` records a hand-run observation with real evidence — that is a reasonable interim position and the reasoning behind it is unusually well documented. But spec 0011's Follow-up item (index.md:209) asserts *"The only real fix, if a second scenario ever needs the same real row: `fileParallelism: false`"*, and that claim is wrong. It should be corrected in this branch. `docs/reflexes.md` carries a standing rule about follow-up items being the stalest part of a spec because nobody re-reads them; this one would be stale from the day it was written. Note too that Minor #6 above is a second scenario needing the same treatment, so the "if a second scenario ever needs it" condition is already met by this same diff.

**THREE — refusals returned as `success({ allowed: false, reason })`. Agreed, and it is the right reading of the binding rules.** `failure()` unconditionally calls `markActiveSpanFailed()` regardless of severity (`result.ts:90-91`), and `failure_rate()` over `usage_gate.check` is the ratio AC-10's monitor computes, so a cap refusal reported through `failure()` would put the system working as designed into the numerator. `verify.md:47` proves the design holds under real traffic in the way that actually matters: the burst spans carry `failure.kind` of "(no value)", sitting in the denominator of both queries and the numerator of neither, and the filtered query returns 88 of 98 spans rather than collapsing to the failures alone. That single measurement is what makes the whole alert claim credible, and it is worth keeping visible — without it, a reader could not tell a working ratio from one whose denominator had vanished.

On the downstream-caller worry: it is real but small, and structural rather than a defect in this diff. `Result<UsageGateDecision>` does not force a caller to read `allowed` — `if (isFailure(gate)) return ...` followed by an unguarded outbound call type-checks cleanly, because the success value is a union whose members are only distinguished after narrowing. The fix, when feature 11 arrives, is inversion of control: a `withUsageGate(callType, fn)` that invokes `fn` only on the allowed branch makes "`ok: true` meant the search ran" structurally impossible instead of conventionally discouraged. I would not change `checkUsageGate()`'s signature for it now — the shape is right and the spec's API surface table records it — but it is worth a line in spec 0011's Consequences so feature 11 inherits the concern rather than rediscovering it.

## Strengths

- The `plpgsql` function is the strongest part of the change. The fixed lock order is stated, justified, and separated in the comments from the unrelated refusal precedence; every `ON CONFLICT` repeats its partial index's `WHERE` clause, with a comment saying what Postgres does if you forget; and the "never raises to signal a normal outcome" reasoning is exactly right about how a raised exception would traverse `.rpc()` and `attempt()`.
- The AC-14 defensiveness is the kind that usually gets cut. Checking the RPC's own `error` before any output column, and treating `data: null` with no error as fail-closed rather than as an absent decision, is a genuine silent-open closed by hand.
- `test/integration/usage-gating.test.ts`'s burst sizing is justified against measured numbers (`statement_timeout` 8s, PostgREST pool of 10, reconfirmed 2026-09-03) rather than a round number that felt safe.
- The database-fault test asserts `context.code === "42501"` specifically to prove *which branch* produced the failure, not merely that one occurred. That is the difference between a test that would survive the guard being deleted and one that would not.
- `docs/experiments/0011-usage-gating-and-kill-switch.md` §1 is a model of a debugging record: the hypothesis space enumerated, each branch ruled out with the observation that ruled it out, and the finding turned into a standing reflex rather than a note in one file.
- The two-span, two-monitor split (`kill_switch.read` separate from `usage_gate.check`) is correct and its consequence is implemented correctly: a kill switch read failure returns `success({ allowed: false, reason: "kill_switch_unavailable" })` from the parent, so the outage moves only its own ratio.

## Test coverage

Strong where the guarantees are real. Atomicity is proven against the live stack for all three windows, both globally (15 callers, 15 accounts, cap of 5, both day and month) and per account (30 calls, cap of 25), each asserting the allowed/refused split, the reason, and both counter columns. Precedence, isolated global refusals, the unconfigured and partially-configured cases, `session_missing`, and the fail-closed database fault are all covered against the real stack. The `{ data: null, error: null }` case is correctly a unit test, for the reason its own comment gives.

Gaps, in order of how much they matter: a profile-less caller (Major #1) is not tested at all and is actively masked by the fixture helper; the `getClaims()` throw path and the unknown-reason defensive branch (Minor #7) have no test; and the kill switch engaged path is a documented, hand-verified omission with a viable committed alternative (decision TWO above). `copy.test.ts` tests the constraints the spec placed on specific slots rather than the strings themselves, which is the right call and matches `auth/copy.test.ts`.
