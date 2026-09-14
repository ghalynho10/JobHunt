# 0021. Seeded demo account

**Date**: 2026-09-13
**Status**: In Progress

## Summary

Feature 31 becomes a small public page at `/demo` that shows a fixed, already scored set of
fake job listings, without sign in and without spending any real search or scoring call. The
same fake listing appears under two example candidate profiles with a different score each
time, which is what actually proves the product's point: the score depends on the person, not
just the posting. A fuller version of this feature (a real seeded account with applications and
a dashboard) is deferred until feature 23 exists, and is not part of this build.

## Requirements

**User stories**:
- As a visitor who has not signed up, I want to see real looking, already scored results, so
  that I can judge whether this product is worth signing up for.
- As the engineer, I want that page to cost nothing and be impossible to corrupt, so that
  sharing the link carries no ongoing risk.

**Acceptance criteria**:
- **AC-1**: A visitor reaches `/demo` and sees a list of results with no sign in, no redirect,
  and no account required.
- **AC-2**: The page makes no external paid call on any render: no Adzuna search, no AI scoring
  call. Every value shown was prepared in advance.
- **AC-3**: Every seeded value (company name, title, description, location) reads as obviously
  fictional, not as a real employer or a real posting.
- **AC-4**: No control on the page writes to the database. There is no code path by which one
  visitor's visit changes what the next visitor sees.
- **AC-5**: The page offers exactly two example candidate profiles, `backend-engineer`
  ("Backend engineer", the default) and `product-designer` ("Product designer"), switchable
  through a `?persona=` link. Any value that is not exactly one of those two slugs (absent,
  unrecognized, empty, or a repeated query param) shows the default profile rather than erroring.
- **AC-6**: Exactly two seeded listings (the same title and company each time) appear under both
  profiles, each with a different band, different matched and not mentioned skills, and
  different written reasoning per profile. Their exact content is named in **Seed content**
  below.
- **AC-7**: Within one profile, listings are ordered best band first (ties broken by a seeded
  display order), the same ordering rule `/search` already uses.
- **AC-8**: Each card shows title, company, location when present, a stated salary on some
  listings, a description snippet, the band, matched skills, not mentioned skills, and the
  written reasoning. It carries no real "view posting" link and no working apply control, only a
  plain text line where the real apply control would sit, never a disabled button.
- **AC-9**: The page shows no Adzuna attribution and no salary prediction attribution, since
  nothing on it came from either vendor.
- **AC-10**: A visible line on the page states plainly that this is sample data, not live
  postings.
- **AC-11**: The page is not indexed by search engines.
- **AC-12**: If the seeded data cannot be read, the page answers a normal 200 and shows a visible
  failure state rather than an empty, broken looking, or server error page.
- **AC-13**: The entry page's hero carries a real, working link to `/demo`, and the "what's real
  today" status card moves "a no sign in demo account" from planned to working.

## Feature design

**Data model sketch**:

One new table, `demo_result`, with no foreign keys and no relationship to any other table:

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `persona_slug` | `text not null` | `backend-engineer` or `product-designer`, checked against exactly those two values |
| `sort_order` | `smallint not null` | seeded explicitly per row (1 to 6 within each persona); the tiebreaker within one band, since every row lands in the same migration transaction and shares one `now()` |
| `title` | `text not null` | trimmed, non empty |
| `company_name` | `text not null` | trimmed, non empty, obviously fictional |
| `location` | `text`, nullable | |
| `salary_min` / `salary_max` | `integer`, nullable | a plain stated figure on some rows, never a predicted one; formatted through the same `salaryText()` (`src/lib/listing-format.ts`) the real card uses, passed a fixed `salaryCurrency: "USD"` rather than a column, since every row would carry the same value |
| `description_snippet` | `text`, nullable | a genuinely truncated excerpt of a longer fabricated description, never the whole thing. See **Seed content** for why this matters |
| `band` | `text not null`, checked against the same five values `src/features/scoring/rubric.ts`'s `BANDS` uses | reuses the real band vocabulary and its badge styling |
| `matched_skills` | `text[] not null default '{}'` | |
| `not_mentioned_skills` | `text[] not null default '{}'` | named to match the real product's own field (`notMentionedSkills` in `src/features/scoring/rubric.ts`), not "missing"; see **Seed content** |
| `reasoning` | `text not null`, capped at 600 characters | same ceiling the real reasoning field uses |
| `created_at` | `timestamptz not null default now()` | record keeping only, not the ordering tiebreaker |

