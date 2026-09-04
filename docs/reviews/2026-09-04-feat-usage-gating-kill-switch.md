# Review, feat/usage-gating-kill-switch, 2026-09-04

**Reviewed by**: Opus 5 (author on Sonnet 5)
**Scope**: 26 files, branch vs `main` (merge base `4f4fe49`)
**Verdict**: Changes requested

## Summary

This is a re-review of the branch after the two Majors from
[2026-09-03](2026-09-03-feat-usage-gating-kill-switch.md) were fixed. Both fixes are
correct, and I judged each on its own terms rather than against the finding that
prompted it: the foreign key retarget to `auth.users(id)` changes nothing about
cascade correctness or isolation and is the right call, and moving the
configuration check ahead of the counter upserts introduces no new race, no new
deadlock exposure, and no weakening of AC-1's atomicity claim. Details of both
analyses are in `## On the two fixes` below, because "no finding" is itself a
result worth recording. The new `integration-serial` project genuinely delivers
the ordering its comments claim — I verified `groupOrder`'s scheduling in the
installed Vitest's own source, not just its types.

What is missing is proof. The FK retarget's entire purpose is to make a
signed-in caller with no `profile` row work, and no committed test drives that
caller: every gate call in the suite seeds a profile row first, including the
one in the new serial file, and `verify.md` gained no step for it. The prior
review asked for this test by name. Beyond that, the fix propagated unevenly
across the repo: the generated `database.types.ts` still declares the old
foreign key (I proved this by regenerating against the running stack), the
integration suite's own doc comment still states the old behaviour as fact, and
`spans.md` still carries the two-kind alert numerator that was corrected
everywhere else.

## Major

### 🟠 The foreign key fix has no test and no verify step, and the suite actively masks the case it fixes, `test/integration/usage-gating.test.ts:52` and `test/integration-serial/shared-global-state.test.ts:98`

**Problem**: the retarget exists so that a signed-in user with no `profile` row
can make a gated call. Nothing proves that they can. `freshSession()`
(`usage-gating.test.ts:52-68`) inserts a `profile` row for every user it mints,
and every gate call in that file goes through it; the new AC-14 test in
`shared-global-state.test.ts:98-105` inserts one too, by hand. The only
profile-less call in the whole suite is the `session_missing` test
(`usage-gating.test.ts:683`), which uses an empty cookie jar and returns before
the RPC is ever reached, so it exercises nothing about the foreign key.
`docs/specs/0011-usage-gating-and-kill-switch/verify.md` gained no step either —
its `## Identity` section has four steps and none of them names a profile-less
caller, and its `## Schema and grants` section has no step asserting the FK's
target at all.

The prior review's suggested fix said this explicitly: *"add a committed
integration test for a minted user with no profile row — the suite already has
`mintFixtureUser()` separate from the profile insert, so the case is one call
away."* That half was not done.

**Why it matters**: three things follow. First, `docs/scope/scope.md:218` now
records the Major as fixed, and `verify.md` is this project's ticked-evidence
document, so the repo asserts a guarantee it holds no evidence for. Second, the
regression is silent: if a later migration reverts the FK, or feature 28 adds a
`profile`-joined view or a `select` policy that assumes a profile row exists,
nothing fails — the suite would go green because every fixture user has a
profile. Third, `freshSession()`'s profile insert is now unnecessary for the
gate's own sake and is only there because of the bug that was fixed, so the
masking will look deliberate to the next reader.

I verified the fix itself is correct against the running stack —
`usage_gate_counter_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES
auth.users(id) ON DELETE CASCADE` — so this is a coverage finding, not a
correctness one. It is a Major rather than a Minor because the branch claims
the fix is done, the suite is arranged so the untested case cannot surface by
accident, and the rubric puts uncovered security- and error-path logic at that
level.

**Suggested fix**: one test in `usage-gating.test.ts` that mints a user with
`mintFixtureUser()`, mints a session, calls `checkUsageGate(JOB_SEARCH, …)`
without inserting a profile row, and asserts `allowed: true` plus an
`account` scoped counter row whose `profile_id` is that user id — the assertion
that would have failed before the retarget. Add the matching `verify.md` step
under `## Identity`, and add a `## Schema and grants` step asserting the
constraint's target so the FK is pinned by something other than a comment. While
there, add one line to `freshSession()`'s doc comment saying the profile row is
no longer required by the gate and is kept only to match the other integration
files.

