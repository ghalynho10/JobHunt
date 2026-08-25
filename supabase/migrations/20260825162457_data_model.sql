-- Spec 0003: the six tables of the v1 loop.
--
-- The profile is the per user root, and every other table hangs off it by a
-- foreign key with `on delete cascade`. That chain is what makes deletion real:
-- removing an auth user, or a user removing their own profile, takes the whole
-- subtree with it (AC-5, AC-6).
--
-- EVERY RULE THAT MATTERS IS ENFORCED HERE RATHER THAN IN APPLICATION CODE,
-- because the database is the only thing no feature can forget to call. A caller
-- that never checks for a duplicate application still cannot create one.
--
-- This migration only ADDS. `scaffold_check` is dropped in a separate migration,
-- in a separate pull request, only after production is confirmed to be serving
-- the read that replaces it (spec 0002 invariant 1, carried into spec 0003's
-- build plan as AC-16). Vercel and GitHub Actions build the same commit in
-- parallel and nothing sequences them, so a drop arriving before the deploy that
-- stopped reading the table breaks running code with nothing to catch it.

-- ---------------------------------------------------------------------------
-- The shared timestamp trigger function
-- ---------------------------------------------------------------------------

-- One function for all five tables that carry `updated_at`, rather than one per
-- table. `app_settings` has its own copy from spec 0002 and keeps it; this is
-- the shared one every table from here on uses.
--
-- `security invoker` and an empty search_path: the function does nothing that
-- needs elevated rights, and an empty search_path means an object it names can
-- never be resolved out of a schema someone else controls. Every name inside is
-- therefore fully qualified.
--
-- Invariant 10: `updated_at` is never written by application code. A row changed
-- by hand in the Supabase dashboard is still timestamped correctly (AC-12).
create function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profile: the per user root
-- ---------------------------------------------------------------------------

