-- Spec 0024: the master resume, as an append only sequence of versions.
--
-- The resume is its own markdown document, not a view over the profile tables.
-- It is seeded once from the profile by the application and never synced back,
-- so nothing here references `profile_skill` or `work_experience`.
--
-- A ROW IS NEVER UPDATED AND NEVER DELETED (invariant 1). That is enforced here
-- by withholding the privilege, not by trusting application code to only ever
-- insert: `authenticated` is granted `select` and `insert` and nothing else, so
-- an update or a delete is refused at the privilege check before any policy is
-- even consulted (AC-11). The one way a row goes is the cascade from its
-- profile, which is what makes deleting a profile remove its whole history.

create table public.resume_version (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile (id) on delete cascade,
  -- Starts at 1 per profile and grows by one per save. The application computes
  -- it as the caller's `previousVersionNumber + 1`; the database does NOT, on
  -- purpose (spec 0024, State transitions). A trigger that picked the next
  -- number itself would let two racing saves both succeed as consecutive
  -- versions, which is exactly the silent overwrite AC-9 exists to refuse.
  --
  -- `> 0` also makes `previousVersionNumber = 0` a value no row can hold, so
  -- the very first save can never collide with anything.
  version_number integer not null check (version_number > 0),
  -- Markdown, stored as the reader wrote it with one exception: line endings
  -- arrive normalised to `\n` by the save parse in `saveResumeVersion()`
  -- (spec 0024, AC-3), so the text here is what a textarea reports when it is
  -- read back. Nothing else rewrites it. The check below is invariant 3: non
  -- blank after trimming mirrors `profile.full_name`'s own rule, and the
  -- ceiling is the same 20000 characters the Zod parse enforces, measured after
  -- that normalisation. It is `char_length`, so the limit counts characters the
  -- reader typed rather than bytes, which a multibyte name would otherwise eat
  -- into.
  content text not null
    check (length(btrim(content)) > 0 and char_length(content) <= 20000),
  -- The only timestamp: there is no `updated_at` because nothing is updated,
  -- and so no `set_updated_at` trigger either.
  created_at timestamptz not null default now(),
  -- THE WHOLE MECHANISM BEHIND AC-9. Two saves built against the same
  -- `previousVersionNumber` both try to claim the same next number, and only
  -- one can. The loser gets a `23505`, which the action turns into a named
  -- conflict carrying the newer text rather than a failure.
  --
  -- It is also the only index this table needs. It leads with `profile_id`, so
  -- it serves the foreign key and every policy check, and Postgres scans the
  -- same btree backwards for both reads the feature makes: the current version
  -- (`order by version_number desc limit 1`) and the version list newest first.
  constraint resume_version_profile_id_version_number_key
    unique (profile_id, version_number)
);

-- ---------------------------------------------------------------------------
-- Privileges: select and insert only
-- ---------------------------------------------------------------------------

-- No `update` and no `delete`, which is invariant 1 as a database property.
-- `profile_skill` set the precedent of granting only the actions a table
-- actually needs (spec 0003); this table needs one fewer than that.
--
-- REVOKE FIRST, THEN GRANT. Supabase's default privileges on `public` give
-- `authenticated` truncate, references, trigger and maintain on every new
-- table, and a `grant` only adds, so without this line those four stay
-- (`/check verify`, 2026-09-30, live ACL `authenticated=arDxtm`). Truncate
-- matters most: row level security never applies to it, so it would empty
-- every user's history at once.
revoke all on public.resume_version from authenticated;
grant select, insert on public.resume_version to authenticated;

-- Written even though this project does not expose a new table to the Data API
-- by default, for the same reason spec 0003 gives: "holds nothing by default" is
-- a setting somebody can change.
revoke all on public.resume_version from anon, service_role;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

-- `enable` turns policies on, `force` applies them to the table owner too
-- (invariant 4). Both, as on every other table.
alter table public.resume_version enable row level security;
alter table public.resume_version force row level security;

-- Two policies, not four. A policy for an action nothing is granted would be
-- dead code that still has to be read and trusted, and it would also be the
-- one line a later migration could "complete" by adding the grant beside it.

create policy resume_version_select_own
  on public.resume_version for select to authenticated
  using ((select auth.uid()) = profile_id);

create policy resume_version_insert_own
  on public.resume_version for insert to authenticated
  with check ((select auth.uid()) = profile_id);
