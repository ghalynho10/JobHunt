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

  -- AC-2: the privilege gate. `authenticated` and nothing else.
  for r in
    select ro.rolname,
           t.tbl,
           coalesce(nullif(concat_ws(',',
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'select') then 'select' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'insert') then 'insert' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'update') then 'update' end,
             case when has_table_privilege(ro.rolname, 'public.' || t.tbl, 'delete') then 'delete' end), ''), 'NOTHING') as privs
    from (values ('profile'),('profile_skill'),('work_experience'),('job_preference'),('application'),('application_answer')) t(tbl)
    cross join (values ('anon'),('authenticated'),('service_role')) ro(rolname)
    order by ro.rolname, t.tbl
  loop
    return next 'AC-2  ' || rpad(r.rolname, 13) || ' on ' || rpad(r.tbl, 20) || ': ' || r.privs
      || case
           when r.rolname in ('anon','service_role') and r.privs = 'NOTHING' then '   pass'
           when r.rolname in ('anon','service_role') then '   FAIL, must hold nothing'
           when r.tbl = 'profile_skill' and r.privs = 'select,insert,delete' then '   pass'
           when r.tbl <> 'profile_skill' and r.privs = 'select,insert,update,delete' then '   pass'
           else '   FAIL'
         end;
  end loop;

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

  -- AC-13: the drop. BEFORE the second pull request this reads `still present`,
  -- which is correct and required. AFTER it, this must read `gone`.
  select case when to_regclass('public.scaffold_check') is null then 'gone' else 'still present' end into result;
  return next 'AC-13 scaffold_check on this database: ' || result
              || '   (must be `still present` before the drop pull request, `gone` after it)';
end;
$$;

select * from pg_temp.inspect_schema();
