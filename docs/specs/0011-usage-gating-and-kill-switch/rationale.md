# Rationale: usage gating and kill switch

This file carries the full context, the options weighed, and the sourced references for
[index.md](index.md). `/develop` does not read this file; it is the decision record for a human,
and for a later `/architect` run that revisits this decision.

## Context

See index.md's `## Context` for the build facing summary. The fuller picture:

This design conversation ran unusually deep because the starting numbers offered turned out to be
wrong by roughly an order of magnitude. An earlier version of `docs/jobhunt-carry-forward.md`
attributed Adzuna's rate limits to their terms of service; on 2026-09-02 that attribution was
checked against `developer.adzuna.com/terms`, `/docs/search`, and `/overview`, found nothing there,
and concluded the limits were in the developer docs under "Default API access limits" (25 hits a
minute, 250 a day, 1,000 a week, and 2,500 a month) rather than the terms. That negative conclusion
was itself corrected on 2026-09-04: the page hosting the "Default API access limits" heading is
`https://developer.adzuna.com/docs/terms_of_service` (checked 2026-09-04), which is Adzuna's terms
of service, so the original attribution was correct all along. The engineer supplied the corrected
numbers and the full reasoning chain, including which of the four limits actually binds (the month,
once the day and week are worked forward), and that reasoning is carried into this spec rather than
re-derived.

Three design tensions shaped the final shape, each worth recording since none is obvious from the
schema alone:

**Two budgets, one shared key.** Adzuna's limits are per API key, and this app uses one key for every
user. A per account cap alone protects one person from themselves; it does nothing for the aggregate.
The design needs both an account scoped ceiling (fair to one user) and an app wide ceiling (protects
the key), checked together, atomically, so neither can be satisfied while the other is silently
exceeded by concurrent traffic.

**Attempts must be counted even when nothing is spent.** The whole point of this feature's own alert
rule (AC-10) is to see a hammered, blocked period as different from a quiet one. That is only possible
if a refused call still increments something. The naive version of "atomic budget check" rolls back
everything on refusal, discarding the very count that would make refusal visible. The design that
survived this conversation splits the concern into two counters on the same row, one bumped
unconditionally (attempts) and one bumped only when the call is actually allowed (consumed budget),
which needs no exception handling, no savepoint, just two plain updates in a fixed order.

**A rate limit alert must not alert on itself working.** `src/lib/result.ts`'s `failure()` marks the
active span failed on every call, regardless of severity; severity only changes what Sentry does with
it (error level versus info level), not whether it counts toward the ratio. A cap refusal is common by
design, the system doing exactly what it is built to do. Routing it through `failure()` would make
this project's first alert rule fire on ordinary, correct operation, which is a worse failure mode than
having no alert at all: a rule that cries wolf gets muted, and then the outage it was meant to catch is
silent again. The design settled on here reports a refusal as a successful decision whose value happens
to be "no," never as a failure, so `usage_gate.check`'s ratio only ever reflects genuine breakage
(`usage_gate_misconfigured`, `database_unavailable`).

## Options considered

See index.md's `## Options considered` for the three options and their pros and cons. The forces that
decided between them:

**A fourth, narrower option surfaced during cross check: lower the global daily cap from 66 to 64.**
At 64 a day, the monthly window becomes provably unreachable the same way the weekly counter already
is (64 x 31 = 1,984, under the 2,000 ceiling on every possible month length), which would let the
month window and its row lock be dropped entirely, the same simplification already applied to the
week. Declined, deliberately, and for a different reason than the week was kept out: the week was
dropped because Adzuna enforces that exact limit itself, so a redundant local copy of it can never
fire. The month is not redundant in that sense, it is the actual number this whole feature exists to
protect, the one real ceiling on what this app is licensed to spend. Making it structurally unable to
ever bind would mean the feature's headline number stops doing any work, and the day cap, chosen to
close the rolling window gap, would quietly become the only real constraint instead. Kept at 66, and
the month window stays.

Option 3 (application level read then write) was ruled out on spec 0001's own terms: its binding rule
that atomic work is one statement in the database names this exact gate as the reason the rule exists,
so building it as a read then write in TypeScript would not just be a worse choice, it would be the
specific thing that rule was written to prevent.

Option 2 (fold the kill switch read into the atomic function) was the harder call. It removes a real,
if small, race: under Option 1, a kill switch flipped on between the pre-check read and the atomic
window check lets one call through. But Option 2's cost is not symmetric with that benefit. Spec 0002's
binding rule 4 exists so that `app_settings`, the one table whose read failure is defined project wide
to mean "everything stops," has exactly one reader, and that singularity is what makes the rule
auditable at a glance rather than something that has to be checked file by file. Option 2 would need
that rule amended the moment it shipped, trading a standing architectural guarantee for closing a race
window measured in the time between a human operated dashboard flip and the next request, which is not
a window an attacker or a bug can reliably exploit, only a coincidence a real operator might occasionally
hit during the exact minute they are already intervening by hand.

## References

