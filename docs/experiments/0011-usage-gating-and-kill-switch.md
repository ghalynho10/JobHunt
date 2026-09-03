# Experiments: usage gating and kill switch · spec 0011

Run 2026-09-02 evening into 2026-09-03, 03:00–04:00 UTC, during `/develop usage
gating & kill switch`'s AC-11 forced failure smoke test.

Environments referred to below:

- **local**: Supabase in Docker, `127.0.0.1:54321`, driven through `pnpm dev`
- **Sentry**: the `jobhunt` project, environment tag `development`, trace
  sampling 1

---

## 1. Does the forced failure smoke test prove the whole alert chain fires?

**Why it matters.** AC-11 asks for more than an error event landing in Sentry:
the span has to record the failure, sampling has to capture it, the
fingerprint has to group it, and a real alert has to fire. Each of those is a
different mechanism and any one of them can be silently missing while the
others work.

**What was run.** A temporary `await checkUsageGate("smoke_test_unknown");`
added to `src/app/(app)/health/page.tsx`, then `GET /health` loaded 26 times
with an authenticated session minted through `test/helpers`.

**Result: error events arrived, spans did not.**

```
Sentry Issues: 26 usage_gate_misconfigured events on transaction GET /health
Explore → Traces, transaction:"GET /health", 24h: 0 matches of 10.2K spans
Explore → Traces, span.op:function, smoke test window: 2 of 316 spans, both sign_in.bounce
profile.read and GET /profile traces from the same session: arrived normally
```

**Ruled out, and how.**

- **Not "never created".** `debug: true` in `sentry.server.config.ts` showed a
  sampled root span `GET /health` (`op: http.server`), a child `usage_gate.check`
  (`op: function`) with the correct parent and root IDs, `kill_switch.read`
  nested inside that, the error event captured inside the span, then
  `Finishing "function" span "usage_gate.check"`, then the root span finishing.
- **Not a client side drop.** `Flushing outcomes... No outcomes to send`.
- **Not an early return abandoning the span.** `checkUsageGate()`'s early
  `return failure(...)` still returns a value from the callback
  `Sentry.startSpan` wraps; the span finished in the ordinary way regardless of
  which branch returned.
- **Not `beforeSendTransaction`, `ignoreTransactions`, or a `tracesSampler`.**
  `sentry.server.config.ts` has none of the three.
- **Not a filter baked into the SDK.** Grepping the installed
  `@sentry/node-core` and `@sentry/core` packages for a health check filter
  list found nothing.

**The cause.** Sentry's project level inbound filter "Filter out health check
transactions" is enabled at `/settings/projects/jobhunt/filters/` ("Filter
transactions that match most common naming patterns for health checks").
Settings → Stats & Usage, Spans category, 24h: 12.2K total, 11.6K accepted, 644
filtered, 0 rate limited, 0 invalid. Errors category, same window: 177 total,
177 accepted, 0 filtered. The filters page states filtered events are tracked
separately from rate limits and do not count against quota. The entire
`GET /health` transaction is discarded at ingest, and every span nested inside
it goes with it, while error events raised on the same request are unaffected
because that filter does not apply to them.

**Conclusion.** Nothing is wrong with the gate, the span, or the SDK wiring.
`/health` is exactly the name a "health check" filter is written to match, and
Sentry discards the whole transaction before the Issues page or the Explore →
Traces view ever sees it, which is why the error event and its own span
disagreed about whether anything arrived. Re run against `/profile`
(unfiltered, and already carrying real `profile.read` traffic): 25 more
`usage_gate_misconfigured` events, 25 `usage_gate.check` spans, 25 root spans
named `GET /profile`, confirmed the same way. Spec 0011's AC-11 and `verify.md`
now name `/profile` as the required route, for this reason.

**A second version of a trap this project has already met.** This directory's
own `README.md` says a probe pointed at the wrong environment "is a failure
mode this project has already met once", from spec 0002's experiment 8 (a
screen proving AC-6 was `localhost:3000`, not the preview it was taken for).
This is the same shape again, not the same mistake: right instrumentation,
right question, aimed at a host that can never carry the answer, because
Sentry itself was configured to discard everything sent from it.

---

## 2. Configuring the alert rules: what the Sentry forms actually allow

