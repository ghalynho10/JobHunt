# Review, feat/usage-gating-kill-switch, 2026-09-04 (round 3)

**Reviewed by**: Opus 5 (author on Sonnet 5)
**Scope**: 12 files, custom commit range `1eda2ce..55ce31e` (four commits: `68cab5e`, `8832332`, `76882c1`, `55ce31e`), not the whole branch
**Verdict**: Changes requested

Prior rounds, not re-litigated here: [2026-09-03-feat-usage-gating-kill-switch.md](2026-09-03-feat-usage-gating-kill-switch.md)
(round 1, two Majors) and [2026-09-04-feat-usage-gating-kill-switch.md](2026-09-04-feat-usage-gating-kill-switch.md)
(round 2, one Major, six Minors, four Nits). This round judges only what those four
commits did in response.

## Summary

The two things I was asked to look hardest at are both **correct**, and I verified
each empirically against the running local stack rather than by reading. The collapsed
`usage_cap` lookup returns the right shape, distinguishes a stored `cap_value = 0`
from an absent row, and genuinely closes the multi-snapshot straddle rather than
narrowing it. The new profile-less caller test does exercise the foreign key retarget's
real path, and fails hard if that fix is reverted — I confirmed that by reverting the
constraint inside a transaction and watching the gate call raise `23503`.

There is **one Major**, and it is not in the SQL logic: this range is the *second*
in-place edit of a migration file that this branch's own CI has already applied to the
hosted development project. `supabase db push` applies by version, never by content, so
the dev project is now silently running the pre-fix function and, more seriously, the
pre-fix `profile(id)` foreign key — the exact bug round 1 raised as a Major. The
workflow will stay green and say "Remote database is up to date". Production is not
affected.

Everything else is Minor or below. The follow-through on round 2's `fileParallelism`
finding is half-done: the config option landed, the four places whose prose argues
*against* it did not get updated, including two inside `vitest.config.mts` itself, which
now contradicts itself.

## Major

### 🟠 This range edits a migration the branch has already applied to the hosted development project, so the fixes never reach it, `supabase/migrations/20260902120000_usage_gating.sql:173-185`

