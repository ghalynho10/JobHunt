# Observability

Alert rule definitions live here, in git, so they are reviewable even though
Sentry is what enforces them. Spec 0001, binding rule 4.

## Why alerts are defined by rate, not by volume

The reference project this one learns from had an outage where every metered
action was denied, for every user, for two weeks. Every one of those denials was
correctly classified as an expected failure, and with a handful of users the
absolute event count stayed tiny throughout. Any volume threshold would have
stayed silent for the full two weeks.

So an alert here combines two conditions:

- a **ratio**: the share of attempts for an operation that end in failure, which
  catches total failure however few users there are
- an **absolute floor**: a minimum number of attempts before the ratio may fire,
  so one failure out of two attempts does not page anyone

## Where the denominator comes from

A ratio needs attempts counted, not just failures. Two mechanisms, deliberately
not one:

1. **Every operation** opens a named span. `failure()` in `src/lib/result.ts`
   marks the active span failed, so attempts are counted as spans. Span names are
   registered in [spans.md](spans.md).
2. **Gated operations** additionally increment an attempt counter inside feature
   10's atomic gate function, at the moment the decision is made.

The second exists because the first is a convention someone has to follow.
Nothing fails to compile when a later feature adds an early return above its
span, and a counter inside the atomic gate has no placement to get wrong.

**Trace sampling must be 1.0 on any operation whose failure rate is alerted on.**
A sampled ratio at this traffic volume is noise, not a signal.

Since spec 0002 it is one validated value, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`,
read by both `src/sentry.server.config.ts` and `src/instrumentation-client.ts`
rather than written into each of them. Production and local work run at 1.
Vercel Preview runs at 0.1, so hand driven previews do not compete for the quota
the ratio depends on. A rare failure on a preview may therefore go unsampled,
which is accepted: previews are driven by a person who is watching.

The environment tag comes from `NEXT_PUBLIC_VERCEL_ENV`, and the release is left
to the SDK, which already falls back to `VERCEL_GIT_COMMIT_SHA` at both build
time and runtime. Setting the release by hand as well would be the same value
written twice with two chances to drift.

## Ways this application can go dark, and what tells a human

Three of them, with three different detectors. They are not interchangeable, and
the gaps between them are the point of this section.

| What breaks | What tells you | What it does NOT tell you |
|---|---|---|
| The site stops answering | The uptime monitor, outside Vercel | Nothing about the databases. It watches Vercel, so it reports the site up while a database underneath it is paused. |
| A hosted Supabase project pauses | Supabase's own warning email, roughly a week ahead, then a confirmation | Nothing the uptime monitor would notice, and on production nothing a visitor would notice either until they touch data. |
| The Sentry quota runs out | Sentry's spend notifications | That reporting has stopped. Once quota is gone the failure ratio alert goes quiet, which is the exact failure this whole directory is written against. |

### Uptime monitoring

UptimeRobot, **two** monitors at a 5 minute interval, both confirmed Up with
real check results on 2026-08-30.

1. `https://usejobhunt.dev`, the production origin. It watches the marketing
   page rather than a status route, because a route that only reports on itself
   proves less than the page a visitor loads.
2. `https://usejobhunt.vercel.app`, the old host, added when the domain moved.
   It exists to catch the 308 redirect breaking, because spec 0007 AC-4 leans on
   that redirect: if the old host ever served the application again, a sign in
   started there would write the PKCE code verifier on a hostname the callback
   never returns to, and sign in would fail at the exchange.

**Known limitation on the second monitor, recorded rather than assumed fixed.**
As configured it reports Up whether that host redirects or serves the
application, so it cannot detect the one thing it was added for. The fix is to
invert its expected status codes, so `200` counts as down and `3xx` as up. Until
that is applied, the redirect is proved only by the manual `curl` step in spec
0007's `verify.md`, not by the monitor.

Production is public, so the monitor measures the application. That holds only
while deployment protection stays at standard, which leaves the generated
production URL reachable. Raising protection to cover all deployments would take
production private, and the monitor would then cheerfully report a Vercel login
page as "up".

### Supabase pause warnings

Both projects sit on the free plan, and the free plan pauses a project that has
not had enough database activity across the previous week. Supabase's guidance
puts that at roughly a few user requests a day, so it is a daily bar rather than
a weekly one: a burst of activity on merge day does not clear it.

