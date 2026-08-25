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
| `scaffold_check.read` | `db.query` | `src/features/scaffold-check/queries.ts` | No. Scaffold only. **Nothing calls it any more**: the health page now reads `profile.read` instead. It is still listed because the code and the table are dropped in a separate pull request, only after production is confirmed serving the new read (spec 0003, AC-13 and AC-16). |
| `dev_session.sign_in` | `auth` | `src/features/dev-session/actions.ts` | No. Development only; removed by feature 7. |
| `kill_switch.read` | `db.query` | `src/lib/kill-switch.ts` | Not yet. Feature 10 puts this read inside every gated call, and its failure rate is alerted on from there. |

None of the spans above is alerted on yet. They are registered because the convention
starts at the first operation written, not at the first one that matters, and a
convention adopted late is one nobody follows.
