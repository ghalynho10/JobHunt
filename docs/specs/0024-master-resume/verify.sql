-- Spec 0024, build plan step 11: prove `resume_version` against a HOSTED project.
-- Paste this whole file into the Supabase SQL editor for jobhunt-dev and run it.
--
-- IT RETURNS ONE RESULT SET. The SQL editor only shows the last statement's
-- result, so every check is collected by one function and returned together.
-- Read the `sweep` column top to bottom: every check line ends in `pass`, or
-- is a stated fact. Any line containing `FAIL` is a real failure.
--
-- SAFE BY CONSTRUCTION, the same shape as spec 0003's verify.sql, and it does
-- NOT rely on a rollback:
--   * Every write meant to succeed happens under a throwaway user created at
--     the start (`eeeeeeee-...`), never under a real account.
--   * Every write meant to be refused undoes only itself, because a failed
--     statement inside a plpgsql exception block rolls back just that block.
--   * The cascade check deletes the throwaway auth user, which removes the
--     profile and every resume row this script created. The last lines confirm
--     nothing else changed.
--
-- WHAT IT PROVES: AC-11 (row level security enabled and forced, two policies,
-- `authenticated` holding select and insert and nothing else, `anon` and
-- `service_role` holding nothing, no update or delete) and AC-9's constraint
-- (a duplicate `(profile_id, version_number)` refused with 23505), plus the
-- content and version number checks and the cascade from a deleted profile.

-- Runs a statement that MUST be refused with one specific SQLSTATE, so a check
-- cannot pass because the statement failed for some other reason.
create or replace function pg_temp.refused_with(label text, stmt text, expected text)
returns text language plpgsql as $$
begin
  execute stmt;
  return 'FAIL  accepted: ' || label;
exception when others then
  if sqlstate = expected then
    return 'pass  ' || label || '  [' || sqlstate || ']';
  end if;
  return 'FAIL  refused for the wrong reason: ' || label || '  [' || sqlstate
         || ' ' || left(sqlerrm, 90) || '], expected ' || expected;
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

-- Becomes a signed in user, the way the Data API does: the `authenticated`
-- role plus a claim that `auth.uid()` reads.
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
  u_tmp    uuid := 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  held     text;
  n        bigint;
  rows_before bigint;
  rel      record;
