# 0013. Job search and results list

**Date**: 2026-09-04
**Status**: In Progress

## Summary

This spec builds the first real search screen: a signed in user types a title and or a location, the app spends one budget checked call against Adzuna (the job board this project already committed to), and real listings come back with the attribution Adzuna's own terms require. Nothing here persists. Clicking through to a real posting, and marking a job applied, stay feature 12's job; this feature only searches and displays. The two hardest parts are not the search itself: they are meeting Adzuna's exact attribution wording without guessing, and making sure a caller can never spend an outbound call without passing feature 10's budget gate first.

## Requirements

**User stories**:
- As a signed in user, I want to search real job listings by title and location, so I can see what is actually available rather than a mock.
- As a signed in user, I want my own weekly preferences to prefill the search so I do not retype them every visit.
- As a signed in user, I want a clear, honest reason when a search is blocked or fails, so I know whether it is my own usage, a shared limit, or something broken.
- As the operator, I want Adzuna's attribution requirements met exactly as written, so the app stays inside the terms that let it use their data at all.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: A signed in user who submits a search with at least one of title or location filled sees real Adzuna listings for the configured country (United States) rendered on the page, first page only, up to 20 results, no pagination this slice.
- **AC-2**: A search submitted with both title and location blank is refused before any external call runs, with a visible validation message, and spends no usage gate budget.
- **AC-3**: Every search that passes AC-2's check is checked through `checkUsageGate("job_search")` before the Adzuna call runs. A refusal, for any of the five reasons feature 10 defines, renders the exact sentence from `src/lib/usage-gating/copy.ts`'s `SENTENCES` map for that reason, and the Adzuna call never runs.
- **AC-4**: A search that runs successfully and matches zero listings renders a visible "no results" state, clearly distinct from both the gate refusal state (AC-3) and the failure state (AC-5).
- **AC-5**: An Adzuna call that fails outright (network error, timeout, a non success response) is reported through `failure()` with `external_service_failed`; a response that does not match the expected shape is reported with `response_malformed`. Either renders a visible failure state distinct from AC-4's empty state.
- **AC-6**: Every rendered result carries its own "Jobs by Adzuna" attribution, at least 116 by 23 pixels, through `Card.Footer`'s `attribution` slot (spec 0005, AC-10): the word "Jobs" links to `https://www.adzuna.com`, and the word "Adzuna" is the Adzuna logo image, also linked to `https://www.adzuna.com`.
- **AC-7**: A result whose salary is predicted (Adzuna's `salary_is_predicted: true`) shows "(estimated)" beside the figure and carries the separate Jobsworth attribution: a 20 by 20 pixel icon plus the words "Adzuna Jobsworth", both linked to `http://www.adzuna.co.uk/jobs/salary-predictor.html`, with the mouseover text "Salary estimate powered by Adzuna Jobsworth". A stated, non predicted salary shows neither the label nor the Jobsworth attribution.
- **AC-8**: Each result shows its title, company, location, a relative posted date (e.g. "posted 3 days ago", computed at render from the raw timestamp), a salary range when present, and its description snippet, plus a real, working link that opens the source posting (`job_url`) in a new tab.
- **AC-9**: On a first visit to `/search` carrying neither `q` nor `where`, the title and location fields prefill from the caller's `job_preference` row (the first entry of `desired_titles` and of `desired_locations`) when present; a caller with no `job_preference` row, or an empty array, sees blank fields. Landing on the page this way never itself runs a search or spends gate budget; a search only runs once the URL carries `q` or `where`.
- **AC-10**: The `job_search` call type spends exactly one gate check and, when allowed, exactly one outbound Adzuna call per render of `/search` that carries `q` or `where`. This is true of a fresh submit, a reload, a browser back navigation, and a shared link alike, since each is a distinct render carrying the same params; none of them is free, and Consequences records that cost.
- **AC-11**: `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` are added to `DATA_RECIPIENTS` in `src/features/legal/recipients.ts`, naming Adzuna as the recipient, as part of this build, satisfying spec 0009 AC-5's drift guard.
- **AC-12**: This feature moves its own claim (`filtered search`) from planned to working in the entry page's "What's real today" card (spec 0006, AC-8).

## Options considered

Reasoning and the options weighed for how the search itself is triggered: see [rationale.md](rationale.md).

## Decision

**Chosen option**: A signed in `Server Component` reading the search terms from the URL (`/search?q=...&where=...`), never a Server Action or a client side fetch.

The whole operation, gate check, Adzuna call, and Zod parse, runs server side inside one function, `searchListings()`, called from `src/app/(app)/search/page.tsx`. No client JavaScript ships for search itself. A plain `<form method="get" action="/search">` with inputs named `q` and `where` is what actually produces the URL this relies on; there is no client side submit handler.

`searchListings()` never returns `Result<Listing[]>` directly. A refusal (spec 0011, AC-5) is a success carrying `allowed: false`, never a `Failure`, so the return type has to carry both branches: `Result<{ allowed: true; value: Listing[] } | { allowed: false; reason: UsageGateReason }>`. This is exactly what the new `withUsageGate()` helper (Build plan step 2) returns generically, and `searchListings()` is its first real caller.

## Rationale

Full reasoning and the options weighed: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new database table. Results are never persisted (by product decision, recorded in `docs/scope/scope.md`'s Slice 1 introduction), so the only new shape is an in memory value object, Zod parsed at the Adzuna response boundary and never written to Postgres. Feature 12 imports this exact shape later for its own field mapping (spec 0003 already names feature 11 as owner of that mapping).

`Listing` (in memory, request scoped):

| Field | Type | Required | Source |
|---|---|---|---|
| `source` | literal `"adzuna"` | yes | a constant, exported once from `src/features/search/adzuna.ts` so feature 12 imports the same literal rather than re declaring it (spec 0003's Value sourcing table names this feature as the one that sets it) |
| `sourceJobId` | string | yes | Adzuna `id`, coerced to string (Adzuna's own docs do not commit to a JSON type for it) |
| `title` | string | yes | Adzuna `title` |
| `companyName` | string | yes | Adzuna `company.display_name` |
| `location` | string | no | Adzuna `location.display_name` |
| `url` | string (URL) | yes | Adzuna `redirect_url` |
| `descriptionSnippet` | string | no | Adzuna `description` (a snippet only; Adzuna does not return the full posting text; see Follow-up on spec 0003's column note) |
| `salaryMin` | number | no | Adzuna `salary_min` |
| `salaryMax` | number | no | Adzuna `salary_max`. If Adzuna ever returns a max below the min, the Zod schema drops both rather than passing an inverted pair forward, since spec 0003's own check constraint would refuse it outright at feature 12's insert |
| `salaryCurrency` | string | no, present exactly when either salary figure is | a constant derived from the configured country (`ADZUNA_COUNTRY = "us"` maps to `"USD"`), never from Adzuna, whose response carries no currency field at all |
| `salaryIsPredicted` | boolean | yes | Adzuna `salary_is_predicted` |
| `postedAt` | string (ISO datetime) | no | Adzuna `created` |

Adzuna's response is parsed as an envelope first (does the whole body match the expected shape at all) and then per item: a single listing that fails its own parse is dropped and counted, not treated as a reason to fail the whole page. `response_malformed` is only reported when every item in a non empty batch fails, since one bad row among twenty is Adzuna's data quality, not a broken integration (feature 19 owns data quality properly; this is just refusing to let one bad row blank an otherwise good page).

`SearchQuery` (parsed from URL search params, request scoped):

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no, but at least one of `title`/`location` required | trimmed, max 200 characters, maps to Adzuna's `what` |
| `location` | string | no, but at least one of `title`/`location` required | trimmed, max 200 characters, maps to Adzuna's `where` |

**The Adzuna request itself**, named explicitly rather than left to the build to invent:

| Constant | Value | Notes |
|---|---|---|
| Endpoint | `https://api.adzuna.com/v1/api/jobs/{ADZUNA_COUNTRY}/search/1` | page fixed to `1` (AC-1, first page only) |
| `results_per_page` | `20` | matches AC-1's "up to 20 results" |
| `sort_by` | omitted | Adzuna's own default (relevance) is used deliberately; no sort control exists this slice (structured filters are Slice 3), and ranking intelligence arrives properly in Slice 2 rather than being approximated here by switching to a date sort |
| timeout | `8000` ms, via `AbortSignal.timeout(8000)` | so a hung Adzuna request fails visibly (AC-5) rather than holding the render open indefinitely |

A response whose HTTP status is not success (`res.ok` false, most likely a `429` given Adzuna's 25 calls a minute ceiling) is treated the same as a thrown error: reported as `external_service_failed`, never parsed as if it were a listings body. `fetch()` itself does not throw on a non success status, so this check is explicit rather than assumed to fall out of `attempt()`.

**Copy**: one slot per user facing string, text left for the engineer to write before `/develop`, the same convention specs 0007 and 0011 use.

| Slot | Shown when | Text |
|---|---|---|
| `COPY-1` | the title field's label | _to be written_ |
| `COPY-2` | the location field's label | _to be written_ |
| `COPY-3` | both fields submitted blank (AC-2) | _to be written; should say at least one field is needed, not just "invalid"_ |
| `COPY-4` | a search matches zero listings (AC-4) | _to be written; should read as a normal outcome, not a failure, matching the "no `role=\"alert\"`" convention the current placeholder page already sets_ |
| `COPY-5` | the Adzuna call fails or its response cannot be parsed (AC-5) | _to be written; a generic, honest failure message, not a technical one_ |

The five gate refusal reasons already have their sentences in `src/lib/usage-gating/copy.ts` (spec 0011); this feature renders those verbatim and writes no copy of its own for them.

**State transitions**: none. Neither shape is persisted, so there is no lifecycle to define.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `GET /search` | page (Server Component) | URL search params `q?`, `where?` | rendered listings, or the empty, failure, or refusal state | signed in, via the existing `(app)` layout guard (spec 0008) | none thrown; every failure renders inline |
| the search form, `src/features/search/search-form.tsx` | plain HTML form | title/location text inputs, prefilled per AC-9 | a browser navigation to `/search?q=...&where=...` | none (it only ever produces a `GET` to the page above) | none; client side has nothing to fail, `AC-2`'s check happens server side on submit |
| `searchListings()` in `src/features/search/adzuna.ts` | server function | `{ title?: string; location?: string }`, plus an optional `cookieAdapter?: CookieMethodsServer` (the same test seam `checkUsageGate()` already exposes, spec 0011) | a `Result` whose success value is either `{ allowed: true, value: Listing[] }` or `{ allowed: false, reason: UsageGateReason }` (see Decision) | called only from the signed in route above; internally verified again by `checkUsageGate()`'s own `getClaims()` check | `validation_failed` (both fields blank), `session_missing`, `usage_gate_misconfigured`, `database_unavailable` (all three real `checkUsageGate()` failure kinds, spec 0011), `external_service_failed`, `response_malformed` |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| render results | the title/location query values | URL search params `q`/`where`, or the prefill below when both are absent |
| render results | the prefilled title/location | `job_preference.desired_titles[0]` / `job_preference.desired_locations[0]` for the caller (spec 0003's existing table, read only) |
| render results | the Adzuna country | the constant `ADZUNA_COUNTRY = "us"`, a code constant, not an environment variable, since it does not vary by deploy environment |
| render results | Adzuna credentials | `env.ADZUNA_APP_ID`, `env.ADZUNA_APP_KEY`, server only |
| render results | each listing's fields | parsed one to one from Adzuna's response, per the `Listing` table above |
| render results | `salaryCurrency` | derived from `ADZUNA_COUNTRY` via a small constant map (`{ us: "USD" }`), never from Adzuna |
| render results | the "Jobs"/"Adzuna" attribution link target | derived from `ADZUNA_COUNTRY` via a constant map (`{ us: "https://www.adzuna.com" }`), per Adzuna's terms allowing "the relevant local domain" |
| render results | the Jobsworth attribution link target | the fixed URL quoted verbatim in Adzuna's terms, `http://www.adzuna.co.uk/jobs/salary-predictor.html` (the terms state this one without a local domain alternative, unlike the main attribution clause; see Follow-up) |
| render results | the Adzuna logo image asset | supplied by the engineer before this feature is built; not sourced by this spec (see Follow-up) |
| refusal state | the sentence shown | `src/lib/usage-gating/copy.ts`'s `SENTENCES` map, keyed by the reason `checkUsageGate()` returns |
| any state | the relative posted date text | computed at render from `postedAt` with `Intl.RelativeTimeFormat("en-US")`, never stored formatted; omitted entirely when `postedAt` is absent, never shown as a placeholder |

**Key invariants**:

1. Exactly one Adzuna call, and exactly one usage gate check, per user submitted search, never zero and never more than one, so spec 0011's own accounting assumption ("the cap counts outbound API calls") holds exactly.
2. A usage gate refusal, or a blank query, always short circuits before any Adzuna call, enforced structurally by the `withUsageGate()` helper (see Build plan), never left to a caller remembering to check `allowed` first.
3. Currency is never read from Adzuna; it is always the constant derived from the configured country.
4. Attribution renders once per displayed listing, never once per screen. A screen with zero listings shows no attribution block, since there is nothing to attribute.
5. A predicted salary is never shown indistinguishably from a stated one.
6. No listing data is ever written to the database by this feature. Every result is request scoped and re fetched on the next search.
7. An optional field with no value (`location`, `descriptionSnippet`, either salary figure, `postedAt`) is simply omitted from the card, never rendered as a placeholder or a dash that could be mistaken for real data.

**Security model**:

Only a signed in caller reaches `/search`'s real content, enforced by the existing `(app)` layout guard (spec 0008); this feature adds no new authorization rule, since a search targets nobody's data but the caller's own preferences and a public search API. `checkUsageGate()` already verifies the caller with `getClaims()` before spending any budget (spec 0011); this feature adds no separate identity check. The only things sent outward are the caller's typed query text, the app's own shared Adzuna credentials, and (for the prefill) the caller's own previously stated preferences, never a value belonging to anyone else.

**Configuration required**:

- `ADZUNA_APP_ID`: server only, required (`z.string().min(1)`, no default), Adzuna's application id credential.
- `ADZUNA_APP_KEY`: server only, required (`z.string().min(1)`, no default), Adzuna's application key credential.

Both are added to `.env.example` and `.env.test.example` (both already exist in this repo) as part of Build plan step 1, with placeholder values, matching every other credential already documented there.

Country, currency, and the attribution domain are plain code constants, not environment variables: they carry no secret and do not vary by deploy environment.

**Critical test scenarios**:

- Happy path: a signed in user with a `job_preference` row searches with a real title, sees real Adzuna listings with working attribution and outbound links, verifies **AC-1**, **AC-6**, **AC-8**.
- Failure case: Adzuna forced to time out and, separately, forced to return a malformed body, each renders the failure state and reports the matching kind, verifies **AC-5**.
- Failure case: Adzuna forced to return a non success HTTP status (e.g. a `429`), renders the same failure state and reports `external_service_failed`, verifies **AC-5**.
- Failure case: a batch where one of several returned listings fails its own item level parse renders the rest normally and drops only the bad one, verifies **AC-1**, **AC-5** (the "every item fails" branch is a separate case, same kind).
- Gate: a caller whose account week cap is already spent gets the exact `account_week_cap_reached` sentence and no Adzuna call runs, verifies **AC-3**, **AC-10**.
- Gate failure: `checkUsageGate()` itself forced to fail (an invalid session, or a forced database error) renders the failure state through `session_missing` or `database_unavailable` respectively, never the refusal state, verifies **AC-3**.
- Validation: a submission with both fields blank is refused before any call and spends no budget, verifies **AC-2**.
- Empty: a search that legitimately matches nothing renders the empty state, distinguishable from both the failure and refusal states, verifies **AC-4**.
- Predicted salary: a listing carrying `salary_is_predicted: true` renders the estimate label and the Jobsworth attribution; one carrying `false` (or no salary) renders neither, verifies **AC-7**.
- Prefill without spend: a caller with a `job_preference` row visits bare `/search` (no `q`/`where`), sees the fields prefilled, and neither `checkUsageGate()` nor the Adzuna client is called, verifies **AC-9**.

## Build plan

Ordered for Tracer Bullet: a thin thread through every layer proven on one real query before the full attribution and edge case surface is built out.

_Progress, 2026-09-04: steps 1 to 7 are built and landed on `feat/job-search-and-results-list`. Step 8 is **not** done: the whole thread was proved end to end by hand against the real local stack and the real Adzuna API (a real minted session, 20 real listings, and each of the five visible states driven in a browser), but no recorded Adzuna fixture and no committed test of the Critical test scenarios exists yet. That is `/test`'s milestone on this feature's scope row._

1. Configuration: add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` (both required) to `src/env.ts`'s server block and to `.env.example`/`.env.test.example`, and add the `adzuna` entry to `DATA_RECIPIENTS` in `src/features/legal/recipients.ts` naming both keys. Satisfies **AC-11**.
2. Build `src/lib/usage-gating/with-usage-gate.ts`: the `withUsageGate<T>(callType, fn, cookieAdapter?)` inversion of control helper spec 0011's own Consequences flagged as owed to this feature, returning `Result<{ allowed: true, value: T } or { allowed: false, reason: UsageGateReason }>` (see Decision), so a caller cannot reach its outbound call without the gate's `allowed: true` branch running it. Threads the same optional `cookieAdapter` seam `checkUsageGate()` already exposes, so the real minted session tests in step 8 have something to pass. Lives in `src/lib/` alongside the rest of usage gating, not under this feature, since it is generic across call types. Satisfies **AC-3**, **AC-10**.
3. Build `src/features/search/adzuna.ts`: the Zod schemas (the envelope, the per item listing shape parsed individually per the Data model sketch's drop and count rule, and the `SearchQuery` input requiring at least one of title or location), the `source` constant, the `Listing` type, and `searchListings()` (accepting the same optional `cookieAdapter`), opening the `search.run` span as its first statement, building the request from the named endpoint/`results_per_page`/timeout constants, checking `res.ok` explicitly before parsing (a non success status is `external_service_failed`, never handed to the parser), wrapping the `fetch` in `attempt()` for a thrown network error, and calling `withUsageGate("job_search", ...)` around it. Register `search.run` in `docs/observability/spans.md`. Satisfies **AC-1**, **AC-2**, **AC-5**, **AC-10**.
4. The thin end to end thread: `src/features/search/search-form.tsx` (the plain `GET` form) and repoint `src/app/(app)/search/page.tsx` off its placeholder to read `searchParams`, call `searchListings()`, and render real listings through `Card`/`Card.Footer`, with a plain text attribution stand in until the real logo lands. Proves the whole pipe, gate through render, on one real query. Satisfies **AC-1**, **AC-8** (partial).
5. Thicken: the `AdzunaAttribution` component (the real logo asset once sourced, both link targets) placed in `Card.Footer`'s `attribution` slot, and the Jobsworth badge (icon, text, link, mouseover) shown beside a predicted salary, plus the "(estimated)" label. Satisfies **AC-6**, **AC-7**, **AC-8**.
6. Thicken: the prefill read from `job_preference` on a bare `/search` visit (never itself calling `searchListings()`), and the three distinct visible states (validation message, empty state, failure state), rendering `COPY-3` through `COPY-5` from the Copy table above. Satisfies **AC-4**, **AC-9**.
7. Retire the entry page's `filtered search` planned claim to working (spec 0006, AC-8, the status card). Satisfies **AC-12**.
8. Prove and test: the Critical test scenarios above, against a real minted session (spec 0004) and a recorded Adzuna fixture (redacting `ADZUNA_APP_ID`/`ADZUNA_APP_KEY` at capture time, per spec 0004's own redaction rule). Satisfies every AC.

## Consequences

**Positive**:

- The entry page's "filtered search" claim becomes true the moment this ships, the third of five features 32's status card held a slot open for.
- `withUsageGate()` closes a gap spec 0011 itself flagged rather than engineered around, and becomes reusable by features 13 and 14 when they add their own call types.
- The attribution slot spec 0005 built ahead of time gets its first real content, closing that spec's own Follow-up.

**Negative / tradeoffs**:

- Adzuna's search response carries only a description snippet, not the full posting text. Scoring (feature 14) and the remote heuristic (feature 18) inherit that limitation; this spec does not resolve it, `docs/jobhunt-carry-forward.md`'s feature 14 entry already names the options.
- The Jobsworth attribution adds a second, visually distinct attribution block whenever a predicted salary appears, which is most listings in practice; the result card is busier than a plain job board card as a direct consequence of meeting the terms exactly rather than approximately.
- Locking the country to a single constant means a second market is a code change, not a configuration change, until a real second market is actually needed.
- A reload, a browser back navigation, or a shared `/search?q=...` link each spends a fresh gate check and, if allowed, a fresh Adzuna call (AC-10), since the URL alone drives the render; there is no client side cache to serve a repeat view from. At this app's real volume this is not a meaningful cost, but it is a real one, and it means the account weekly cap of 25 is a cap on renders, not on distinct intents to search.

**Neutral**:

- No migration. This is the first Slice 1 feature that adds no table and no policy.
- The real Adzuna logo asset is a manual step outside this spec's own build plan (see Follow-up); the thin thread ships with a text only stand in until it lands.

## Follow-up

- [x] The real Adzuna logo image asset must be sourced by the engineer before step 5 of the Build plan; none was found at the pages this spec's research reached (`adzuna.co.uk/press.html` returned 403 Forbidden on 2026-09-04). **Done: the engineer supplied it before the build** (`src/features/search/adzuna-logo.svg`, commit `1504a0b`), so AC-6 is met in full, with the mark rendered inline from `adzuna-logo-geometry.ts` and held to the file by a drift test.
- [ ] Spec 0005's own Follow-up (index line 180, confirm the exact attribution image asset and link targets) is answered here for the link targets (`https://www.adzuna.com` for both, for the configured United States country) but not for the image asset itself; that spec stays as written until the asset lands.
- [ ] If this app is ever configured for a country other than the United States, review the currency constant, the attribution domain constant, and the Jobsworth link target together: the Jobsworth URL is quoted in this spec exactly as Adzuna's terms state it, with no "or relevant local domain" alternative offered the way the main attribution clause has, so treat it as fixed rather than assumed to vary per country until checked again.
- [ ] Whether Adzuna grants a rate limit increase on request, and on what terms, is unverified (also flagged in `docs/jobhunt-carry-forward.md`'s feature 10 entry); worth asking before spec 0011's own caps are treated as permanently fixed to Adzuna's current defaults.
- [ ] `docs/scope/scope.md`'s Done when wording for this feature ("every screen showing listings carries the required attribution label") is close enough to build against but not quite accurate: the verified obligation is per displayed advert, not per screen. Worth a small wording correction next time `/scope` reconciles.
- [ ] Spec 0003's `application` table sketch (index line 118) describes `job_description` as "the listing's full description text ... the only copy that survives the posting being taken down." That is now known incorrect: Adzuna's search response carries only a snippet (confirmed directly against the API docs, 2026-09-04), so whatever feature 12 eventually writes into `job_description` will be a snippet too, unless a future feature adds a separate fetch of the full posting. Worth a small correction to spec 0003's column note so a later reader is not misled about what actually survives.
- [ ] **`Listing.salaryIsPredicted` has nowhere to land.** Confirmed directly against `supabase/migrations/20260825162457_data_model.sql:168` to `188`: `application` carries `salary_min`, `salary_max`, `salary_currency`, and no column for whether the figure was predicted. If feature 12 snapshots a `Listing` straight into `application` as the table stands today, AC-7's "(estimated)" label silently disappears the moment a user applies to a predicted salary listing, and every later screen reading from `application` (an applications dashboard, feature 23) would show it as a stated figure. This spec does not resolve it, since the table belongs to spec 0003 and the write belongs to feature 12, neither of which this spec owns. My own lean, for feature 12's spec to weigh rather than inherit as settled: add the column (a small, additive migration) rather than drop the flag on snapshot, since dropping it directly contradicts the reason AC-7 exists. Recorded identically in spec 0003's own Follow-up and on feature 12's scope row so it survives until a feature 12 spec exists to decide it properly.

## Rationale

Full reasoning, the options weighed, and the verified references: see [rationale.md](rationale.md).
