-- The scaffold fixture. Runs locally on `pnpm db:reset`, and against the hosted
-- DEVELOPMENT project only, from the db-migrate workflow on every pull request.
-- It never reaches production, which carries no fake users and no scaffold row.
--
-- Production has no sign in path at all until feature 7, so the end to end
-- thread is proved on a preview against the development project. Creating fake
-- users in production to prove it there would be a worse outcome than the
-- problem it solves (spec 0002, "How the scaffold fixture reaches a hosted
-- project").
--
-- EVERY STATEMENT HERE IS IDEMPOTENT, because the workflow re-runs this file on
-- every pull request against a database that is not wiped first. That is why the
-- rows carry fixed identifiers rather than generated ones: a generated key would
-- make each run insert another copy, and `on conflict` would have nothing to
-- match on.
--
-- Two users, not one, on purpose. One user proves a row can be read. Two users
-- prove the row level security policy actually confines each of them, which is
-- the claim spec 0001 rests the whole isolation guarantee on. A seed with a
-- single user would let a completely broken policy still look like it worked.
--
-- Standing rule from the scope: fixtures never carry real personal data. These
-- identifiers are obviously fake and the addresses use the reserved `.test`
-- domain, which can never resolve to a real mailbox.

-- Password for both: devpassword123
-- Sign in at /sign-in. Development only, hard blocked anywhere else.
--
-- KNOWN AND DELIBERATELY LEFT: the two user ids below (`1111…`, `2222…`) are not
-- valid UUIDs by RFC version and variant, so `z.uuid()` rejects them, the same
-- way it rejected the scaffold row ids until they were fixed. Nothing parses a
-- user id today, so nothing is broken. They are not changed here because these
-- users already exist on the hosted development project and changing an id would
-- insert a second pair rather than rename the first. Feature 8 owns the fixture
-- pool and should mint valid identifiers when it replaces this.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  -- These columns are nullable in the schema but the Auth service reads them
  -- into plain strings, so a NULL makes every sign in fail with a 500 rather
  -- than a wrong password error. Empty string is what the service writes itself.
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone_change,
  phone_change_token,
  reauthentication_token
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-1111-1111-111111111111',
    'authenticated',
    'authenticated',
    'dev-one@example.test',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-2222-2222-222222222222',
    'authenticated',
    'authenticated',
    'dev-two@example.test',
    extensions.crypt('devpassword123', extensions.gen_salt('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', '', '', '', '', ''
  )
on conflict (id) do nothing;

-- GoTrue resolves a password sign in through the identity record, not through
-- `auth.users` alone, so a user seeded without one cannot sign in.
insert into auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
values
  (
    '11111111-1111-1111-1111-111111111111',
    '11111111-1111-1111-1111-111111111111',
    '{"sub":"11111111-1111-1111-1111-111111111111","email":"dev-one@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222',
    '{"sub":"22222222-2222-2222-2222-222222222222","email":"dev-two@example.test","email_verified":true,"phone_verified":false}'::jsonb,
    'email',
    now(),
    now(),
    now()
  )
-- Matching the `identities_provider_id_provider_unique` constraint, since the
-- generated primary key would differ on every run and infer nothing.
on conflict (provider_id, provider) do nothing;

-- One row each. Signed in as dev-one you must see only the first, and signing in
-- as dev-two must change what the page shows. If both users see the same note,
-- the policy is not doing its job and the scaffold has proved nothing.
--
-- The identifiers are fixed rather than generated so a re-run collides instead
-- of accumulating a third and fourth row, which would break exactly the claim
-- this fixture exists to make.
--
-- THEY ARE ALSO REAL VERSION 4 UUIDs, and that is not decoration. Postgres will
-- accept any hex in the right shape into a `uuid` column, but Zod 4's `z.uuid()`
-- checks the RFC version and variant nibbles, so the `4` and the `8` below are
-- load bearing. An earlier version of this file used `aaaaaaaa-aaaa-aaaa-…`,
-- which Postgres stored happily and the application then refused to parse,
-- rendering `response_malformed` on a deployed page. A fixture that the real
-- code cannot read proves nothing. Any identifier invented by hand for this
-- project has to survive `z.uuid()`, not just `::uuid`.
--
-- Self healing, deliberately: this file runs against a shared development
-- project that is never wiped, so it removes any stale fixture row for these two
-- users before inserting. The delete is scoped to the two synthetic users by id
-- and can never touch anything else.
delete from public.scaffold_check
where user_id in (
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222'
  )
  and id not in (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );

insert into public.scaffold_check (id, user_id, note)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'Row belonging to dev-one. Read through the real server client, under a real policy.'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '22222222-2222-2222-2222-222222222222',
    'Row belonging to dev-two. If dev-one can see this line, row level security is broken.'
  )
on conflict (id) do nothing;
