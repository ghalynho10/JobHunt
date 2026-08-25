-- Spec 0003, build plan task 6: prove the schema against a HOSTED project.
-- Paste this whole file into the Supabase SQL editor and run it.
--
-- IT RETURNS ONE RESULT SET. The Supabase SQL editor only ever shows the last
-- statement's result, so every check below is collected by a single function
-- and returned in one go. Read the `result` column top to bottom: every line
-- must begin with `pass` or be a stated fact. Any line beginning `FAIL` is a
-- real failure.
--
-- SAFE BY CONSTRUCTION, and it does NOT rely on a rollback:
--   * Every write that is meant to succeed happens under a throwaway user
--     created at the start (`dddddddd-...`), never under dev-one or dev-two.
--   * Every write that is meant to be refused rolls itself back, because a
--     failed statement inside a plpgsql exception block undoes only itself.
--   * The last cascade test deletes the throwaway auth user, which removes
--     everything this script created. The final lines confirm the fixtures
--     are untouched.

-- Runs a statement that MUST be refused, and reports which error refused it,
-- so a check cannot pass for the wrong reason.
create or replace function pg_temp.refused(label text, stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'FAIL  accepted: ' || label;
exception when others then
  return 'pass  ' || label || '  [' || sqlstate || ']';
end;
$$;

create or replace function pg_temp.allowed(label text, stmt text) returns text
language plpgsql as $$
begin
  execute stmt;
  return 'pass  ' || label;
exception when others then
  return 'FAIL  refused: ' || label || '  [' || sqlstate || ' ' || left(sqlerrm, 90) || ']';
end;
$$;

create or replace function pg_temp.subtree(uid uuid) returns bigint language sql as $$
  select (select count(*) from public.profile where id = uid)
       + (select count(*) from public.profile_skill where profile_id = uid)
       + (select count(*) from public.work_experience where profile_id = uid)
       + (select count(*) from public.job_preference where profile_id = uid)
       + (select count(*) from public.application where profile_id = uid)
       + (select count(*) from public.application_answer where profile_id = uid);
$$;

-- Becomes a signed in user for the statements that follow, the same way the
-- Data API does: the `authenticated` role, plus a claim `auth.uid()` reads.
create or replace function pg_temp.become(uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
end;
$$;

create or replace function pg_temp.become_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

create or replace function pg_temp.sweep() returns setof text
language plpgsql as $$
declare
  result  text;
  u_one   uuid := '11111111-1111-1111-1111-111111111111';
  u_two   uuid := '22222222-2222-2222-2222-222222222222';
  u_three uuid := '33333333-3333-4333-8333-333333333333';
  u_tmp   uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  a_tmp   uuid := 'adddddd0-dddd-4ddd-8ddd-dddddddddddd';
  n       bigint;
  r       record;
begin
  -- =========================================================================
  -- Setup: the throwaway user every successful write below happens under.
  -- =========================================================================
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', u_tmp, 'authenticated', 'authenticated',
    'sweep-throwaway@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );
  insert into public.profile (id, full_name) values (u_tmp, 'Throwaway');
  return next 'setup  throwaway user and profile created';

  -- =========================================================================
  -- AC-1  the six tables exist
  -- =========================================================================
  select string_agg(relname, ', ' order by relname) into result
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and relname in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-1  tables: ' || coalesce(result, 'NONE');

  -- =========================================================================
  -- AC-2  row level security enabled AND forced, policy count, privileges
  -- =========================================================================
  select string_agg(relname || '=' || relrowsecurity::text || '/' || relforcerowsecurity::text, ' ' order by relname)
  into result
  from pg_class c join pg_namespace nsp on nsp.oid = c.relnamespace
  where nsp.nspname = 'public' and c.relkind = 'r'
    and relname in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-2  rls enabled/forced (all must be t/t): ' || coalesce(result, 'NONE');

  select count(*) into n from pg_policies where schemaname = 'public'
    and tablename in ('profile','profile_skill','work_experience','job_preference','application','application_answer');
  return next 'AC-2  policy count (expect 23): ' || n::text
              || case when n = 23 then '  pass' else '  FAIL' end;

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

  -- =========================================================================
  -- AC-4  each policy carries the clause its action permits
  -- =========================================================================
  for r in
    select tablename, cmd, (qual is not null) as has_using, (with_check is not null) as has_check
    from pg_policies where schemaname = 'public'
      and tablename in ('profile','profile_skill','work_experience','job_preference','application','application_answer')
    order by tablename, cmd
  loop
    return next 'AC-4  ' || rpad(r.tablename || '.' || r.cmd, 34)
      || 'using=' || r.has_using::text || ' with_check=' || r.has_check::text
      || case
           when r.cmd in ('SELECT','DELETE') and r.has_using and not r.has_check then '   pass'
           when r.cmd = 'INSERT' and not r.has_using and r.has_check then '   pass'
           when r.cmd = 'UPDATE' and r.has_using and r.has_check then '   pass'
           else '   FAIL, wrong clause for this action'
         end;
  end loop;

  -- =========================================================================
  -- AC-3  isolation: each user sees only their own chain
  -- =========================================================================
  perform pg_temp.become(u_one);
  select coalesce(string_agg(full_name, ','), 'NOTHING') into result from public.profile;
  return next 'AC-3  dev-one sees: ' || result
              || case when result = 'Dev One' then '   pass' else '   FAIL' end;

  perform pg_temp.become(u_two);
  select coalesce(string_agg(full_name, ','), 'NOTHING') into result from public.profile;
  return next 'AC-3  dev-two sees: ' || result
              || case when result = 'Dev Two' then '   pass' else '   FAIL' end;

  perform pg_temp.become(u_three);
  select coalesce(string_agg(full_name, ','), 'NOTHING') into result from public.profile;
  return next 'AC-3  dev-three, who has no profile, sees: ' || result
              || case when result = 'NOTHING' then '   pass' else '   FAIL' end;

  -- =========================================================================
  -- AC-4  writes confined to your own chain
  -- =========================================================================
  perform pg_temp.become(u_one);

  return next pg_temp.refused('AC-4  dev-one inserts under DEV-TWO''s profile',
    $q$ insert into public.work_experience (profile_id, company, title, started_on)
        values ('22222222-2222-2222-2222-222222222222', 'Sneaky Co', 'Engineer', '2024-01-01') $q$);

  -- The trap: this is not an error, it changes ZERO rows, because `using`
  -- hides the row. Assert the count, never merely the absence of an exception.
  with changed as (
    update public.profile set full_name = 'Taken Over' where id = u_two returning 1
  )
  select count(*) into n from changed;
  return next 'AC-4  rows dev-one could change on dev-two (expect 0): ' || n::text
              || case when n = 0 then '   pass' else '   FAIL' end;

  perform pg_temp.become(u_tmp);

  return next pg_temp.allowed('AC-4  throwaway inserts under OWN profile',
    $q$ insert into public.work_experience (id, profile_id, company, title, started_on)
        values ('edddddd0-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Test Co', 'Engineer', '2024-01-01') $q$);

  return next pg_temp.refused('AC-4  throwaway MOVES own row under dev-two (update with check)',
    $q$ update public.work_experience set profile_id = '22222222-2222-2222-2222-222222222222'
        where id = 'edddddd0-dddd-4ddd-8ddd-dddddddddddd' $q$);

  -- A request carrying no session is refused at the privilege check.
  execute 'set local role anon';
  return next pg_temp.refused('AC-2  anon reads profile (expect 42501 permission denied)',
    $q$ select 1 from public.profile $q$);

  -- =========================================================================
  -- AC-7, AC-9, AC-10, AC-11  the constraint sweep, under the throwaway user
  -- =========================================================================
  perform pg_temp.become(u_tmp);

  return next pg_temp.allowed('AC-7  a first application',
    $q$ insert into public.application (id, profile_id, source, source_job_id, job_title, company_name, job_url)
        values ('adddddd0-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-1', 'Engineer', 'Test Co', 'https://example.test/1') $q$);

  return next pg_temp.refused('AC-7  the SAME listing applied to twice',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-1', 'Engineer', 'Test Co', 'https://example.test/1') $q$);

  return next pg_temp.refused('AC-1  an unknown source value',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'linkedin', 'sweep-9', 'E', 'C', 'https://example.test/9') $q$);

  return next pg_temp.refused('AC-9  an amount with NO currency',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url, salary_min)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-3', 'E', 'C', 'https://example.test/3', 50000) $q$);

  return next pg_temp.refused('AC-9  a currency with NO amount',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url, salary_currency)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-4', 'E', 'C', 'https://example.test/4', 'EUR') $q$);

  return next pg_temp.refused('AC-9  a top BELOW its bottom',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url, salary_min, salary_max, salary_currency)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-5', 'E', 'C', 'https://example.test/5', 90000, 50000, 'EUR') $q$);

  return next pg_temp.allowed('AC-9  a SINGLE stated figure, the other absent',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url, salary_min, salary_currency)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-6', 'E', 'C', 'https://example.test/6', 60000, 'EUR') $q$);

  return next pg_temp.refused('AC-9  a lowercase currency code',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url, salary_min, salary_currency)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'adzuna', 'sweep-7', 'E', 'C', 'https://example.test/7', 60000, 'eur') $q$);

  return next pg_temp.refused('AC-9  job_preference amount with NO currency',
    $q$ insert into public.job_preference (profile_id, minimum_pay)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 40000) $q$);

  return next pg_temp.refused('AC-1  job_preference unknown remote_preference',
    $q$ insert into public.job_preference (profile_id, remote_preference)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'from_the_moon') $q$);

  return next pg_temp.allowed('AC-10 the skill React',
    $q$ insert into public.profile_skill (profile_id, name)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'React') $q$);
  return next pg_temp.refused('AC-10 the skill react, same profile, different case',
    $q$ insert into public.profile_skill (profile_id, name)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'react') $q$);
  return next pg_temp.refused('AC-10 a blank skill name',
    $q$ insert into public.profile_skill (profile_id, name)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '   ') $q$);

  return next pg_temp.refused('AC-11 a start date not on the first',
    $q$ insert into public.work_experience (profile_id, company, title, started_on)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'C', 'E', '2024-01-15') $q$);
  return next pg_temp.refused('AC-11 an end date not on the first',
    $q$ insert into public.work_experience (profile_id, company, title, started_on, ended_on)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'C', 'E', '2024-01-01', '2024-06-15') $q$);
  return next pg_temp.refused('AC-11 an end BEFORE its start',
    $q$ insert into public.work_experience (profile_id, company, title, started_on, ended_on)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'C', 'E', '2024-06-01', '2024-01-01') $q$);
  return next pg_temp.allowed('AC-11 an absent end date, meaning current',
    $q$ insert into public.work_experience (profile_id, company, title, started_on)
        values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Current Co', 'E', '2025-03-01') $q$);

  -- =========================================================================
  -- AC-8  the foreign keys, as the OWNER
  -- =========================================================================
  -- Run as `authenticated` the insert policy denies these first, and they would
  -- pass without ever exercising the foreign key.
  perform pg_temp.become_owner();

  return next pg_temp.refused('AC-8  an application naming a profile that does not exist',
    $q$ insert into public.application (profile_id, source, source_job_id, job_title, company_name, job_url)
        values ('99999999-9999-4999-8999-999999999999', 'adzuna', 'sweep-2', 'E', 'C', 'https://example.test/2') $q$);

  return next pg_temp.refused('AC-8  an answer naming an application owned by someone else',
    $q$ insert into public.application_answer (application_id, profile_id, question_key, answer)
        values ('adddddd0-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'why', 'Not mine.') $q$);

  return next pg_temp.allowed('AC-8  an answer naming its own application',
    $q$ insert into public.application_answer (application_id, profile_id, question_key, answer)
        values ('adddddd0-dddd-4ddd-8ddd-dddddddddddd', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'why', 'Fixture.') $q$);

  -- =========================================================================
  -- AC-12  updated_at belongs to the trigger, not to the caller
  -- =========================================================================
  update public.profile
    set full_name = 'Throwaway Edited', updated_at = '2000-01-01T00:00:00Z'
    where id = u_tmp;
  select case when updated_at = now() then 'pass' else 'FAIL' end into result
  from public.profile where id = u_tmp;
  return next 'AC-12 the trigger overwrote the caller''s updated_at: ' || result;

  -- =========================================================================
  -- AC-6  a user deletes their OWN profile, the auth account survives
  -- =========================================================================
  -- Not a fixed number: the constraint sweep above legitimately left several
  -- rows behind under this user. What matters is that there ARE rows, so the
  -- delete that follows has something to prove.
  n := pg_temp.subtree(u_tmp);
  return next 'AC-6  throwaway rows across the six BEFORE (must be above 0): ' || n::text
              || case when n > 0 then '   pass' else '   FAIL' end;

  perform pg_temp.become(u_tmp);
  delete from public.profile where id = u_tmp;
  perform pg_temp.become_owner();

  n := pg_temp.subtree(u_tmp);
  select count(*) into result from auth.users where id = u_tmp;
  return next 'AC-6  after deleting own profile, rows (expect 0): ' || n::text
              || ', auth account (expect 1): ' || result
              || case when n = 0 and result = '1' then '   pass' else '   FAIL' end;

  -- =========================================================================
  -- AC-5  deleting the AUTH USER removes the whole subtree
  -- =========================================================================
  insert into public.profile (id, full_name) values (u_tmp, 'Throwaway');
  insert into public.profile_skill (profile_id, name) values (u_tmp, 'Postgres');
  insert into public.work_experience (profile_id, company, title, started_on) values (u_tmp, 'C', 'E', '2024-01-01');
  insert into public.job_preference (profile_id, minimum_pay, minimum_pay_currency) values (u_tmp, 55000, 'EUR');
  insert into public.application (id, profile_id, source, source_job_id, job_title, company_name, job_url)
    values (a_tmp, u_tmp, 'adzuna', 'sweep-cascade', 'E', 'C', 'https://example.test/c');
  insert into public.application_answer (application_id, profile_id, question_key, answer)
    values (a_tmp, u_tmp, 'why', 'Fixture.');
  return next 'AC-5  throwaway rows rebuilt across the six (expect 6): ' || pg_temp.subtree(u_tmp)::text;

  delete from auth.users where id = u_tmp;

  n := pg_temp.subtree(u_tmp);
  return next 'AC-5  after deleting the auth user, rows (expect 0): ' || n::text
              || case when n = 0 then '   pass' else '   FAIL' end;

  -- =========================================================================
  -- Cleanup confirmation: the fixtures must be exactly as they were.
  -- =========================================================================
  select count(*) into result from auth.users where id = u_tmp;
  return next 'clean  throwaway auth rows left (expect 0): ' || result;

  select count(*) into result from public.profile;
  return next 'clean  profile rows (expect 2, dev-one and dev-two): ' || result;

  select full_name into result from public.profile where id = u_one;
  return next 'clean  dev-one is still: ' || coalesce(result, 'MISSING')
              || case when result = 'Dev One' then '   pass' else '   FAIL' end;

  select full_name into result from public.profile where id = u_two;
  return next 'clean  dev-two is still: ' || coalesce(result, 'MISSING')
              || case when result = 'Dev Two' then '   pass' else '   FAIL' end;

  select count(*) into result from public.application;
  return next 'clean  application rows left behind (expect 0): ' || result;
end;
$$;

-- The one statement whose result the editor shows.
select * from pg_temp.sweep();
