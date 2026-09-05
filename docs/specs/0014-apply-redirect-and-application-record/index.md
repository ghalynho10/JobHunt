# 0014 · Apply redirect and application record

**Status**: Accepted
**Date**: 2026-09-05
**Revision**: 4 (2026-09-05, after `/check verify` and `/debug` measured three of this spec's own claims and found two of them wrong. **AC-20 named the wrong mechanism**: the read only cookie adapter is real defence in depth but is not what keeps an expired session apply free, because the cookie write came from `src/proxy.ts`, which runs on the action `POST` too. New **AC-20a** records the fix and amends specs 0008 and 0001. **The stale build does not cost a search**: revision 3 recorded that it does, from a hand built `POST`; a real browser against a genuinely stale build gets a `404` and moves no counter. AC-21 and one `## Consequences` line are corrected. Everything else revision 3 said held up under measurement.)

**Revision**: 3 (2026-09-05, after the build: one destination was wrong, one acceptance criterion was not satisfiable where it was written, and the stale build case turned out to cost the reader a search. See `## Follow-up`)

## Summary

A signed in user clicks a search result through to the real posting, then marks that they applied, and the app writes one `application` row holding a full copy of the listing. Those rows are listed back on `/applications`, where they can be removed through a confirmation step. Nothing is auto filled and nothing is submitted on anyone's behalf.

Three things make this more than a form and a table. The apply write must not re-render `/search`, because that would re-run the Adzuna search and spend one of the 25 weekly calls. Adzuna's attribution obligation is per displayed advert, so it follows the listing onto `/applications`. And the `application` table gains one column, `salary_is_predicted`, because without it a salary Adzuna only guessed at resurfaces later as a stated fact.

The hardest part is not the write. It is that three separate mechanisms can each re-render `/search` without anyone meaning to, and two of them are invisible in review.

Full reasoning and the options weighed: see [rationale.md](rationale.md).

## Requirements

**User stories**:

- As a job seeker, I want to open the real posting on the source site, so that I apply through the employer's own process rather than through a copy of it.
- As a job seeker, I want to record that I applied, so that I can see what I sent and when without re-running a search.
- As a job seeker, I want a search to show me which jobs I already applied to, so that I do not waste an application or a click on a job I already sent.
- As a job seeker, I want to remove a record I created by mistake, so that one wrong click does not permanently poison a job I still want to apply to.
- As the operator, I want Adzuna's attribution to follow their data wherever it is displayed, so that the app stays inside the terms that let it use that data at all.

**Acceptance criteria**:

- **AC-1**: A result card carries a `Mark as applied` control that is separate from feature 11's `View the posting` link. Opening a posting records nothing at all: no row is written by the click through, and no state changes.
- **AC-2**: Marking applied writes exactly one `application` row for the caller, carrying `profile_id` from the caller's own verified claims, `source` from `ADZUNA_SOURCE`, and eleven snapshot fields from the `Listing`. The listing is re-parsed on arrival by `listingSnapshotSchema`, which parses the transformed `Listing` shape rather than Adzuna's wire shape, and which requires `postedAt` to be a real ISO datetime so an unparseable date is a `validation_failed` rather than a Postgres `22007` reported as an outage. No value in the row comes from anything the browser is trusted to have got right.
- **AC-3**: The record survives a reload and is visible on `/applications` without spending an Adzuna call or a `job_search` gate check.
- **AC-4**: A second apply to the same `(profile_id, source, source_job_id)` writes no second row and produces a visible expected failure carrying `COPY-2`, kind `validation_failed`, severity `expected`. The refusal comes from the unique constraint, so it holds for a caller that never checked first (spec 0003, AC-7).
- **AC-5**: An apply by a caller with no `profile` row writes nothing and produces a visible expected failure carrying `COPY-3`, kind `record_not_found`, severity `expected`, which names the profile as the thing needed first and links to `/profile`. The refusal comes from the foreign key (spec 0003, AC-8), and a raw database error never reaches the reader.
- **AC-6**: `application.salary_is_predicted` exists as a nullable boolean, and a check constraint makes it present exactly when `salary_min` or `salary_max` is present. When Adzuna stated no pay at all, the column is written `null` and never `false`, so it never makes a claim about a figure that does not exist.
- **AC-7**: An application row whose stored salary was predicted renders `(estimated)` beside the figure and carries the Jobsworth attribution, matching spec 0013's AC-7 exactly: a 20 by 20 pixel icon plus the words `Adzuna Jobsworth`, both linked to `ADZUNA_JOBSWORTH_URL`, with the mouseover text `Salary estimate powered by Adzuna Jobsworth`. A stored non predicted salary renders neither.
- **AC-8**: Every application row displayed on `/applications` carries its own `Jobs by Adzuna` attribution through `Card.Footer`'s attribution slot, on the same terms spec 0013 AC-6 sets for a search result, with the link target read from `ADZUNA_ATTRIBUTION_URL`. Attribution renders once per displayed row and never once per screen (spec 0013, invariant 4). A page with no rows shows no attribution block.
- **AC-9**: A search result the caller has already applied to is visibly marked as applied, and its `Mark as applied` control is disabled. Two paths reach that state and both are covered: a server read at render time (`readAppliedJobIds`, scoped to the `source_job_id` values actually rendered), and the action's own returned state after a successful apply in this render. The applied state is reached only on a confirmed database write, never optimistically.
- **AC-10**: Marking applied does not re-render `/search`. No second Adzuna call is made, no `job_search` gate check is spent, and the weekly counter does not move. This holds for a fresh session **and for a session whose access token has expired**, which is the case a single measurement misses. Measured against a production build (`pnpm build && pnpm start`), never under `pnpm dev`, for the reason spec 0013's AC-10 records.
- **AC-11**: An application can be removed from `/applications`. The removal is confirmed first at `/applications?remove=<id>`, that URL mutates nothing on its own, and the question carries `COPY-4`, naming the job being removed rather than asking a bare "are you sure". A removal matching zero rows is a reported failure, not a silent success. On success the remove action **does** call `revalidatePath("/applications")`, because that page makes no outbound call and the deviation in AC-10 is scoped to the apply action alone.
- **AC-12**: `job_description` holds the Adzuna description snippet the search already parsed, and the spec that describes that column as the full posting text is corrected in every place it says so.
- **AC-13**: `Listing` refuses an empty or whitespace only `sourceJobId`, `title` or `companyName`. Such an item is dropped by feature 11's existing per item parse as an ordinary bad row, so it never reaches the results list and never reaches an insert that the table's check constraints would refuse.
- **AC-14**: The four operations this feature adds each open a named span as their first statement, at the moment the operation is first written rather than in a later pass, and are registered in [spans.md](../../observability/spans.md) with `op: "db.query"`: `application.record`, `application.remove`, `application.read_list`, and `search.read_applied`.
- **AC-15**: `salary_is_predicted` is declared in `STORED_FIELDS` with a plain words description, so the privacy notice drift guard passes and the notice keeps naming every column actually stored.
- **AC-16**: The entry page's "What's real today" card moves `application tracking` out of `planned` and into `working` (spec 0006, **AC-8**), and the `planned` list no longer names it.
- **AC-17**: `/applications` with no rows keeps its existing promise sentence and adds a link to `/search` carrying `COPY-5`, so the empty state has an exit rather than being a dead end.
- **AC-18**: `/applications` lists rows newest applied first by `applied_at`, and shows for each the full stored snapshot: title, company, location, salary, description snippet, posted date, applied date, and the link out to the posting carrying `COPY-6`. `applied_at` renders as an absolute date and `posted_at` reuses feature 11's relative formatter, because a relative applied date is the one that ages into uselessness on an archive.
- **AC-19**: Both write paths verify their own caller independently of the protected layout that rendered the form (spec 0001, binding rule 6), and row level security remains the real guarantee behind both.
- **AC-20**: The apply action builds its Supabase client with a **read only cookie adapter**, so nothing inside it can write a session cookie. A cookie write inside a Server Action puts a re-render of the current route into the action's response, which on `/search` means a second Adzuna call. **This criterion is defence in depth, and it is NOT what makes AC-10 hold for an expired session** (corrected 2026-09-05, revision 4; the original wording said it was). Measured: with the adapter in place and unchanged, an expired session apply still spent a call, because the write came from `src/proxy.ts`, which runs on the action `POST` too. The adapter closes a door this bug never used, and it stays closed because a later session adding a cookie write inside the action would reopen it. What actually makes AC-10 hold for an expired session is **AC-20a**.
- **AC-20a**: `src/proxy.ts` **withholds the refreshed session cookie from the response of a Server Action request**, while still handing the refreshed value to that request's own code through `request.cookies.set()`, so `recordApplication` can verify its caller. The branch keys on the presence of Next's `next-action` request header, never on the route, so binding rule 6's mechanical guard is untouched: the proxy still cannot tell a protected path from a public one. This is the criterion the 25 weekly Adzuna calls actually rest on. **The trade is deliberate**: the browser keeps its stale cookie until its next ordinary request, which refreshes and persists as usual. That refresh reuses a token the action already rotated, which GoTrue accepts inside `refresh_token_reuse_interval` (10 seconds on this project, read from the running container). Confirmed alive across three consecutive applies and a twelve second pause. Amends spec [0008](../0008-app-shell-and-navigation/index.md) AC-10 and spec [0001](../0001-stack-and-architecture/index.md) binding rule 6, both dated the same day.
- **AC-21**: An apply attempted against a stale build fails visibly, carrying `COPY-7`. The encryption key protecting the bound listing is regenerated on every build, so any results page left open across a deploy has an apply control the framework refuses. **The refusal happens before any of this feature's server code runs, so it is caught in the client control around the call, never in `recordApplication`** (corrected 2026-09-05, see `## Consequences`). **It costs the reader nothing** (settled 2026-09-05, revision 4). An earlier draft recorded a refused dispatch re-rendering `/search` and spending one of the 25 weekly Adzuna calls. That came from a hand built `POST`, the no JavaScript shape, and it does not carry over: driven from a real browser against a genuinely stale build, the dispatch answers `404`, runs none of this feature's code, and moves no `job_search` counter. So `COPY-7` is politeness about a dead button, which is reason enough to keep it, and not compensation for a stolen call.

## Options considered

See [rationale.md](rationale.md).

## Decision

**Chosen option**: Two Server Actions writing `application` rows, reached from a small Client Component inside an otherwise server rendered card, where the apply action is prevented from re-rendering the page it was invoked from by three separate measures rather than one.

**How the listing reaches the action.** A thin inline `'use server'` closure is defined **inside the Server Component that renders the card**, capturing that card's parsed `Listing`, and it delegates to the shared `recordApplication` in `src/features/applications/actions.ts`. The inline shape is not a style preference: closure encryption applies to variables captured by an action defined inline in a component (basis: the installed Next.js 16.3.1 docs, `data-security.md` lines 505 to 526, the `publishVersion` example). A module level `'use server'` export has nothing to close over, and `.bind()` is documented separately (`forms.md` lines 74 to 88) with no encryption claim attached to it at all. Building it the module level way would quietly leave this spec's integrity claim unsupported.

The action parses the value again with `listingSnapshotSchema` on arrival regardless, per `AGENTS.md`'s "Parse at every boundary" rule (basis: the same docs at `data-security.md` line 528, where the page that documents the encryption advises against relying on it alone). That rule is a project convention in `AGENTS.md`, not one of spec 0001's eight numbered binding rules; binding rule 8 is about deferred tooling choices and has nothing to do with parsing.

**The three ways `/search` could be re-rendered, and what stops each.** A re-render re-runs `searchListings()` and spends one of 25 weekly gated calls, so each is a real cost rather than a slow page (basis: the installed docs, `server-actions.md` lines 44 to 48 and 74; and spec 0011's `job_search` cap).

1. The action calling `revalidatePath`, `updateTag`, `refresh` or `redirect`. Prevented by calling none of them and returning an `ActionState` instead.
2. A cookie mutated during the action's request. This is the one nobody writes on purpose, and revision 3 found only half of it. The half it found: the shared cookie adapter writes cookies, so a session refresh inside the action's own caller check would trigger one, prevented by AC-20's read only adapter. **The half it missed, and the one that actually fired: `src/proxy.ts` runs on the action `POST` too, and refreshes there.** An action cannot defend against that from inside itself, however carefully it builds its own client. Prevented by AC-20a.
3. A future session tidying the action toward the house pattern every profile action follows. Prevented only by this spec and a comment at the call site, which is why both say so in terms.

**What the client control does.** The applications feature carries its own `ActionState` with `status: "idle" | "failed" | "applied"`, deliberately not reusing the profile one, whose comment records that it has no success variant precisely because every profile action redirects. The control flips to applied on `"applied"`, so the visible state follows a confirmed write rather than an optimistic guess.

**Removal** is confirmed through a URL that mutates nothing (basis: spec 0010 AC-8, the shape already shipped on `/profile`; and WCAG 2.2 criterion 3.3.4, Error Prevention for data changes, which this project's stated AA bar makes binding), and it uses the ordinary `revalidatePath` pattern, because `/applications` makes no outbound call.

**The table** gains one nullable column paired to the salary by a check constraint (basis: spec 0013 AC-7, the rule that a predicted figure is never shown indistinguishably from a stated one; and spec 0003's own currency pairing check, the pattern this one copies).

**Implementation skills**: `supabase-postgres-best-practices` (`supabase/agent-skills`, `.agents/skills/supabase-postgres-best-practices/`), read before the migration · `supabase` (`supabase/agent-skills`, `.agents/skills/supabase/`) · `vitest` (`antfu/skills`, `.agents/skills/vitest/`)

## Rationale

See [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

One additive migration. No new table, no new policy: `application` and its four `application_*_own` policies already ship from feature 4, and both unique constraints already exist.

| Change | Detail |
|---|---|
| `application.salary_is_predicted` | `boolean`, nullable. New column, the only schema change in this feature |
| `application_predicted_pairing` | New check constraint: `check ((salary_is_predicted is null) = (salary_min is null and salary_max is null))`, mirroring the existing `salary_currency` pairing check on the same table |

Everything else `application` needs already exists: `unique (profile_id, source, source_job_id)` is what refuses the second apply, `unique (id, profile_id)` is already there for `application_answer`'s composite foreign key in Slice 4, and the four policies already compare `(select auth.uid()) = profile_id`.

**Why the column is nullable rather than `not null default false`.** `Listing.salaryIsPredicted` is always a boolean, because Adzuna sends the field on every advert whether or not it quoted pay. Writing that boolean straight through would put `false` on rows that carry no salary at all, which reads as "this figure was stated, not predicted" about a figure that does not exist. Null carries the third meaning the data actually has: Adzuna said nothing about pay, so the question does not arise. The check constraint is what stops the two from drifting apart.

**State transitions**: none. `application` deliberately carries no status column in v1 and feature 23 introduces one when the dashboard needs it (spec 0003, `## State transitions`). A row exists or it does not.

**Shared code this feature relocates.** `/applications` must render the same attribution, the same `(estimated)` label and the same salary formatting as `/search`, and `AGENTS.md`'s folder rule says anything two features share moves out of the feature folder. Three things move, and this is a relocation of shipped, tested code rather than a rewrite:

| What | From | To |
|---|---|---|
| `AdzunaAttribution`, `JobsworthAttribution`, plus the logo geometry and SVG they read | `src/features/search/` | `src/components/` |
| `salaryText`, `relativePostedAt` | `src/features/search/result-card.tsx` (the first is currently unexported) | `src/lib/listing-format.ts` |
| `ADZUNA_SOURCE`, `ADZUNA_ATTRIBUTION_URL`, `ADZUNA_JOBSWORTH_URL`, `ADZUNA_COUNTRY` | already exported from `src/features/search/adzuna.ts` | `src/lib/adzuna.ts`, so neither feature imports from the other |

**`src/components/`, NOT `src/components/ui/`, and the first revision of this spec said the wrong one.** Corrected 2026-09-05 during the build, which is when anyone first read the destination's own rules. [src/components/ui/AGENTS.md](../../../src/components/ui/AGENTS.md) defines that directory as spec 0005's design system: "the token layer's consumers, and the only sanctioned way to render these patterns", with every file enumerated in a table. A vendor licence attribution is not a design system primitive and does not consume the token layer; filing it there would have put a terms obligation inside a spec 0005 governed directory and required editing that spec's table for a component that does not belong to it.

Root `AGENTS.md` names two destinations for shared code, `src/lib` and `src/components/ui`, and neither fits: `src/lib` holds no JSX at all, and `src/components/ui` is the design system. `src/components/` is a third location, and adding it is the smallest change that keeps both rules true. `/sync` should record it in root `AGENTS.md` after the merge.

`ADZUNA_COUNTRY` moved too, which the first revision missed: `ADZUNA_ATTRIBUTION_URL` derives from it, so leaving the country behind would have made a shared module import from a feature. `CURRENCY_BY_COUNTRY` deliberately stayed in the search feature, since only that feature parses a response.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `recordApplication` | Server Action, reached through an inline per card closure | the `Listing`, captured by the closure and re-parsed by `listingSnapshotSchema` on arrival | `ActionState`: `status: "applied"` on success, `"failed"` with a message otherwise. Never `undefined`, which would be indistinguishable from the initial state | own caller verified inside the action, using the read only cookie adapter | duplicate (`validation_failed`), no profile row (`record_not_found`), bad shape or unparseable date (`validation_failed`), database down (`database_unavailable`). **A stale build refusal is deliberately absent: it never reaches this action** (AC-21) |
| `removeApplication` | Server Action | `application_id` from the confirmation form | `ActionState`, then `revalidatePath("/applications")` on success | own caller verified inside the action | zero rows matched (`record_not_found`), database down (`database_unavailable`) |
| `readApplications` | Server read, `/applications` | the caller's own id | the caller's rows, newest `applied_at` first | protected layout plus row level security | database down (`database_unavailable`) |
| `readAppliedJobIds` | Server read, `/search` | the caller's own id, plus the `source_job_id` values actually rendered | the subset already applied to | protected layout plus row level security | database down (`database_unavailable`) |

The confirmation screen needs no read of its own: `/applications` already holds the rows, so the job named in the question comes from the row the page rendered. That is why there are four operations here and not five.

Neither read is a route handler and neither lives under `src/app/api/`, so binding rule 6's restriction on handlers reading user data is respected rather than worked around.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| record | `profile_id` | `auth.uid()` from the caller's own verified claims, never from the form (spec 0003, Value sourcing) |
| record | `source` | `ADZUNA_SOURCE`, imported rather than re declared as a second string literal |
| record | `source_job_id`, `job_title`, `company_name`, `job_location`, `job_url`, `posted_at`, `salary_min`, `salary_max`, `salary_currency` | the `Listing` feature 11 parsed, captured by the card's inline closure and re-parsed on arrival |
| record | `job_description` | `Listing.descriptionSnippet`, which is a snippet and not the full posting text. Adzuna's search response carries no full text, confirmed against its API docs on 2026-09-04 |
| record | `salary_is_predicted` | `Listing.salaryIsPredicted` when either salary figure is present, and `null` when neither is |
| record | `applied_at`, `created_at`, `updated_at` | database defaults and the `set_updated_at` trigger, never written by application code (spec 0003, invariant 10) |
| record | the Supabase client's cookie adapter | a read only adapter passed into `createClient()`, using the injected adapter parameter (AC-20) |
| record | the duplicate message | `COPY-2`, via a per feature failures table mapping Postgres `23505` to `validation_failed` at `expected`, following `src/features/profile/actions.ts:346` |
| record | the missing profile message | `COPY-3`, via the same table mapping Postgres `23503` to `record_not_found` at `expected`, following the `FOREIGN_KEY_VIOLATION` constant at `src/features/profile/failures.ts:119` |
| apply control (client) | the stale build message | `COPY-7`, from a `try`/`catch` around the dispatch in `ApplyControl`. **Not a value the action produces**: the framework refuses the request before `recordApplication` runs, so this is the one failure in the feature that never passes through `failure()` and never reaches Sentry (AC-21) |
| record | the card's applied state after a successful apply | the action's own returned `status: "applied"`, never an optimistic client flip |
| remove | which row is removed | `application_id` from the confirmation form, narrowed by the caller's own `profile_id` in the statement itself, so a crafted id cannot reach another user's row even before row level security refuses it |
| remove | the job named in the confirmation question | `COPY-4`, filled from the row `/applications` already rendered, so no extra read and no fifth span |
| list | the ordering | `applied_at` descending, the column spec 0003 defined for exactly this |
| list | the salary line and its `(estimated)` label | `salary_min`, `salary_max`, `salary_currency` and `salary_is_predicted` off the stored row, through the relocated `salaryText`, formatted at render and never stored formatted |
| list | `applied_at` as displayed | an absolute date formatted at render |
| list | `posted_at` as displayed | the relocated `relativePostedAt`, with `now` injected the way feature 11 already injects it |
| list | the attribution link target | `ADZUNA_ATTRIBUTION_URL`, the existing export. Its underlying `ATTRIBUTION_DOMAIN_BY_COUNTRY` map is module private and is not the thing to import |
| list | the Jobsworth link target | `ADZUNA_JOBSWORTH_URL`, the existing export |
| list | the empty state link | `COPY-5` |
| list | the link out label | `COPY-6` |
| search | which results are marked applied | one read of the caller's own `application` rows, filtered to the `source_job_id` values rendered on this page |
| search | what a failed marker read shows | `COPY-8`, said out loud to the reader. Rendering the cards unmarked would silently claim "not applied", which is the default that reads like success this project's rules forbid |

**Copy**: one slot per user facing string, text left for the engineer to write before `/develop`, the same convention specs 0007, 0011 and 0013 use.

| Slot | Shown when | Text |
|---|---|---|
| `COPY-1` | the label on the apply control, and its applied state | Button: `Mark as applied` · Applied state: `Applied` |
| `COPY-2` | the same job is marked applied twice | `You've already marked this job applied.` |
| `COPY-3` | an apply is attempted with no profile row, including the link text to `/profile` | `Set up your profile before you can apply to jobs.` (link text: `Set up your profile`) |
| `COPY-4` | the removal confirmation question, naming the job | `Remove your application to {title} at {company}? This can't be undone.` |
| `COPY-5` | `/applications` is empty, the link to `/search` | Link text: `Search for jobs` |
| `COPY-6` | the link out to the posting from an application row | `View the posting` |
| `COPY-7` | an apply is attempted from a page left open across a deploy | `This page is out of date. Refresh and try again.` |
| `COPY-8` | the applied marker read failed, so the page cannot say which jobs were already applied to | `We couldn't check which jobs you've already applied to, so none are marked below.` |

Two notes for the build, neither of which changes the text above.

`COPY-4` carries two placeholders, `{title}` and `{company}`, so it is a function rather than a constant, the same shape `deleteConfirmation(title, company)` already has in `src/features/profile/copy.ts`.

`COPY-6` is the same visible label feature 11 uses on a result card, and it is correct that both read the same. It needs the same treatment feature 11 gave it: the accessible name has to name the posting, because a list of application rows all carrying a link named `View the posting` is indistinguishable in a screen reader's link list. That is a build obligation under AC-18 and the project's WCAG 2.2 AA bar, not a second copy slot.

**Key invariants**:

1. Opening a posting records nothing. Only the explicit control writes.
2. One application per user per source listing, guaranteed by the unique constraint rather than by a caller remembering to check.
3. `salary_is_predicted` is present exactly when a salary figure is present, guaranteed by the check constraint.
4. A predicted salary is never displayed indistinguishably from a stated one, on `/applications` as on `/search`.
5. Attribution renders once per displayed advert, never once per screen, on every screen that displays one.
6. The apply action triggers no re-render of `/search`, by any of the five routes, including the cookie write nobody performs deliberately.
7. Nothing in this feature makes an outbound call, so nothing here passes through the usage gate.
8. Every value written to a row comes from verified claims, a constant, or a re-parsed listing, never from a value the browser is trusted on.
9. No screen ever renders an absence of information as a statement of fact: an unmarked card during a failed marker read, and an empty salary, both say what they are.

**Security model**:

Both writes verify their own caller inside the action (binding rule 6), independently of the protected layout. Row level security is the real guarantee: all four `application` policies compare `(select auth.uid()) = profile_id`, so a caller can only ever read, write or delete their own rows.

The closure encryption is an integrity measure, not a confidentiality one. The listing is public job data already rendered in plain sight on the same page, so there is nothing to hide from the reader. What the encryption buys is that a client cannot mint a listing it was never served. It does not stop a client replaying a listing it *was* served, which is fine, because that only ever writes their own row. Next's own docs advise against relying on it alone, which is why the Zod parse on arrival is not optional and the row is narrowed by the caller's id regardless.

The read only cookie adapter is a budget measure rather than a security one, and it is worth being clear about which. It stops the action writing a refreshed session cookie, and the session still refreshes: `src/proxy.ts` does it on every request, which is exactly what the existing adapter's catch block already depends on for Server Components.

Compliance scope: `application` rows are personal data. Spec 0009's privacy notice already classifies the table and lists its columns, and its drift guard reads the generated database types, so the new column fails the unit suite until it is described. That failure is the mechanism working, not a defect.

**Configuration required**: none. This feature adds no environment variable and no credential, so it cannot hit the preview build failure features 11, 13 and 14 each carry.

**Critical test scenarios**:

- Happy path: a signed in user with a profile marks a real listing applied, one row lands with all eleven snapshot fields plus `profile_id` and `source`, and the card flips to applied without the page re-rendering, verifies **AC-1**, **AC-2**, **AC-3**, **AC-9**.
- Duplicate: the same listing applied twice writes one row and the second attempt shows `COPY-2`, verifies **AC-4**.
- No profile: an apply by a user with no `profile` row is refused by the foreign key and shows `COPY-3` linking to `/profile`, verifies **AC-5**.
- Predicted salary round trip: a listing with `salary_is_predicted` true stores `true` and renders `(estimated)` plus Jobsworth on `/applications`; one with a stated salary stores `false` and renders neither; one with no salary at all stores `null`, verifies **AC-6**, **AC-7**.
- Pairing refusal: an insert carrying `salary_is_predicted` with no salary figure, or a salary figure with no flag, is refused by the check constraint, verifies **AC-6**.
- Expired session apply: an apply on a session whose access token has expired spends no Adzuna call, which is the one a fresh session measurement misses entirely, verifies **AC-10**, **AC-20a**. **Drive it from a real browser and make the action `POST` the first request after expiry**: an ordinary request arriving first (a nav prefetch will do it) refreshes the session and heals the case before the click, which is how this bug hid.
- Unparseable posted date: a listing whose `postedAt` is not an ISO datetime is refused by `listingSnapshotSchema` as `validation_failed`, never reaching the insert to raise a `22007` reported as an outage, verifies **AC-2**.
- Attribution per row: a page of three applications carries three attribution blocks, and a page of none carries zero, verifies **AC-8**.
- Applied marker: a search repeating a job already applied to shows it marked with its control disabled, verifies **AC-9**.
- Failed marker read: the read fails and the page says so rather than rendering every card as not applied, verifies **AC-9**, invariant 9.
- No spend on apply: against a production build, an apply moves neither the weekly `job_search` counter nor produces a second `search.run` span, verifies **AC-10**.
- Remove: the confirmation URL is visited without removing anything, then the form removes the row and the list re-renders; a remove matching zero rows reports a failure, verifies **AC-11**.
- Empty listing fields: an Adzuna item with an empty `title` is dropped by the parse rather than rendered or inserted, verifies **AC-13**.
- Privacy drift guard: the migration without a `STORED_FIELDS` entry fails the unit suite with the guard's own message, verifies **AC-15**.

## Build plan

Ordered for Tracer Bullet: one real apply travelling the whole way from a card to a stored row to a rendered list, before any of the failure surface, the attribution or the marker is built out. Each step that writes an operation opens its span in that same step, because binding rule 4 is about the span being the first statement when the operation is written, not about a later registration pass.

1. Migration adding `salary_is_predicted` and the `application_predicted_pairing` check, then `pnpm db:types`, then the `STORED_FIELDS` entry that keeps the privacy notice honest. Satisfies **AC-6**, **AC-15**.
2. Tighten `Listing` in `src/features/search/adzuna.ts`: `.min(1)` after trimming on `id`, `title` and `company.display_name`, so an empty valued item is dropped by the per item parse feature 11 already built. Satisfies **AC-13**.
3. Relocate the shared render code per the table in `## Feature design`, with feature 11 still green afterwards. Done before either feature imports across a boundary, so the wrong import never gets written. Satisfies **AC-7**, **AC-8**, **AC-18** (partial).
4. The thin end to end thread: `listingSnapshotSchema`, `recordApplication` in `src/features/applications/actions.ts` opening `application.record` as its first statement, with its caller check on the read only cookie adapter, the re-parse and the insert; the inline per card closure that reaches it; the `ApplyControl` Client Component and the feature's own three state `ActionState`; and a minimal `/applications` list opening `application.read_list`. One real apply proves card to row to list. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-19**, **AC-20**.
5. Thicken the failures: the per feature failures table mapping `23505` and `23503`, the stale build refusal, and the messages all three render. Satisfies **AC-4**, **AC-5**, **AC-21**.
6. Thicken `/applications`: the full snapshot per row, newest applied first, both date formats, the salary line with its `(estimated)` label, both attributions in `Card.Footer`, and the empty state with its link to `/search`. Satisfies **AC-17**, **AC-18**.
7. The applied marker: `readAppliedJobIds` opening `search.read_applied`, scoped to the rendered ids, the marked state on the card fed by both the read and the action's returned state, the disabled control, and the visible failure when the read fails. Satisfies **AC-9**.
8. Removal: the confirmation route that mutates nothing, and `removeApplication` opening `application.remove`, reporting a zero row match as a failure and revalidating on success, reusing spec 0010 AC-8's shape. Satisfies **AC-11**.
9. Register all four spans in [spans.md](../../observability/spans.md). Registration only: each span was opened in the step that wrote its operation. Satisfies **AC-14**.
10. Prove no spend, on a fresh session and on an expired one, against a production build rather than `pnpm dev`. Satisfies **AC-10**.
11. Move `application tracking` from `planned` to `working` in `src/features/entry-page/about-section.tsx`. This is outside this feature's own code area and nothing else in the build prompts it, which is exactly how feature 7's equivalent clause went unmet for two days. Satisfies **AC-16**.
12. The cross spec corrections this feature owes, listed in `## Follow-up`. Satisfies **AC-12**.
13. Critical test scenarios above, with the recorded fixture pattern spec 0004 requires. Satisfies every AC.

## Consequences

**Positive**:

- The application record becomes the only place a job persists, which is what closes the Slice 1 loop: search, click out, record, see it later.
- The predicted salary decision that three specs deferred is settled, and settled in the direction that keeps AC-7's honesty rule true past the moment of applying.
- `/applications` stops making a promise the product does not keep. That sentence has been live on production since feature 32 with nothing behind it.
- Feature 23's dashboard inherits a table with real rows in it and a display path already written, rather than starting from an empty page.
- The attribution components and the salary formatter become shared rather than feature private, which is where the folder rule always wanted them and where feature 23 will need them.

**Negative and tradeoffs**:

- `/search` ships client JavaScript for the first time. Spec 0013's Decision says the page never uses a client side fetch and that no client JavaScript ships for search; the first half stays true and the second does not, once the apply control exists. The control is deliberately the smallest possible boundary, but the property is gone rather than reduced.
- The apply action breaks the pattern every profile action follows, in two ways: no `revalidatePath` and no `redirect`, and a cookie adapter that refuses to write. A later session tidying either toward the house pattern would silently reintroduce a real budget cost. The reasons live at the call sites, not only here.
- This feature is the first production caller to pass `createClient()` an adapter. That parameter was built as spec 0004's test seam and its own doc comment says the default is "every caller in `src/`", which stops being true here.
- **A deploy invalidates the apply control on any results page left open, and it costs the reader nothing.** The closure key is regenerated per build, so the framework refuses the dispatch. Driven from a real browser on 2026-09-05 against a genuinely stale production build: the server logs `Failed to find Server Action. This request might be from an older or newer deployment.`, the browser receives a `404`, `ApplyControl`'s catch renders `COPY-7` beside a control that stays enabled, no row is written, and **no `job_search` counter moves**. An earlier draft of this line recorded the opposite, that the refusal falls back to re-rendering `/search` and spends a call. That was true of the hand built `POST` it was measured on and is not true of the hydrated dispatch a real reader sends. **The method mattered more than the result here**: a first attempt rebuilt over a populated `.next`, which reuses the previous build's `server-reference-manifest.json`, so the key never rotated, the page was never stale, and the whole case read as unreproducible. `.next` must be wiped before each build to reach this state at all.
- **The stale build refusal cannot be handled where a failure normally is.** Next rejects the dispatch before `recordApplication` executes, so this feature's failure table, its span, and its whole error model never see it. The catch sits in `ApplyControl` around the call instead, which is the only place left, and it is a plain `try`/`catch` around everything rather than a match on the framework's wording, because that wording is not ours to depend on. One consequence worth naming: this is the only failure in the feature that never reaches Sentry through `failure()`, because no server code runs to report it.
- Removing an application in one tab leaves another tab's search still showing that job as applied, until the next search. Recovering costs one of 25 weekly calls, so the stale state is cheap to create and expensive to clear.
- One extra database read per search render, for the applied marker.
- `/applications` is unpaginated. Correct at a ceiling of 25 searches a week and wrong eventually, which feature 23 inherits.
- The attribution obligation now has to be honoured on two screens rather than one, so a third screen showing a stored listing will owe it too, and nothing enforces that automatically.

**Neutral**:

- One additive migration on a table holding no rows anywhere yet, so no backfill and no live data risk.
- A new feature folder, `src/features/applications/`, and the nested `AGENTS.md` that will want writing once it has invariants worth recording. That is `/sync`'s job after the build, not this spec's.
- No new environment variable, so no Vercel preview build failure to plan for.

## Follow-up

- [x] **Settle the one claim this spec inferred rather than verified.** AC-20's read only adapter is built on the reasoning that `getClaims()` can refresh an expired access token and persist new cookies through `setAll`. **Answered 2026-09-05 by `/debug`, and the answer is yes.** Driven against a real minted session whose `expires_at` was pushed two hours into the past: the default `next/headers` adapter refreshed and wrote `sb-127-auth-token`, while the read only adapter in the identical state wrote nothing and the apply still succeeded. So every link in AC-20's chain is now verified rather than inherited. **The same run also showed the chain was not the one that fired** (see AC-20a): the write that cost the call came from `src/proxy.ts`, one layer up, where the action could not defend against it.
- [ ] **Correct `createClient()`'s doc comment** at `src/lib/supabase/server.ts:17-30`. It says the `next/headers` store is the default "which is every caller in `src/`", and AC-20 makes this feature the exception. It also frames the parameter as existing for tests, which stops being the whole truth.
- [x] **Correct spec 0003's `job_description` description in both places, not one.** [index.md:118](../0003-data-model/index.md) calls it "the listing's full description text. The only copy that survives the posting being taken down", and [index.md:262](../0003-data-model/index.md) says it "stores a full listing body per application". Both are wrong: Adzuna's search response carries only a snippet. Spec 0013's own Follow-up item names only line 118, so that item is itself incomplete and should be updated when it is closed. A plain grep for "full text" or "full description" finds only the first; line 262 says "full listing body" and is missed. · **Done 2026-09-05.** Both corrected, and spec 0013's own Follow-up item (which named only line 118) was updated to record that it had missed the second.
- [x] **Amend spec 0013's Decision at [index.md:42](../0013-job-search-and-results-list/index.md) with a visible note** that "never a Server Action or a client side fetch" and "no client JavaScript ships for search itself" no longer hold in full once this feature ships. Follow the shape of that spec's own AC-10 correction: a note in the spec that a later reader cannot miss, rather than a quiet narrowing recorded only in this spec's Consequences. · **Done 2026-09-05.** Spec 0013's Decision now carries a block quote splitting the claim in two: the Server Component and plain `GET` half stays true, the no client JavaScript half does not, with the reason (a form with no JavaScript needs a rendered response, which is the re-render that spends a call).
- [x] **Update spec 0013's `Listing` table (rows 71 to 73 today; they were 63 to 65 before this pass's own block quote shifted them)** so `sourceJobId`, `title` and `companyName` record the non empty guarantee AC-13 adds. The table currently documents all three as plain strings, which is what let the gap sit undetected between a shipped schema and a shipped table. Its `postedAt` row also claims ISO datetime while the code accepts any string, which AC-2 now enforces at this feature's boundary and which that table should say. · **Done 2026-09-05.** All three rows record the non empty guarantee, and the `postedAt` row now says it accepts any string rather than claiming a validated ISO datetime, which it never enforced.
- [x] **Close spec 0003's Follow-up items at lines 274 and 275.** Line 274 asks for a `Done when` criterion covering the missing profile case, which AC-5 now supplies. Line 275 asks for the predicted salary decision, which AC-6 now settles. Both were written at design time and neither had been acted on. · **Done 2026-09-05.** Both ticked, each naming the acceptance criterion that closed it and what the deliberation added beyond the original lean.
- [ ] **Does a refused stale dispatch spend a call on the HYDRATED path too?** The re-render and the spend were observed for real, but only from a hand built `POST`, which is the no JavaScript request shape and the only one that can be driven headlessly. The real control sends a different request. If the hydrated dispatch merely rejects the promise, `COPY-7` renders and nothing is spent; if it behaves like the observed case, every deploy silently bills mid session readers. AC-21 and Consequences both state the limit rather than guessing. **Answer this before anyone builds a rate alert on `search.run`**, since a deploy would otherwise look like an Adzuna incident.
- [ ] **AC-10 is not proven end to end, and the gap is specific.** The build stood up a production build, confirmed a search moves the `job_search` counters, and confirmed the wiring with two unit guards whose regressions were both driven on purpose (removing the read only adapter, and adding a re-render trigger to `recordApplication`). What it could NOT do is dispatch a real apply: Next refuses a hand built action `POST` with `Failed to find Server Action`, so `curl` and `fetch` cannot drive it. **A successful apply's cost has therefore never been measured, only argued from the wiring.** It needs a real browser, and it is the single most load bearing unverified claim in this spec. `verify.md` carries the corrected method.
- [ ] **The expired session case is untouched**, which is the one AC-20 exists for. A fresh session cannot reveal it, and the first attempt to prove AC-20 passed against BOTH the read only adapter and the writing default, precisely because of that. Recorded in `verify.md` under `## What the build measured`.
- [ ] **AC-21's client side catch is not browser verified.** The stale build refusal was observed for real at the server, and the catch was written where it has to be, but nothing has yet driven a deploy underneath an open page and watched `COPY-7` render.
- [ ] **`src/components/` is a third shared location that root `AGENTS.md` does not name.** It names `src/lib` and `src/components/ui`. `/sync` should add it after the merge, with the reason: `src/components/ui` is spec 0005's design system, so a shared component that is not a design system primitive needs somewhere else to live.
- [ ] **A new feature area has no nested `AGENTS.md` yet.** `src/features/applications/` now holds the one action in the codebase that must never call `revalidatePath` or `redirect`, and the reason is a budget cost invisible in review. That is exactly the kind of invariant a nested context file exists to carry. `/sync` after the merge.
- [ ] Feature 23's applications dashboard inherits the unpaginated list and the absent status column. Both are deliberate here and neither should be inherited silently.
- [ ] A third screen that ever displays a stored listing owes the same per advert attribution. Nothing enforces this automatically today, and the two screens that owe it are currently kept correct by review alone.
- [ ] **What revision 2 changed, and why it is recorded rather than smoothed over.** A cross check on a different model found two majors this spec had not seen. The first is that the design's whole purpose, not spending a call on apply, could be defeated by a session refresh writing a cookie inside the action, which is invisible in review and passes a single measurement on a fresh session. The second is that the file layout in the original build plan was mechanically incompatible with the closure encryption the security model rested on, so the build would have landed on `.bind()` and the integrity claim would have been false while reading as true. Both are the same shape: a correct sounding spec whose failure only appears under a condition nobody thought to test.

## Rationale

Full reasoning, the options weighed, and what was verified against what: see [rationale.md](rationale.md).