Row level security is enabled and forced with zero policies, the same shape
`app_settings` already uses (`supabase/migrations/20260821120000_app_settings.sql`). That
migration's own comment is the reason the next two statements are not optional: `BYPASSRLS`
bypasses policies but not table privileges, so after forcing row level security the migration
must also `revoke all on public.demo_result from anon, authenticated;` and then
`grant select on public.demo_result to service_role;`, the exact pattern `app_settings` uses,
in that order. Without the grant, the secret key client's read fails, and per that same
migration's own reasoning a failed read looks identical to nothing being wrong until someone
checks. The only legitimate reader is the server, through the secret key client already reserved
as this feature's third caller (`src/lib/supabase/secret.ts`). All rows for both personas,
including the two shared title and company pairs required by AC-6, are inserted directly in the
migration, before row level security is forced, matching that same migration's ordering. This is
not `supabase/seed.sql`: that file only applies on a local `db reset`, never on a hosted project,
and this data has to exist in production for a shared link to work.

**Seed content** (named here so the build has nothing to invent):

Twelve rows total, six per persona, each persona's six spanning all five bands (one band appears
twice). Two of the twelve are a deliberate cross persona pair: the same title and company, seeded
once under each persona with a different band, different skill lists, and different reasoning,
which is what AC-6 actually needs to demonstrate.

*Shared pair 1, "Platform Engineer" at "Fictional Fintech Co"*:
- Under `backend-engineer`: `strong_match`. Matched: Go, PostgreSQL, Kubernetes, Terraform. Not
  mentioned: gRPC. Reasoning: "Backend engineer, this is about as clean a match as postings get:
  your Go, PostgreSQL, Kubernetes and Terraform experience covers everything this platform team
  lists as required. gRPC isn't mentioned here, so there's nothing to weigh it against, but
  nothing suggests it matters for this role."
- Under `product-designer`: `not_a_match`. Matched: none. Not mentioned: Figma, user research,
  design systems. Reasoning: "Product designer, this platform engineering role asks for
  infrastructure and backend skills that don't appear anywhere in your profile, and it doesn't
  mention Figma, user research, or design systems work at all. There's no real overlap here to
  build a case on."

*Shared pair 2, "Founding Product Engineer" at "Faux Systems Inc"*:
- Under `backend-engineer`: `possible_match`. Matched: PostgreSQL, TypeScript, CI/CD. Not
  mentioned: Kubernetes, Terraform. Reasoning: "Backend engineer, this founding role wants someone
  comfortable across the stack, and your PostgreSQL, TypeScript and CI/CD experience covers real
  ground here. It reads more full stack than pure backend though, and your Kubernetes and
  Terraform depth isn't mentioned as something this posting is looking for."
- Under `product-designer`: `weak_match`. Matched: Figma. Not mentioned: user research, design
  systems. Reasoning: "Product designer, this posting mentions design taste and product sense
  alongside heavy engineering ownership, and Figma is the one thing here that lines up with what
  you've listed. User research and design systems work aren't mentioned, and most of what the
  posting asks for reads like engineering skills rather than design ones."

*Remaining four `backend-engineer` rows* (titles and companies at `/develop`'s discretion, each
obviously fictional), covering the three bands the shared pair does not already give this
persona (`good_match`, `weak_match`, `not_a_match`) plus one repeated `possible_match`, each with
its own plausible matched and not mentioned skill lists drawn from the same skill vocabulary
(Go, PostgreSQL, gRPC, Kubernetes, Terraform, TypeScript, REST APIs, CI/CD) and a one to two
sentence reasoning in the same direct, second person voice as the two pairs above.

*Remaining four `product-designer` rows*, covering `strong_match`, `good_match`, and
`possible_match` (the shared pair already gives this persona `not_a_match` and `weak_match`),
plus one repeated band, so this persona's six rows also span all five bands with one repeat,
matching the `backend-engineer` rows above. Drawn from a design skill vocabulary (Figma, user
research, design systems, prototyping) in the same voice.

