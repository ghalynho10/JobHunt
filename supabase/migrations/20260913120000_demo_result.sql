-- Spec 0021: the tables behind the public `/demo` page.
--
-- EDITED IN PLACE ON 2026-09-14, NOT SUPERSEDED BY A SECOND MIGRATION. The
-- original version of this file created a table and seeded twelve fabricated
-- rows into it. That design was reversed: a fabricated demo cannot be evidence
-- the ranking works, because a reader can reasonably assume the examples were
-- picked to flatter it. This file never applied to a hosted project, so there
-- is no live data to transform and nothing to roll back. If it ever applied to
-- a local or preview database, `pnpm db:reset` is required there.
--
-- WHAT IS HERE NOW: two empty tables and one function. Every row in
-- `demo_result` arrives from a refresh (AC-17) that runs two real Adzuna
-- searches, one per example candidate's own role, and scores every kept
-- listing for real against both candidates. Nothing on `/demo` is hand written any more except the two
-- candidate profiles themselves, which live in
-- `src/features/demo/personas.ts` and are shown on the page in full.
--
-- NO FOREIGN KEY AND NO RELATIONSHIP TO ANY OTHER TABLE. This data belongs to
-- nobody and is never joined to a real row. `demo_refresh` is metadata about
-- the last run rather than a parent of the result rows, so the two are not
-- related either; they are only ever written together, by the one function
-- below, in one transaction.
--
-- THE STATEMENT ORDER BELOW IS THE CORRECTNESS, not a style, and it is the same
-- order `20260821120000_app_settings.sql` uses for the same reasons. Each block
-- says why it sits where it does.

