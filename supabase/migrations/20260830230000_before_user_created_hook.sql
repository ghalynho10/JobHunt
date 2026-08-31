-- Spec 0007: one person, one account, per verified email (invariant 2).
--
-- ENFORCED IN THE DATABASE, NOT IN APPLICATION CODE, for the same reason spec
-- 0003 put every other rule here: the database is the only thing no feature can
-- forget to call. A caller that never checks still cannot create the second
-- empty account.
--
-- WHAT PROBLEM THIS SOLVES. Supabase links a new OAuth identity to an existing
-- user automatically when the email address matches AND is verified. When that
-- does not happen, GoTrue's default is to create a SECOND user with the same
-- email and no rows, and the person reads their own data as lost. That is a
-- silent failure, so this refuses the signup out loud instead (AC-9).
--
-- THIS ADDS NO TABLE AND NO COLUMN. Spec 0003's six tables already key off
-- `profile.id`, which is the `auth.users` id. The only new object is this one
-- function.
--
-- ROLLBACK IS ONE STEP: set `enabled = false` on the
-- `[auth.hook.before_user_created]` stanza in `supabase/config.toml`, and the
-- matching switch in each hosted dashboard. A broken hook stops new signups
-- while existing users keep signing in, so the failure is loud, noticed on the
-- first attempt, and reversed without a migration.
--
-- DELIBERATELY NOT ADDED: a trigger on `auth.users` creating a `profile` row.
-- `profile.full_name` is `not null` with a non blank check, so a provider that
-- returned no name would make the trigger raise inside the signup transaction
-- and surface as an opaque "Database error saving new user". Profile creation
-- stays with feature 9, exactly as spec 0003's value sourcing table assigns it.

-- ---------------------------------------------------------------------------
-- The provider's display name
-- ---------------------------------------------------------------------------

