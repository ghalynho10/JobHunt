# 0021. Seeded demo account

**Date**: 2026-09-13
**Status**: Accepted

## Summary

Feature 31, `/demo`, is reworked from a fully fabricated page into one that shows real Adzuna
listings, scored for real, under two fictional candidate profiles. Only the two candidates are
made up now, and they are shown on the page as the whole disclosure. A manually triggered refresh
runs ~~one real Adzuna search~~ two real Adzuna searches (revised 2026-09-15), scores every kept listing against both personas exactly the way
`/search` scores a real user's results (including the same grounding check), and replaces the
page's data in one all or nothing write. This reverses several of this spec's own earlier
decisions; each reversed line below is kept and struck through rather than deleted, with a note
saying when and why it stopped applying, so a later reader can see the history rather than only
the current rule. A cross model check ran against the first draft of this rework on 2026-09-14 and
found several real gaps; this text already reflects the fixes and the two judgment calls the
engineer made in response (**Rationale**, and `rationale.md`'s "Rework" section).

**Revised 2026-09-15**, after the first real refresh: 15 of its 16 rows carried zero matched
skills, so the one broad `"software engineer"` search is replaced by two opposed searches,
`"backend engineer"` and `"frontend engineer"`, four listings kept from each (**Feature design**,
"The fixed search queries"). The same revision records two decisions `/develop` made while
building the refresh (**Feature design**, "Refresh outcomes") and routes one migration comment
correction to `/develop` (**Build plan**, step 10).

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
  makes no external paid call on any render. Every paid call (~~one Adzuna search~~ two Adzuna
  searches, revised 2026-09-15, then one
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
  not just two of them, because both personas are scored against the same ~~one search's
  results~~ kept set, drawn from both searches (revised 2026-09-15).
  Each listing's band, matched skills, not mentioned skills, ungrounded skills, and reasoning are
  computed independently per persona by the real scorer and the real grounding check, and are
  expected to differ, but nothing in the build may select or discard a listing based on whether
  they actually do, and a refresh that returns fewer than the target count (**Feature design**,
  "The kept listing count") is still published as is, never padded or retried to reach it, as
  long as it kept at least one listing; a refresh that kept zero aborts (**Feature design**,
  "Refresh outcomes", recorded 2026-09-15).
- **AC-7**: Within one profile, listings are ordered best band first, ties broken by ~~Adzuna's own
  returned rank for that search~~ the order the kept walk kept each listing, which interleaves the
  two searches' own Adzuna order (revised 2026-09-15; **Feature design**, "The kept listing
  count") (stored as `sort_order`), the same band ordering rule `/search` already uses. *(Tiebreak source changed 2026-09-14: a hand seeded display order is replaced by
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
  today" status card moves "a no sign in demo account" from planned to working. ~~**Deliberately not
  built by this spec.** Recorded in `docs/scope/scope.md` on 2026-09-14: wiring this while the page
  still showed fabricated data would have advertised a demo already decided to be insufficient,
  and that reasoning holds unchanged for the real data version until it ships.~~ **Built
  2026-09-17**, once its own stated condition was met: the real data version shipped in pull
  request #135 and the first production refresh ran 2026-09-16, so `/demo` shows real scored
  postings rather than the fabricated set this was waiting out.
- **AC-14** (new 2026-09-14): The page shows ~~the search query the current results answer (the
  title and, when set, the location the refresh searched)~~ both search queries the current
  results answer (both titles, and the shared location when one is set; revised 2026-09-15) and
  when the data was last refreshed,
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
- **AC-17** (new 2026-09-14): A refresh, triggered as described in AC-18, runs ~~exactly one real
  Adzuna search using the fixed query in **Feature design**, de-duplicates the results by Adzuna's
  own listing id (first occurrence wins) and keeps up to a fixed count of what remains in Adzuna's
  own returned order~~ exactly two real Adzuna searches using the fixed queries in **Feature
  design**, de-duplicates across both by Adzuna's own listing id, and keeps up to four listings
  from each search in that search's own returned order, by the walk **Feature design** states
  (revised 2026-09-15) (never selected, reordered, or padded by how any score turns out), and scores
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
  transaction. A gate refusal (of ~~either call type~~ any of the three call types, `job_search`,
  `ai_scoring` or `ai_check`) is reported at a different Sentry severity than a genuine failure,
  since it is the budget working as designed. A refresh whose searches leave zero kept listings in
  total also aborts, writing nothing. **Feature design**, "Refresh outcomes", states the exact
  shape of each outcome, both recorded 2026-09-15 from what `/develop` built.
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
| `sort_order` | `smallint not null` | ~~Adzuna's own returned rank for that search, after de-duplication~~ the kept walk's keep order across both searches (revised 2026-09-15), 1 based; the tiebreak within one band (AC-7); identical for both personas' copies of the same listing |
| `search_title` | `text not null`, `check (search_title in ('backend engineer', 'frontend engineer'))` | New 2026-09-15. The fixed query whose walk turn kept this listing. A posting both searches returned is kept once, under whichever search's turn reaches it first in the walk (backend 1, frontend 1, backend 2, ...), and the other search takes its own next listing. Identical for both personas' copies of the same listing. It is what makes the walk checkable from stored data and what the stopping rule's own role count reads (`## Follow-up`); the card does not have to display it |
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
| ~~`search_title`~~ | ~~`text not null`~~ | ~~the fixed query's title term (**Seed content**)~~ · **REPLACED 2026-09-15** by `search_titles`, since a refresh now runs two searches |
| `search_titles` | `text[] not null`, `check (cardinality(search_titles) = 2 and length(trim(search_titles[1])) > 0 and length(trim(search_titles[2])) > 0)`, keeping the non blank guarantee the old `search_title` column's check carried | New 2026-09-15. Both fixed queries' title terms, in the order the searches ran (`backend engineer` first, then `frontend engineer`), stored raw exactly as sent to Adzuna. The page renders both (AC-14) |
| `search_location` | `text`, nullable | the ~~fixed query's~~ location term both fixed queries share, absent when the searches are nationwide (as both are today) |
| `refreshed_at` | `timestamptz`, nullable | `null` until the first refresh ever runs (AC-15); set atomically with the `demo_result` rewrite (AC-17) |

Same row level security shape: enabled and forced, zero policies, `select` and (new) `update`
granted to `service_role` only. The migration inserts the singleton row with `refreshed_at` left
`null`, mirroring `app_settings`'s own insert-before-force ordering. That seed row's
`search_titles` carries both fixed queries' own terms, `array['backend engineer', 'frontend
engineer']`, for the same reason the current migration's comment gives for seeding the real term
rather than a placeholder (revised 2026-09-15; it seeds `'software engineer'` today).

No foreign key between the two tables: `demo_refresh` is metadata about the last run, not a parent
of the result rows, and the two are only ever written together by the same atomic function below.

**The atomic write, a dedicated Postgres function**: `public.replace_demo_results(p_results jsonb,
~~p_search_title text~~ p_search_titles text[], p_search_location text default null)` (revised
2026-09-15; the `default null` records what the migration already does, so the nationwide case is
an omitted argument), `security invoker`, `set search_path = ''`. It runs
as its caller, and the only caller is the secret key client authenticating as `service_role`,
which already carries `BYPASSRLS` (the same reasoning `20260821120000_app_settings.sql`'s own
comment gives). This is a deliberate change from an earlier draft that specified `security
definer`: this table's row level security is enabled and forced with zero policies, and whether a
`security definer` function's owning role carries `BYPASSRLS` in a hosted project is exactly the
question that migration's own comment says this repository cannot confirm; `security invoker`
sidesteps the question entirely, since `service_role`'s own privilege is what does the work, and
needs only the ordinary table grants above.

`p_results` is a JSON array, one element per `demo_result` row to insert, with exactly these keys,
matching the table's own columns: `persona_slug`, `source_job_id`, `sort_order`, `search_title`
(added 2026-09-15, `search_title text` in the recordset definition below too), `title`,
`company_name`, `location`, `salary_min`, `salary_max`, `salary_currency`, `salary_is_predicted`,
`description_snippet`, `band`, `matched_skills`, `not_mentioned_skills`, `ungrounded_skills`,
`reasoning`. In one transaction the function deletes every row in `demo_result`, inserts the rows
via `insert into public.demo_result (...) select ... from jsonb_to_recordset(p_results) as
t(persona_slug text, source_job_id text, sort_order smallint, title text, company_name text,
location text, salary_min numeric(12,2), salary_max numeric(12,2), salary_currency text,
salary_is_predicted boolean, description_snippet text, band text, matched_skills text[],
not_mentioned_skills text[], ungrounded_skills text[], reasoning text)`, and updates the singleton
`demo_refresh` row's ~~`search_title`~~ `search_titles`, `search_location`, and `refreshed_at = now()` via `insert ...
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

~~**The fixed search query**: title `"software engineer"`, no location (nationwide within the
already configured `ADZUNA_COUNTRY`). Broad enough to return a mix of backend, frontend, and full
stack postings so the two personas plausibly land on different bands, without being selected or
adjusted after the fact based on what came back.~~ · **SUPERSEDED 2026-09-15**, by the two queries
below. The first real refresh (local stack, `demo_refresh.refreshed_at` 2026-09-15 00:08 UTC)
wrote 16 rows and 15 of them carried zero matched skills, so the cards could not show the skill
matching the page exists to demonstrate. Three of its eight listings were embedded, FPGA or
robotics roles neither persona fits. `rationale.md`'s "Revision, 2026-09-15" section records the
options, the likely deeper cause (Adzuna's 500 character snippet), and why changing a query after
seeing one run is not the cherry picking the next paragraph forbids.

**The fixed search queries** (revised 2026-09-15): two searches per refresh, both nationwide within
the already configured `ADZUNA_COUNTRY`, each matching one persona's own first desired title
(**Seed content**): title `"backend engineer"`, then title `"frontend engineer"`. The backend
search runs first; a refusal or failure of the backend search ends the refresh before the frontend
search runs (**Refresh outcomes**). A refused or failed frontend search aborts the refresh too,
even though the backend search succeeded: only a search that *succeeds and returns nothing* is the
"publish the other search's listings" case below, never a search that did not complete. Each query
is paired with the persona whose own role it names (`"backend engineer"` with `backend-engineer`,
`"frontend engineer"` with `frontend-engineer`), which is what the own role count in **Refresh
outcomes** reads. Two opposed queries give each persona its own strong matches
and its own mismatches, so AC-16's cross persona line shows differences in both directions, where
a single role query leans toward whichever persona it names. These two queries are fixed from here
on and are not re-tuned per run; the one condition under which they are revisited is the stopping
rule in `## Follow-up`, and that rule's answer is to leave them unchanged.

~~**The kept listing count**: the first 8 listings Adzuna returns for that search, in Adzuna's own
order, after de-duplicating by `sourceJobId` (Adzuna can return the same advert twice; first
occurrence wins, still in Adzuna's own order). If de-duplication or Adzuna's own response leaves
fewer than 8, the refresh proceeds with however many remain rather than aborting, retrying, or
padding.~~ · **SUPERSEDED 2026-09-15**, by the per search count below. The principle that closed
the original paragraph is unchanged and still governs: **whatever a refresh returns gets
published, unedited and unre-rolled, until the next scheduled refresh**, and that includes the
count. This rule is stated here because it is the entire reason this version answers the cherry
picking objection the fabricated version could not.

**The kept listing count** (revised 2026-09-15): up to 4 listings from each search, so up to 8 in
total and up to 16 `demo_result` rows, both personas scored against the exact same kept set. The
kept set is decided by one walk, before any scoring call:

- The two result lists take alternating turns, backend first: backend, frontend, backend,
  frontend, and so on.
- On its turn a search keeps its next listing in its own Adzuna order whose `sourceJobId` neither
  search has already kept, skipping past any that has been. So a duplicate costs that search
  nothing: it takes its own next listing rather than borrowing one from the other search.
- A search stops taking turns once it has kept 4, or once its own results run out. The other
  continues alone until it too has kept 4 or runs out.
- A search that ends with fewer than 4 is never topped up from the other search, never retried,
  and never widened. It publishes what it has.
- A listing both searches returned is kept once, by whichever search reaches it first in the walk,
  and its rows store that search's title as `search_title`. At equal rank that is the backend
  search, since it takes the first turn. This is fixed before any score exists, so it cannot be a
  selection by outcome.
- `sort_order` is the order the walk kept each listing, 1 based, so the stored order interleaves
  the two searches (backend 1, frontend 1, backend 2, frontend 2, ...) and neither query's
  listings cluster at the top of a band's ties (AC-7).
- If the walk keeps zero listings in total, the refresh aborts (**Refresh outcomes**). If one search
  keeps zero and the other keeps any, the refresh publishes the other's listings, under the same
  "publish what came back" rule.

**The walk is a pure, exported function**, `keepListings(backend, frontend)`, taking the two
searches' already parsed listings and returning the kept listings with their `search_title` and
`sort_order`. It is unit tested directly over fixture lists, including the zero case (two empty
lists return an empty result), so no test has to mock `searchListings()` or the session mint. The
zero kept abort in `refreshDemoResults()` is then one branch on that result's length, checked by
reading it. "Returns nothing" means Adzuna answering with an empty `results` array, which
`searchListings()` returns as `success([])`; a non empty response whose listings all fail to parse
is a `response_malformed` `Failure` instead, and aborts as a genuine failure, not as zero kept.

De-duplication is by Adzuna's own `sourceJobId` only, never by content. Two Adzuna ids carrying the
same posting therefore both appear. Collapsing those is feature 19's dedup key decision, not this
feature's (`## Follow-up`), and doing it here by matching content would be this feature choosing
which real listings a reader sees.

**Refresh outcomes** (recorded 2026-09-15 from what `/develop` built in
`src/features/demo/refresh.ts` and `src/app/api/demo/refresh/route.ts`; both decisions below were
made during the build, not by this spec, and are ratified here):

| Outcome | `refreshDemoResults()` returns | Sentry | `demo.refresh` span | Route answers |
|---|---|---|---|---|
| Every kept listing scored and checked clean under both personas, and the write landed | `success({ completed: true, listingCount, rowCount, skillCounts })` (`skillCounts` added 2026-09-15, below) | nothing | successful, `outcome: "completed"`, plus the four `skillCounts` values as attributes | `200`, `refreshed: true`, with `listings`, `rows` and the four `skillCounts` values |
| The usage gate refused any call: either search, any `ai_scoring`, any `ai_check` | `success({ completed: false, reason })`, carrying the gate's own `UsageGateReason` | `Sentry.captureMessage(..., "info")`, whose message names the step and, for a `job_search` refusal, the search title | successful, with `outcome: "refused"`, `refusedReason`, `refusedStep` attributes, plus `refusedSearch` (the title) when the step is `job_search` (added 2026-09-15) | `503`, `refreshed: false` |
| The walk kept zero listings in total | a `Failure`, `kind: "record_not_found"`, `severity: "unexpected"`, whose context names both search titles | via `failure()` | failed | `500`, `refreshed: false` |
| Anything else genuinely failed: the session mint, a search, a score, a check, a missing outcome, or the write | a `Failure`; a search's own `Failure` carries the search title in its context, so the report says which of the two searches broke (added 2026-09-15) | via `failure()` | failed | `500`, `refreshed: false` |

**`skillCounts`** (added 2026-09-15, for the stopping rule in `## Follow-up`): computed by
`refreshDemoResults()` from the rows it is about to write, never from a later read, as four numbers.
`ownRoleRows` and `ownRoleEmpty` count the rows where the persona's own query kept the listing
(`backend-engineer` with `search_title` `"backend engineer"`, `frontend-engineer` with
`"frontend engineer"`), up to 8, and how many of those carry an empty stored `matched_skills`.
`crossRoleRows` and `crossRoleEmpty` count the same for the other rows, where each persona is scored
against the other role's postings and an empty `matched_skills` is often the correct result. Both
pairs are recorded on every completed run so the stopping rule is always read against the own role
pair, never against all 16 rows.
| A wrong or missing secret | never called | nothing | never opened | `401`, before anything runs |

- **A gate refusal is a success carrying `completed: false`, never a `Failure`, and it is reported
  at info level.** Spec 0001 binding rule 3 states a gate refusal is never a `Failure` at any
  severity, because `failure()` fails the active span whatever the severity, and a correct refusal
  must never enter `demo.refresh`'s failure ratio. AC-17 still asks for the refusal to be reported
  at a severity distinct from a genuine failure, so it goes through `Sentry.captureMessage` at
  info directly, which is the level `failure()` itself uses for `expected`, without the span side
  effect. Nothing is written either way.
- **A refresh that keeps zero listings aborts, and this is not a departure from "publish whatever
  comes back".** Publishing an empty set would delete the previous run's real results and stamp a
  fresh `refreshed_at` over them. That state has no copy: it is not AC-15's "no refresh has ever
  run", because one just did, and not AC-12's read failure, because nothing failed to read.
  Aborting leaves the page in a state this spec does describe. Any total from one upward publishes
  as is.

**State transitions**: `demo_result` and `demo_refresh` are replaced wholesale by each refresh
(AC-17); no row is ever individually updated.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/demo` | GET (Server Component render) | `persona` (query param, optional) | the ordered list of results for that profile, each carrying the other persona's band, plus ~~the search query~~ both search queries (revised 2026-09-15) and last refreshed time | none, public | a genuine read failure answers 200 with AC-12's visible state; an empty, never refreshed table answers 200 with AC-15's distinct visible state; any value other than the two known slugs falls back to `backend-engineer` |
| `/api/demo/refresh` | POST | `Authorization: Bearer <secret>`, compared (as a SHA-256 digest) against `env.DEMO_REFRESH_SECRET` | `200` on a completed refresh, a non 200 with a visible reason on a wrong secret or any aborted step | a shared secret only, no session (AC-18) | wrong or missing secret refuses before anything runs (`401`); a gate refusal at any call aborts with nothing written (`503`); zero kept listings or any genuine failure aborts with nothing written (`500`); **Refresh outcomes** (AC-17) |

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
| Render `/demo` | the search query line (both titles, revised 2026-09-15) and the last refreshed time (AC-14) | the single `demo_refresh` row's `search_titles`, `search_location` and `refreshed_at`, read once per render in a second, separate query (no foreign key joins the two tables); never the refresh's query constant, so the line names what the stored results actually answer even if the constant has since changed. The sentence is `DEMO_COPY.searchedFor(titles: readonly [string, string], location: string \| undefined)`, replacing today's single title signature, and reads exactly `These are the first results from two searches, up to four from each: "backend engineer" and "frontend engineer".`, or with ` in ${location}` before the final period when a location is set (decided 2026-09-15; today's "the first results for a search" would be false). `queries.ts` exposes the parsed array as a `readonly [string, string]` tuple so the page needs no undefined branch |
| Render `/demo` | the "not yet refreshed" state (AC-15) vs. the genuine failure state (AC-12) | `demo_refresh.refreshed_at is null` (a successful read of an expected empty state) vs. an actual database or parse `Failure` (an unexpected state); the two are structurally distinct return shapes, never told apart by inspecting an error message |
| The refresh | which searches run, in what order, and which persona each is own role for | a module constant in `refresh.ts` holding exactly two entries in this order, `{ title: "backend engineer", persona: "backend-engineer" }` then `{ title: "frontend engineer", persona: "frontend-engineer" }`, nationwide (**Feature design**, "The fixed search queries"); its titles, in order, are what `replace_demo_results()` receives as `p_search_titles` |
| The refresh | each kept listing's `search_title` | the search whose walk turn kept it (**Feature design**, "The kept listing count") |
| The refresh | `skillCounts` (own role and cross role, rows and empty) | the rows about to be written, grouped by whether `persona_slug` is the own role persona of that row's `search_title` (**Feature design**, "Refresh outcomes") |
| The refresh | which listings to keep, and each one's `sort_order` | ~~the first 8 of Adzuna's own returned order for the fixed query, after de-duplicating by `sourceJobId`; fewer than 8 is published as is~~ the alternating walk over both searches' own Adzuna order, up to 4 per search, de-duplicated by `sourceJobId` across both, `sort_order` being the walk's keep order (revised 2026-09-15; **Feature design**, "The kept listing count") |
| The refresh | its outcome and the route's status | **Feature design**, "Refresh outcomes" |
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
  ordered by band, each card naming the other persona's band, both search queries and the refresh time
  visible, and both attributions where they apply. Verifies **AC-1**, **AC-7**, **AC-8**, **AC-9**,
  **AC-14**, **AC-16**.
- The refresh, happy path: `POST /api/demo/refresh` with the correct secret runs ~~one search~~ two
  searches (revised 2026-09-15), scores up to 16 listings across both personas, and replaces both
  tables atomically. Verifies **AC-2**, **AC-6**, **AC-17**, **AC-18**.
- The kept walk (new 2026-09-15), a unit test of `keepListings()`: a backend list of 2 and a
  frontend list of 6 whose first entry repeats backend's first `sourceJobId`. The walk keeps
  backend 1, frontend 2 (frontend 1 is the repeat, skipped), backend 2, frontend 3, then frontend
  4 and 5 alone, stopping at 4 kept for frontend and never topping backend up; `sort_order` is 1 to
  6 in that order, and each kept listing's `search_title` names the search that kept it. Verifies
  **AC-7**, **AC-17**.
- The kept walk, zero (new 2026-09-15), a unit test of `keepListings()`: two empty lists return an
  empty result. `refreshDemoResults()` then returns a `Failure` of kind `record_not_found` and never
  calls `replace_demo_results()`. Verifies **AC-17**.
- The refresh, a failed second search (new 2026-09-15): the backend search succeeds and the
  frontend search returns a `Failure`; the refresh aborts with nothing written and the failure's
  context names `"frontend engineer"`. Verifies **AC-17**.
- The refresh, skill counts (new 2026-09-15): on a completed refresh, `ownRoleRows` plus
  `crossRoleRows` equals `rows`, and recomputing both pairs from `demo_result` with SQL gives the
  same four numbers the route returned. Verifies the stopping rule's input (`## Follow-up`).
- The refresh, a search refusal (new 2026-09-15): the backend search is gate refused; the frontend
  search never runs, the result is `completed: false`, the route answers `503`, and the span is not
  failed. Verifies **AC-17**.
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

Ordered by this project's Tracer Bullet approach: stand up the whole real pipe end to end (~~one
real search~~ the real searches, two since 2026-09-15, both personas scored including the grounding check, one atomic write, one real
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
   keeping the first 8 by `sourceJobId` (both revised to two searches and the kept walk by step
   10), `scoreListings()` called once per persona with the matching
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
10. **The 2026-09-15 revision** (two searches, the kept walk, the migration comment), for
    `/develop`. First reconfirm `supabase/migrations/20260913120000_demo_result.sql` has still not
    applied to any hosted project, since editing it in place rests on that; if it has, this step
    needs a second migration instead. Each file below was located by a repo search on 2026-09-15
    for `DEMO_SEARCH_TITLE`, `search_title` and `software engineer`:
    - `supabase/migrations/20260913120000_demo_result.sql`: replace `demo_refresh.search_title`
      with `search_titles text[] not null` and the check the data model table states (cardinality
      2, both elements non blank); add `demo_result.search_title` with its check; seed the
      singleton with `array['backend engineer', 'frontend engineer']` (the insert currently at line
      332) and update that insert's own comment, which names the single term. In
      `replace_demo_results()`: change the second argument to `p_search_titles text[]` in the
      signature, the `on conflict` update and the `comment on function` line; add `search_title`
      to the insert column list, the select list and the `jsonb_to_recordset` definition; **and
      change the `revoke execute` and `grant execute` statements at lines 390 to 391**, which name
      the old `(jsonb, text, text)` signature and make `pnpm db:reset` fail if left. Correct every
      comment that describes one search or Adzuna's own rank: the file header (line 12, "runs one
      real Adzuna search"), the `sort_order` comment (lines 49 to 53), the `demo_refresh` table
      comment (lines 189 to 190, "its search query"), and the function body (line 229, "whatever
      one search returned").
      **Correct the heading of the
      `where true` comment** (currently line 235 to 236), which reads "`where true` IS NOT
      REDUNDANT HERE, AND REMOVING IT BREAKS THIS FUNCTION IN PRODUCTION ONLY". Replace it with
      "`where true` IS NOT REDUNDANT HERE, AND REMOVING IT BREAKS EVERY APPLICATION CALL TO THIS
      FUNCTION, LOCAL OR HOSTED." The comment's own body already contradicts "production only",
      saying the bare delete "fails every time the application calls this function", and it was
      found on the local stack, whose `authenticator` role (the connection PostgREST serves over)
      preloads `safeupdate`: `pg_roles.rolconfig` read on 2026-09-15 shows
      `session_preload_libraries=supautils, safeupdate`. Leave the rest of the body unchanged.
      Then `pnpm db:reset` and `pnpm db:types`.
    - `src/features/demo/refresh.ts`: replace `DEMO_SEARCH_TITLE` with the two entry search
      constant the Value sourcing table names, and its doc comment (which still argues for one
      broad query); run both searches in order, backend first, applying **Refresh outcomes** to
      each, including the search title in a search failure's context and in a `job_search`
      refusal's message and `refusedSearch` attribute; replace `keepListings()` with the exported
      pure walk in **Feature design**, "The kept listing count", keeping the zero kept abort, whose
      context now names both titles; write `search_title` on every row; compute `skillCounts` and
      return it on the completed outcome and as span attributes; pass `p_search_titles` to the
      write; change `KEPT_LISTING_COUNT`'s **value from 8 to 4** and its doc comment to a per
      search ceiling.
    - `src/app/api/demo/refresh/route.ts`: add the four `skillCounts` values to the `200` body.
    - `src/features/demo/queries.ts`: parse `search_titles` as exactly two non empty strings and
      expose it as a `readonly [string, string]` in place of `searchTitle`; parse `search_title`
      on each `demo_result` row; correct the `sort_order` doc comment (line 159, "Adzuna's own
      returned rank").
    - `src/features/demo/copy.ts` and `src/app/(marketing)/demo/page.tsx`: change `searchedFor`
      to the signature and literal sentence the Value sourcing table gives (AC-14), and correct
      `page.tsx`'s header comment (line 19, "from one real search").
    - `src/features/demo/demo-card.tsx`: the doc comment at line 23 says "one real Adzuna search";
      correct it.
    - `src/features/demo/personas.ts`: the doc comment at lines 49 to 52 describes listings "from
      one 'software engineer' search"; correct it.
    - `src/features/legal/stored-fields.ts`: line 80 says `demo_refresh` holds "a search term";
      it holds two now.
    - `docs/observability/spans.md`: the `demo.refresh` row says "one Adzuna search plus up to
      sixteen"; it is two searches now.
    - **Not this step's to edit, and owed**: `docs/scope/scope.md` lines 447 to 459 (feature 31)
      still say "one Adzuna search" and "one real search". That file is `/scope`'s.
    Satisfies **AC-2**, **AC-6**, **AC-7**, **AC-14**, **AC-17**.

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
  calls total) plus ~~one Adzuna search~~ two Adzuna searches (revised 2026-09-15; the model call
  count is unchanged, since the kept total is still at most 8), not the 16 scoring calls alone;
  still negligible against the shared caps at a weekly cadence. Two searches is 2 against
  `job_search`'s global day cap of 66 and 2 against the refresh identity's own account week cap of
  25 (`supabase/migrations/20260902120000_usage_gating.sql`).
- De-duplication is by id only, so two Adzuna ids under one company both appear on `/demo`
  whenever they exist. The first real refresh had one instance of this shape: Everpure, Inc.
  under ids `5883839578` and `5883870504`, with byte identical snippets but different titles
  ("Software Engineering Manager, Platform" and "Software Engineer"). The identical snippets are
  expected rather than suspicious (`rationale.md` records every stored snippet as 500 characters
  of the company's own introduction), so this pair is most likely two distinct roles, and **no
  confirmed duplicate is on record**. Both ids stay visible as two results under feature 19's dedup
  key (spec [0022](../0022-listing-data-quality/index.md), AC-2), because their titles differ
  (`## Follow-up`).
- Changing a query after seeing one run's results is the move this spec otherwise forbids. It is
  accepted once, on a criterion about the cards' information (no matched skills for either
  persona) rather than about which bands came back, and it is bounded by a stopping rule
  (`## Follow-up`) whose answer is to leave the queries alone (`rationale.md`, "Revision,
  2026-09-15").
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

- [x] Revisit the fixed search query and kept listing count if, after a few refreshes, the two
      personas consistently land on the same band (no visible differential), which would undercut
      AC-6/AC-16's whole point. **Revisited 2026-09-15 on a different trigger than this item
      names**: after one refresh, not a few, because 15 of 16 rows carried zero matched skills.
      The query and the count were both revised (**Feature design**). The band differential this
      item watched for is now covered by the stopping rule below and by AC-16.
- [x] **The stopping rule for the queries** (2026-09-15): read the next completed refresh's
      `skillCounts` (**Feature design**, "Refresh outcomes"). If **5 or more of its own role rows**
      (`ownRoleEmpty` of up to 8 `ownRoleRows`) carry zero matched skills, the cause is Adzuna's
      500 character snippet, which the three first run snippets read on 2026-09-15 suggest (each
      is a company introduction cut off before any requirement), and the queries do not change
      again. **The denominator is own role rows only, deliberately.** Each persona is also scored
      against the other role's postings, where zero matched skills is often the correct result, so
      up to 8 of the 16 rows can be empty by design; counting across all 16 would fire on almost
      any run and freeze the queries for the wrong reason. `crossRoleEmpty` is recorded beside it
      so the two are never confused. The snippet limitation is already recorded in spec 0013's
      Consequences, and any fix belongs there, not in a third query.
      **Fired twice, on two environments and two different sets of real postings, 2026-09-16.**
      The rule asked for one completed refresh's `skillCounts` and got two, both above its
      threshold of 5: **6 of 8 own role rows empty** on the local stack on 2026-09-15, and **7 of
      8** on production (`https://usejobhunt.dev`) on 2026-09-16, with `crossRoleEmpty` at 8 of 8
      in both. Both runs are written up in `docs/experiments/0021-seeded-demo-account.md`, the
      local one in section 1 and the production one in section 4, each with the response body it
      is read from. So **the cause is Adzuna's 500 character snippet and the two queries do not
      change again**, which is what this item said it would conclude. A single run left open that
      the postings happened to be unusual; two independent runs closing the same way, more
      strongly the second time, does not. This ticks what the rule concluded, it does not decide
      anything new: the fix still belongs to spec 0013's Consequences and to
      `docs/scope/scope.md`'s deferred full posting text item, which now carries both numbers.
- [ ] **Two listing data items the first real refresh put on this public page, both feature
      19's** (`docs/scope/scope.md`, "Listing data quality"), recorded here because `/demo` is
      where a visitor sees them: (1) Everpure, Inc. appears twice under Adzuna ids `5883839578`
      and `5883870504`, byte identical snippets with different titles ("Software Engineering
      Manager, Platform" and "Software Engineer"). The identical snippets are expected, not
      suspicious (`rationale.md`'s 500 character company introduction finding), so this pair is
      most likely two distinct roles rather than a confirmed duplicate; it is a test case a dedup
      key must keep as two results, which is exactly the risk feature 19's row names. (2) PNC
      Financial Services Group's snippet (id
      `5854960477`) carries literal `\n` character sequences, rendered as text. ~~Feature 19's scope
      row does not yet name this second defect (its row covers duplicates, the equal salary range
      and outliers; `docs/session-notes.md` is the only other place it is mentioned), so this
      pointer is not a claim that it is already scoped; adding it there is `/scope`'s.~~
      **No longer true as of 2026-09-16**: the `/scope` pass this sentence was waiting on has run,
      and feature 19's row now names the escaped character defect in both its intent and its
      **Done when**, with an evidence paragraph for each of the two defects. It also widened that
      feature in the process, from de-duplicating incoming listings to **normalising** their text
      as well, which is the change this defect forced and which the row now states outright. This spec fixes
      neither: `/demo` renders listings exactly as returned (AC-19), and a demo only cleanup would
      make `/demo` differ from `/search`.
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
- [ ] **Open question, not a decision: is one failed call worth discarding about thirty paid ones?**
      Raised by the **first production refresh, 2026-09-16**, whose first attempt returned HTTP 500
      with `"A demo refresh score or grounding check did not come back clean, so nothing was
      written."` Nothing was written, which is AC-17 behaving exactly as specified. What the run
      added is the other half of that trade, which this spec chose without a number against it:
      **the calls already made when the run aborts are still billed.** `scoreListings()` fires one
      persona's listings concurrently, so by the time a single bad outcome is noticed at least that
      persona's eight `ai_scoring` calls and their chained `ai_check` calls have been made and paid
      for, and if the failure landed in the second persona the whole set had. A run makes up to 32
      vendor calls and one failure discards all of them. The question this leaves open, deliberately
      unanswered here: **should the one failed call be retried before the run aborts**, rather than
      the choice being only between aborting everything and writing an unchecked row? A retry is a
      third option this spec never considered; it does not weaken AC-17's guarantee, because a
      retry that also fails still aborts and still writes nothing. Costs to weigh against it: a
      retry doubles the worst case latency of the slowest call, spends more money on a vendor
      already failing, and needs a bound so a persistently broken vendor cannot loop. **Related but
      not the same as the `ai_check` best effort item above**, which asks whether a failed check
      should be ignored and the row written anyway; this asks whether the call should be tried
      again first, and the two could be decided independently or together. **This run is also the
      first real datum for that neighbouring item's own trigger** ("if check failures turn out to
      abort refreshes often enough to matter in practice"), though one abort is an observation and
      not yet a rate. Evidence, including what the abort cost and why the retry after it was not a
      re roll, is in `docs/experiments/0021-seeded-demo-account.md`, section 4. Which of the two
      steps failed, `ai_scoring` or `ai_check`, is carried on the failure event's `step` context
      and was not read: Sentry was unreachable from this repository during that run, recorded in
      the same section.
- [ ] **The status card's `planned` row now needs a new claim each time the last one ships, which
      is a recurring obligation the mechanism did not previously have** (2026-09-17). AC-13
      specifies only that `a no sign in demo account` moves from `planned` to `working`. It says
      nothing about what the `planned` row then shows, and feature 31 was the last of the original
      five, so following AC-13 literally would have left that row rendering a `planned` chip beside
      nothing. **That is not a cosmetic problem**: the third about paragraph, on the same screen,
      promises "anything not built yet is labeled as such on this page, not implied", and a card
      with no `planned` side makes that sentence false where a visitor can read both at once. So
      one replacement claim was chosen rather than deleting the row: `resumes tailored to each
      posting`, which is feature 25 (Resume tailoring per job), a real `planned` scope row, as
      AC-8's second promise requires. **Recorded as a content change to AC-8's card beyond what
      AC-13 specifies, not as a decision this spec made.** What it leaves open: the original five
      drained one at a time and were never refilled, so the row was always going to empty exactly
      once and no rule covers what happens after. From now on, every feature that moves this claim
      into `working` must either choose the next one or delete the row and rewrite the paragraph
      beside it, and nothing enforces that choice except `about-section.test.ts`'s exact match on a
      single element array. Whether the row should carry a standing rule for picking its next
      claim, or be rebuilt to read the scope, belongs to `/architect` and to spec 0006, which owns
      the card.