create table public.demo_result (
  id uuid primary key default gen_random_uuid(),

  -- Exactly two example profiles, checked by the database rather than by
  -- convention. A third slug arriving here would render on a page whose
  -- switcher does not know it exists.
  --
  -- `product-designer` became `frontend-engineer` on 2026-09-14: both personas
  -- are now scored for real against the same listings, and a contrasting pair
  -- of engineers gives a cleaner signal than an engineer against a designer.
  persona_slug text not null check (
    persona_slug in ('backend-engineer', 'frontend-engineer')
  ),

  -- Adzuna's own listing id (`Listing.sourceJobId`). IT IS WHAT PAIRS THE SAME
  -- REAL LISTING ACROSS BOTH PERSONAS' ROWS, which is the whole mechanism
  -- behind AC-16's compact "the other candidate scored this" line. Without it
  -- the two rows describing one posting could only be matched by comparing
  -- title and company text, which is a join on prose.
  source_job_id text not null check (length(trim(source_job_id)) > 0),

  -- THE TIEBREAK WITHIN ONE BAND (AC-7), and it is the order the refresh's kept
  -- walk kept this listing, 1 based. The walk alternates between the two
  -- searches, each in Adzuna's own order, so this interleaves them (backend 1,
  -- frontend 1, backend 2, ...) and neither query's listings cluster at the
  -- top of a band. Identical for both personas' copies of the same listing,
  -- because both personas score the same kept set. It has to be a column: every
  -- row is written by one transaction, so every `created_at` below shares a
  -- single `now()` and cannot order anything.
  sort_order smallint not null check (sort_order > 0),

  -- WHICH OF THE TWO FIXED QUERIES KEPT THIS LISTING (spec 0021, revised
  -- 2026-09-15). A posting both searches returned is kept once, under whichever
  -- search's turn reached it first. Without this column nothing stored says
  -- where a listing came from, so the walk could not be checked from the data
  -- and the stopping rule's own role count (a persona scored against its own
  -- role's postings) could not be read at all.
  search_title text not null check (
    search_title in ('backend engineer', 'frontend engineer')
  ),

  title text not null check (length(trim(title)) > 0),

  -- THE REAL EMPLOYER NAME, NEVER A FICTIONAL ONE (AC-3, AC-19), which is the
  -- exact reverse of what this column held before 2026-09-14. It renders
  -- unhidden and unaltered whatever band either persona gave the listing,
  -- `weak_match` and `not_a_match` included.
  company_name text not null check (length(trim(company_name)) > 0),

  location text,

  -- `numeric(12, 2)` AND NOT `integer`, matching `application.salary_min` and
  -- `salary_max` (`20260825162457_data_model.sql`). Adzuna returns a JSON
  -- number that is not guaranteed to be whole, and these figures are now
  -- Adzuna's own rather than hand written round numbers. Stored raw, with no
  -- rounding, and formatted at render.
  salary_min numeric(12, 2) check (salary_min > 0),
  salary_max numeric(12, 2) check (salary_max > 0),
  check (salary_min is null or salary_max is null or salary_max >= salary_min),

  -- THE CURRENCY IS A COLUMN NOW, not a constant in the read path. It used to
  -- be safe to assume one value because every row was hand written; a real
  -- Adzuna response carries whatever `CURRENCY_BY_COUNTRY[ADZUNA_COUNTRY]`
  -- resolved to at fetch time, and `salaryText()` returns `undefined` without
  -- it, so a figure with no currency would silently render no salary at all.
  salary_currency text check (length(trim(salary_currency)) > 0),

  -- The same pairing `application` already enforces: a figure without its
  -- currency, or a currency without a figure, is a half stored value.
  check ((salary_min is null and salary_max is null) = (salary_currency is null)),

  -- FROM `Listing.salaryIsPredicted`. It drives whether the `(estimated)`
  -- label and the Jobsworth attribution render together (AC-9). Spec 0013
  -- AC-7 exists because a predicted figure must never read like a stated one,
  -- and that distinction now applies here too: these figures are real Adzuna
  -- figures, and some of them are Adzuna's own estimates.
  salary_is_predicted boolean not null default false,

  -- ADZUNA'S OWN EXCERPT, EXACTLY AS RETURNED, truncated or not. Whether it is
  -- truncated is derived at render the same way `buildListingBlock()` derives
  -- it, so `SCORING_COPY.notMentionedCaption` ("This posting only shows part of
  -- the description...") is shown only when the stored snippet actually is
  -- partial. Before 2026-09-14 every snippet was hand written as a cut off
  -- excerpt to make that caption true by construction; now it is true or false
  -- per row and the render decides.
  description_snippet text,

  -- The same five values `src/features/scoring/rubric.ts`'s `BANDS` declares,
  -- restated here because the database cannot import them. The read path parses
  -- this column against `BANDS` itself, so a drift between the two is caught at
  -- the boundary rather than rendered.
  band text not null check (
    band in (
      'strong_match',
      'good_match',
      'possible_match',
      'weak_match',
      'not_a_match'
    )
  ),

  -- AFTER THE GROUNDING CHECK HAS ALREADY REMOVED ANY NAME IT FLAGGED. The
  -- flagged names go to `ungrounded_skills` below, so the card can render both
  -- the shortened list and the sentence explaining why it is shorter.
  matched_skills text[] not null default '{}',

  -- NAMED FOR THE PRODUCT'S OWN FIELD (`notMentionedSkills` in `rubric.ts`),
  -- never "missing". The two are different claims, and the whole reason the
  -- real card uses this wording is that an excerpt cannot prove a gap.
  not_mentioned_skills text[] not null default '{}',

  -- Spec 0019's `checkFitScore()` verdict, carried through so the demo card
  -- renders the flagged state the real card renders (`SCORING_COPY.removedSkills`
  -- and `.reasoningCaveat`, both reused verbatim).
  --
  -- A ROW REACHES THIS TABLE ONLY ONCE ITS CHECK HAS COME BACK CLEAN. A check
  -- that failed or was refused aborts the whole refresh (AC-17) rather than
  -- being written as if it had passed, so this column never has to represent an
  -- unfinished check, and an empty array here always means "checked, nothing
  -- flagged" rather than "never checked".
  ungrounded_skills text[] not null default '{}',

  -- The same 600 character ceiling the real reasoning field carries.
  reasoning text not null check (
    length(trim(reasoning)) > 0 and length(reasoning) <= 600
  ),

  created_at timestamptz not null default now(),

  -- ONE ROW PER LISTING PER PERSONA. It is what makes AC-16's pairing lookup
  -- unambiguous: a duplicated `source_job_id` under one persona would give the
  -- other persona's card two candidate bands to name and no rule for choosing.
  -- The refresh de-duplicates Adzuna's response by this id before scoring, and
  -- this constraint is what makes that de-duplication a guarantee rather than
  -- an intention.
  unique (persona_slug, source_job_id)
);

