# Span registry

Every operation whose failure rate is or will be alerted on opens a named span.
The name is declared here rather than left incidental, because binding rule 4's
ratio depends on all attempts at one operation grouping under one name.

**The span must open as the first statement of the operation**, before any early
return, denial or guard clause. If it opens later, a total denial outage produces
no spans at all, the ratio has no denominator, and the alert stays silent through
exactly the failure it exists to catch.

| Span name | `op` | Opened in | Alerted on |
|---|---|---|---|
| `profile.read` | `db.query` | `src/features/profile/queries.ts` | Not yet. It is the deployed end to end proof from spec 0003, and the first read of a real product table. Feature 9 gives it a write path worth alerting on. |
| `auth.sign_in` | `auth` | `src/features/auth/actions.ts` | Not yet. One name for both providers, deliberately: the provider is a span attribute, so every sign in attempt groups under one name and binding rule 4's ratio has a single denominator rather than two half sized ones. |
| `auth.callback` | `auth` | `src/features/auth/callback.ts` | Not yet, and it is the one here most likely to earn an alert. Spec 0007's follow-up defers the decision to feature 10, which brings the first alert rule. |
| `auth.sign_out` | `auth` | `src/features/auth/actions.ts` | No. A failing sign out still reports through `failure()`, and the operation is best effort by design (spec 0007, invariant 6). |
| `kill_switch.read` | `db.query` | `src/lib/kill-switch.ts` | Not yet. Feature 10 puts this read inside every gated call, and its failure rate is alerted on from there. |
| `landing_rule.decide` | `function` | `src/lib/landing-rule.ts` | Not yet. It is the one place deciding where a signed in visitor lands, and all three of its callers run through it, so it has a single denominator by construction. Feature 14 layers its scoring gate onto those callers, which is when the rate starts meaning something. |
| `door.decide` | `function` | `src/app/go/route.ts` | Not yet. The door reads the session and hands off to the landing rule, so a failure here is a visitor who cannot get in at all. Worth an alert the day `/` is the main way in. |
| `sign_in.bounce` | `function` | `src/app/(marketing)/sign-in/page.tsx` | No. It decides whether an already signed in visitor is sent onward, and its failure mode is showing the sign in page to somebody who did not need it, which is the harmless direction. It is registered because the convention applies to every named operation, not only the alarming ones. |

The three spans feature 32 added all carry `op: "function"` rather than a
transport specific op. They are decisions rather than queries or requests: the
database read inside `landing_rule.decide` is deliberately not given an op or a
name of its own, because it exists only to answer that decision and a second
name would split one operation's failure ratio in two.

None of the spans above is alerted on yet. They are registered because the convention
starts at the first operation written, not at the first one that matters, and a
convention adopted late is one nobody follows.
