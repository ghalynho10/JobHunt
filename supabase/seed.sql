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
-- THREE users from spec 0003. The third carries an auth row and an identity but
-- deliberately NO profile row, because AC-14 requires that a signed in user with
-- no profile sees a visible expected failure naming the missing profile rather
-- than an empty page. Proving that needs a real user who genuinely has no
-- profile; a user who merely has not been looked at yet would not prove it.
--
-- Standing rule from the scope: fixtures never carry real personal data. These
-- identifiers are obviously fake and the addresses use the reserved `.test`
-- domain, which can never resolve to a real mailbox.

-- Password for both: devpassword123
-- Sign in at /sign-in. Development only, hard blocked anywhere else.
--
-- KNOWN AND DELIBERATELY LEFT: the two user ids below (`1111…`, `2222…`) are not
-- valid UUIDs by RFC version and variant, so `z.uuid()` rejects them, the same
-- way it rejected the scaffold row ids until they were fixed. They are not
-- changed here because these users already exist on the hosted development
-- project and changing an id would insert a second pair rather than rename the
-- first. Feature 8 owns the fixture pool and should mint valid identifiers when
-- it replaces this (spec 0003 follow-up).
--
-- SPEC 0003 MADE THIS REACH THE APPLICATION: `profile.id` IS the auth user id,
-- and `readOwnProfile()` parses the row it reads. That parse therefore uses
-- `z.guid()`, which checks the real 8-4-4-4-12 shape without the RFC version and
-- variant nibbles these two ids violate. See the note in
-- `src/features/profile/queries.ts`. The third user below is newly minted here
-- and IS a valid version 4 UUID, so it is already what feature 8 should mint.

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
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    -- A real version 4 UUID, unlike the two above: the `4` and the `8` are the
    -- version and variant nibbles. This id is minted here for the first time, so
    -- there is no hosted row to collide with and no reason to repeat the earlier
    -- mistake.
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'dev-three@example.test',
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
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '33333333-3333-4333-8333-333333333333',
    '{"sub":"33333333-3333-4333-8333-333333333333","email":"dev-three@example.test","email_verified":true,"phone_verified":false}'::jsonb,
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

-- SPEC 0003: the real profile fixture, which replaces the scaffold rows above.
--
-- The scaffold rows deliberately stay for now. This seed has to keep the current
-- health page working right up until the deploy that repoints it lands, and the
-- table they live in is dropped in a later pull request, after production is
-- confirmed serving the new read (spec 0002 invariant 1, spec 0003 AC-16).
--
-- No `updated_at` is set anywhere below. Invariant 10: application code, and a
-- fixture, never write that column. The default and the trigger own it.

-- DEV-THREE MUST HAVE NO PROFILE ROW, and this delete is what keeps that true.
--
-- It is the fixture AC-14's missing profile path is proved against, and this
-- file runs against a shared development project that is never wiped. Without
-- the delete, one person creating a profile for this user by hand would quietly
-- destroy the fixture, and the next run of AC-14 would pass for the wrong
-- reason: a page showing a profile instead of the expected failure. Scoped to
-- the one synthetic user by id, so it can never touch anything else. The cascade
-- takes any subtree with it.
delete from public.profile
where id = '33333333-3333-4333-8333-333333333333';

-- One profile each for the other two. Same claim as the scaffold rows made, now
-- against the real table: signed in as dev-one you must see only the first, and
-- signing in as dev-two must change what the page shows.
--
-- Obviously fake, and holding no real personal data, per the standing rule. They
-- are subject to exactly the same check constraints a real write is, so a
-- fixture that the database would refuse fails here rather than in production.
--
-- Fully idempotent without a self healing delete: the primary key IS the auth
-- user id, so a re-run can only ever collide with the same single row rather
-- than accumulate a second one.
insert into public.profile (id, full_name, location, summary)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Dev One',
    'Remote, Test Country',
    'Synthetic fixture profile for dev-one. Read through the real server client, under a real policy.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Dev Two',
    'Also Remote, Test Country',
    'Synthetic fixture profile for dev-two. If dev-one can see this line, row level security is broken.'
  )
on conflict (id) do nothing;
