-- Spec 0003, AC-16: confirm the schema on PRODUCTION, read only.
--
-- WHY THIS IS A SEPARATE FILE FROM `verify.sql`.
--
-- `verify.sql` writes. It creates a throwaway auth user, exercises every
-- constraint against it, and deletes it again. That is right for the
-- development project, which already carries synthetic users on purpose. It is
-- wrong for production, which carries none by design, and a run that failed
-- partway could leave one behind.
--
-- This script only reads. It touches no row, creates nothing, and deletes
-- nothing. It answers the one question the drop gate actually turns on: is the
-- new schema really applied to production, with its isolation intact?
--
-- Returns ONE result set, because the Supabase SQL editor shows only the last
-- statement's result. Read the column top to bottom and look for `FAIL`.
--
-- Run this again AFTER the drop pull request too. The last line is the one that
-- proves AC-13 on production.

create or replace function pg_temp.inspect_schema() returns setof text
language plpgsql as $$
declare
  result text;
  n      bigint;
  r      record;
begin
  -- AC-1: the six tables exist.
  select string_agg(relname, ', ' order by relname) into result
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and relname in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-1  tables present: ' || coalesce(result, 'NONE');

  select count(*) into n
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and relname in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-1  table count (expect 6): ' || n::text
              || case when n = 6 then '   pass' else '   FAIL' end;

  -- AC-2: row level security enabled AND forced. Enabled alone leaves the
  -- table owner exempt, which is the whole point of forcing it.
  select string_agg(relname || '=' || relrowsecurity::text || '/' || relforcerowsecurity::text, ' ' order by relname)
  into result
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and relname in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-2  rls enabled/forced (all must be t/t): ' || coalesce(result, 'NONE');

  select count(*) into n
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and relname in ('profile','profile_skill','work_experience','job_preference','application','application_answer')
    and relrowsecurity and relforcerowsecurity;
  return next 'AC-2  tables with rls both enabled and forced (expect 6): ' || n::text
              || case when n = 6 then '   pass' else '   FAIL' end;

  -- AC-2: twenty three policies, four per table and three on profile_skill.
  select count(*) into n from pg_policies where schemaname = 'public'
    and tablename in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-2  policy count (expect 23): ' || n::text
              || case when n = 23 then '   pass' else '   FAIL' end;

  -- The `maintain` checks below need Postgres 17. On anything older this script
  -- errors at the first of them, which is loud, and the revision 2 migration
  -- (which names `maintain`) would fail there too.
  return next 'note  ' || version();

  -- AC-2 and AC-17: the privilege gate. `authenticated` and nothing else, and
  -- for `authenticated` exactly each table's own list. ALL EIGHT table
  -- privileges, not only the four a policy governs: the four line version of
  -- this check passed while `authenticated` still held Supabase's default
  -- truncate, references, trigger and maintain on all six (spec 0003 revision 2).
  for r in
    select ro.rolname,
           t.tbl,
           coalesce(nullif(concat_ws(',',
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'select') then 'select' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'insert') then 'insert' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'update') then 'update' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'delete') then 'delete' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'truncate') then 'truncate' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'references') then 'references' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'trigger') then 'trigger' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'maintain') then 'maintain' end), ''), 'NOTHING') as privs
    from (values ('profile'),('profile_skill'),('work_experience'),('job_preference'),('application'),('application_answer')) t(tbl)
    cross join (values ('anon'),('authenticated'),('service_role')) ro(rolname)
    order by ro.rolname, t.tbl
  loop
    return next 'AC-17 ' || rpad(r.rolname, 13) || ' on ' || rpad(r.tbl, 20) || ': ' || r.privs
      || case
           when r.rolname in ('anon','service_role') and r.privs = 'NOTHING' then '   pass'
           when r.rolname in ('anon','service_role') then '   FAIL, must hold nothing'
           when r.tbl = 'profile_skill' and r.privs = 'select,insert,delete' then '   pass'
           when r.tbl <> 'profile_skill' and r.privs = 'select,insert,update,delete' then '   pass'
           else '   FAIL'
         end;
  end loop;

  -- AC-19: the default that put those four there. Reads the `postgres` grantor
  -- row itself, not any table's result, and prints it raw so a run before the
  -- revision 2 migration and a run after it can be compared line for line.
  -- The `supabase_admin` row is platform managed and deliberately not checked.
  select coalesce(string_agg(d.defaclacl::text, ' '), 'NO ROW') into result
  from pg_default_acl d join pg_namespace nsp on nsp.oid = d.defaclnamespace
  where nsp.nspname = 'public' and d.defaclobjtype = 'r' and d.defaclrole = 'postgres'::regrole;
  return next 'AC-19 default acl, grantor postgres, tables in public: ' || result;

  select count(*) into n
  from pg_default_acl d join pg_namespace nsp on nsp.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where nsp.nspname = 'public' and d.defaclobjtype = 'r' and d.defaclrole = 'postgres'::regrole
    and a.grantee in ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole)
    and a.privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');
  return next 'AC-19 default grants of truncate, references, trigger or maintain to the three API roles (expect 0): '
              || n::text || case when n = 0 then '   pass' else '   FAIL' end;

  -- AC-4: each policy carries the clause its action permits.
  select count(*) into n
  from pg_policies where schemaname = 'public'
    and tablename in ('profile','profile_skill','work_experience','job_preference','application','application_answer')
    and ((cmd in ('SELECT','DELETE') and qual is not null and with_check is null)
      or (cmd = 'INSERT' and qual is null and with_check is not null)
      or (cmd = 'UPDATE' and qual is not null and with_check is not null));
  return next 'AC-4  policies carrying the right clause for their action (expect 23): ' || n::text
              || case when n = 23 then '   pass' else '   FAIL' end;

  -- AC-12: the shared trigger is attached to all five tables that carry updated_at.
  select count(*) into n
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  join pg_namespace nsp on nsp.oid = c.relnamespace
  where not t.tgisinternal and nsp.nspname = 'public'
    and c.relname in ('profile','work_experience','job_preference','application','application_answer')
    and t.tgname like '%set_updated_at';
  return next 'AC-12 updated_at triggers on the five tables that need one (expect 5): ' || n::text
              || case when n = 5 then '   pass' else '   FAIL' end;

  -- Production carries no synthetic users by design. This is a standing check,
  -- not a spec criterion: if it is ever above zero, something seeded fake data
  -- into production and that is worth knowing immediately.
  select count(*) into n from public.profile;
  return next 'note  profile rows on this database: ' || n::text
              || case when n = 0 then '   (expected on production, nobody has signed up yet)' else '' end;

  -- Names the database a saved output came from. Nothing else here does: every
  -- other line can read the same on development and production, and on
  -- 2026-10-06 and 2026-10-07 four saved outputs were byte identical in pairs,
  -- profile row count included, so which project each came from rested on the
  -- engineer's word. The auth user count told the two apart (jobhunt-dev 4,
  -- jobhunt-prod 5 on 2026-10-06). A count only, never an identity.
  select count(*) into n from auth.users;
  return next 'note  auth users on this database: ' || n::text;

  -- AC-13: the drop. BEFORE the second pull request this reads `still present`,
  -- which is correct and required. AFTER it, this must read `gone`.
  select case when to_regclass('public.scaffold_check') is null then 'gone' else 'still present' end into result;
  return next 'AC-13 scaffold_check on this database: ' || result
              || '   (must be `still present` before the drop pull request, `gone` after it)';
end;
$$;

select * from pg_temp.inspect_schema();
