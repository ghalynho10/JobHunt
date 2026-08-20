-- Local development seed. Runs on `pnpm db:reset`, never against a real project.
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
  );

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
  );

-- One row each. Signed in as dev-one you must see only the first, and signing in
-- as dev-two must change what the page shows. If both users see the same note,
-- the policy is not doing its job and the scaffold has proved nothing.
insert into public.scaffold_check (user_id, note)
values
  (
    '11111111-1111-1111-1111-111111111111',
    'Row belonging to dev-one. Read through the real server client, under a real policy.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'Row belonging to dev-two. If dev-one can see this line, row level security is broken.'
  );