Run 2026-09-03 in the `jobhunt` Sentry project (org `ghalys-org`), dashboard
configuration, during the same `/develop usage gating & kill switch` pass.

**What was configured.** Four metric monitors, `usage_gate.check` and
`kill_switch.read`, each in the `development` and `production` environments —
two rules times two environment-scoped copies in the one Sentry project. There
is no separate development Sentry project: spec 0002 index line 79 records the
setup as "an organisation and a project", and the environments are separated
by the `environment` tag. Each monitor is dataset `Spans`, visualize
`failure_rate()`, interval `1 day`, High priority Above `0.2`, Medium Above
`0.19`, Resolve default. Filters: the `usage_gate.check` pair filters
`span.description:usage_gate.check` and `failure.kind is not session_missing`;
the `kill_switch.read` pair filters `span.description:kill_switch.read` only.
Each has an alert connected that notifies `mghalynho@gmail.com` on all four
issue triggers.

**Finding one: there is no attempt floor.** AC-10 specifies "a ratio with an
absolute attempt floor". Sentry's metric monitor form offers Threshold, Change
or Dynamic; Threshold is a bare value on the metric, and no minimum sample
count exists anywhere in the form. Verified in the form on 2026-09-03. A lone
failure in a quiet 24 hour window therefore reads as 100%; the 1 day interval
is the partial mitigation. Spec 0011's follow-up now considers an absolute
count threshold instead, which would give a natural floor at this app's
volume.

**Finding two: Sentry requires two priority thresholds where the spec defines
one.** Medium is pinned at 0.19, just under High's 0.2, so the two fire
together rather than expressing a second alerting policy no document
describes.

**Finding three: a metric monitor detects but does not notify.** Creating the
monitor does not create an alert. The first firing on 2026-09-03 produced a
Critical issue, correctly assigned, and delivered nothing at all, because the
monitor's Connected Alerts list was empty. Detection and notification are
separate objects and the second must be attached by hand. This is exactly the
failure AC-11 exists to catch, and a paper review of the alert rule would pass
it every time: the rule is written, the filter matches, the issue appears —
and nobody is told.

**Finding four: delivery is proven three times over, and the full chain with
it.** The alert builder's Send Test Notification button delivered an email to
`mghalynho@gmail.com` on 2026-09-03. A second, non test delivery followed the
same day: raising the monitor thresholds to High 0.95 / Medium 0.94 resolved
Sentry issue 592127114 at 2026-09-03 21:49 local, the connected alert's "An
issue is resolved" trigger fired, and a real email was delivered to
`mghalynho@gmail.com`. That is a genuine state transition through the
connected alert, not the Send Test Notification button, and it proves the
recovery notification path. The threshold-breach creation delivery then
landed: with the thresholds back at High 0.2 / Medium 0.19, the monitor's next
evaluation created a new issue and the connected alert's "A new issue is
created" trigger delivered a real email to `mghalynho@gmail.com` on
2026-09-03. That is the exact delivery AC-11 names — not a test notification
and not the resolve transition.

**The chain AC-11 asks for is complete, recorded in one place.** Forced
failure: deliberate `usage_gate_misconfigured` loaded through `/profile`.
Span recorded: `usage_gate.check` arrived in the `development` environment.
Sampling captured: local trace sampling at 1.0. Fingerprint grouped: the
events grouped into one issue. Threshold crossed: the failure rate passed
High's 0.2. New issue created: by the monitor's own next evaluation after the
thresholds returned to 0.2 / 0.19. Connected alert fired: the "A new issue is
created" trigger. Email delivered: to `mghalynho@gmail.com`. All eight links
proven on 2026-09-03; the chain is complete rather than composed of parts.

**Conclusion.** AC-10's draft "floor of 20 attempts" is not expressible in
Sentry's Threshold form; the spec now records the configured reality (no
floor, two thresholds, a 1 day interval) and carries a follow-up for an
absolute count threshold. AC-11's smoke test must confirm an alert is
connected to the monitor, not merely that an issue was created, and must end
with a real threshold-breach creation delivery. That delivery has now landed:
alert connected, threshold crossed by the monitor's own evaluation, a new
issue created, the connected alert's "A new issue is created" trigger fired,
and a real email delivered — not the Send Test button and not the resolve
transition.
