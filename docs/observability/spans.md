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

None of the spans above is alerted on yet. They are registered because the convention
starts at the first operation written, not at the first one that matters, and a
convention adopted late is one nobody follows.
