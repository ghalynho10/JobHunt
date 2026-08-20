-- Spec 0001, follow-up: the scaffold's one real end to end thread.
--
-- This table exists to prove that a protected page can read a row through the
-- real server client, under a real policy, with a real session. It is not part
-- of the product. Feature 4 owns the real data model and removes this table.

create table public.scaffold_check (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  note text not null check (length(trim(note)) > 0),
  created_at timestamptz not null default now()
);

-- A foreign key without an index makes every policy check and every cascade
-- delete a sequential scan.
create index scaffold_check_user_id_idx on public.scaffold_check (user_id);

-- Two gates, not one. This project does not expose a new table to the Data API
-- automatically, so a role reaches the table only with an explicit grant, and
-- reaches a row only if a policy lets it.
--
-- `anon` is deliberately left with no grant at all. A request with no session
-- gets a hard permission denied rather than an empty result set, which is the
-- difference between failing visibly and returning something that reads as
-- success with nothing in it.
grant select on public.scaffold_check to authenticated;

-- The database is the guarantee, not a check in application code that someone
-- could forget to write.
alter table public.scaffold_check enable row level security;

-- Policies apply to the table owner too, so a bug running as the owner cannot
-- quietly read everything.
alter table public.scaffold_check force row level security;

-- `to authenticated` alone would be authentication without authorisation: it
-- checks the role and not the row. The ownership predicate in `using` is what
-- actually confines a user to their own rows.
--
-- `auth.uid()` is wrapped in a select so Postgres evaluates it once rather than
-- once per row.
create policy scaffold_check_select_own
  on public.scaffold_check
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- No insert, update or delete policy exists on purpose. Nothing in the product
-- writes this table; the seed does, as the owner during a reset. A table with
-- RLS enabled and no policy for an action denies that action outright.