-- The read path asks for every row of both personas in one query, ordered by
-- `sort_order`, then groups in application code. The index carries the sort as
-- well as the filter, so the per persona subset is already in order.
create index demo_result_persona_sort_idx
  on public.demo_result (persona_slug, sort_order);

comment on table public.demo_result is
  'Spec 0021: real Adzuna listings scored for real against two fictional example candidates, for the public /demo page. Written only by replace_demo_results(), read by the secret key client only.';

-- The single row of metadata about the last refresh (AC-14, AC-15).
--
-- A SEPARATE TABLE RATHER THAN A COLUMN REPEATED ON EVERY RESULT ROW. The
-- search query and the refresh time are facts about the run, not about any one
-- listing, and repeating them sixteen times would let sixteen copies disagree.
create table public.demo_refresh (
  -- One row, enforced by the database rather than by convention, the same
  -- shape `app_settings` uses. A second row would make "the last refresh"
  -- ambiguous, and the read would pick one.
  id smallint primary key default 1 check (id = 1),

  -- BOTH QUERIES THE CURRENT RESULTS ANSWER, in the order they ran, shown on
  -- the page (AC-14) so a reader knows what searches these listings came back
  -- from rather than assuming they were chosen. Exactly two, each non blank:
  -- the same guarantee the single `search_title` column this replaced carried,
  -- kept per element rather than dropped with the change to an array.
  search_titles text[] not null check (
    cardinality(search_titles) = 2
    and length(trim(search_titles[1])) > 0
    and length(trim(search_titles[2])) > 0
  ),

  -- The location both queries share. Absent when the searches were
  -- nationwide, which both fixed queries are today.
  search_location text check (length(trim(search_location)) > 0),

  -- NULL UNTIL THE FIRST REFRESH EVER RUNS, which is exactly what AC-15's
  -- "results are not available yet" state reads. That state is a successful
  -- read of an expected emptiness, never a failure, and this nullable column
  -- is what lets the read path tell the two apart structurally instead of by
  -- inspecting an error.
  refreshed_at timestamptz
);

comment on table public.demo_refresh is
  'Spec 0021: one row describing the last /demo refresh, its two search queries and when it ran. refreshed_at null means no refresh has ever run.';

