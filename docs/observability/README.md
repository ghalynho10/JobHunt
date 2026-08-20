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
A sampled ratio at this traffic volume is noise, not a signal. This is set in
`src/sentry.server.config.ts` and `src/instrumentation-client.ts`.

## Status

No alert rule is defined yet. Feature 10 (usage gating and kill switch) owns
building the first one, together with the forced failure smoke test that proves
the whole chain fires: span, sampling, fingerprint, threshold, delivery. A rule
that exists on paper is not the same as a rule that fires.

Drift detection between Sentry's live rules and this directory is a v1.5 item,
not v1.