-- Split out so the refusal message above stays readable, and `immutable` because
-- it is a pure mapping. `security invoker` and an empty search_path, matching
-- `public.set_updated_at()`: this one genuinely does nothing needing elevated
-- rights, which is exactly the distinction the hook's own comment draws.
--
-- The fallback returns the raw provider rather than a placeholder, so a provider
-- added later is named clumsily instead of anonymously.
create function public.provider_display_name(provider text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case provider
    when 'google' then 'Google'
    when 'github' then 'GitHub'
    when 'email' then 'an email address and password'
    else provider
  end;
$$;

-- ---------------------------------------------------------------------------
-- The refusal hook
-- ---------------------------------------------------------------------------

-- SECURITY CONTEXT IS NOT COPIED FROM `public.set_updated_at()` BESIDE IT, only
-- its discipline. That one is `security invoker` precisely because, as its own
-- comment says, it "does nothing that needs elevated rights". This one does: it
-- reads `auth.users` and `auth.identities`, which the calling role cannot.
--
-- `security definer` therefore, and on a definer function `set search_path = ''`
-- is not hygiene, it is the difference between a safe function and a privilege
-- escalation. Every name inside is fully qualified for that reason.
--
-- IT LIVES IN `public`, NOT `auth`, and `config.toml`'s commented template is
-- wrong twice over for this project: `before-user-created-hook` is not a legal
-- unquoted Postgres identifier, and `auth` is Supabase's own schema, changeable
-- by a platform upgrade. This project's migrations own `public`, where all six
-- tables and `public.set_updated_at()` already live. Do not copy the template.
create function public.before_user_created_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_email text;
  owning_provider text;
begin
  -- INTERNAL CONSISTENCY CHECK, AND IT IS LOAD BEARING (AC-10). Auth Hooks is a
  -- surface the vendor marks beta, so the payload shape is a real dependency
  -- rather than a given. A shape this function cannot read is an internal error,
  -- and an internal error must REFUSE, never allow: a hook that failed open
  -- would recreate exactly the silent empty account it exists to prevent.
  --
  -- The shape below was confirmed against the running local stack on
  -- 2026-08-30 rather than assumed: `event -> 'user' ->> 'email'` and
  -- `event -> 'user' -> 'app_metadata' ->> 'provider'`, with `identities` still
  -- empty because the user row does not exist yet.
  if pg_catalog.jsonb_typeof(event -> 'user') is distinct from 'object' then
    raise exception 'before_user_created_hook: event carries no user object';
  end if;

  -- `nullif` IS DELIBERATELY UNQUALIFIED while everything around it is not, and
  -- it is not an oversight to tidy up. NULLIF is a SQL construct like CASE and
  -- COALESCE, not a function in `pg_catalog`, so `pg_catalog.nullif(...)` does
  -- not resolve and the whole hook falls into its own exception handler. That
  -- happened once here, on 2026-08-30, and the symptom was every signup refused
  -- with the internal error message, which is the fail closed behaviour working
  -- and the hook being broken at the same time. Constructs are never resolved
  -- through `search_path`, so leaving it bare is safe under an empty one.
  candidate_email := pg_catalog.lower(
    nullif(pg_catalog.btrim(event -> 'user' ->> 'email'), '')
  );

  -- NO EMAIL IS TREATED AS AN INTERNAL ERROR, NOT AS "NOTHING TO CHECK", and
  -- that is a deliberate fail closed choice. Both providers carry
  -- `email_optional = false` on the local stack and in all four hosted provider
  -- dialogs (P4), so a signup reaching here without one cannot happen through a
  -- configured path. If it does, the one account rule cannot be evaluated at
  -- all, and this project prefers a loud total failure to a quiet wrong answer.
  if candidate_email is null then
    raise exception 'before_user_created_hook: event carries no email address';
  end if;

  -- WHY THIS READS A TABLE THAT MOVES UNDER IT. Verified 2026-08-30 (P7): when
  -- GoTrue makes an automatic link it "will remove any other unconfirmed
  -- identities linked to an existing user". So the very table queried here is
  -- rewritten by the linking path this hook does not run on, and a later signup
  -- reads rows an earlier link already pruned. The integration suite covers that
  -- interaction directly rather than testing this function against a clean
  -- fixture.
  --
  -- `auth.identities.email` is a stored generated column, `lower(identity_data
  -- ->> 'email')`, confirmed in the running database, so the comparison is
  -- already case folded on both sides.
  --
  -- Earliest identity wins, so the answer is deterministic when an email carries
  -- more than one (which means they are linked, and so belong to one person).
  select identity.provider
    into owning_provider
    from auth.identities as identity
   where identity.email = candidate_email
   order by identity.created_at asc
   limit 1;

  -- `auth.users` as well as `auth.identities`, because the two can disagree.
  -- An identity pruned by a link leaves the user row behind, and that user still
  -- owns the address.
  if owning_provider is null then
    select 'email'
      into owning_provider
      from auth.users as existing
     where pg_catalog.lower(existing.email) = candidate_email
     limit 1;
  end if;

  -- Nobody owns it. This is the ordinary first signup, and the overwhelmingly
  -- common path.
  if owning_provider is null then
    return '{}'::jsonb;
  end if;

  -- AC-9: refused with a named reason that says WHICH provider owns the address,
  -- because "that email is taken" on a product with exactly two sign in buttons
  -- tells the person nothing they can act on.
  --
  -- 422 rather than 400: the request was well formed and this is a rule refusing
  -- it. Confirmed on 2026-08-30 that GoTrue returns the status and this message
  -- verbatim to the caller.
  --
  -- THE OPENING PHRASE OF THIS MESSAGE IS A CONTRACT WITH THE APPLICATION, not
  -- just wording. `ACCOUNT_EXISTS_MARKER` in src/features/auth/callback.ts must
  -- stay byte for byte identical to 'That email address already signs in with '.
  --
  -- Why text and not a code: P10 was answered against the real local stack on
  -- 2026-08-30 by driving a full external handshake with this hook refusing.
  -- GoTrue forwards the refusal to the application's own callback as
  -- `?error=server_error&error_code=&error_description=<this message>`, and no
  -- user row is created. `error` is the generic value a real fault also uses and
  -- `error_code` arrives empty. Returning `error_code` or `code` inside this
  -- error object was tried; neither survives the redirect. The message is the
  -- only channel carrying anything specific.
  --
  -- Rewording this opening phrase without changing that constant would silently
  -- turn `account_exists` into `no_code` and show the wrong sentence. An
  -- integration test drives this function and feeds its real message through the
  -- real classifier so that fails loudly instead.
  return pg_catalog.jsonb_build_object(
    'error',
    pg_catalog.jsonb_build_object(
      'http_code', 422,
      'message',
      'That email address already signs in with '
        || public.provider_display_name(owning_provider)
        || '. Use that option instead and you will reach the same account.'
    )
  );

exception
  -- AC-10, THE HALF THAT IS EASY TO LEAVE OUT. This catches the hook's own
  -- internal error and still refuses, with its own distinct message so the two
  -- cases are told apart in the field rather than guessed at. Proved separately
  -- from the case the hook exists to catch, because a hook that failed open here
  -- would be indistinguishable from a working one until the day it mattered.
  when others then
    return pg_catalog.jsonb_build_object(
      'error',
      pg_catalog.jsonb_build_object(
        'http_code', 500,
        'message',
        'Sign in could not be completed because an account check failed. '
          || 'Nothing was created. Please try again shortly.'
      )
    );
end;
$$;

comment on function public.before_user_created_hook(jsonb) is
  'Spec 0007 invariant 2: refuses a second unlinked account for an email that '
  'already belongs to an identity, and refuses on its own internal error too '
  'rather than failing open. security definer because it reads auth.users and '
  'auth.identities, which the calling role cannot.';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- WRITTEN OUT RATHER THAN INHERITED. `create function` grants EXECUTE to PUBLIC
-- by default, and a `security definer` function reachable by the wrong role is a
-- different risk class from the invoker function beside it. So the default is
-- revoked and exactly one role is granted: `supabase_auth_admin`, which is the
-- role GoTrue connects as, confirmed in the running database rather than assumed.
revoke execute on function public.before_user_created_hook(jsonb) from public;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;

-- The helper gets NO grant at all, only the revoke, and that is not an omission.
-- It is called from inside the `security definer` function above, where the
-- effective user is the owner rather than the caller, so the nested call is
-- checked against the owner. Granting it to `supabase_auth_admin` as well would
-- widen the surface for nothing.
revoke execute on function public.provider_display_name(text) from public;