-- THE ATOMIC WRITE (AC-17). Every kept listing under both personas, plus the
-- refresh metadata, replaced in one transaction or not at all.
--
-- `security invoker`, DELIBERATELY, AND THIS IS A CHANGE FROM AN EARLIER DRAFT
-- THAT SAID `security definer`. These tables carry row level security enabled
-- and forced with zero policies. Whether a `security definer` function's owning
-- role carries BYPASSRLS in a hosted project is exactly the question
-- `20260821120000_app_settings.sql`'s own comment says this repository cannot
-- confirm, and betting on the answer is how a migration passes locally and is
-- refused on its first hosted application. `security invoker` sidesteps the
-- question: the only caller is the secret key client authenticating as
-- `service_role`, which already carries BYPASSRLS, so the caller's own
-- privilege is what does the work and this function needs nothing but the
-- ordinary table grants below.
--
-- An empty `search_path` means an object named inside can never be resolved out
-- of a schema someone else controls, so every name here is fully qualified.
--
-- IT IS CALLED ONLY AFTER EVERY SCORE AND EVERY GROUNDING CHECK FOR THE WHOLE
-- REFRESH HAS ALREADY COME BACK CLEAN AND ALLOWED, in application code. A mid
-- refresh failure never reaches this function at all, so the existing data is
-- left untouched by a run that did not finish.
create function public.replace_demo_results(
  p_results jsonb,
  -- Both fixed queries' titles, in the order the searches ran.
  p_search_titles text[],
  -- DEFAULTED, so the nationwide case is an omitted argument rather than an
  -- explicit null the caller has to type around. The generated TypeScript for a
  -- function argument carries no nullability, so without the default every
  -- caller would have to assert a null past a parameter typed `string`.
  p_search_location text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- WHOLESALE REPLACEMENT, NEVER A PER ROW UPDATE. The result set is whatever
  -- one refresh's two searches returned; merging a new run into an old one
  -- would leave the page showing listings from two different refreshes under
  -- one stated pair of queries, and would also accumulate rows indefinitely,
  -- which is the storage duration question Adzuna's terms do not address.
  --
  -- `where true` IS NOT REDUNDANT HERE, AND REMOVING IT BREAKS EVERY APPLICATION
  -- CALL TO THIS FUNCTION, LOCAL OR HOSTED. Supabase enables the `safeupdate`
  -- guard on the connection PostgREST serves requests over, which refuses any
  -- DELETE or UPDATE carrying no WHERE clause outright:
  -- `ERROR: DELETE requires a WHERE clause`. A bare
  -- `delete from public.demo_result;` therefore runs fine from psql as the
  -- superuser and fails every time the application calls this function, which
  -- is exactly how it was found, on the first real refresh, after the search
  -- and all 32 model calls had already been paid for. The predicate satisfies
  -- the guard without narrowing anything.
  delete from public.demo_result where true;

  insert into public.demo_result (
    persona_slug,
    source_job_id,
    sort_order,
    search_title,
    title,
    company_name,
    location,
    salary_min,
    salary_max,
    salary_currency,
    salary_is_predicted,
    description_snippet,
    band,
    matched_skills,
    not_mentioned_skills,
    ungrounded_skills,
    reasoning
  )
  select
    t.persona_slug,
    t.source_job_id,
    t.sort_order,
    t.search_title,
    t.title,
    t.company_name,
    t.location,
    t.salary_min,
    t.salary_max,
    t.salary_currency,
    t.salary_is_predicted,
    t.description_snippet,
    t.band,
    t.matched_skills,
    t.not_mentioned_skills,
    t.ungrounded_skills,
    t.reasoning
  from jsonb_to_recordset(p_results) as t(
    persona_slug text,
    source_job_id text,
    sort_order smallint,
    search_title text,
    title text,
    company_name text,
    location text,
    salary_min numeric(12, 2),
    salary_max numeric(12, 2),
    salary_currency text,
    salary_is_predicted boolean,
    description_snippet text,
    band text,
    matched_skills text[],
    not_mentioned_skills text[],
    ungrounded_skills text[],
    reasoning text
  );

  -- `insert ... on conflict do update` AND NEVER A BARE `update`. A bare update
  -- against a missing singleton row affects zero rows and reports nothing, which
  -- would leave `refreshed_at` stuck null beside sixteen freshly written result
  -- rows: the page would show AC-15's "not available yet" state while holding a
  -- full set of real results, and nothing anywhere would have failed.
  insert into public.demo_refresh (id, search_titles, search_location, refreshed_at)
  values (1, p_search_titles, p_search_location, pg_catalog.now())
  on conflict (id) do update
  set
    search_titles = excluded.search_titles,
    search_location = excluded.search_location,
    refreshed_at = excluded.refreshed_at;
end;
$$;

comment on function public.replace_demo_results(jsonb, text[], text) is
  'Spec 0021 AC-17: replaces every demo_result row and the demo_refresh singleton in one transaction. security invoker, so service_role own BYPASSRLS does the work rather than an elevated function owner.';

-- THE INSERT COMES BEFORE ROW LEVEL SECURITY IS FORCED, DELIBERATELY, and this
-- is `app_settings`'s reasoning applied unchanged: forced row level security
-- applies to the table owner too, and a table with policies forced and zero
-- policies denies an insert to any role that respects them. Whether the hosted
-- `postgres` role carries BYPASSRLS is not something this repository can
-- confirm, so a migration that forced first and inserted second could pass
-- locally and be refused on its first application to a hosted project.
--
-- `search_titles` CARRIES BOTH FIXED QUERIES' OWN TERMS rather than
-- placeholders, because the column is not nullable and the queries are
-- constants this feature already fixes (`src/features/demo/refresh.ts`).
-- `refreshed_at` stays null, which is the only field AC-15 reads, so this row
-- says "the queries we will run, and no run has happened yet" rather than
-- claiming results exist.
insert into public.demo_refresh (id, search_titles, search_location, refreshed_at)
values (1, array['backend engineer', 'frontend engineer'], null, null);

-- The database is the guarantee, not a check in application code.
alter table public.demo_result enable row level security;
alter table public.demo_refresh enable row level security;

-- Policies apply to the table owner too, so a bug running as the owner cannot
-- quietly read or change these rows.
alter table public.demo_result force row level security;
alter table public.demo_refresh force row level security;

-- NO POLICIES EXIST ON EITHER TABLE, deliberately, the same shape `app_settings`
-- uses. Row level security on with no policy denies every action to every role
-- that respects policies, which is every role except one carrying BYPASSRLS.
--
-- THIS IS WHAT SATISFIES AC-4 NOW THAT A WRITE PATH EXISTS. Before 2026-09-14
-- the guarantee was that no writer existed at all; the refresh is a writer, so
-- the guarantee is instead that a visitor holds no key which can reach these
-- tables, and no route a visitor's browser can reach triggers the refresh.

-- Two independent gates, the same pattern `app_settings` uses. No grant to
-- `anon` and none to `authenticated`, so a query carrying a user's token is
-- refused at the privilege check before row level security is ever consulted.
--
-- Written even though this project does not expose a new table to the Data API
-- automatically, because "it holds nothing by default" is a setting somebody
-- can change later.
revoke all on public.demo_result from anon, authenticated;
revoke all on public.demo_refresh from anon, authenticated;

-- THE GRANTS, AND THEY ARE LOAD BEARING.
--
-- BYPASSRLS bypasses policies but NOT table privileges. Those are two separate
-- checks in Postgres and only the first is bypassed, so the one intended caller
-- still has to be named here.
--
-- Without the `select` grants the read is refused and `/demo` renders its
-- failure state (AC-12) on every request, in a deployed application, looking
-- exactly as designed.
--
-- `insert` AND `delete` ON `demo_result` ARE NEW, for the refresh's wholesale
-- replace. `demo_refresh` needs `insert` as well as `update`, because
-- `replace_demo_results()` writes it with `insert ... on conflict do update`
-- rather than a bare update, for the reason stated at that statement: the
-- insert half is the branch that fires when the singleton row is missing, so
-- granting only `update` would make exactly the failure the `on conflict` shape
-- exists to prevent unreachable in one direction and a privilege error in the
-- other.
--
-- `service_role` is the role the secret key authenticates as, and the client
-- built with that key is constructible in exactly one file (binding rule 1).
grant select, insert, delete on public.demo_result to service_role;
grant select, insert, update on public.demo_refresh to service_role;

-- Execute is granted to PUBLIC by default. This function is `security invoker`,
-- so a caller without the table privileges above gets a privilege error rather
-- than a write; the revoke is written anyway, on the same reasoning the table
-- revokes above carry, so the reachable surface matches the intended one
-- instead of relying on a second check to refuse.
revoke execute on function public.replace_demo_results(jsonb, text[], text) from public;
grant execute on function public.replace_demo_results(jsonb, text[], text) to service_role;
