-- Spec 0003, revision 2 (AC-17, AC-19): tighten what `authenticated` holds on
-- the six user data tables, and close the default that put the extras there.
--
-- WHY. Supabase's default privileges on `public` (a `pg_default_acl` row for
-- grantor `postgres`, read live on 2026-10-05 as `authenticated=Dxtm/postgres`)
-- give `authenticated`, `anon` and `service_role` truncate, references,
-- trigger and maintain on every table `postgres` creates. The data model
-- migration only `grant`ed, and a `grant` never revokes, so `authenticated`
-- kept all four on all six tables beside its intended list. Truncate matters
-- most: row level security never applies to it.
--
-- One file, so one transaction: no reader ever sees a moment where
-- `authenticated` holds neither the old privileges nor the new ones.

-- ---------------------------------------------------------------------------
-- Part 1: each table back to its own list (AC-17)
-- ---------------------------------------------------------------------------

-- REVOKE FIRST, THEN GRANT, the sequence `resume_version` already proved
-- (`20260930120000_resume_version.sql`). Each table keeps its own list exactly:
-- `profile_skill` has no update path by design (spec 0003 AC-4), and a uniform
-- regrant would widen it under a migration whose purpose is tightening.
revoke all on public.profile from authenticated;
grant select, insert, update, delete on public.profile to authenticated;

revoke all on public.profile_skill from authenticated;
grant select, insert, delete on public.profile_skill to authenticated;

revoke all on public.work_experience from authenticated;
grant select, insert, update, delete on public.work_experience to authenticated;

revoke all on public.job_preference from authenticated;
grant select, insert, update, delete on public.job_preference to authenticated;

revoke all on public.application from authenticated;
grant select, insert, update, delete on public.application to authenticated;

revoke all on public.application_answer from authenticated;
grant select, insert, update, delete on public.application_answer to authenticated;

-- ---------------------------------------------------------------------------
-- Part 2: close the default at its source (AC-19)
-- ---------------------------------------------------------------------------

-- Touches no existing table. It changes only what a table `postgres` creates
-- from here on receives, which is every table this project's migrations make
-- (all twelve in `public` today are owned by `postgres`).
--
-- NOT A CLAIM THAT THE GAP IS CLOSED FOR EVERY CREATOR. A second, platform
-- managed row for grantor `supabase_admin` still grants all eight, and this
-- migration runs as `postgres`, which can neither alter nor become that role.
-- The drift guard (`test/integration/table-privilege-drift.test.ts`, AC-18) is
-- what catches a table made that way.
alter default privileges for role postgres in schema public
  revoke truncate, references, trigger, maintain on tables
  from anon, authenticated, service_role;