**Problem**: `20260902120000_usage_gating.sql` was created on 2026-09-02 (`16b3f89`),
then edited in place twice: `e2ae743` on 2026-09-03 (the FK retarget and the
config-check reorder — the two round-1 Majors) and `68cab5e` on 2026-09-04 (this
range's collapsed lookup). In between, the branch's own record says the original
version was already applied to the hosted development project:

> *"Hosted development project confirmed by hand by the engineer 2026-09-03 in the
> project's SQL editor, **after PR #86 applied the migration there**"*
> — `docs/specs/0011-usage-gating-and-kill-switch/verify.md:42`

`.github/workflows/db-migrate.yml:31-52` runs `supabase db push --yes` against the
development project on every `pull_request` (`opened`, `synchronize`, `reopened`), and
this repo's own spec records what that command does:

> *"`supabase db push` compares the migrations directory against the migration history
> table and applies only what is missing."*
> — `docs/specs/0002-deployment-and-environments/rationale.md:104`

Version `20260902120000` is already in that project's history table, so every
subsequent push of this branch skips the file entirely and reports success.

**Why it matters**: the development project is what every preview deployment reads
(`db-migrate.yml:7`), and it is currently running the *original* function and the
*original* constraint. That means, on the hosted dev project:

- `usage_gate_counter.profile_id` still references `public.profile (id)`, so a signed
  in caller with no profile row still fails every gated call as `database_unavailable`
  and still lands in AC-10's alert numerator — round 1's Major, unfixed where it is
  actually deployed;
- `check_usage_gate` still bumps `attempt_count` before checking configuration, so any
  authenticated caller can still create unbounded `usage_gate_counter` rows by varying
  `p_call_type` — round 1's second Major, likewise;
- this range's collapsed lookup is not there either.

The workflow's own header names this failure by name: *"A change applied to one project
by hand is drift, and the two projects running different schemas is the failure this
exists to prevent."* Nothing in the branch would have caught it: the FK verify step
added in this range (`verify.md:16`) is ticked *"Confirmed 2026-09-04 against the local
stack"* only, while its sibling BYPASSRLS step two lines down was deliberately confirmed
against **both** the local stack and the hosted project. The one step written to pin the
FK's target checks the one environment that was never in doubt.

Production is clean: it has never had `20260902120000` applied, and gets the corrected
file whole on the merge to `main`.

**Verified vs inferred**: verified from the repo — the workflow triggers and commands,
the `db push` semantics as this project itself documents them, `verify.md:42`'s record
of the application, and the commit dates showing two edits after it. Inferred, because I
have no access to the hosted project — that its `supabase_migrations.schema_migrations`
still holds `20260902120000` and that its function body and constraint are therefore the
pre-fix ones. One query against the dev project settles it:
`select confrelid::regclass, pg_get_constraintdef(oid) from pg_constraint where conname = 'usage_gate_counter_profile_id_fkey'`
— if it reads `profile`, the drift is real.

**Suggested fix**: stop editing this file and add a follow-up migration that carries the
delta (`create or replace function public.check_usage_gate`, plus
`alter table public.usage_gate_counter drop constraint usage_gate_counter_profile_id_fkey`
and re-add it against `auth.users (id)`). That is idempotent for production, which will
apply both files in order and land in the same place, and it is the only thing that
reaches the dev project through the sanctioned path. Then re-run `verify.md:16` against
the hosted development project and record both environments in the evidence line, the way
the BYPASSRLS step already does.

## Minor

### 🟡 `fileParallelism: false` landed, but the four places arguing against it did not change, `vitest.config.mts:29-37`

**Problem**: round 2 asked for the option *"and reframe the surrounding comment"*. Only
the new project-level block (`vitest.config.mts:160-177`) was written. The same file's
top comment, thirteen lines above the option it now contradicts, still reads:

> *"WHAT `groupOrder` DOES NOT DO: isolate the files INSIDE `integration-serial` FROM
> EACH OTHER … every scenario needing the real shared state has to live in the SAME
> file"* — `vitest.config.mts:29-37`

Three more places carry the same now-false claim:

- `test/integration-serial/shared-global-state.test.ts:30-37` — *"which is the only
  ordering guarantee actually available here"* and, in the very last line, *"See
  `vitest.config.mts`'s own top comment and spec 0011's Follow-up list for why
  `fileParallelism: false` was rejected in favour of this."* It was not rejected; it is
  set, on this exact project, for this exact file.
- `test/integration/kill-switch.test.ts:41-47` — *"`groupOrder` isolates that whole
  PROJECT from this one but not its files from each other"*. The first clause is still
  true; the second no longer is.
- `docs/specs/0011-usage-gating-and-kill-switch/index.md:210` — the Follow-up still ends
  *"Every future scenario needing this same real shared state belongs in that one file
  too, not a new one of its own."*

**Why it matters**: the mechanical guard was added precisely so a future session would
not have to read a comment to be safe. Three of the four comments it would read now tell
it the guard was considered and rejected, and one of them is the file it would be editing.
The realistic bad outcome is not a race — it is someone removing `fileParallelism: false`
as dead config on the authority of the paragraph directly above it. `docs/reflexes.md`
carries the rule for exactly this: *"When correcting a claim that appears in more than one
place in a document, fix every instance in the same pass and state which ones were
checked"*, and the companion rule about follow-up items being the stalest part of a spec.

**Suggested fix**: one pass over the four locations. `groupOrder` isolates the project
from `integration`; `fileParallelism` serialises within it; the merged single file stays
the default because it is simpler, not because a split would be unsafe.

### 🟡 `cap_value = 0`, the documented per-call-type kill switch, is the one input the collapsed aggregate makes load bearing and nothing covers it, `supabase/migrations/20260902120000_usage_gating.sql:29-32`

**Problem**: the collapsed lookup now distinguishes "no row for this window" from "a row
whose cap is 0" purely by `max()` returning `NULL` versus `0`. That distinction decides
between `usage_gate_misconfigured` (an `unexpected` failure in AC-10's alert numerator)
and an ordinary refusal. Spec 0011 documents `cap_value = 0` as a real, supported lever
twice (`index.md:99`, `index.md:200`) and the migration repeats it at line 29-32. No test
in `test/integration/usage-gating.test.ts` and no step in `verify.md` sets a cap to 0.

**Why it matters**: this is safe today and I confirmed it directly — against the running
stack, a `call_type` with all three caps at 0 returns `configured: t, allowed: f, reason:
account_week_cap_reached` with `attempt_count 1, consumed_count 0` on all three windows,
while a partially configured one returns `configured: f` and writes nothing. It is safe
structurally, not incidentally: `cap_value` is `not null`, so `max()` can only return
`NULL` for an empty filter. That is a good property, and it is the kind of property that
survives exactly as long as nobody makes `cap_value` nullable or swaps `max()` for
something else. Nothing currently fails if they do.

**Suggested fix**: one case on the existing `gate_test` call type with all three caps at
0, asserting the refusal reason and that no `consumed_count` moved — it fits the
`withDedicatedCaps` helper already in the file. A `verify.md` line naming the 0-vs-missing
distinction would be the cheaper half if a test is not wanted.

### 🟡 `max()` is unqualified, in the one function whose own comment says every name inside is qualified, `supabase/migrations/20260902120000_usage_gating.sql:174-182`

**Problem**: the header above this function states the rule and why it exists:

> *"`set search_path = ''` is not hygiene on a definer function, it is the difference
> between a safe function and a privilege escalation, so every name inside is fully
> qualified."* — lines 119-121

Every other call in the body obeys it: `pg_catalog.now()`, `pg_catalog.date_trunc()`,
`auth.uid()`. The three new aggregates are bare `max(...)`.

**Why it matters**: not a vulnerability, and I checked rather than assuming — I ran the
identical aggregate under `set local search_path = ''` on the running stack and it
resolved correctly, because `pg_catalog` is implicitly searched when it is not named in
the path, and with an empty path there is no user schema left that could shadow it. The
cost is that the file's own stated invariant is now false, in a `security definer`
function where that invariant is the security argument. A reader checking the claim finds
a counter-example immediately and learns the comment is approximate.

**Suggested fix**: `pg_catalog.max(...)` in the three places, or soften the header claim
to name the exception. The first is one word each and keeps the stronger sentence.

### 🟡 The two reworded failure messages are indistinguishable from each other and one now opens `COPY-5` verbatim, `src/lib/usage-gating/failures.ts:40`

**Problem**: round 2's nit was about `usage_gate_misconfigured` only. The fix reworded
that one to *"Search isn't available right now. Try again shortly."* and also reworded
`database_unavailable`, which was not raised, to *"Search isn't working right now. Try
again shortly."* Those two differ by one word. The second is also, character for
character, the opening clause of `copy.ts:58`'s `COPY-5`: *"Search isn't working right
now, and the reason isn't clear yet…"*, which is a **refusal** the gate produces on
purpose, not a failure.

**Why it matters**: feature 11 renders both paths on the same screen. A person, and more
importantly a support conversation reconstructed from what the person saw, can no longer
separate a broken kill switch read from a database fault from a misconfigured call type —
three different operator responses behind three near-identical sentences. `copy.ts:5-10`
also records that this feature's user-facing sentences are *"written by the engineer, used
verbatim"* and that reinventing them is a spec change first. `failures.ts`'s strings sit
outside spec 0011's Copy table so that rule does not bind them literally, but they are
marked *"Safe to show a user"* (line 15) and they are now colliding with the strings it
does bind.

**Suggested fix**: keep the round-2 nit's fix, revert or re-differentiate
`database_unavailable`'s, and let the engineer write the replacement rather than an agent —
the same convention `copy.ts` already states for this feature.

## Nits

- ⚪ `supabase/migrations/20260902120000_usage_gating.sql:158-172`, round 2's fourth nit
  asked to shorten the 16-line in-body history note by pointing at the spec. The
  2026-09-03 note was cut to four lines and a ten-line 2026-09-04 note was added in its
  place, so the block is 15 lines instead of 16. The spec paragraph it points to
  (`index.md:124`) now carries the new reasoning in full too, so the same three-lines-and-
  a-pointer treatment applies.
- ⚪ `test/integration/usage-gating.test.ts:209`, the new describe's title carries the
  parenthetical *"(spec 0011, the auth.users FK fix)"* while every other describe in the
  file cites acceptance criteria (`(AC-1, AC-9)`, `(AC-3)`). The FK is a data-model row
  rather than an AC, so there may be nothing to cite — worth one glance for consistency.

## Strengths

- The collapsed lookup is the right shape for the problem, not just a smaller one. Because
  `usage_cap`'s primary key is `(call_type, scope, period)`, each `filter`ed `max()` sees at
  most one row, so the aggregate loses nothing, and the `call_type`-only predicate rides the
  same primary key index the three separate lookups used. It reads better than what it
  replaced, which is rare for a concurrency fix.
- It closes the race rather than narrowing it. One statement is one snapshot under `read
  committed`, so an admin edit wrapped in a transaction is seen whole or not at all. The
  remaining exposure — an admin editing the three rows in three separate transactions — is a
  property of the edit, not of this code, and no amount of care here would fix it.
- The new profile-less test is aimed at the right thing and proves it honestly. It uses
  `freshUser()` rather than `freshSession()` deliberately, and the comment says why. I
  checked the counterfactual: reverting the constraint to `profile (id)` inside a
  transaction and calling the gate for a profile-less user raises `23503` from the account
  insert, which reaches `checkUsageGate()` as an `.rpc()` error and returns
  `database_unavailable`, so the test's `isFailure` guard throws. It fails if the fix goes
  away.
- The test also cleans itself up through the fix under test: `deleteFixtureUser` removes the
  auth user and the `on delete cascade` takes the counter row with it, which quietly
  exercises the cascade half of the FK decision as well.
- `fileParallelism: false` is genuinely correct as config, not just plausible. Per-project
  `fileParallelism: false` forces that project's `maxWorkers` to 1
  (`coverage.DM_a_rWm.js:223-225`), and `groupSpecs` gives group 1 its own worker count
  (`cli-api.CnMVyzaz.js:3832-3896`), so the project's files serialise while `integration`
  keeps full parallelism. `vitest list --project integration-serial` resolves clean, no
  warning about an unsupported project-level option.
- `spans.md`'s numerator correction is consistent with what the Sentry rule actually does:
  the monitors filter `failure.kind is not session_missing` (spec `index.md:35`), a negative
  filter, so naming `external_service_failed` as a third numerator kind is describing
  reality rather than requiring a dashboard change. Worth saying because the obvious worry —
  a doc claiming a filter nobody updated — does not apply here.

## Test coverage

The suite is in good shape and I ran it. `pnpm exec vitest run --project unit
src/lib/result.test.ts` → 8 passed, which covers the message assertion `68cab5e` had to
update. `pnpm exec vitest run --project integration test/integration/usage-gating.test.ts`
against the running local stack → 12 passed, including the new profile-less case.

What the range adds is well targeted: the one scenario the FK retarget existed for now has
a committed test, and it is the kind that fails loudly rather than quietly if the fix is
reverted.

Two gaps, both already filed above. `cap_value = 0` is untested (Minor), and it is the one
input where the new aggregate's `0`-vs-`NULL` behaviour decides between an alert-numerator
failure and an ordinary refusal. The snapshot race itself has no test and should not have
one — it is a sub-millisecond timing window that no deterministic integration test can pin,
and the existing partial-configuration test already covers the query shape the fix
introduced. The migration-drift Major is not a coverage problem at all: no test running
against the local stack can see it, which is precisely why the hosted half of `verify.md:16`
matters.