create table public.profile (
  -- The primary key IS the auth user id, not a separate key with a unique
  -- constraint beside it. That buys two things at once: every policy on every
  -- table below is a direct comparison against `auth.uid()`, and one profile per
  -- user is guaranteed by the key itself (invariant 1), which cannot be dropped
  -- the way a constraint can.
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    check (length(trim(full_name)) > 0 and length(full_name) <= 200),
  -- Free text, as the user writes it. Feature 14 reads it for scoring.
  location text,
  summary text check (length(summary) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_set_updated_at
  before update on public.profile
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- profile_skill
-- ---------------------------------------------------------------------------

create table public.profile_skill (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile (id) on delete cascade,
  name text not null
    check (length(trim(name)) > 0 and length(name) <= 100),
  -- No `updated_at` and no update policy: a renamed skill is a delete plus an
  -- insert. There is nothing here to change in place.
  created_at timestamptz not null default now()
);

-- AC-10: the same profile cannot hold both `React` and `react`. Uniqueness is
-- per profile and ignores case, so it is an expression index rather than a
-- column constraint.
--
-- Its leading column is `profile_id`, so this one index also serves as the
-- foreign key index. A foreign key without an index makes every policy check and
-- every cascade delete a sequential scan.
create unique index profile_skill_profile_id_lower_name_idx
  on public.profile_skill (profile_id, lower(name));

-- ---------------------------------------------------------------------------
-- work_experience
-- ---------------------------------------------------------------------------

create table public.work_experience (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile (id) on delete cascade,
  company text not null
    check (length(trim(company)) > 0 and length(company) <= 200),
  title text not null
    check (length(trim(title)) > 0 and length(title) <= 200),
  location text,
  -- In v1.5 this is the source of truth the numeral check tests generated resume
  -- bullets against, so it is stored as the user wrote it and never summarised.
  description text check (length(description) <= 4000),
  -- AC-11: the day is pinned to 1. Nobody states an employment history to the
  -- day, and storing a real day would invent precision the user never gave.
  started_on date not null check (extract(day from started_on) = 1),
  -- Absent means the role is current. That is why there is no `is_current`
  -- boolean: two columns that can disagree about the same fact.
  ended_on date check (extract(day from ended_on) = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Invariant 7: a period never ends before it starts.
  constraint work_experience_period_ordered
    check (ended_on is null or ended_on >= started_on)
);

create index work_experience_profile_id_idx
  on public.work_experience (profile_id);

create trigger work_experience_set_updated_at
  before update on public.work_experience
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- job_preference: one row per profile
-- ---------------------------------------------------------------------------

create table public.job_preference (
  -- Primary key and foreign key in one column, so one row per user is true by
  -- construction rather than by a constraint someone has to remember.
  profile_id uuid primary key references public.profile (id) on delete cascade,
  desired_titles text[] not null default '{}',
  desired_locations text[] not null default '{}',
  -- A check constraint rather than an enum type, so adding a value later is an
  -- ordinary migration instead of an `alter type` that cannot run in a
  -- transaction on older Postgres. The cost is recorded in the spec's
  -- consequences: the generated TypeScript is `string`, so the allowed values are
  -- named again in Zod and the two can drift.
  remote_preference text not null default 'no_preference'
    check (remote_preference in ('on_site', 'hybrid', 'remote', 'no_preference')),
  -- Invariant 9: raw, never a formatted string. Formatting happens at render.
  minimum_pay numeric(12, 2),
  minimum_pay_currency text check (minimum_pay_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Invariant 5, AC-9: an amount never exists without its currency, so nothing
  -- downstream can render a bare number as money.
  constraint job_preference_pay_paired
    check ((minimum_pay is null) = (minimum_pay_currency is null))
);

create trigger job_preference_set_updated_at
  before update on public.job_preference
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- application: the only place a job persists
-- ---------------------------------------------------------------------------

create table public.application (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile (id) on delete cascade,
  -- One source in v1. A check rather than an enum, same reasoning as
  -- `remote_preference` above.
  source text not null check (source in ('adzuna')),
  source_job_id text not null check (length(trim(source_job_id)) > 0),
  -- Snapshots. Search results deliberately do not persist, so these columns are
  -- the only copy of the listing that survives the posting being taken down.
  job_title text not null check (length(trim(job_title)) > 0),
  company_name text not null check (length(trim(company_name)) > 0),
  job_location text,
  job_url text not null check (length(trim(job_url)) > 0),
  job_description text,
  salary_min numeric(12, 2),
  salary_max numeric(12, 2),
  salary_currency text check (salary_currency ~ '^[A-Z]{3}$'),
  posted_at timestamptz,
  -- Distinct from `created_at` on purpose, so a later feature can record an
  -- application made elsewhere without lying about when the row was written.
  applied_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- AC-7, invariant 4: the second apply to the same listing fails at the
  -- database, so it holds even for a caller that forgot to check first. Its
  -- leading column is `profile_id`, so it doubles as the foreign key index.
  constraint application_profile_source_job_key
    unique (profile_id, source, source_job_id),
  -- PLAIN, over exactly these two columns, never partial and never over an
  -- expression. A composite foreign key can only reference a real unique
  -- constraint or unique index, and this exists for no other reason than to be
  -- the target of `application_answer`'s composite foreign key below.
  constraint application_id_profile_id_key unique (id, profile_id),
  -- AC-9: currency present exactly when either figure is present. A single
  -- stated figure stays a single figure, with the other absent.
  constraint application_salary_currency_paired
    check ((salary_min is null and salary_max is null) = (salary_currency is null)),
  -- Invariant 6: a range never has its top below its bottom.
  constraint application_salary_range_ordered
    check (salary_min is null or salary_max is null or salary_max >= salary_min)
);

create trigger application_set_updated_at
  before update on public.application
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- application_answer
-- ---------------------------------------------------------------------------

create table public.application_answer (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null,
  -- DENORMALISED ON PURPOSE, and it is load bearing (invariant 8). Without it
  -- every policy on this table would need a subquery into `application` on each
  -- row, and an answer could in principle name an application belonging to
  -- someone else. With it, the composite foreign key below makes the database
  -- itself refuse a mismatch, and the policy stays the same plain comparison
  -- against the caller as every other table.
  profile_id uuid not null,
  -- No fixed value list yet. Feature 20 owns the question set and adds the check
  -- then, against a table that is still empty.
  question_key text not null check (length(trim(question_key)) > 0),
  answer text not null
    check (length(trim(answer)) > 0 and length(answer) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint application_answer_application_fkey
    foreign key (application_id, profile_id)
    references public.application (id, profile_id) on delete cascade,
  -- One answer per question, so an edit touches one row rather than appending.
  constraint application_answer_question_key
    unique (application_id, question_key)
);

-- The unique constraint above leads with `application_id`, not `profile_id`, and
-- `profile_id` is the column every policy on this table compares. It needs its
-- own index.
create index application_answer_profile_id_idx
  on public.application_answer (profile_id);

create trigger application_answer_set_updated_at
  before update on public.application_answer
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges: two gates, not one
-- ---------------------------------------------------------------------------

-- A role reaches a table only with an explicit grant, and reaches a row only if
-- a policy lets it. Table privileges and row level security are separate checks
-- in Postgres, and only the second is bypassed by BYPASSRLS.
--
-- AC-2: `authenticated` is the only role named. A request carrying no session is
-- therefore refused at the privilege check with a hard permission denial, not an
-- empty result set that reads like success.
--
-- `service_role` is deliberately absent too. Spec 0002's task 10 proved on the
-- hosted project that the Data API exposure setting withholds privileges from
-- `service_role` as well, so a role that is not named here genuinely holds
-- nothing. Nothing in this feature belongs in `src/lib/supabase/secret.ts`, and
-- binding rule 1 is untouched.
grant select, insert, update, delete on public.profile to authenticated;
grant select, insert, delete on public.profile_skill to authenticated;
grant select, insert, update, delete on public.work_experience to authenticated;
grant select, insert, update, delete on public.job_preference to authenticated;
grant select, insert, update, delete on public.application to authenticated;
grant select, insert, update, delete on public.application_answer to authenticated;

-- Written even though this project does not expose a new table to the Data API
-- automatically, so these roles hold nothing here by default. The same reasoning
-- as `app_settings`: "it holds nothing by default" is a setting somebody can
-- change, and six silently readable personal data tables is not a failure
-- anyone would notice from the outside.
revoke all on public.profile from anon, service_role;
revoke all on public.profile_skill from anon, service_role;
revoke all on public.work_experience from anon, service_role;
revoke all on public.job_preference from anon, service_role;
revoke all on public.application from anon, service_role;
revoke all on public.application_answer from anon, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- `enable` turns policies on. `force` applies them to the table owner too, so a
-- bug running as the owner cannot quietly read or change everything (invariant
-- 2). Both are needed; enable alone leaves the owner exempt.
alter table public.profile enable row level security;
alter table public.profile force row level security;
alter table public.profile_skill enable row level security;
alter table public.profile_skill force row level security;
alter table public.work_experience enable row level security;
alter table public.work_experience force row level security;
alter table public.job_preference enable row level security;
alter table public.job_preference force row level security;
alter table public.application enable row level security;
alter table public.application force row level security;
alter table public.application_answer enable row level security;
alter table public.application_answer force row level security;

-- ---------------------------------------------------------------------------
-- Policies: twenty three, and the clause differs by action
-- ---------------------------------------------------------------------------

-- THE CLAUSE IS THE CORRECTNESS, not boilerplate. Postgres refuses the wrong
-- one outright:
--
--   select, delete -> `using` only. It decides which existing rows are visible.
--   insert         -> `with check` only. There is no existing row to test.
--   update         -> BOTH, and it needs both. `using` decides which rows may be
--                     changed, `with check` decides what they may be changed
--                     into. Omitting `with check` on an update would let a user
--                     move their own row under another user's profile (AC-4).
--
-- `auth.uid()` is wrapped in a select so Postgres evaluates it once rather than
-- once per row.

-- profile: the predicate compares against `id`, since the key is the user id.

create policy profile_select_own
  on public.profile for select to authenticated
  using ((select auth.uid()) = id);

create policy profile_insert_own
  on public.profile for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profile_update_own
  on public.profile for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- AC-6: a user can delete their own profile, and the cascade removes the rest.
-- Deletion is a real capability here, not an exception, so the privacy notice in
-- feature 21 can describe removal truthfully rather than carefully.
create policy profile_delete_own
  on public.profile for delete to authenticated
  using ((select auth.uid()) = id);

-- profile_skill: three policies, not four. It has no update path by design, and
-- a policy for an action nothing performs is dead code that still has to be read
-- and trusted.

create policy profile_skill_select_own
  on public.profile_skill for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy profile_skill_insert_own
  on public.profile_skill for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy profile_skill_delete_own
  on public.profile_skill for delete to authenticated
  using ((select auth.uid()) = profile_id);

-- work_experience

create policy work_experience_select_own
  on public.work_experience for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy work_experience_insert_own
  on public.work_experience for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy work_experience_update_own
  on public.work_experience for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy work_experience_delete_own
  on public.work_experience for delete to authenticated
  using ((select auth.uid()) = profile_id);

-- job_preference

create policy job_preference_select_own
  on public.job_preference for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy job_preference_insert_own
  on public.job_preference for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy job_preference_update_own
  on public.job_preference for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy job_preference_delete_own
  on public.job_preference for delete to authenticated
  using ((select auth.uid()) = profile_id);

-- application

create policy application_select_own
  on public.application for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy application_insert_own
  on public.application for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy application_update_own
  on public.application for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy application_delete_own
  on public.application for delete to authenticated
  using ((select auth.uid()) = profile_id);

-- application_answer: the same plain comparison as every other table, which is
-- exactly what the denormalised `profile_id` bought. The composite foreign key
-- guarantees that column agrees with the parent application's owner, so the
-- policy and the schema cannot disagree about who owns an answer.

create policy application_answer_select_own
  on public.application_answer for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy application_answer_insert_own
  on public.application_answer for insert to authenticated
  with check ((select auth.uid()) = profile_id);

create policy application_answer_update_own
  on public.application_answer for update to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

create policy application_answer_delete_own
  on public.application_answer for delete to authenticated
  using ((select auth.uid()) = profile_id);
