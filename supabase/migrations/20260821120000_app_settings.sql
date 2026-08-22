-- Spec 0002: the global kill switch, as one row in Postgres.
--
-- Flipping this stops every gated call without a deploy and without a build.
-- It is operated from outside the application, in the Supabase dashboard, which
-- is the point: stopping the spend requires access to the deployment, never a
-- privilege inside the product. Feature 10 builds the gate that reads it.
--
-- THE STATEMENT ORDER BELOW IS THE CORRECTNESS, not a style. Each block says why
-- it sits where it does. Reordering them can produce a migration that passes
-- locally and is refused on the hosted projects.

create table public.app_settings (
  -- One row, enforced by the database rather than by convention. A second row
  -- would make "the kill switch" ambiguous, and the read would pick one.
  id smallint primary key default 1 check (id = 1),
  -- True means every gated call stops.
  kill_switch_enabled boolean not null default false,
  -- Maintained by the trigger below, so a flip made by hand in the dashboard is
  -- timestamped without anyone remembering to set it.
  updated_at timestamptz not null default now()
);

-- `security invoker` and an empty search_path: the function does nothing that
-- needs elevated rights, and an empty search_path means an object it names can
-- never be resolved out of a schema someone else controls. Every name inside is
-- therefore fully qualified.
create function public.app_settings_set_updated_at()
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

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row
  execute function public.app_settings_set_updated_at();

-- THE INSERT COMES BEFORE ROW LEVEL SECURITY IS FORCED, DELIBERATELY.
--
-- Forced row level security applies to the table owner too, and a table with
-- policies forced and zero policies denies an insert to any role that respects
-- them. Whether the hosted `postgres` role carries BYPASSRLS is not something
-- this repository can confirm; the local Docker `postgres` is a superuser, so a
-- migration that forced first and inserted second would pass locally and could
-- be refused on its first application to both hosted projects. Ordering it this
-- way removes the question instead of betting on the answer.
insert into public.app_settings (id, kill_switch_enabled)
values (1, false);

-- The database is the guarantee, not a check in application code.
alter table public.app_settings enable row level security;

-- Policies apply to the table owner too, so a bug running as the owner cannot
-- quietly read or change this row.
alter table public.app_settings force row level security;

-- NO POLICIES EXIST ON THIS TABLE, deliberately. Row level security on with no
-- policy denies every action to every role that respects policies, which is
-- every role except one carrying BYPASSRLS.

-- Two independent gates, the same pattern `scaffold_check` already uses. No
-- grant to `anon` and none to `authenticated`, so a query carrying a user's
-- token is refused at the privilege check before row level security is ever
-- consulted, and gets a hard permission denial rather than an empty result.
--
-- This project does not expose a new table to the Data API automatically, so
-- these two roles hold nothing here by default. The revoke is written anyway,
-- because "it holds nothing by default" is a setting somebody can change, and a
-- silently readable settings table is not a failure anyone would notice.
revoke all on public.app_settings from anon, authenticated;

-- THE ONE GRANT, AND IT IS LOAD BEARING.
--
-- BYPASSRLS bypasses policies but NOT table privileges. Those are two separate
-- checks in Postgres and only the first is bypassed, so the one intended reader
-- still needs to be named here. With new tables not exposed to the Data API,
-- this table starts with no privileges for any Data API role.
--
-- Without this grant the read is refused, and invariant 3 defines a failed read
-- as "switched on". So a missing grant would not look like a missing grant. It
-- would look like a kill switch stuck permanently on, in a deployed
-- application, with the visible failure rendering exactly as designed.
--
-- `service_role` is the role the secret key authenticates as, and the client
-- built with that key is constructible in exactly one file (binding rule 1).
grant select on public.app_settings to service_role;