**Project sources** (verifiable, in this repo):
- `docs/jobhunt-carry-forward.md`, "Feature 10, Usage gating and kill switch" section, corrected 2026-09-02: the source of the four Adzuna limits and the reasoning for which one binds.
- Spec 0001 (`docs/specs/0001-stack-and-architecture/index.md`), index line 34: atomic work is one statement in the database, naming this feature's gate directly.
- Spec 0001, index line 123: the attempt counter is incremented inside the atomic gate function itself, at the moment the decision is made, "built with that function, not deferred."
- Spec 0001, index line 171: trace sampling at 1.0 on gated operations costs more Sentry quota than a sampled configuration and needs revisiting if volume ever grows, the dependency this spec's Key invariants section names as a live coupling.
- Spec 0001, index line 190: feature 10 owns building binding rule 4 and must say so in its done when clause, including the forced failure smoke test firing in a non production project, a qualifier `docs/scope/scope.md` line 208 does not carry.
- Spec 0002 (`docs/specs/0002-deployment-and-environments/index.md`), index line 170, binding rule 4: only `src/lib/kill-switch.ts` reads `app_settings`. This is the rule Option 2 above would have needed to amend.
- `supabase/migrations/20260821120000_app_settings.sql`, lines 57 and 61 (`enable` then `force row level security`), line 76 (`revoke all on public.app_settings from anon, authenticated`), line 92 (the one `grant select ... to service_role`): the pattern this spec's two new tables follow.
- `supabase/migrations/20260830230000_before_user_created_hook.sql`: the only existing `SECURITY DEFINER` function in this schema, and the pattern this spec's gate function follows for `set search_path = ''` and writing out the `EXECUTE` grant explicitly rather than leaving the default `PUBLIC` grant in place.
- Spec 0003 (`docs/specs/0003-data-model/index.md`), index line 176: `profile.id` is `auth.uid()` of the caller, never a client supplied value, the same rule this spec's gate function applies to the account scoped window.
- `src/lib/result.ts`, lines 34 to 46 (the `FailureKind` union) and line 110 (`markActiveSpanFailed`, called unconditionally inside `failure()` regardless of severity): the reason a cap refusal cannot be reported through `failure()` without corrupting AC-10's ratio.
- `docs/observability/spans.md` and `docs/observability/README.md`: the span registry and the alert methodology (a ratio plus an absolute floor) this spec's AC-10 builds the first real instance of.
- `src/features/auth/copy.ts` and `src/features/auth/failure-codes.ts`: the closed reason enum plus a separate `SENTENCES` map pattern this spec's `UsageGateReason` and `copy.ts` mirror.
- `docs/scope/scope.md`, line 208 (feature 10's own done when clause) and line 213 (feature 11, which owns rendering a blocked search's message on a real screen).
- `src/proxy.test.ts`, line 18: `getClaims()` verifies against the auth server rather than trusting an unverified cookie, the reasoning behind AC-13, even though the file itself is a test mechanics comment, not a spec.

**Practices & standards**:
- Atomic upsert with a conditional `WHERE` clause (`insert ... on conflict ... do update ... where`) as the standard Postgres pattern for a check and increment that must not race under concurrent callers.
- Partial unique indexes for a table whose rows fall into mutually exclusive shapes (here, `account` scoped rows that always name an owner and `global` rows that never do), rather than a single constraint worked around with a sentinel value.
- A ratio alert with an absolute attempt floor, rather than a bare threshold, so a low traffic total failure is still caught (the reasoning already recorded in `docs/observability/README.md`, not new to this spec).

**Verified 2026-09-02, and recorded as a negative result on purpose (corrected 2026-09-04: this negative result was itself wrong)**:
The 2026-09-02 investigation recorded:
> Adzuna's limits are published in their developer docs under "Default API access limits,"
> not in their terms of service. Three public pages, `developer.adzuna.com/docs/search`,
> `/overview`, and `/terms`, were checked the same day and carry no limit figures at all.
> This is recorded explicitly because the reverse mistake (attributing the numbers to the terms)
> is what cost this feature several hours of this conversation: the correct numbers,
> misattributed, looked unverifiable until the actual source was found.

**Correction (2026-09-04)**: The negative result above was itself mistaken. The 2026-09-02 pass checked
`developer.adzuna.com/terms`, `/docs/search`, and `/overview`, but never checked
`https://developer.adzuna.com/docs/terms_of_service`. On 2026-09-04, `https://developer.adzuna.com/docs/terms_of_service`
was verified directly: the page is titled "Terms of Service" and contains the heading "Default API access
limits" verbatim with the four figures (25/min, 250/day, 1000/week, 2500/month). The heading was previously
misread as evidence the page was docs rather than terms; the URL path demonstrates it is both, and the
original attribution to Adzuna's terms of service was correct. The false negative from 2026-09-02 is preserved
above because confidently stating a negative result after checking the wrong URLs is a failure mode that
costs hours on re-verification.

**Inferred, not verified in the current terms text**: that provisioning more than one account or API
key to expand the effective budget counts as misuse. `docs/jobhunt-carry-forward.md` records this as a
permanent constraint from Adzuna's terms; this spec treats it as an inferred, operator facing policy
constraint rather than a verified quote, and it is not something this gate can technically enforce
regardless.
