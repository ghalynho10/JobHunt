# src/features/applications

Recording that you applied to a job, listing those records back, and removing one. Built by feature 12, governed by [spec 0014](../../../docs/specs/0014-apply-redirect-and-application-record/index.md), which is `Accepted`.

## What lives here

The two routes are [src/app/(app)/applications/page.tsx](<../../app/(app)/applications/page.tsx>) and the apply control that feature 11's result card embeds. `/search` reaches into this directory; this directory never reaches back into `src/features/search/`.

| File | What it owns |
|---|---|
| [actions.ts](actions.ts) | `recordApplication` and `removeApplication`, the two Server Actions |
| [queries.ts](queries.ts) | `readApplications` for `/applications`, `readAppliedJobIds` for the search markers |
| [schemas.ts](schemas.ts) | `listingSnapshotSchema`, which re-parses the listing on arrival |
| [failures.ts](failures.ts) | Every failure this feature can produce, one table, kind and severity fixed per entry |
| [form-state.ts](form-state.ts) | `ApplicationActionState`, the three state shape both actions return |
| [copy.ts](copy.ts) | Every sentence the reader sees |
| [apply-control.tsx](apply-control.tsx) | The one Client Component, `useActionState` around the apply |
| [application-card.tsx](application-card.tsx) | One row on `/applications` |
| [remove-form.tsx](remove-form.tsx) | The confirmation form |

## Rules that are easy to break by accident

- **The apply action must not re-render `/search`.** A re-render re-runs `searchListings()` and spends one of 25 weekly Adzuna calls (spec 0011). `recordApplication` therefore calls no `revalidatePath`, no `updateTag`, no `refresh` and no `redirect`, and returns its state instead. **Every profile action in this repo ends with `revalidatePath` then `redirect`**, so the house pattern is the tempting thing to copy here and copying it would make every apply cost a search, with nothing failing. `removeApplication` **does** revalidate, deliberately: `/applications` makes no outbound call.
- **A re-render trigger is a property of the request, not of the function.** This is the lesson feature 12 paid for. The fifth trigger is a cookie mutation anywhere in the request, and the one that actually fired came from [src/proxy.ts](../../proxy.ts), a layer above the action, where `readOnlyCookieAdapter` could not reach it. If you are ever reasoning about what an action costs, enumerate every layer that runs on that request, the proxy included, not just the action's own body.
- **`readOnlyCookieAdapter` stays even though it was not the leak.** It is defence in depth, and it is what stops a later session adding a cookie write inside the action. See spec 0014 AC-20 and AC-20a; the second one is the criterion the budget actually rests on, and it lives in the proxy.
- **`profile_id` comes from verified claims, never from a form field or the listing.** Nothing the browser sends can name whose row is written.
- **The listing arrives through an encrypted inline closure, and is parsed again anyway.** The `'use server'` closure is defined inside the Server Component that renders the card so Next encrypts what it captures; a module level export with `.bind()` carries no such guarantee. `listingSnapshotSchema` re-parses on arrival regardless, per the parse at every boundary rule.
- **The database is the real guarantee, not the checks in this directory.** The duplicate refusal is the unique constraint, the missing profile refusal is the foreign key, and the predicted salary pairing is a check constraint. Each is mapped to a reader facing sentence by `failures.ts`; none is prevented by looking first.
- **`salary_is_predicted` is `null`, never `false`, when there is no salary at all.** `false` would be a claim about a figure that does not exist, and the pairing check constraint refuses the row either way.
- **A failed read says so.** `readAppliedJobIds` failing renders `COPY-8` rather than twenty cards marked as not applied, which would silently tell the reader they have applied to none of them. That branch had no test until feature 12 was already closed; it has one now, broken on purpose in both directions.
- **The stale build message is the one failure here that does not go through `failure()`.** The framework refuses the dispatch before any of this code runs, so `ApplyControl` catches it around the call. It still reports: that catch takes everything, including a dropped connection or a blocking extension, so it calls `Sentry.captureException` explicitly before showing the message. Without that, a real client regression looks exactly like the ordinary staleness that follows every deploy.

## Testing

Unit tests sit beside the code (`pnpm test`); anything resting on a real constraint, a real policy or a real session is an integration test in [test/integration/application-actions.test.ts](../../../test/integration/application-actions.test.ts) (`pnpm test:integration`, needs `pnpm db:start`).

**Two guarantees no test in this repo can hold**, both in [verify.md](../../../docs/specs/0014-apply-redirect-and-application-record/verify.md) permanently: that an apply on an **expired** session spends no Adzuna call (AC-10, AC-20a), and that a stale build shows `COPY-7` (AC-21). Both need a real browser and, for the second, a real deploy with `.next` wiped first. The wiring beneath the first is locked by [test/integration/proxy-action-refresh.test.ts](../../../test/integration/proxy-action-refresh.test.ts).

When you change a guard here, **break it on purpose first and confirm the test fails**. Feature 12's own suite was written that way and it changed two tests: one branch was passing vacuously, and one needed a counterweight to stop the rule reading as "drop anything blank".

_Drafted by /sync from the introducing change, worth a quick human pass._