Every `description_snippet`, on every row, is written as a truncated excerpt (for example ending
mid sentence or with an ellipsis), never a complete description. This is load bearing, not a
style choice: the not mentioned skills section reuses `SCORING_COPY.notMentionedCaption`
verbatim ("This posting only shows part of the description, so this is not a confirmed gap."),
and that sentence is only true if the stored snippet genuinely is partial. On `/search` it is
true because Adzuna returns a 500 character excerpt of a longer real posting; on `/demo` it has
to be made true by construction, since the demo authors wrote the whole fake description
themselves and a complete one would make the reused caption false on the one feature whose entire
premise is that nothing on it misleads.

**State transitions**: none. Every row is fixed at seed time; nothing here is ever updated.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/demo` | GET (Server Component render) | `persona` (query param, optional) | the ordered list of seeded results for that profile | none, public | seed read failure answers 200 with a visible failure state; any value other than the two known slugs (absent, unrecognized, empty, or repeated) silently falls back to `backend-engineer` |

There is no Server Action and no route handler here. The whole surface is one server rendered
page with no client side fetch, the same shape `/search` already uses.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Render `/demo` | which profile's rows to show | the `persona` search param, parsed as a single string and checked against exactly `backend-engineer` or `product-designer`; any other shape (missing, empty, an array from a repeated param, or an unrecognized value) defaults to `backend-engineer` |
| Render `/demo` | the two profile switcher links and their labels | a small constant list of the two `{slug, label}` pairs in code, not a database read; there are only ever two |
| Render each switcher link | which one renders as plain text vs. a real link | the currently active persona renders as text with `aria-current="page"`; the other renders as a real link |
| Render each card | title, company, location, salary, description snippet | the matching `demo_result` row, parsed through a Zod schema before use (see Build plan) |
| Render each card | band, matched skills, not mentioned skills, reasoning | the matching `demo_result` row, `band` checked against `BANDS` by the same schema |
| Render each card | ordering within one profile | `bandRank()` from `src/features/scoring/rubric.ts`, tied by the row's own seeded `sort_order` |
| Render each card | the not mentioned skills caption | `SCORING_COPY.notMentionedHeading` and `.notMentionedCaption`, reused verbatim |
| Render each card | the formatted salary line | `salaryText()` from `src/lib/listing-format.ts`, called with `{salaryCurrency: "USD", salaryMin, salaryMax}` from the row; reused rather than reimplemented so the equal-min-max single-figure case and the one-sided `from` / `up to` cases stay correct |
| Render each card | the inert apply line | a copy constant, plain text: "Applying is available once you sign in." |
| Render `/demo` | the sample data banner text | a copy constant: "Sample results, not live postings. Every listing on this page is fictional and was prepared in advance." |
| Render `/demo` | the failure state text, on a read failure or an unparseable row | a copy constant: "The sample results couldn't be loaded right now." |

**Key invariants**:
- No value on `/demo` traces to a real employer or a real search or scoring vendor; Adzuna's and
  the salary predictor's attribution components never render here.
- Nothing under `src/features/demo/` or the `/demo` route ever writes to the database. There is
  no update, insert, or delete path anywhere in this feature after the seed migration.
- The shared title and company pairs across the two profiles are a deliberate, documented
  choice in the seed data, not an accidental duplicate.
- Every row read from `demo_result` is parsed before it reaches the card, the same "parse at
  every boundary" rule the rest of the project follows; an unparseable row is a read failure
  (AC-12), never a card rendered from unchecked data.
- A card never shows a relative "posted" date or a sponsorship chip. Both are deliberately
  omitted, not missed: the demo has no meaningful "posted" time and no sponsorship claim to make.

**Security model**: no authentication and no session anywhere in this feature. `demo_result`
carries row level security enabled and forced with zero policies, so only the secret key client
can read it, and that client is never signed in as anyone. Because no write path exists at all,
there is nothing to authorize: a visitor cannot corrupt the data for the next visitor by
construction, not because a check happens to catch them.

**Configuration required**: none. This reuses the `SUPABASE_SECRET_KEY` feature 3 and feature 10
already require.

**Critical test scenarios**:
- Happy path: a visitor opens `/demo` with no session, sees the first profile's results ordered
  by band, with the banner and no real posting link, verifies **AC-1**, **AC-7**, **AC-8**,
  **AC-10**.
- Cross profile: switching `?persona=` shows the same title and company scored differently,
  verifies **AC-5**, **AC-6**.
- Failure case: the seeded data cannot be read, the page shows a visible failure state, verifies
  **AC-12**.

**Decision**: Seed the results into a dedicated database table, read at request time through the
secret key client already reserved for this feature in spec 0001 binding rule 1, rather than
hardcoding them as a static fixture in code or seeding a full account across the real schema.
See `rationale.md` for the options weighed and why.

## Build plan

1. Write the migration creating `demo_result` (the columns above, including `sort_order`),
   enabling and forcing row level security, then `revoke all ... from anon, authenticated`
   followed by the load bearing `grant select ... to service_role`, then seeding all twelve rows
   for both profiles exactly as named in **Seed content**, each `description_snippet` a genuine
   partial excerpt. Satisfies **AC-3**, **AC-6**, **AC-7**.
2. Add a read function under `src/features/demo/` that calls `createSecretClient()`, wraps the
   query in `attempt()`, opens a `demo.read` span (`op: db.query`) as its first statement, and
   parses every returned row through a Zod schema (`band` checked against `BANDS`) before
   handing it on; an unparseable row is treated as a read failure. Register the span in
   `docs/observability/spans.md`. Satisfies **AC-2**, **AC-12**.
3. Build a dedicated demo card component, visually matching `ResultCard` and `ScoreCard`, using
   `SCORING_COPY.notMentionedHeading`/`.notMentionedCaption` verbatim for the not mentioned
   skills section, `salaryText()` from `src/lib/listing-format.ts` (passed `salaryCurrency:
   "USD"`) rather than a hand written formatter, the plain text "Applying is available once
   you sign in." where `ApplyControl` sits on the real card (never a disabled button), no
   "view posting" control, and no Adzuna or salary prediction attribution. No relative posted
   date, no sponsorship chip. Satisfies **AC-8**, **AC-9**.
4. Build `src/app/(marketing)/demo/page.tsx`: reuse `<EntryHeader navigation="none" />` for page
   chrome, the same prop value `/sign-in` and `/ui-preview` already pass so this page cannot
   accidentally ship the three `/`-only anchors, render the sample data banner, read the default
   profile's rows and render them in band order (tied by `sort_order`), and render the visible
   failure state, with a normal 200 response, when the read or the parse fails. This is the end
   to end thread proven for one profile before the second is wired in. Satisfies **AC-1**,
   **AC-10**, **AC-11**, **AC-12**.
5. Add the two profile switcher entries and wire the `persona` search param: parse it as a single
   string, treat anything other than the two known slugs (missing, empty, an array, or
   unrecognized) as the default, render the active profile as plain text with
   `aria-current="page"` and the other as a real link. Satisfies **AC-5**.
6. Update `src/features/entry-page/hero-section.tsx` to add a real link to `/demo` beside
   `DoorCta`, and update `src/features/entry-page/about-section.tsx` to move "a no sign in demo
   account" from `PLANNED` into the `WORKING` sentence, updating `about-section.test.ts` to
   match. Do this in the same pass that marks feature 31 `done` in `docs/scope/scope.md`:
   `about-section.tsx`'s own doc comment states that nothing may sit under `working` that the
   scope does not mark `done`, so splitting these two edits across separate commits would make
   that stated invariant briefly false. Satisfies **AC-13**.

## Consequences

**Positive**:
- A recruiter or visitor can see real looking, real reasoning behind a score without signing up
  and without costing anything.
- The entry page's last "planned" line becomes real, closing out the one claim `about-section.tsx`
  has been carrying since feature 6.
- The cross profile pairs make the product's actual claim, that the score depends on the person,
  visible rather than asserted in prose.

**Negative / tradeoffs**:
- The seeded reasoning text is hand written and will not track any future change to the real
  rubric (spec 0018 style band anchor work), so it can quietly drift from the real product's
  voice over time.
- This is one more permanent caller of the secret key client, a highly privileged path, recorded
  in a spec 0001 allow list that can now never shrink back to two without a spec change.
- The entry page's hero and status card copy now depend on this feature's wording; a later
  change to either has to remember the other exists.

**Neutral**:
- One new table, no relationships to the rest of the schema, no new environment variables.
- Feature 31 now covers materially less than its original scope row description. The fuller
  version (a real seeded account with applications and a dashboard) is recorded in
  `docs/scope/scope.md`'s Deferred section rather than built here.

## Follow-up

- [ ] Revisit the seeded reasoning text's wording whenever spec 0018's band anchors change, so
      the demo does not quietly drift from the real product's voice.

## Rationale

Reasoning and options: see `rationale.md`.