begin
  -- =========================================================================
  -- Facts first: the table exists, and how many rows it held before we start.
  -- =========================================================================
  select count(*) into rows_before from public.resume_version;
  return next 'fact  resume_version rows before the sweep: ' || rows_before::text;

  -- =========================================================================
  -- AC-11: row level security, policies, privileges.
  -- =========================================================================
  select relrowsecurity, relforcerowsecurity into rel
    from pg_class where oid = 'public.resume_version'::regclass;
  return next 'AC-11 row level security enabled and forced: '
              || rel.relrowsecurity::text || ' ' || rel.relforcerowsecurity::text
              || case when rel.relrowsecurity and rel.relforcerowsecurity then '   pass' else '   FAIL' end;

  select string_agg(cmd, ',' order by cmd) into held
    from pg_policies where schemaname = 'public' and tablename = 'resume_version';
  return next 'AC-11 policies (expect INSERT,SELECT): ' || coalesce(held, 'none')
              || case when held = 'INSERT,SELECT' then '   pass' else '   FAIL' end;

  -- Every table privilege Postgres 17 has, not only the four a policy could
  -- govern: Supabase's default privileges grant the other four to
  -- `authenticated` unless the migration revokes them (found 2026-09-30).
  for rel in
    select role_name, string_agg(p, ',' order by p) as privileges
      from unnest(array['authenticated', 'anon', 'service_role']) as role_name
      cross join unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as p
     where has_table_privilege(role_name, 'public.resume_version', p)
     group by role_name
  loop
    return next 'AC-11 ' || rel.role_name || ' holds: ' || rel.privileges
                || case when rel.role_name = 'authenticated' and rel.privileges = 'INSERT,SELECT'
                        then '   pass' else '   FAIL' end;
  end loop;

  select string_agg(r, ',') into held
    from unnest(array['anon', 'service_role']) as r
   where exists (
     select 1 from unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) as p
      where has_table_privilege(r, 'public.resume_version', p));
  return next 'AC-11 anon and service_role hold nothing: '
              || coalesce('FAIL, held by ' || held, 'pass');

  -- =========================================================================
  -- Setup: the throwaway user and profile every successful write uses.
  -- =========================================================================
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', u_tmp, 'authenticated', 'authenticated',
    'resume-sweep-throwaway@example.test', '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  );
  insert into public.profile (id, full_name) values (u_tmp, 'Sweep Throwaway');

  -- =========================================================================
  -- Writes as the throwaway user, through the same role and claim the app uses.
  -- =========================================================================
  perform pg_temp.become(u_tmp);

  return next pg_temp.allowed('insert version 1 as its owner',
    format('insert into public.resume_version (profile_id, version_number, content) values (%L, 1, %L)',
           u_tmp, '# Version one'));

  return next pg_temp.refused_with('AC-9 duplicate (profile_id, version_number) refused',
    format('insert into public.resume_version (profile_id, version_number, content) values (%L, 1, %L)',
           u_tmp, '# A racing second save'), '23505');

  return next pg_temp.refused_with('AC-11 update refused by the missing grant',
    format('update public.resume_version set content = %L where profile_id = %L', '# Changed', u_tmp),
    '42501');

  return next pg_temp.refused_with('AC-11 delete refused by the missing grant',
    format('delete from public.resume_version where profile_id = %L', u_tmp), '42501');

  -- NEVER EXECUTED WHEN THE PRIVILEGE IS HELD. Truncate ignores row level
  -- security, so on a project where the grant had come back, running it would
  -- empty every user's resume history. Proved locally on 2026-10-01: with the
  -- grant restored on purpose, an unguarded version of this line emptied the
  -- table. The privilege check above already reports that case as a FAIL.
  if has_table_privilege('authenticated', 'public.resume_version', 'TRUNCATE') then
    return next 'FAIL  AC-11 truncate is granted, so it was not attempted';
  else
    return next pg_temp.refused_with('AC-11 truncate refused by the missing grant',
      'truncate public.resume_version', '42501');
  end if;

  return next pg_temp.refused_with('AC-3 blank content refused by the check',
    format('insert into public.resume_version (profile_id, version_number, content) values (%L, 2, %L)',
           u_tmp, '   '), '23514');

  return next pg_temp.refused_with('AC-3 content over 20000 characters refused by the check',
    format('insert into public.resume_version (profile_id, version_number, content) values (%L, 2, repeat(%L, 20001))',
           u_tmp, 'x'), '23514');

  return next pg_temp.refused_with('version number 0 refused by the check',
    format('insert into public.resume_version (profile_id, version_number, content) values (%L, 0, %L)',
           u_tmp, '# Zero'), '23514');

  return next pg_temp.allowed('insert version 2 as its owner',
    format('insert into public.resume_version (profile_id, version_number, content) values (%L, 2, %L)',
           u_tmp, '# Version two'));

  select count(*) into n from public.resume_version where profile_id = u_tmp;
  return next 'AC-4  versions the owner can read (expect 2): ' || n::text
              || case when n = 2 then '   pass' else '   FAIL' end;

  perform pg_temp.become_owner();

  select count(*) into n from public.resume_version
   where profile_id = u_tmp and content in ('# Version one', '# Version two');
  return next 'AC-4  both rows unchanged after the refused update (expect 2): ' || n::text
              || case when n = 2 then '   pass' else '   FAIL' end;

  -- =========================================================================
  -- AC-11 cascade: deleting the user deletes the profile and every version.
  -- =========================================================================
  delete from auth.users where id = u_tmp;

  select count(*) into n from public.resume_version where profile_id = u_tmp;
  return next 'AC-11 resume rows after deleting the user (expect 0): ' || n::text
              || case when n = 0 then '   pass' else '   FAIL' end;

  -- =========================================================================
  -- Cleanup confirmation.
  -- =========================================================================
  select count(*) into n from auth.users where id = u_tmp;
  return next 'clean throwaway auth rows left (expect 0): ' || n::text
              || case when n = 0 then '   pass' else '   FAIL' end;

  select count(*) into n from public.resume_version;
  return next 'clean resume_version rows after (expect ' || rows_before::text || '): ' || n::text
              || case when n = rows_before then '   pass' else '   FAIL' end;
end;
$$;

-- The one statement whose result the editor shows.
select * from pg_temp.sweep();