## Minor

### 🟡 `database.types.ts` still declares the old foreign key; it was never regenerated, `src/lib/supabase/database.types.ts:313-321`

**Problem**: the committed generated types say
`usage_gate_counter.profile_id` → `referencedRelation: "profile"`. It does not.
I regenerated with the project's own `db:types` command against the running
local stack and diffed: the only difference is this block, which should be
`Relationships: []` (the generator omits foreign keys into non-exposed schemas,
which is also why `profile.id`'s own FK to `auth.users` appears nowhere in this
file). The migration was edited but `pnpm db:types` was not re-run.

**Why it matters**: a generated file that has drifted from the schema is worse
than no file, because it is the thing readers trust instead of the migration.
Nothing catches it — `typecheck`, `lint` and both test projects all pass with
the stale block, and CI has no `db:types --check`. The practical bite lands on
whoever writes the first embedded query on this table (feature 28 is the likely
one): `.select("*, profile(*)")` would type-check and fail at runtime with a
PostgREST relationship error.

**Suggested fix**: run `pnpm db:types` and commit the result. Worth a separate
thought about whether CI should diff the generated file against a freshly
generated one, but that is not this branch's work.

### 🟡 The integration suite's own doc comment still asserts the pre-fix foreign key as the reason it seeds a profile, `test/integration/usage-gating.test.ts:42-51`

