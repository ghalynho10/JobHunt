# Verify: usage gating and kill switch · spec 0011

_Steps derived from spec 0011's acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

All steps below are unticked: nothing here has been built yet. Run against a real local database
connection unless a step says otherwise; none of this can be proved against a mock.

## Schema and grants

- [ ] `usage_cap` and `usage_gate_counter` both show `relrowsecurity` and `relforcerowsecurity` true, and neither `anon` nor `authenticated` holds any privilege on either table (`has_table_privilege(...)` for both roles, both tables, all of `select`/`insert`/`update`/`delete`, all false). Verifies **AC-15**.
- [ ] `service_role` holds `select` on `usage_cap` and nothing on `usage_gate_counter`. Verifies the grant design in `## Feature design`.
- [ ] `check_usage_gate`'s `EXECUTE` privilege: `authenticated` holds it, `PUBLIC` does not (`has_function_privilege('public', 'public.check_usage_gate(text)', 'execute')` is false). Verifies the "written out rather than inherited" hardening note in the Build plan.
- [ ] Insert two `usage_gate_counter` rows for the same `(call_type, period, period_start)` with `scope = 'global'` and `profile_id null` on both: the second insert is refused by the partial unique index. Then insert two `account` scoped rows for the same user and window: the second is also refused. Verifies the data model's partial unique index design.

## Atomicity and the refusal/attempt split

All of the following run through the Data API with a real minted test session (spec 0004), never the
direct database connection helper: that connection carries no `auth.uid()`, so it either fails
`usage_gate_counter`'s owner check constraint or has no privilege on the table at all under the specced
grants.

