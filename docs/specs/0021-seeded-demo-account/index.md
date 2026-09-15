# 0021. Seeded demo account

**Date**: 2026-09-13
**Status**: In Progress

## Summary

Feature 31, `/demo`, is reworked from a fully fabricated page into one that shows real Adzuna
listings, scored for real, under two fictional candidate profiles. Only the two candidates are
made up now, and they are shown on the page as the whole disclosure. A manually triggered refresh
runs one real Adzuna search, scores every kept listing against both personas exactly the way
`/search` scores a real user's results (including the same grounding check), and replaces the
page's data in one all or nothing write. This reverses several of this spec's own earlier
decisions; each reversed line below is kept and struck through rather than deleted, with a note
saying when and why it stopped applying, so a later reader can see the history rather than only
the current rule. A cross model check ran against the first draft of this rework on 2026-09-14 and
found several real gaps; this text already reflects the fixes and the two judgment calls the
engineer made in response (**Rationale**, and `rationale.md`'s "Rework" section).

## Requirements

**User stories**:
- As a visitor who has not signed up, I want to see real listings scored for real against a
  stated candidate, so that I can judge whether the ranking actually works, not just whether it
  looks plausible.
- As the engineer, I want the page to cost nothing on render and never be corruptible by a
  visitor, while still reflecting real data that nobody hand picked.

**Acceptance criteria**:
- **AC-1**: A visitor reaches `/demo` and sees a list of results with no sign in, no redirect,
  and no account required.
- **AC-2**: ~~The page makes no external paid call on any render: no Adzuna search, no AI scoring
  call. Every value shown was prepared in advance.~~ · **SUPERSEDED 2026-09-14.** The page still
  makes no external paid call on any render. Every paid call (one Adzuna search, then one
  `ai_scoring` call, and, for any listing whose score claims at least one skill, one chained
  `ai_check` call, per listing per persona, exactly the sequence `scoreListings()` already runs for
  a real search) now happens only inside the refresh described in AC-17, gated exactly like every
  other real call in this app, never inside a page render.
- **AC-3**: ~~Every seeded value (company name, title, description, location) reads as obviously
  fictional, not as a real employer or a real posting.~~ · **SUPERSEDED 2026-09-14.** The opposite
  is now true on purpose: every listing (company name, title, description, location) is real,
  exactly as Adzuna returned it, including a real employer's name on a `weak_match` or
  `not_a_match` row (AC-19). The two candidate personas are the only fictional element left, and
  they are shown on the page in full (AC-14) as the disclosure that makes this honest.
- **AC-4**: ~~No control on the page writes to the database. There is no code path by which one
  visitor's visit changes what the next visitor sees.~~ · **SUPERSEDED 2026-09-14.** No
  visitor facing control writes to the database, and a visitor's own visit still cannot change
  what the next visitor sees. What is no longer true is the absolute second sentence: the refresh
  (AC-17) is a code path that deliberately changes what every visitor sees, on a schedule the
  visitor never controls. It runs behind a secret only the engineer holds (AC-18), never behind
  anything a visitor's browser can reach.
- **AC-5**: The page offers exactly two example candidate profiles, `backend-engineer`
  ("Backend engineer", the default) and `frontend-engineer` ("Frontend engineer"), switchable
  through a `?persona=` link. Any value that is not exactly one of those two slugs (absent,
  unrecognized, empty, or a repeated query param) shows the default profile rather than erroring.
  *(Slug changed 2026-09-14: `product-designer` is replaced by `frontend-engineer`, since the
  personas are now scored for real and a contrasting-stack pair of engineers gives a cleaner
  signal than an engineer against a designer; see `rationale.md`.)*
- **AC-6**: ~~Exactly two seeded listings (the same title and company each time) appear under both
  profiles, each with a different band, different matched and not mentioned skills, and
  different written reasoning per profile. Their exact content is named in **Seed content**
  below.~~ · **SUPERSEDED 2026-09-14.** Every kept listing (AC-17) appears under both profiles now,
  not just two of them, because both personas are scored against the same one search's results.
  Each listing's band, matched skills, not mentioned skills, ungrounded skills, and reasoning are
  computed independently per persona by the real scorer and the real grounding check, and are
  expected to differ, but nothing in the build may select or discard a listing based on whether
  they actually do, and a refresh that returns fewer than the target count (**Feature design**,
  "The kept listing count") is still published as is, never padded or retried to reach it.
- **AC-7**: Within one profile, listings are ordered best band first, ties broken by Adzuna's own
  returned rank for that search (stored as `sort_order`), the same band ordering rule `/search`
  already uses. *(Tiebreak source changed 2026-09-14: a hand seeded display order is replaced by
  Adzuna's own order, since there is no longer a hand authored order to seed.)*
- **AC-8**: Each card shows title, company, location when present, a stated or predicted salary
  on some listings, a description snippet, the band, matched skills, not mentioned skills, the
  written reasoning, and (AC-16) a compact line naming the other persona's band for the same
  listing. A matched skill the grounding check flagged as ungrounded is removed from the displayed
  matched list and the same two sentences the real card shows appear here too (**Feature design**,
  "Ungrounded skills"). It carries no real "view posting" link and no working apply control, only a
  plain text line where the real apply control would sit, never a disabled button.
- **AC-9**: ~~The page shows no Adzuna attribution and no salary prediction attribution, since
  nothing on it came from either vendor.~~ · **SUPERSEDED 2026-09-14.** The opposite is now
  required: every card carries the "Jobs by Adzuna" attribution (reusing `AdzunaAttribution` from
  spec 0013 unchanged), and a card whose salary was predicted rather than stated additionally
  carries both the `(estimated)` label and the Jobsworth attribution (`JobsworthAttribution`),
  reusing the same pairing `src/features/search/result-card.tsx` already renders, because the two
  must never come apart (`salaryText()`'s own doc comment). The listing genuinely came from Adzuna
  now, so both attributions are load bearing, not decorative.
- **AC-10**: ~~A visible line on the page states plainly that this is sample data, not live
  postings.~~ · **SUPERSEDED 2026-09-14.** That claim is now false and reversed: a visible line
  states plainly that the listings are real, live Adzuna results, refreshed periodically, and that
  the two candidate profiles judged against them are fictional (AC-14 names what else that line
  shows). Every other place on the page or in its code that asserted the old claim (page metadata,
  heading, intro copy, the demo card's own doc comment, the not mentioned skills caption's
  justification) is corrected in the same pass (**Build plan**, "the wording pass").
- **AC-11**: The page is not indexed by search engines.
- **AC-12**: If the seeded data cannot be read because of a genuine fault (the database is
  unreachable, or a row fails to parse), the page answers a normal 200 and shows a visible failure
  state rather than an empty, broken looking, or server error page. This is a different case from
  AC-15, and the two must render distinguishable copy.
- **AC-13**: The entry page's hero carries a real, working link to `/demo`, and the "what's real
  today" status card moves "a no sign in demo account" from planned to working. **Deliberately not
  built by this spec.** Recorded in `docs/scope/scope.md` on 2026-09-14: wiring this while the page
  still showed fabricated data would have advertised a demo already decided to be insufficient,
  and that reasoning holds unchanged for the real data version until it ships.
- **AC-14** (new 2026-09-14): The page shows the search query the current results answer (the
  title and, when set, the location the refresh searched) and when the data was last refreshed,
  both read from the single `demo_refresh` row (**Feature design**). It also shows both persona
  profiles' full content (summary, skills, experience, preferences) somewhere on the page, which is
  the disclosure AC-3 now depends on.
- **AC-15** (new 2026-09-14): If no refresh has ever run since the current schema was deployed
  (`demo_refresh.refreshed_at is null`), the page shows a visible "results are not available yet"
  state, worded distinctly from AC-12's failure state (the first is expected and temporary, the
  second is a fault), never a blank or partially rendered page. This is a normal, successful read
  of an empty state, not a `Failure`.
- **AC-16** (new 2026-09-14): Each card additionally names the other persona's band for the same
  listing, in a compact line separate from the active persona's full result, so a reader sees both
  scores without switching `?persona=`. The paired row is always present by construction (AC-17's
  transaction writes both personas' rows for every kept listing together), so this line has no
  "missing" case to design for; it is not defensively hidden.
- **AC-17** (new 2026-09-14): A refresh, triggered as described in AC-18, runs exactly one real
  Adzuna search using the fixed query in **Feature design**, de-duplicates the results by Adzuna's
  own listing id (first occurrence wins) and keeps up to a fixed count of what remains in Adzuna's
  own returned order (never selected, reordered, or padded by how any score turns out), and scores
  every kept listing against both personas exactly as `scoreListings()` already does for a real
  search (AC-2), including the chained grounding check. The refresh aborts, writing nothing, if
  any one of those `ai_scoring` calls does not come back as an allowed score, or if the chained
  `ai_check` call for a listing that claimed a skill does not come back as a clean verdict, whether
  refused by the usage gate or genuinely failed either way. Unlike `/search`, where the check is
  best effort because a real search must still render something, the refresh has no reader waiting
  on it and a previous, fully checked run to fall back to, so an unfinished check is treated the
  same as an unfinished score rather than silently written as if it had passed. Only once every
  kept listing has a clean, allowed score under both personas does the refresh atomically replace
  the entire contents of `demo_result` and the single `demo_refresh` row in one database
  transaction. A gate refusal (of either call type) is reported at a different Sentry severity than
  a genuine failure, since it is the budget working as designed.
- **AC-18** (new 2026-09-14): The refresh is reachable only via a `POST` to a dedicated route
  handler, authorized by hashing the caller supplied secret (from an `Authorization: Bearer`
  header) and the configured `env.DEMO_REFRESH_SECRET` with SHA-256 and comparing the two digests;
  no other path triggers it. To spend real `job_search` and `ai_scoring`/`ai_check` budget through
  the existing gate (which requires a verified session, **Feature design**), the refresh
  authenticates as a dedicated, permanent internal identity that holds no `profile` or
  `application` row and is never reachable by a real visitor. That identity's own weekly account
  scope budget is therefore always separate from any real signed in user's.
- **AC-19** (new 2026-09-14): A real employer's name and a real listing's content render exactly
  as returned, whatever band either persona receives, including `weak_match` and `not_a_match`.
  Nothing on the page is hidden, blurred, or altered based on a score.

## Decision

Keep spec 0021's original mechanism decision (a dedicated table, read through the secret key
client already reserved for this feature) and extend it with a manually triggered, atomic refresh
that populates that table from real data, rather than switching to a different storage or read
strategy. The refresh authenticates as a dedicated internal identity and is triggered by a
protected route handler; both are new decisions this rework required, weighed in `rationale.md`
against the alternatives (triggering under the engineer's own session, bypassing the usage gate,
and a local script) and against the original options this decision still rests on.

## Rationale

Reasoning and options: see `rationale.md`.

## Feature design

**Data model sketch**:

`demo_result` (evolved from the original table; the original migration never applied to a hosted
project, so it is edited in place rather than superseded by a second migration; if it ever applied
to any local or preview database, `pnpm db:reset` is required there, and a genuinely hosted
application of the old migration would need a second migration instead, which is not this
project's situation today):

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `persona_slug` | `text not null` | checked against exactly `backend-engineer` or `frontend-engineer` (changed 2026-09-14 from `backend-engineer` / `product-designer`) |
| `source_job_id` | `text not null` | Adzuna's own listing id (`Listing.sourceJobId`); pairs the same real listing across both personas' rows. New column |
| `sort_order` | `smallint not null` | Adzuna's own returned rank for that search, after de-duplication, 1 based; the tiebreak within one band (AC-7); identical for both personas' copies of the same listing |
| `title` | `text not null` | |
| `company_name` | `text not null` | the real employer name, never fictional (AC-3, AC-19) |
| `location` | `text`, nullable | |
| `salary_min` / `salary_max` | `numeric(12, 2)`, nullable | as returned by Adzuna, stored raw with no rounding, matching `application.salary_min`/`salary_max`'s own type (`supabase/migrations/20260825162457_data_model.sql`), not the `integer` the original design used |
| `salary_currency` | `text`, nullable | New column. Stored raw from the parsed `Listing.salaryCurrency` (`src/features/search/adzuna.ts`, derived from `CURRENCY_BY_COUNTRY[ADZUNA_COUNTRY]` at fetch time), never hardcoded at render: `salaryText()` (`src/lib/listing-format.ts`) returns `undefined` with no currency. `check ((salary_min is null and salary_max is null) = (salary_currency is null))`, the same pairing `application` already enforces |
| `salary_is_predicted` | `boolean not null default false` | New column, from `Listing.salaryIsPredicted`. Drives whether the `(estimated)` label and `JobsworthAttribution` render (AC-9) |
| `description_snippet` | `text`, nullable | Adzuna's own excerpt, truncated or not exactly as returned; whether it is truncated is derived at render the same way `buildListingBlock()` already derives it (`descriptionSnippet.trimEnd().endsWith("…")`), not assumed |
| `band` | `text not null`, checked against the same five values `src/features/scoring/rubric.ts`'s `BANDS` uses | |
| `matched_skills` | `text[] not null default '{}'` | after the grounding check removes any name it flagged |
| `not_mentioned_skills` | `text[] not null default '{}'` | |
| `ungrounded_skills` | `text[] not null default '{}'` | New column, from spec 0019's `checkFitScore()`'s `ungroundedSkills`. Rendered on the demo card the same way `score-card.tsx` renders it on the real one: removed from the matched list and surfaced through `SCORING_COPY.removedSkills(...)` and `SCORING_COPY.reasoningCaveat` verbatim, both reused rather than restated. A row is only ever written once its check has actually come back clean; a check that fails or is refused aborts the whole refresh (AC-17) rather than being written as if it had passed, so this column never has to represent an unfinished check |
| `reasoning` | `text not null`, capped at 600 characters | same ceiling the real reasoning field uses |
| `created_at` | `timestamptz not null default now()` | |

Unique on `(persona_slug, source_job_id)`. Row level security enabled and forced with zero
policies. Grants: `select` (unchanged), plus `insert` and `delete` (new, for the refresh's
wholesale replace) to `service_role` only; still nothing to `anon`/`authenticated`.

`demo_refresh` (new table, one row, the same singleton pattern `app_settings` already uses,
`supabase/migrations/20260821120000_app_settings.sql`):

| Column | Type | Notes |
|---|---|---|
| `id` | `smallint primary key default 1 check (id = 1)` | enforces exactly one row |
| `search_title` | `text not null` | the fixed query's title term (**Seed content**) |
| `search_location` | `text`, nullable | the fixed query's location term, absent when the search is nationwide |
| `refreshed_at` | `timestamptz`, nullable | `null` until the first refresh ever runs (AC-15); set atomically with the `demo_result` rewrite (AC-17) |

Same row level security shape: enabled and forced, zero policies, `select` and (new) `update`
granted to `service_role` only. The migration inserts the singleton row with `refreshed_at` left
`null`, mirroring `app_settings`'s own insert-before-force ordering.

No foreign key between the two tables: `demo_refresh` is metadata about the last run, not a parent
of the result rows, and the two are only ever written together by the same atomic function below.

**The atomic write, a dedicated Postgres function**: `public.replace_demo_results(p_results jsonb,
p_search_title text, p_search_location text)`, `security invoker`, `set search_path = ''`. It runs
as its caller, and the only caller is the secret key client authenticating as `service_role`,
which already carries `BYPASSRLS` (the same reasoning `20260821120000_app_settings.sql`'s own
comment gives). This is a deliberate change from an earlier draft that specified `security
definer`: this table's row level security is enabled and forced with zero policies, and whether a
`security definer` function's owning role carries `BYPASSRLS` in a hosted project is exactly the
question that migration's own comment says this repository cannot confirm; `security invoker`
sidesteps the question entirely, since `service_role`'s own privilege is what does the work, and
needs only the ordinary table grants above.

`p_results` is a JSON array, one element per `demo_result` row to insert, with exactly these keys,
matching the table's own columns: `persona_slug`, `source_job_id`, `sort_order`, `title`,
`company_name`, `location`, `salary_min`, `salary_max`, `salary_currency`, `salary_is_predicted`,
`description_snippet`, `band`, `matched_skills`, `not_mentioned_skills`, `ungrounded_skills`,
`reasoning`. In one transaction the function deletes every row in `demo_result`, inserts the rows
via `insert into public.demo_result (...) select ... from jsonb_to_recordset(p_results) as
t(persona_slug text, source_job_id text, sort_order smallint, title text, company_name text,
location text, salary_min numeric(12,2), salary_max numeric(12,2), salary_currency text,
salary_is_predicted boolean, description_snippet text, band text, matched_skills text[],
not_mentioned_skills text[], ungrounded_skills text[], reasoning text)`, and updates the singleton
`demo_refresh` row's `search_title`, `search_location`, and `refreshed_at = now()` via `insert ...
on conflict (id) do update` (never a bare `update`, so a missing singleton row cannot leave
`refreshed_at` stuck `null` beside sixteen freshly written result rows). Called once, after every
score for the whole refresh has already come back allowed in application code (AC-17), so a mid
refresh failure never reaches this function at all and the existing data is left untouched.

**Seed content**: no longer seeded in a migration. The two persona profiles are typed constants in
`src/features/demo/personas.ts` (extended, not a new table, per the same reasoning that file's own
doc comment already gives: "only ever two, fixed by the spec ... a second table to hold two rows
would add a read that can fail"), shaped as `ScoringProfile` (`src/features/scoring/rubric.ts`):

*`backend-engineer`*: summary "Backend engineer focused on distributed systems and
infrastructure, most recently building and operating Kubernetes based platforms at scale."
Skills: Go, PostgreSQL, Kubernetes, Terraform, gRPC, Docker, AWS, CI/CD. Experience: Senior
Backend Engineer at "Fictional Systems Co" (`startedOn: "2022-01-01"`, `endedOn: undefined`,
"Built and operated a Kubernetes microservices platform in Go, backed by PostgreSQL, with
Terraform managed infrastructure on AWS."); Backend Engineer at "Faux Data Inc" (`startedOn:
"2019-03-01"`, `endedOn: "2021-12-31"`, "Designed gRPC APIs and CI/CD pipelines for a data
ingestion platform."). Preferences: `desired_titles: ["Backend Engineer", "Platform Engineer"]`,
`desired_locations: ["Remote", "Chicago, IL"]`, `remote_preference: "remote"`, `minimum_pay:
150000`, `minimum_pay_currency: "USD"`.

*`frontend-engineer`*: summary "Frontend engineer specializing in React applications and design
systems, focused on accessibility and performance." Skills: TypeScript, React, CSS, Next.js,
Accessibility, Design systems, Playwright, Web Vitals. Experience: Senior Frontend Engineer at
"Fictional Fintech Co" (`startedOn: "2021-06-01"`, `endedOn: undefined`, "Led the React component
library and design system, with a focus on WCAG 2.2 AA accessibility."); Frontend Engineer at
"Faux Systems Inc" (`startedOn: "2018-08-01"`, `endedOn: "2021-05-31"`, "Built customer facing
React applications with Playwright end to end coverage, and tracked Web Vitals to guide
performance work."). Preferences: `desired_titles: ["Frontend Engineer", "UI Engineer"]`,
`desired_locations: ["Remote", "Austin, TX"]`, `remote_preference: "remote"`, `minimum_pay:
140000`, `minimum_pay_currency: "USD"`.

Both employers named in each persona's own work history are deliberately fictional (the candidate
is the disclosed fabrication, not the listings), following the same "obviously fictional" naming
style AC-3 originally required of listings.

**The dedicated refresh identity**: a permanent `auth.users` row at a fixed, reserved domain
address, `demo-refresh@example.test` (RFC 2606, the same convention `test/helpers/fixture-user.ts`
already uses for addresses that must never resolve to a real mailbox and can never collide with a
real OAuth account, since no real provider can verify an address on a reserved, non resolvable
domain). This is a plain module constant, not an environment variable: knowing the address grants
nothing without `SUPABASE_SECRET_KEY`, which only this feature's refresh code and its read path
already hold. The refresh ensures the identity exists before minting a session for it each run:
`admin.getUserByEmail` (or an equivalent lookup), and if absent, `admin.createUser({ email,
email_confirm: true })`, matching `mintFixtureUser()`'s own reasoning that an unconfirmed user
cannot complete the magiclink exchange. This identity holds no `profile` or `application` row and
is never used to sign in anywhere a real visitor can reach.

**The fixed search query**: title `"software engineer"`, no location (nationwide within the
already configured `ADZUNA_COUNTRY`). Broad enough to return a mix of backend, frontend, and full
stack postings so the two personas plausibly land on different bands, without being selected or
adjusted after the fact based on what came back.

**The kept listing count**: the first 8 listings Adzuna returns for that search, in Adzuna's own
order, after de-duplicating by `sourceJobId` (Adzuna can return the same advert twice; first
occurrence wins, still in Adzuna's own order). If de-duplication or Adzuna's own response leaves
fewer than 8, the refresh proceeds with however many remain rather than aborting, retrying, or
padding: **whatever a refresh returns gets published, unedited and unre-rolled, until the next
scheduled refresh**, and that includes the count. Both kept personas are scored against the exact
same kept set (up to 16 `demo_result` rows written per refresh). This rule is stated here because
it is the entire reason this version answers the cherry picking objection the fabricated version
could not.

**State transitions**: `demo_result` and `demo_refresh` are replaced wholesale by each refresh
(AC-17); no row is ever individually updated.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/demo` | GET (Server Component render) | `persona` (query param, optional) | the ordered list of results for that profile, each carrying the other persona's band, plus the search query and last refreshed time | none, public | a genuine read failure answers 200 with AC-12's visible state; an empty, never refreshed table answers 200 with AC-15's distinct visible state; any value other than the two known slugs falls back to `backend-engineer` |
| `/api/demo/refresh` | POST | `Authorization: Bearer <secret>`, compared (as a SHA-256 digest) against `env.DEMO_REFRESH_SECRET` | `200` on a completed refresh, a non 200 with a visible reason on a wrong secret or any aborted step | a shared secret only, no session (AC-18) | wrong or missing secret refuses before anything runs; any listing's score coming back refused or failed aborts with nothing written (AC-17) |

**On the route handler writing** (a scope clarification, not an exception, recorded 2026-09-14):
root `AGENTS.md` restricts route handlers under `src/app/api/` from reading or writing *user
data*, and separately states "Server Components read, Server Actions write", elaborated in the
same rule as being about the request path where "no Supabase call and no session check runs in the
browser." `demo_result` and `demo_refresh` are already classified as holding no personal data
(`chore(legal)` commit `54d2d06`), and this refresh runs with no session at all, triggered by an
external, non interactive caller a Server Action structurally cannot serve (a Server Action
requires Next's own internal dispatch, not a plain HTTP call a future cron could make). Neither
rule was written with this case in mind, and neither has to be read as covering it: this is the
first route handler under `src/app/api/`, and the first one that writes anything, so the reasoning
above is recorded in the route file itself as well as here, to set the precedent correctly for
whichever feature is the second.

**Refresh authentication, mechanically** (AC-18): `createSecretClient()` is already this feature's
permitted secret key caller (spec 0001 binding rule 1, caller 3, "the seeded demo account (feature
31)"). This is that same caller used a second way, not a fourth caller: the read path uses it to
query `demo_result`/`demo_refresh`, and the refresh uses it to reach `.auth.admin` and to call
`replace_demo_results()`. The refresh mints a session for the dedicated identity above using
`admin.generateLink({ type: "magiclink", email })` followed by `verifyOtp({ token_hash, type:
"email" })`, in the same order `test/helpers/session.ts` already establishes and for the same
stated reasons: an in memory cookie jar is created **first**, a request scoped client is built
from it (`createClient(jar)`), `verifyOtp` is called on **that client** so `@supabase/ssr` itself
writes the real, correctly chunked and named session cookies into the jar, and the jar is asserted
non empty before use (`jar.names().length > 0`), the same guard `mintSession()` makes and for the
same reason: a client also keeps a session in memory, so a jar that silently received nothing would
still read correctly through that one client. **`test/helpers/session.ts` itself is not imported**:
root `AGENTS.md` places test helpers outside `src/` specifically so no application module can
import one, so this mint is a small, separate implementation under `src/features/demo/`, imitating
the technique rather than reusing the code. The jar is then passed as the `cookieAdapter` argument
`checkUsageGate()`, `searchListings()`, and `scoreListings()` already expose (documented as "absent
in every real caller"), so `auth.uid()` inside `check_usage_gate` resolves to this identity's own
id exactly the way it resolves to any real signed in user's, because the request scoped client
built from that jar carries this identity's own verified JWT. This widens the security surface
spec 0001 describes caller 1 (the unrelated, development only test session mint) as "hard blocked
outside development": the refresh mints a session in production, on purpose, guarded instead by
the route's shared secret and by the identity itself holding nothing a compromise could reach
beyond its own gated call budget. `rationale.md`'s "Rework" section records why this was chosen
over triggering the refresh from a local script that would have avoided the production
session-minting path entirely.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render `/demo` | which profile's rows to show | the `persona` search param, parsed as a single string against exactly `backend-engineer` or `frontend-engineer`; anything else defaults to `backend-engineer` |
| Render `/demo` | the two profile switcher links, and both personas' full summary/skills/experience/preferences (AC-14) | `DEMO_PERSONAS` in `personas.ts`, a constant, not a database read |
| Render each card | title, company, location, salary, currency, predicted flag, description, whether the snippet is truncated | the matching `demo_result` row for the active persona; truncation is derived at render (`descriptionSnippet.trimEnd().endsWith("…")`), never assumed, so the not mentioned skills caption only claims a partial description when the stored snippet actually is one |
| Render each card | band, matched skills (minus any ungrounded ones), not mentioned skills, ungrounded skills copy, reasoning | the matching `demo_result` row for the active persona |
| Render each card | the other persona's band (AC-16) | the sibling `demo_result` row sharing the same `source_job_id` but the other `persona_slug`, looked up from the one query that reads all rows for both personas, ordered by `sort_order` and grouped by `persona_slug` in application code (below) |
| Render each card | the "Jobs by Adzuna" attribution, and, when predicted, the `(estimated)` label plus the Jobsworth attribution | `AdzunaAttribution()` unconditionally; the `(estimated)` label and `JobsworthAttribution()` together, exactly the pairing `result-card.tsx` already renders, when `salary_is_predicted` is true |
| Render `/demo` | the search query line and the last refreshed time (AC-14) | the single `demo_refresh` row, read once per render in a second, separate query (no foreign key joins the two tables) |
| Render `/demo` | the "not yet refreshed" state (AC-15) vs. the genuine failure state (AC-12) | `demo_refresh.refreshed_at is null` (a successful read of an expected empty state) vs. an actual database or parse `Failure` (an unexpected state); the two are structurally distinct return shapes, never told apart by inspecting an error message |
| The refresh | which listings to keep | the first 8 of Adzuna's own returned order for the fixed query, after de-duplicating by `sourceJobId`; fewer than 8 is published as is (**Feature design**, "The kept listing count") |
| The refresh | each persona's score inputs | the matching constant in `personas.ts`, already `ScoringProfile` shaped, passed to `scoreListings()` unchanged |
| The refresh | the session it authenticates with | the dedicated demo refresh identity at `demo-refresh@example.test`, minted per run (**Feature design**) |
| The refresh route | whether to proceed at all | a SHA-256 digest comparison of the caller's `Authorization: Bearer` secret against a digest of `env.DEMO_REFRESH_SECRET` |

**Key invariants**:
- No visitor facing control ever writes to the database (AC-4); the only writer is the refresh,
  reachable only by the route's shared secret.
- The refresh either lands every kept listing's score and grounding check under both personas as
  a clean, allowed outcome, or changes nothing (AC-17); an unfinished check is never written as if
  it had passed.
- Every row read from `demo_result` or `demo_refresh` is parsed before it reaches a card, the same
  "parse at every boundary" rule the rest of the project follows.
- A real employer's name and a real listing's content are never hidden or altered by a score
  (AC-19).
- Whatever one refresh returns is what gets published; nothing about the kept listing count,
  de-duplication, or selection depends on how any score turned out (**Feature design**, "The kept
  listing count").
- A read failure (AC-12) and an empty, never refreshed table (AC-15) are different facts and
  render differently; neither is inferred from the other.

**Security model**: no authentication and no session for any *visitor* to `/demo`.
~~Because no write path exists at all, there is nothing to authorize: a visitor cannot corrupt the
data for the next visitor by construction, not because a check happens to catch them.~~ ·
**SUPERSEDED 2026-09-14.** A write path now exists, on purpose: the refresh. A visitor still
cannot corrupt the data for the next visitor, but that guarantee no longer comes from there being
no writer at all; it comes from the refresh being reachable only by a secret no visitor holds
(AC-18), and from the refresh authenticating as a dedicated identity that holds no `profile` or
`application` row and can therefore do nothing beyond spending its own gated `job_search`/
`ai_scoring`/`ai_check` budget and calling `replace_demo_results()`. `demo_result` and
`demo_refresh` keep row level security enabled and forced with zero policies exactly as before;
the secret key client remains the only reader and the only writer, through the one `security
invoker` function above, which relies on `service_role`'s own `BYPASSRLS` rather than on an
elevated function owner. **This is a deliberately accepted, named risk, not an unremarked one**:
the alternative (a local script run by the engineer) would have kept spec 0001's already
development-only test mint exactly as blocked as it is today, but at the cost of putting
`SUPABASE_SECRET_KEY`, the BYPASSRLS credential over every user's table, onto a personal machine
for a routine weekly task. A compromised refresh endpoint's worst case is spending this feature's
own capped, dedicated budget; a compromised laptop holding the secret key's worst case is every
user's data. The route was kept for that reason (`rationale.md`, "Rework").

**Configuration required**:
- `DEMO_REFRESH_SECRET`: server only, the shared secret `/api/demo/refresh` compares its caller
  against (as a SHA-256 digest, never a raw length sensitive comparison, which would either leak
  timing information or throw on a mismatched length). New in `src/env.ts`; must be set in every
  Vercel environment this branch deploys to before the pull request opens (the 2026-09-04 reflex),
  and added to both the unit test job's and the integration job's `env:` blocks in
  `.github/workflows/ci.yml` with a placeholder value, matching how `ADZUNA_APP_ID`/
  `ADZUNA_APP_KEY` are already handled there.
- Reuses `SUPABASE_SECRET_KEY` (feature 3), unchanged.

**Critical test scenarios**:
- Happy path: a visitor opens `/demo` with no session, sees the first profile's real results
  ordered by band, each card naming the other persona's band, the search query and refresh time
  visible, and both attributions where they apply. Verifies **AC-1**, **AC-7**, **AC-8**, **AC-9**,
  **AC-14**, **AC-16**.
- The refresh, happy path: `POST /api/demo/refresh` with the correct secret runs one search, scores
  up to 16 listings across both personas, and replaces both tables atomically. Verifies **AC-2**,
  **AC-6**, **AC-17**, **AC-18**.
- The refresh, a scoring refusal: one of the sixteen `ai_scoring` calls comes back gate refused
  (the shared global cap); nothing is written and the previous data still renders unchanged, and
  the refusal is reported at a lower severity than a failure. Verifies **AC-17**.
- The refresh, a check failure: an `ai_check` call for one listing fails outright after every
  score already succeeded; the refresh aborts and writes nothing, and the previous run's data
  still renders unchanged. Verifies **AC-17**.
- Not yet refreshed: a fresh database with the migration applied but no refresh ever run shows
  AC-15's distinct visible state, not AC-12's failure wording and not a blank page. Verifies
  **AC-15**.
- Auth: `POST /api/demo/refresh` with a wrong or missing secret is refused before any Adzuna or
  scoring call happens. Verifies **AC-18**.
- Cross profile: switching `?persona=` shows the same real listing scored differently, and each
  card's compact line names the band the switch would reveal before the reader switches. Verifies
  **AC-5**, **AC-6**, **AC-16**.
- Ungrounded skill: a listing whose check flags a claimed skill renders that skill removed from
  the matched list, with the same two sentences the real card shows. Verifies **AC-8**.
- Honesty: a listing whose band is `weak_match` or `not_a_match` still renders its real employer
  name, unhidden. Verifies **AC-19**.

## Build plan

Ordered by this project's Tracer Bullet approach: stand up the whole real pipe end to end (one
real search, both personas scored including the grounding check, one atomic write, one real
render) before thickening it with the polish items (attribution sizing, copy, the entry page link,
which stays deliberately unbuilt). Both personas are the load bearing unit from the first slice,
since the refresh's atomic write and AC-6/AC-16 both require both personas from the same run;
there is no meaningful single persona thin thread here.

1. Edit `supabase/migrations/20260913120000_demo_result.sql` in place (never applied to a hosted
   project, confirmed 2026-09-14): update `demo_result`'s check constraints, change
   `salary_min`/`salary_max` to `numeric(12, 2)`, and add `source_job_id`, `salary_currency` (with
   its pairing check), `salary_is_predicted`, and `ungrounded_skills`; remove the twelve seeded
   `insert` statements; grant `insert`/`delete` on `demo_result` to `service_role` alongside the
   existing `select`. Add the new `demo_refresh` table (singleton pattern, row level security
   enabled and forced, zero policies, `service_role` select and update only), inserting its one row
   with `refreshed_at` null. Add `replace_demo_results()` (`security invoker`, one transaction:
   delete, `jsonb_to_recordset` insert, `insert ... on conflict (id) do update` on `demo_refresh`).
   Run `pnpm db:types` after. Satisfies the schema behind **AC-3**, **AC-6**, **AC-8**, **AC-9**,
   **AC-14**, **AC-15**, **AC-17**, **AC-18**.
2. Extend `src/features/demo/personas.ts` with the two `ScoringProfile` shaped constants named in
   **Seed content**, replacing `product-designer` with `frontend-engineer` everywhere its slug is
   referenced (including the doc comment's cross reference to the migration's check constraint).
   Satisfies **AC-3**, **AC-5**, **AC-14**.
3. The legal registry pass: reclassify `demo_result` in `src/features/legal/stored-fields.ts` (its
   current `why` states it describes no real employer or posting, which AC-3/AC-19 reverse) and add
   `demo_refresh` to `NON_PERSONAL_TABLES` (a search query string and a timestamp, no personal
   data). `stored-fields.test.ts` fails on an unclassified table, so this cannot be deferred past
   the migration landing.
4. Build the refresh core under `src/features/demo/`: `demo-refresh@example.test`'s existence
   ensured (create if absent), the admin mint (jar first, `createClient(jar)`, `verifyOtp` on that
   client, assert the jar is non empty, reimplemented rather than importing
   `test/helpers/session.ts`), the fixed query call into `searchListings()`, de-duplicating and
   keeping the first 8 by `sourceJobId`, `scoreListings()` called once per persona with the matching
   `ScoringProfile` and the minted `cookieAdapter`, checking every outcome's score and, when
   attempted, its chained check both came back clean and allowed (aborting otherwise, on either
   kind of failure or refusal), and the single call to `replace_demo_results()` once every score
   and check has landed clean. A named span (`demo.refresh`)
   opens first (binding rule 4), registered in `docs/observability/spans.md`. Satisfies **AC-2**,
   **AC-17**, **AC-18**.
5. Add `src/app/api/demo/refresh/route.ts` (`POST`), reading `Authorization: Bearer <secret>`,
   comparing SHA-256 digests, calling the refresh core and returning its outcome; document the
   route write scope clarification (**Feature design**) in the file's own doc comment. Add
   `DEMO_REFRESH_SECRET` to `src/env.ts` and both `.github/workflows/ci.yml` `env:` blocks.
   Satisfies **AC-17**, **AC-18**.
6. Update `readDemoResults()` (or a renamed equivalent) in `src/features/demo/queries.ts`: one
   query reads every `demo_result` row (both personas) ordered by `sort_order`, parsed (including
   the new columns), paired by `source_job_id` into `{ own: DemoResult; otherBand: Band }` for the
   active persona's ordered list (re-sorted by band then `sort_order` within that persona's
   subset); a second, separate query reads the `demo_refresh` singleton row. An empty
   `demo_result` with `demo_refresh.refreshed_at is null` returns a normal success value carrying
   that fact, never a `Failure`; a genuine database or parse fault still returns a `Failure`
   exactly as before. Satisfies **AC-7**, **AC-12**, **AC-14**, **AC-15**, **AC-16**.
7. Update the demo card component: add the compact other persona band line (AC-16), the ungrounded
   skills rendering (removed from the matched list, `SCORING_COPY.removedSkills(...)` and
   `.reasoningCaveat` reused verbatim), render `AdzunaAttribution` unconditionally and the
   `(estimated)` label plus `JobsworthAttribution` together when `salary_is_predicted` (AC-9), and
   make the not mentioned skills caption conditional on the snippet actually being truncated.
   Satisfies **AC-8**, **AC-9**, **AC-16**, **AC-19**.
8. **The wording pass**: update `src/app/(marketing)/demo/page.tsx`'s `metadata.description`,
   `<h1>`, and intro copy; `DEMO_COPY`'s banner and read-failed strings (plus a new "not yet
   refreshed" string for AC-15); and `DemoCard`'s own doc comment, none of which may still assert
   the page is fabricated. Add the search query and last refreshed line (AC-14), both personas'
   full profiles shown somewhere on the page (AC-14), and AC-15's distinct visible state alongside
   AC-12's. Satisfies **AC-1**, **AC-10**, **AC-11**, **AC-12**, **AC-14**, **AC-15**.
9. **AC-13 stays deliberately unbuilt.** Do not touch `hero-section.tsx` or `about-section.tsx` in
   this pass; recorded in `docs/scope/scope.md` on 2026-09-14.

## Consequences

**Positive**:
- A visitor sees real listings scored for real, which is evidence the ranking works rather than a
  curated illustration of it.
- The two candidate personas are now the only fabricated element, disclosed in full on the page,
  which closes the exact objection ("picked to flatter it") that ended the fabricated version.
- The refresh reuses every existing gated code path (`searchListings()`, `scoreListings()`,
  `checkFitScore()`, `checkUsageGate()`) unchanged, so this feature adds no new vendor call shape
  to reason about, only a new caller of the existing ones.

**Negative / tradeoffs**:
- The refresh introduces a production session minting path where the only prior one was hard
  blocked outside development (spec 0001, caller 1). The blast radius is bounded (the identity
  holds no profile or application row and only this route can trigger it), but it is a genuinely
  new kind of thing in this codebase and the first route handler under `src/app/api/` to write
  anything. This was weighed against triggering the refresh from a local script instead, and the
  route was kept because the alternative moves the far more dangerous `SUPABASE_SECRET_KEY` onto a
  personal machine for a routine task (**Security model**, `rationale.md`).
- A refresh spends up to 16 `ai_scoring` calls and up to 16 chained `ai_check` calls (32 model
  calls total) plus one Adzuna search, not the 16 scoring calls alone; still negligible against the
  shared caps at a weekly cadence.
- The page is only ever as fresh as the last successful manual refresh; a failed or skipped refresh
  leaves `/demo` showing older real data indefinitely, which AC-14's visible timestamp is what
  keeps honest rather than silent.
- A real employer's name now appears on a public portfolio page next to a `weak_match` or
  `not_a_match` band (AC-19), an editorial exposure spec 0021's fabricated version never carried
  and Adzuna's terms do not govern either way.
- A flaky `ai_check` vendor call blocks an otherwise successful refresh entirely, since a check
  failure or refusal now aborts the whole run rather than writing the listing without its
  ungrounded skills flag (**Feature design**, AC-17). Accepted deliberately: refreshes are manual
  and retryable, this is the same shape AC-17 already accepts for a scoring failure, and the
  alternative was writing a row whose check never actually finished as if it had passed clean,
  which is the exact misrepresentation `ungrounded_skills` exists to prevent.
- No scheduler exists yet, so staying current is a manual, easy to forget action; automating it on
  a cron is explicitly deferred (see `docs/scope/scope.md`).

**Neutral**:
- `demo_result`'s shape changes (four new columns, a changed check constraint, two type changes)
  but the table and its access pattern (secret key client only) are unchanged.
- One new table (`demo_refresh`), no relationship to the rest of the schema.
- No migration plan section: the original migration never applied to a hosted project, so this is
  edited in place with no live data to transform and no rollback window to plan for.

## Follow-up

- [ ] Revisit the fixed search query and kept listing count if, after a few refreshes, the two
      personas consistently land on the same band (no visible differential), which would undercut
      AC-6/AC-16's whole point.
- [ ] Automating the refresh on a schedule (a cron calling `/api/demo/refresh`) is a later
      increment; no scheduler exists in this project today.
- [ ] Re-verify Adzuna's terms of service before this ships and periodically after, since Adzuna
      may change them at any time (see `rationale.md`, References), the same standing Follow-up
      spec 0013 already carries.
- [x] `verify.md` was written against the fabricated design (AC-1 to AC-12 as they read before
      2026-09-14) and needs a fresh pass against the acceptance criteria above before the next
      `/check verify` run; its existing steps are kept for history, not deleted. **Done
      2026-09-14 by `/develop`**: a new dated section covering AC-1 to AC-19, plus one step per
      row of the Value sourcing table, is appended below the superseded one, which is left intact.
- [ ] If check failures turn out to abort refreshes often enough to matter in practice, revisit
      whether `ai_check` should become best effort here after all (as it is on `/search`), against
      the reasoning that ruled that out this pass (**Feature design**, AC-17).
