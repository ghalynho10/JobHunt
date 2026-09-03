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
