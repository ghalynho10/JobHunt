# 0013. Job search and results list — rationale

## Context

This feature is the first place JobHunt sends anything to a company outside itself, and the first place a signed in user sees real product value rather than a placeholder (spec 0006's "filtered search" claim, still `planned`). Three earlier specs already narrow this decision far more than "which job board and how to gate it": spec 0003 locked the search source to Adzuna at the schema level (`application.source`'s check constraint allows only `adzuna` in v1), spec 0008 already shipped a live `/search?q=...` route and a tested deep link return path in front of a placeholder page, and spec 0011 already built the exact budget this feature must spend through, including the call type name (`job_search`) and its three cap values (25 per account per week, 66 app wide per day, 2000 app wide per month). What is genuinely open is narrower: how the search maps onto Adzuna's real, verified API shape; how the mandatory per advert attribution and the separate Jobsworth salary attribution actually get built into the slot spec 0005 already reserved for them; and where this feature's boundary against feature 12 (the apply redirect and application record) sits.

Two things made this harder to get right than the scope row alone suggested. First, `docs/jobhunt-carry-forward.md` records that an earlier pass on this project mis-sourced Adzuna's rate limits to "the terms" when they were actually in the docs, which cost real time to unwind; the same file separately flags that the attribution requirement, sourced the same casual way, needed independent re-verification before this spec could rely on it. Second, spec 0011's own Consequences names a real gap this feature inherits rather than invents: `checkUsageGate()`'s result type does not force a caller to check `allowed` before making the outbound call, so misuse is possible by construction, not just by carelessness.

## Options considered

The options below are about how the search itself is triggered and executed, which is the one layer prior specs left genuinely open.

### Option 1: A Server Component reading the search terms from the URL

The page reads `?q=&where=` from `searchParams`; one server side function runs the gate check, the Adzuna call, and the Zod parse, then the page renders the result. No client JavaScript ships for search itself; a plain link or a bookmark to a specific search works because the state lives in the URL.

**Pros**:
- Matches the project's own binding rule directly: this is a read, and "Server Components read, Server Actions write."
- Reuses spec 0008's already built and tested `/search?q=react` deep link mechanism verbatim, rather than inventing a second way to represent "this search."
- Needs zero client JavaScript, consistent with every other page in this project so far.

**Cons**:
- A browser "back" button after a search re-runs the whole gate check and Adzuna call rather than reading from a client side cache. Not a real cost at this app's volume, but a genuine one at higher traffic. **Confirmed correct by measurement on 2026-09-04**, against a production build: one load plus one back moved the usage counter by two. It briefly carried a note that day claiming it was wrong, which was itself wrong; see the first Follow-up item in [index.md](index.md).

### Option 2: A Server Action triggered search

A form posts to a Server Action, which runs the search and returns results into client component state, without a full page navigation.

**Pros**:
- Could show a loading spinner without a page reload.

**Cons**:
- Needs client JavaScript to invoke the action and hold the returned state, which nothing else in this app's UI has needed so far.
- Throws away the exact `/search?q=react` URL shape spec 0008 already built, proved (a real browser driven test of the deep link surviving sign in), and put a return path mechanism through. A plain shared link to a specific search would stop working.

### Option 3: A client side fetch to an internal API route

A route handler under `src/app/api/` calls Adzuna and returns JSON; the browser fetches it directly.

**Pros**:
- A familiar REST shape for anyone used to a conventional API backend.

**Cons**:
- Forbidden outright, not just discouraged: the project's own binding rule states "Route handlers under `src/app/api/` may not read or write user data," and this call both reads the caller's `job_preference` for the prefill and spends their personal usage gate budget, both squarely "user data."

## Rationale

Option 1 is less a green field choice than a confirmation of ground already claimed: spec 0008 committed to the `/search?q=` URL and proved a real browser deep link against it before this feature existed, and the project's own read/write binding rule already draws the line exactly where a GET driven search sits. Option 3 is ruled out on a hard rule, not a preference, so it is not a real contender. Option 2 is the only genuine alternative, and it loses on reuse: adopting it would mean quietly abandoning tested, working infrastructure (the deep link return path) for a capability, a manual loading state, that nothing else in this project's UI currently needs or uses.

## References

**Project sources** (verifiable, in this repo):
- `AGENTS.md`: "Server Components read, Server Actions write" and "Route handlers under `src/app/api/` may not read or write user data"
- spec [0003](../0003-data-model/index.md) (data model): the `application.source` check constraint locking the source to `adzuna`, and the Value sourcing row naming feature 11 as owner of the field mapping
- spec [0008](../0008-app-shell-and-navigation/index.md) (app shell and navigation): the `/search?q=` route and the deep link return path (AC-16)
- spec [0011](../0011-usage-gating-and-kill-switch/index.md) (usage gating and kill switch): the `job_search` call type, its three cap values, and its own Consequences flagging the `withUsageGate()` gap this spec closes
- spec [0005](../0005-design-system-and-ui-foundation/index.md) (design system): `Card.Footer`'s `attribution` slot (AC-10)
- spec [0009](../0009-terms-and-privacy-notices/index.md) (terms and privacy notices): the `DATA_RECIPIENTS` drift guard (AC-5)
- `docs/jobhunt-carry-forward.md`: the "Features 5 and 11" entry (the per advert wording) and the "Feature 19" entry (the Jobsworth attribution)

**Practices & standards**:
- Parse, don't validate: Zod at every external boundary, this project's own binding rule applied to Adzuna's response
- Inversion of control to make misuse of a gate function structurally impossible rather than conventionally discouraged (`withUsageGate()`)

**Links** (web verified 2026-09-04):
- [Adzuna API terms of service](https://developer.adzuna.com/docs/terms_of_service): the per advert attribution wording, the Jobsworth salary attribution, and the published rate limits (25/minute, 250/day, 1000/week, 2500/month), fetched directly and quoted verbatim in the spec
- [Adzuna API search docs](https://developer.adzuna.com/docs/search): the search endpoint shape, request parameters (`what`, `where`, `results_per_page`, `sort_by`), and the response fields per listing
