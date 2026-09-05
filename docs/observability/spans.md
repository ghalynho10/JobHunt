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
| `kill_switch.read` | `db.query` | `src/lib/kill-switch.ts` | Yes, from feature 10: `checkUsageGate()` puts this read inside every gated call (`src/lib/usage-gating/gate.ts`), and its own failure rate rule is defined in `docs/observability/README.md`, separate from `usage_gate.check`'s. |
| `landing_rule.decide` | `function` | `src/lib/landing-rule.ts` | Not yet. It is the one place deciding where a signed in visitor lands, and all three of its callers run through it, so it has a single denominator by construction. Feature 14 layers its scoring gate onto those callers, which is when the rate starts meaning something. |
| `door.decide` | `function` | `src/app/go/route.ts` | Not yet. The door reads the session and hands off to the landing rule, so a failure here is a visitor who cannot get in at all. Worth an alert the day `/` is the main way in. |
| `profile.read_sections` | `db.query` | `src/features/profile/queries.ts` | Not yet. It reads the three tables that hang off a profile row, and it is deliberately separate from `profile.read`, whose failure ratio spec 0008 AC-7 already depends on. Folding the two together would change what that ratio counts. |
| `profile.save_identity` | `db.query` | `src/features/profile/actions.ts` | Not yet, and it is the strongest candidate here. It is the first write path in the product and the parent every other profile row depends on, so a failure means nobody can start. Feature 10 brings the first alert rule. |
| `profile.save_skills` | `db.query` | `src/features/profile/actions.ts` | Not yet. It is the only operation in the feature that writes twice (an insert then a delete), so its failure rate is the one that would show a partial write becoming common. |
| `profile.save_work_experience` | `db.query` | `src/features/profile/actions.ts` | Not yet. ONE NAME FOR THE INSERT AND THE UPDATE, deliberately, the same way `auth.sign_in` covers both providers: the operation is an `operation` span attribute, so every work history save groups under one name and binding rule 4's ratio has a single denominator rather than two half sized ones. |
| `profile.delete_work_experience` | `db.query` | `src/features/profile/actions.ts` | Not yet. It has its own name rather than joining the save above, because a delete that matches zero rows is reported as a failure (spec 0010, invariant 4) and folding it in would put that expected outcome into the save's ratio. |
| `profile.save_preferences` | `db.query` | `src/features/profile/actions.ts` | Not yet. It is the section feature 11's search and feature 14's scoring both read, so a failure here is silent until something else looks wrong. |
| `sign_in.bounce` | `function` | `src/app/(marketing)/sign-in/page.tsx` | No. It decides whether an already signed in visitor is sent onward, and its failure mode is showing the sign in page to somebody who did not need it, which is the harmless direction. It is registered because the convention applies to every named operation, not only the alarming ones. |
| `usage_gate.check` | `function` | `src/lib/usage-gating/gate.ts` | Yes. This project's first alert rule (spec 0011, spec 0001 binding rule 4): the numerator is `usage_gate_misconfigured`, `database_unavailable`, and `external_service_failed` (the `getClaims()` call can throw), filtered by failure kind, never AC-3/AC-4's five refusal reasons and never `session_missing`. Opens as the first statement of `checkUsageGate()`, before the `getClaims()` check and before the `kill_switch.read` call it wraps, so a total denial from either mechanism still produces a span. Trace sampling is 1.0 on this span (AC-8). |
| `search.read_prefill` | `db.query` | `src/features/search/preferences.ts` | Not yet. It reads the caller's own `job_preference` row to prefill the search fields (spec 0013, AC-9), and it is deliberately separate from `search.run`: a bare `/search` visit runs this and never that, so folding the two together would put a visit that spends no budget into the outbound call's ratio. |
| `search.run` | `http.client` | `src/features/search/adzuna.ts` | Not yet. It opens before the query is even parsed (binding rule 4), so THREE kinds fail it, not two: `external_service_failed` and `response_malformed` from the Adzuna call itself, and `validation_failed` when both fields arrive blank, which is a reader typing nothing rather than an integration fault. Corrected 2026-09-04 after a fresh model review; the row previously named only the first two, so an alert built from it would have read blank submissions as an Adzuna incident. A gate refusal runs INSIDE this span and correctly does not fail it, since spec 0011 AC-5 returns a refusal as a success carrying `allowed: false` (spec 0013, AC-2, AC-3, AC-5, AC-10). Anyone building the rate alert should either exclude `validation_failed` in the alert query or accept that blank submissions sit in the numerator; moving the parse ahead of the span is not the fix, it would break binding rule 4. |

The six spans feature 9 added all carry `op: "db.query"`, including the five in
Server Actions. The op describes what the operation actually does, and each of
those actions is one statement against Postgres wrapped in a caller check and a
parse. `profile.save_work_experience` is the one name covering two operations,
told apart by an attribute rather than by a second name, for the reason its row
gives.

The three spans feature 32 added all carry `op: "function"` rather than a
transport specific op. They are decisions rather than queries or requests: the
database read inside `landing_rule.decide` is deliberately not given an op or a
name of its own, because it exists only to answer that decision and a second
name would split one operation's failure ratio in two.

Two of the spans above — `kill_switch.read` and `usage_gate.check` — are
alerted on: feature 10's rules became Sentry metric monitors on 2026-09-03, in
both the `development` and `production` environments of the one `jobhunt`
Sentry project, each with an alert connected (see README.md's `## Alert
rules`). The rest are registered but not yet alerted on, because the
convention starts at the first operation written, not at the first one that
matters, and a convention adopted late is one nobody follows.