- [ ] Under cap, a `job_search` call returns `configured: true, allowed: true`, and both `attempt_count` and `consumed_count` increment by one on all three window rows. Verifies **AC-1**, **AC-9**.
- [ ] A burst of concurrent calls for one account, sized to what the Data API's own statement timeout allows (confirm the current timeout first; do not assume 200 is safe), lands exactly 25 allowed and the rest refused; every call in the burst increments that account's `attempt_count`, and `consumed_count` never exceeds 25. Repeat for the global daily window (66) and monthly window (2000) with enough concurrent callers to exceed each, sized the same way. Verifies **AC-1**, **AC-2**.
- [ ] A refused call's response is `success({ allowed: false, reason })`, never a `Failure`; confirm by asserting `result.ok === true` on a deliberately over cap call. Verifies **AC-5**.
- [ ] With both the account weekly cap and the global daily cap already exhausted, the next call for that account reports `account_week_cap_reached`, not a global reason. Verifies **AC-3**.
- [ ] With the kill switch engaged (`app_settings.kill_switch_enabled = true`), a call is refused with `kill_switch_engaged`, and no `usage_gate_counter` row for that call type changes at all (neither counter, on any window), and the RPC is never called at all (confirm by call count, not just by outcome). Verifies **AC-4**, **AC-5**.
- [ ] With `readKillSwitch()` forced to fail (a broken read, not an engaged switch), a call is refused with `kill_switch_unavailable`, distinct from `kill_switch_engaged`, and still with no `usage_gate_counter` row touched. Verifies **AC-4**.
- [ ] An unrecognised `call_type` (no matching `usage_cap` rows at all) returns `configured: false` and is refused through `failure()` with kind `usage_gate_misconfigured`, severity `unexpected`. Verifies **AC-6**.
- [ ] A `call_type` with only one or two of its three required `usage_cap` rows present behaves identically to a completely unconfigured one: `configured: false`, refused through `failure()`. Verifies **AC-6**.
- [ ] Stopping PostgREST (or revoking the gate function's own table access) mid test makes `checkUsageGate()` return `database_unavailable` rather than hanging, throwing past `attempt()`, or returning an unparsed success from a raised exception. Assert the returned kind is `database_unavailable` and that no output column (`configured`, `allowed`, `reason`) was read to reach that result, not merely that the call did not hang. Verifies **AC-14**, and the `configured` column design in `## Feature design`.
- [ ] Simulate an `.rpc()` response of `{ data: null, error: null }` (no thrown exception, no reported error, simply nothing back) and confirm `checkUsageGate()` still returns `database_unavailable` rather than treating it as an absent, harmless decision. Verifies **AC-14**.

## Identity

- [ ] A call made with no session returns `session_missing` before any database call happens (confirm via a query count or a deliberately broken database connection still failing the same way). Verifies **AC-13**.
- [ ] `check_usage_gate` takes no caller supplied identity parameter; confirm this from the function's own signature, not by testing a bypass that the type system already prevents. Verifies **AC-13**.
- [ ] Grep `src/features/usage-gating/` for `getSession(`: zero matches. Only `getClaims()` verifies the caller. Verifies **AC-13**.
- [ ] The `check_usage_gate` function's owning role carries `BYPASSRLS` (`select rolbypassrls from pg_roles where rolname = (select rolname from pg_proc join pg_roles on pg_proc.proowner = pg_roles.oid where proname = 'check_usage_gate')`), confirmed on both the local stack and the hosted development project, the same way spec 0002's `verify.md` P-1 confirmed it for the migration's own `postgres` role. Without this, `usage_cap` and `usage_gate_counter` return zero rows under forced row level security and the function reports every call as `usage_gate_misconfigured`, which is a permissions bug, not a real misconfiguration.

## Observability

- [ ] `usage_gate.check` appears in `docs/observability/spans.md` and opens as the first line of `checkUsageGate()`, before the `getClaims()` check and before the `readKillSwitch()` call. Verifies **AC-7**.
- [ ] Trace sampling reads 1.0 locally (the environment the forced failure smoke test actually runs in; do not infer this from a production shaped build, confirm it directly in the local run). Verifies **AC-8**, **AC-11**.
- [ ] Both alert rules (`usage_gate.check` and `kill_switch.read`) are visible in the Sentry dashboard for both the development and production projects, each with the stated 24 hour window, 20 attempt floor, and 20% threshold, matching what `docs/observability/README.md` records. Verifies **AC-10**.
- [ ] Each rule's query filters by failure kind (the `failure.kind` span attribute), not by span status alone: confirm a deliberately triggered `session_missing` does **not** move `usage_gate.check`'s ratio, and a deliberate cap refusal does not either. Verifies **AC-5**, **AC-10**.
- [ ] **The forced failure smoke test, run locally against the development Supabase project and the development Sentry project. Never production, never a Vercel Preview deployment** (Preview samples at 0.1, per `docs/observability/README.md`; most forced failures there would never be captured at all). Deliberately trigger `usage_gate_misconfigured` (an unknown `call_type`) enough times to cross the alert's attempt floor within its 24 hour window, and confirm a real Sentry alert is delivered, not just an issue created. Then confirm that a burst of ordinary cap refusals over the same period does **not** move the ratio, proving AC-5's design holds under real traffic, not just under a unit test. Repeat separately for `kill_switch.read`'s own alert, forcing a real read failure. Verifies **AC-11**.
- [ ] **The temporary `checkUsageGate()` call this test adds must load `/profile`, never `/health`.** Sentry's project level inbound filter "Filter out health check transactions" discards `/health`'s entire transaction, and every span nested inside it, at ingest, while an error event raised on the same request still arrives: a smoke test pointed at `/health` shows 26 `usage_gate_misconfigured` issues with zero matching `usage_gate.check` spans, which reads as a broken span rather than a filtered route (confirmed 2026-09-03, `docs/experiments/0011-usage-gating-and-kill-switch.md`). Verifies **AC-11**.

## Documentation

- [ ] `docs/observability/README.md`'s Status section no longer says no alert rule is defined.
- [ ] Spec 0001's follow-up item (index line 190) is ticked, naming this spec.