**Problem**: *"`usage_gate_counter.profile_id` references `public.profile (id)`
(spec 0011's own data model), so an account scoped gate call for a user with no
profile row is refused by that foreign key, not by anything this feature
decides."* Both sentences are now false, and the second describes the exact bug
the branch fixed as though it were still current behaviour.

**Why it matters**: this is the comment the prior review quoted as evidence the
suite *concealed* the bug. It is still there, unchanged, in a file this branch
touched. `docs/reflexes.md` carries a standing rule about fixing every instance
of a corrected claim in the same pass; this is the instance that was missed, and
it is the one most likely to be read by whoever writes the test Major #1 asks
for — it tells them the test cannot pass.

**Suggested fix**: rewrite it to say the FK targets `auth.users(id)`, that the
profile row is no longer needed for the gate, and why it is kept anyway (parity
with the other integration files), citing spec 0011's data model row.

### 🟡 `spans.md` still records the two-kind alert numerator that was corrected everywhere else, `docs/observability/spans.md:28`

**Problem**: the `usage_gate.check` row reads *"the numerator is
`usage_gate_misconfigured` and `database_unavailable` only"*. The prior review's
Minor #1 established that `external_service_failed` is a third kind this span
can carry and that the monitor's `failure.kind is not session_missing` filter
admits it. That correction landed in `docs/observability/README.md`'s `## Alert
rules`, in spec 0011's AC-10, in its Build plan step 6, and in
`gate.test.ts:189-198` — but not here, and the word "only" makes it a positive
false claim rather than an omission.

**Why it matters**: `spans.md` is the span registry AGENTS.md's binding rule 4
points at, so it is the file a later session consults when adding a span or
reconciling a monitor. It now contradicts the README it sits beside, and the
contradiction is in the direction that reads as authoritative.

**Suggested fix**: name the third kind in that table row, matching the README's
own wording, and drop "only" or extend it to three.

### 🟡 `integration-serial`'s one-file invariant is enforced only by prose, and the cheap mechanical guard was rejected for a reason that does not apply to this project, `vitest.config.mts:129-160`

**Problem**: the config comment says *"`include` above deliberately matches one
file"* — it does not. `include: ["test/integration-serial/**/*.test.ts"]`
matches any test file added to that directory, and a second one would run in
parallel with the first, reproducing exactly the race the branch already hit
once. The whole invariant rests on a future session reading two long comments
before adding a file.

The mechanical guard exists and is free here. `fileParallelism: false` set on
this project alone forces `maxWorkers = 1` for it (verified in the installed
Vitest's config resolution, `node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js:223-225`),
and `groupSpecs` then gives group 1 a single worker, so its files serialise
instead of racing. The comments argue against `fileParallelism: false` at
length, but every one of those arguments is about applying it to the
`integration` project, where it would serialise dozens of files. Applied to a
project that holds one file, the cost is exactly zero.

**Why it matters**: the branch's own history is the argument. Two files were put
here, they raced, and the recovery was to merge them and write a comment. The
next scenario needing real shared state is a near certainty — spec 0011's own
follow-up list anticipates it — and the failure mode is an intermittent test
failing for a reason that looks nothing like its cause, which is the specific
thing this project spent two attempts learning.

**Suggested fix**: add `fileParallelism: false` to the `integration-serial`
project alongside `sequence.groupOrder: 1`, and reframe the surrounding comment:
`groupOrder` isolates the project from `integration`, `fileParallelism`
serialises within it, and the two together mean a second file added here is
correct by construction rather than by convention. Keeping the merged file is
still the right default; this just stops a split from being silently wrong.

### 🟡 `verify.md` credits the AC-14 database fault step to a file that no longer holds that test, `docs/specs/0011-usage-gating-and-kill-switch/verify.md:32`

**Problem**: the step is ticked with *"Covered by the committed
`test/integration/usage-gating.test.ts` (revokes the owning role's own table
access mid test…)"*. That test moved to
`test/integration-serial/shared-global-state.test.ts` in this same branch.

**Why it matters**: `verify.md` is the evidence record, and a ticked step whose
named evidence is not where it says it is cannot be re-checked. `docs/reflexes.md`'s
rule about follow-up items being the stalest part of a spec applies to ticked
verify evidence for the same reason — nobody re-reads it until it matters.

**Suggested fix**: point the citation at the new path. Line 28's kill switch
step is worth revisiting in the same pass (see nits).

### 🟡 The three `usage_cap` lookups are three statements, so a concurrent cap edit can be observed half-applied, `supabase/migrations/20260902120000_usage_gating.sql:174-194`

**Problem**: `check_usage_gate` is `VOLATILE` (confirmed on the running stack:
`provolatile = 'v'`), so under `READ COMMITTED` each of its embedded statements
takes a fresh snapshot. The three cap lookups are three separate `select`s. An
admin transaction that inserts or deletes all three rows for a `call_type`
atomically can therefore commit between the first and the second, and the gate
call sees one state for the day cap and another for the month and week caps.
Since a missing row on any of the three returns `configured: false`, the
observable result is a spurious `usage_gate_misconfigured`.

**Why it matters**: `usage_gate_misconfigured` is `unexpected` severity, so it
raises an error-level Sentry event and lands in AC-10's alert numerator — the
same harm shape as the Major this branch just fixed, arriving from a different
door. The probability is genuinely tiny: `usage_cap` is edited by hand or by
migration, not on the request path, and the window is sub-millisecond. That is
why this is a Minor and not higher.

To be explicit, since it is the thing I was asked to look hardest at: **the
reordering did not create this.** The pre-fix function read the three caps as
three separate statements too, just later in the body. What the reorder changes
is that these are now the function's first statements, which if anything
narrows the window rather than widening it.

**Suggested fix**: collapse the three lookups into one statement — a single
`select` with three filtered aggregates or three scalar subqueries over
`usage_cap` — which gives all three values one snapshot and removes the
straddle entirely. It also reads better than three near-identical queries.

## Nits

- ⚪ `docs/specs/0011-usage-gating-and-kill-switch/verify.md:28`, the kill switch
  step is still ticked with *"a throwaway integration test flipped the real
  `app_settings` row"*. A committed test now proves it
  (`test/integration-serial/shared-global-state.test.ts:41`); the evidence line
  understates what the branch actually has.
- ⚪ `test/integration-serial/shared-global-state.test.ts:119-121`, the revoke
  still leaves the local stack with a permanently broken gate if the process
  dies between the revoke and the `finally` (Ctrl-C, CI timeout, OOM). The
  prior review raised both halves of this hazard; the cross-file half was fixed
  by the move, this half was not. One sentence in the comment naming
  `pnpm db:reset` as the recovery would close it.
- ⚪ `src/lib/usage-gating/failures.ts:44`, `"This call type has no usage cap
  configured."` is marked *"Safe to show a user by the `Failure` contract"* but
  is operator language — "call type" and "usage cap" are internal nouns. Compare
  `copy.ts`'s five sentences, which are careful about exactly this.
- ⚪ `supabase/migrations/20260902120000_usage_gating.sql:158-173`, the
  correction note inside the function body is 16 lines of history about a
  version that never shipped outside this branch. It is good history, but
  `docs/specs/0011-usage-gating-and-kill-switch/index.md:127` and AC-9 already
  carry it in full; three lines pointing there would keep the function readable.

## On the two fixes

Both were judged as new code. Neither produced a finding, and the reasoning is
recorded here so a later session does not have to redo it.

**ONE — the foreign key retarget to `auth.users(id)`. Sound, and it changes
nothing about cascade correctness or isolation.**

*Cascade.* `public.profile.id` itself is
`references auth.users (id) on delete cascade`
(`supabase/migrations/20260825162457_data_model.sql:56`), so deleting an auth
user already cascaded to `profile` and, transitively, to
`usage_gate_counter`. Pointing straight at `auth.users` makes that one hop
instead of two and produces the identical outcome for the only deletion path
that exists (feature 31's account deletion, unbuilt). Under concurrent deletes
there is no difference either: both shapes are ordinary RI cascades taking row
locks on the referencing rows, and the retarget removes a level from the chain
rather than adding one. Confirmed against the running stack: `confdeltype = 'c'`.

*Orphans.* Yes, a `usage_gate_counter` row can now name an auth user with no
`profile` row — that is the point of the change, not a side effect, and it is
also reachable in the other direction if a future feature ever lets someone
delete a profile without deleting the account (spec 0011 index:199 records
exactly this narrowing). I checked whether anything treats that orphan as
impossible. Nothing does. The only reader and writer of the table is
`check_usage_gate`, which never mentions `profile`; no other migration carries a
foreign key into `usage_gate_counter`; no application code queries it (it has no
grant to any Data API role — `relacl` on the running stack is
`{postgres=arwdDxtm/postgres}`, owner only). The one place that *claims*
otherwise is the generated `database.types.ts`, which is Minor #1 above and is
stale rather than load-bearing. Feature 28's anticipated `select` policy would
key on `profile_id = auth.uid()`, which needs no profile row either.

*Isolation.* Spec 0003's invariant 2 — "No row in any of the six is reachable by
a user other than its owner" — is scoped to the six data-model tables, and
`usage_gate_counter` is not one of them; it is strictly tighter, with RLS enabled
and forced (confirmed `t, t`), no policy, and no grant to `anon`,
`authenticated` or `service_role`. A foreign key confers no read privilege on
its referenced table, so nothing the `SECURITY DEFINER` function can read or
join changed: it could already reach `auth.users` as `postgres`, and it reads
`auth.uid()` rather than joining anything. The one theoretical leak from a
foreign key — probing a referenced table's contents by observing violation
versus success on an insert — needs insert privilege on the referencing table,
which no Data API role has, and the only insert path writes `auth.uid()` as the
value. Isolation is unchanged.

**TWO — checking configuration before taking the counter locks. Safe, and the
lock-order invariant is intact.**

*The lock order is identical, not merely equivalent.* The three cap `select`s run
global-day, global-month, account-week
(`20260902120000_usage_gating.sql:174-187`) and the three upserts lock in the
same order (`:200-220`). But the ordering question does not arise in the first
place: plain `select`s take no row locks. Under `READ COMMITTED` they read the
last committed version through MVCC and never block on another transaction's row
locks, so they cannot enter a wait-for graph and cannot participate in a
deadlock cycle. The only lock they take is `ACCESS SHARE` on `usage_cap`, which
conflicts with nothing but DDL. The fixed lock order the comment describes is
still exactly the three upserts, in the same sequence, on every call.

*No new time-of-check window that matters.* Reading unlocked configuration before
the locks does mean a cap value could change between the read and the decision.
But the old ordering had the mirror-image window — locks first, unlocked cap read
after — and neither order is safe against a concurrent cap edit, nor claims to
be. AC-1's atomicity guarantee is specifically about `usage_gate_counter`'s three
windows being read and updated together in one transaction under their own row
locks, and that is untouched: all three upserts, the comparison, and the three
`consumed_count` updates still happen inside one transaction with the locks
held. `usage_cap` is admin-edited configuration with no request-path writer, and
a cap edit racing a gate call by microseconds resolves to "one call decided
against the old cap," which is the same answer as if it had arrived a
millisecond earlier. The one genuinely observable artefact is the three-snapshot
straddle, which is Minor #6 above and predates the reorder.

*The reorder is also correct about what it claims.* An unconfigured `call_type`
now writes nothing at all: `usage-gating.test.ts:439-443` asserts zero rows, and
that assertion is a real regression guard, not decoration. The AC-14 test's
reasoning about the revoke is right too — the revoke covers `insert` and
`update` only, so the `select`s that now run first are unaffected and the first
failing statement is still the counter upsert, which is what makes `42501` the
proof of which branch fired.

**THREE — the `integration-serial` project. `groupOrder` delivers the isolation
claimed, verified in the implementation and not only the types.** The prior
review verified the option's documented semantics from Vitest's shipped `.d.ts`;
this branch acted on it, so I checked the runtime. `groupSpecs`
(`node_modules/vitest/dist/chunks/cli-api.CnMVyzaz.js:3849-3915`) buckets
specifications by `sequence.groupOrder`, and `executeTests`
(`:3762-3780`) iterates those buckets with
`const groupResults = await Promise.allSettled(promises)` inside the loop — so
group 1 does not begin until every group 0 file has settled. The default is 0
(`coverage.DM_a_rWm.js:478`, `resolved.sequence.groupOrder ??= 0`), so `unit` and
`integration` are both group 0 and `integration-serial` is alone in group 1. The
config's claim about what `groupOrder` does *not* do is equally accurate: within
a group, `tasks.map(…)` starts every file concurrently against a pool sized by
`resolveMaxWorkers`, so two files in this project would indeed race. That is
Minor #4's subject — the diagnosis is right, only the enforcement is prose.

## Strengths

- The comments on both fixes explain the reasoning that was *wrong*, not just
  the conclusion that is right. The migration's `:158-173` note and spec 0011's
  AC-9 both state the discarded argument ("an attempt nobody could serve is
  still worth seeing") before saying why it failed, which is what stops a later
  session from re-deriving it.
- `usage-gating.test.ts:429-443` turned the unbounded-write finding into an
  assertion rather than a comment, and the assertion is the one that would
  actually fail if the ordering regressed. The prior review noted this test was
  *leaving junk rows behind on every run*; it now proves the opposite.
- The `integration-serial` failure was found by running it, not by reasoning
  about it, and the branch says so plainly in three separate places
  (`vitest.config.mts:39-46`, the test file's own header, spec 0011's
  follow-up). A wrong first attempt documented this honestly is more useful than
  a right first attempt documented not at all.
- The AC-14 test's justification for keeping `job_search` after the reorder is
  precise about which statement the revoke breaks and why the transaction rolls
  back. That is the kind of reasoning that usually goes unwritten and then goes
  wrong.
- `result.ts`'s severity doc now names the cap refusal as the case that is
  deliberately *not* a failure, with the alert-numerator reason attached. The
  correction did more than remove the wrong example.
- `result.test.ts:171-210` asserts the span attribute and the status
  independently, with the empirical reason the attribute is needed at all. It
  would fail if either half were dropped, which is the point.

## Test coverage

Unit suite runs clean: 59 files, 767 tests, 5s. The two branches the prior
review flagged as uncovered are now covered and covered well —
`gate.test.ts:168-186` drives a `reason` outside the closed set through the new
Zod parse, and `:199-212` drives the `getClaims()` throw and asserts the RPC was
never reached. The `beforeEach(vi.clearAllMocks)` added at `:47` is a real fix,
not housekeeping: without it the "never called" assertions in those tests would
have been reading other tests' call logs, and the comment says so.

The gap is the one Major above: no committed test drives a signed-in caller
without a `profile` row, which is the entire behaviour the foreign key change
exists to produce, and the fixture helper is arranged so the case cannot occur
accidentally. Everything else the branch changed is covered — the reorder by the
zero-rows assertion, the serial project by the two scenarios it now holds, the
span attribute by `result.test.ts`. `copy.test.ts` continues to test the
constraints the spec placed on specific slots rather than the strings, which
remains the right call.