Production is the more exposed of the two. Nothing touches the production
database at all until feature 7 ships a way to sign in, so it will pause while
being perfectly healthy. Development is exposed whenever a few days pass with no
previews, and a paused development project breaks CI first, not previews: the
migration workflow's push fails and an unrelated pull request goes red for a
reason that does not look like the cause.

Detection is Supabase's email and nothing else. Both projects must send their
warnings to an address that is actually read. The fix is a dashboard restore; a
scheduled keep awake job was considered and declined.

### Sentry spend notifications

Configured at **Settings → Subscription → Manage spend notifications** in the
Sentry organisation. Sentry notifies owners and billing members by default when
consumption reaches 80% of the reserved volume; that 80% threshold is the one
this project keeps, and it is deliberately well short of exhaustion.

This matters more here than the raw cost does. Binding rule 4's alert is a ratio
of failures to attempts, and both halves stop arriving when the quota is gone.
An alert that has gone silent looks exactly like an application with nothing
wrong, which is the failure mode this project exists to learn from.

## Rolling a bad production deployment back

1. **Promote the previous deployment first.** In the Vercel project, open
   Deployments, find the last good production deployment, and promote it. This
   is the fastest way back and it needs no build.
2. **Then revert in git**, so the next merge does not deploy the same fault
   again. The promotion is the stop; the revert is the fix.
3. **Promoting does not undo a migration.** The database is not part of the
   deployment. If the bad deploy shipped alongside a schema change, the promoted
   code runs against the new schema, and whether that works depends entirely on
   invariant 1 having been followed: additive changes are safe to roll back
   under, drops are not. A migration is undone by writing another migration.

## Alert rules

Spec 0011 builds this project's first two failure rate alert rules, one per
span, because a kill switch outage and a gate outage are different failures
with different causes and different spans (`kill_switch.read` and
`usage_gate.check`, both in [spans.md](spans.md)). Folding them into one rule
would leave one of the two invisible.

Both rules share the same shape: a rolling 24 hour window, a floor of 20
attempts, and a 20% failure threshold. The numbers come from this app's real
traffic: at the global monthly ceiling of 2,000 `job_search` calls this app
averages under 3 calls an hour, so a floor reachable inside a single hour would
only ever cross during an actively searching session, staying silent on an
ordinary quiet day exactly when a real misconfiguration would too. Revisit both
numbers if traffic ever grows enough to change that assumption.

Both rules filter by **failure kind** (the span status message `failure()`
already sets), never by "any failed span":

- **`usage_gate.check`**: numerator is `usage_gate_misconfigured` and
  `database_unavailable` only. Never AC-3/AC-4's five refusal reasons
  (`success({ allowed: false, reason })` is never a failed span in the first
  place, per `checkUsageGate()`'s own AC-5), and never `session_missing` (a
  caller with an expired token is not evidence the gate is broken).
- **`kill_switch.read`**: numerator is its own existing failure kinds
  (`database_unavailable`, `record_not_found`, `response_malformed`),
  unchanged.

Still to be **configured by hand** in the Sentry development and production
projects (this is a dashboard action, not something a migration or a code
change can do): both rules, as written above. Then the forced failure smoke
test (AC-11) has to be run locally against the development Supabase and
Sentry projects only, never production and never a Vercel Preview deployment,
since Preview samples at 0.1 and roughly nine in ten forced failures there
would never be captured.

**`/health` traces never reach Sentry, by design, not by bug.** The project's
own inbound filter "Filter out health check transactions" discards the whole
`GET /health` transaction, and every span nested inside it, at ingest; its
error events are unaffected and arrive normally. `/health` is the diagnostic
route, so a future forced failure test or a manual span check will reach for
it again: use `/profile` instead (confirmed 2026-09-03,
[docs/experiments/0011-usage-gating-and-kill-switch.md](../experiments/0011-usage-gating-and-kill-switch.md)).

## Status

The two rules are **defined here**, but not yet configured in Sentry, and the
forced failure smoke test has not yet been run. A rule that exists on paper is
not the same as a rule that fires: `/check verify` (AC-10, AC-11) is where that
gap closes, once someone with Sentry dashboard access configures both rules in
the development and production projects and runs the smoke test locally.

Drift detection between Sentry's live rules and this directory is a v1.5 item,
not v1.
