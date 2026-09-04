-- Spec 0011: the per account and app wide budget on outside job search calls,
-- checked atomically so a burst cannot slip past, plus this project's first
-- failure rate alert (spec 0001 binding rule 4).
--
-- TWO TABLES. `usage_cap` is the configuration, editable with no deploy, the
-- same operating model as feature 3's `app_settings`. `usage_gate_counter`
-- holds the atomic, always incrementing counters. Neither carries a policy:
-- only `public.check_usage_gate()` below reads or writes them, which is what
-- makes the atomicity guarantee possible in the first place. A caller that
-- reached these tables directly could not see or change three windows in one
-- transaction the way this function does.
--
-- THE KILL SWITCH ITSELF IS NOT TOUCHED HERE. `checkUsageGate()` in
-- `src/lib/usage-gating/gate.ts` calls `readKillSwitch()` first, as a
-- separate step, and only reaches this function once that read succeeds and
-- reports the switch off (spec 0011, Option 1). `app_settings` keeps exactly
-- one reader, per spec 0002 binding rule 4.

-- ---------------------------------------------------------------------------
-- usage_cap: configuration, admin editable with no deploy
-- ---------------------------------------------------------------------------

create table public.usage_cap (
  -- Free text, not a fixed database enum: a new call type (feature 13, 14's
  -- model calls) is one inserted row, never a migration.
  call_type text not null,
  scope text not null check (scope in ('account', 'global')),
  period text not null check (period in ('day', 'week', 'month')),
  -- Zero is allowed on purpose: it refuses every call of that type outright, a
  -- per call type kill switch distinct from feature 3's app wide one. The
  -- upper bound is a sanity ceiling, not a real limit anyone expects to reach.
  cap_value integer not null check (cap_value >= 0 and cap_value <= 100000),
  updated_at timestamptz not null default now(),
  primary key (call_type, scope, period)
);

create trigger usage_cap_set_updated_at
  before update on public.usage_cap
  for each row
  execute function public.set_updated_at();

-- Seed rows for job_search (spec 0011, Feature design). All three are
-- required together: `check_usage_gate` treats a `call_type` missing any one
-- of its three rows the same as a `call_type` with none at all.
insert into public.usage_cap (call_type, scope, period, cap_value) values
  ('job_search', 'account', 'week', 25),
  ('job_search', 'global', 'day', 66),
  ('job_search', 'global', 'month', 2000);

-- ---------------------------------------------------------------------------
-- usage_gate_counter: the atomic counters
-- ---------------------------------------------------------------------------

create table public.usage_gate_counter (
  id uuid primary key default gen_random_uuid(),
  call_type text not null,
  scope text not null check (scope in ('account', 'global')),
  -- An account row always names its owner and a global row never does. `on
  -- delete cascade`: deleting an account (feature 31, not yet built) resets
  -- that person's own weekly cap early, an accepted, bounded edge case (spec
  -- 0011, Consequences).
  profile_id uuid references public.profile (id) on delete cascade,
  period text not null check (period in ('day', 'week', 'month')),
  -- The window's start, computed in UTC inside `check_usage_gate`, never left
  -- to the session's own time zone setting. A new window is a new row, never
  -- a mutation of the old one, so the counters reset by construction.
  period_start date not null,
  -- Incremented unconditionally by the gate function, on every call that
  -- reaches it, whether allowed or refused (AC-9).
  attempt_count integer not null default 0 check (attempt_count >= 0),
  -- Incremented only when the call is allowed; compared against
  -- `usage_cap.cap_value`.
  consumed_count integer not null default 0 check (consumed_count >= 0),
  updated_at timestamptz not null default now(),
  constraint usage_gate_counter_account_scope_has_profile
    check ((scope = 'account') = (profile_id is not null))
);

-- Two partial unique indexes, since a plain unique constraint over a nullable
-- `profile_id` would let two `global` rows exist for one window (SQL treats
-- `null` as distinct from `null`). Every `ON CONFLICT` clause below repeats
-- the matching `where`, or Postgres refuses the statement outright.
create unique index usage_gate_counter_account_window_idx
  on public.usage_gate_counter (call_type, profile_id, period, period_start)
  where scope = 'account';

create unique index usage_gate_counter_global_window_idx
  on public.usage_gate_counter (call_type, period, period_start)
  where scope = 'global';

create trigger usage_gate_counter_set_updated_at
  before update on public.usage_gate_counter
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- check_usage_gate: the one atomic decision
-- ---------------------------------------------------------------------------

-- `security definer` because it writes `global` scope rows no authenticated
-- caller could write under row level security, matching
-- `before_user_created_hook`'s own precedent. `set search_path = ''` is not
-- hygiene on a definer function, it is the difference between a safe function
-- and a privilege escalation, so every name inside is fully qualified.
--
-- NEVER RAISES TO SIGNAL A NORMAL OUTCOME. A Postgres exception surfaced
-- through `.rpc()` arrives at the Supabase client as `{ data: null, error }`,
-- not a thrown exception, and would pass straight through `attempt()` as an
-- unparsed success (the same trap `readKillSwitch()`'s own comments
-- document). `configured` is an ordinary output column instead.
--
-- FIXED LOCK ORDER: global day, then global month, then account week, on
-- every call, regardless of which windows end up over cap. Two concurrent
-- calls therefore always request the same two locks in the same order, which
-- is what avoids a deadlock between them. Refusal precedence is unrelated and
-- decided afterward, purely by which window's cap holds first (AC-3).
create function public.check_usage_gate(p_call_type text)
returns table (configured boolean, allowed boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  v_day_start date := (pg_catalog.now() at time zone 'utc')::date;
  v_week_start date := pg_catalog.date_trunc(
    'week', pg_catalog.now() at time zone 'utc'
  )::date;
  v_month_start date := pg_catalog.date_trunc(
    'month', pg_catalog.now() at time zone 'utc'
  )::date;
  v_global_day_consumed integer;
  v_global_month_consumed integer;
  v_account_week_consumed integer;
  v_global_day_cap integer;
  v_global_month_cap integer;
  v_account_week_cap integer;
  v_allowed boolean;
  v_reason text;
begin
  -- UNCONDITIONAL ATTEMPT BUMP, BEFORE THE CONFIGURATION IS EVEN CHECKED
  -- (AC-9, AC-6). This is also what takes the row locks. The upsert on a
  -- fresh window inserts the row into existence rather than requiring it to
  -- pre-exist.
  insert into public.usage_gate_counter
    (call_type, scope, profile_id, period, period_start, attempt_count)
  values (p_call_type, 'global', null, 'day', v_day_start, 1)
  on conflict (call_type, period, period_start) where scope = 'global'
  do update set attempt_count = public.usage_gate_counter.attempt_count + 1
  returning consumed_count into v_global_day_consumed;

  insert into public.usage_gate_counter
    (call_type, scope, profile_id, period, period_start, attempt_count)
  values (p_call_type, 'global', null, 'month', v_month_start, 1)
  on conflict (call_type, period, period_start) where scope = 'global'
  do update set attempt_count = public.usage_gate_counter.attempt_count + 1
  returning consumed_count into v_global_month_consumed;

  insert into public.usage_gate_counter
    (call_type, scope, profile_id, period, period_start, attempt_count)
  values (p_call_type, 'account', v_account_id, 'week', v_week_start, 1)
  on conflict (call_type, profile_id, period, period_start)
    where scope = 'account'
  do update set attempt_count = public.usage_gate_counter.attempt_count + 1
  returning consumed_count into v_account_week_consumed;

  -- CONFIGURATION CHECK. A `call_type` missing any one of its three required
  -- rows is treated the same as one with none at all (AC-6). The attempt
  -- above already counted; `allowed`/`reason` carry no meaning below.
  select cap.cap_value into v_global_day_cap
    from public.usage_cap as cap
   where cap.call_type = p_call_type and cap.scope = 'global'
     and cap.period = 'day';

  select cap.cap_value into v_global_month_cap
    from public.usage_cap as cap
   where cap.call_type = p_call_type and cap.scope = 'global'
     and cap.period = 'month';

  select cap.cap_value into v_account_week_cap
    from public.usage_cap as cap
   where cap.call_type = p_call_type and cap.scope = 'account'
     and cap.period = 'week';

  if v_global_day_cap is null
     or v_global_month_cap is null
     or v_account_week_cap is null then
    return query select false, null::boolean, null::text;
    return;
  end if;

  -- PRECEDENCE: the caller's own window before either app wide window
  -- (AC-3), because that is the one the person can act on themselves. Ties
  -- between the two app wide windows resolve day before month, the order
  -- AC-3's own closed set lists them in.
  if v_account_week_consumed >= v_account_week_cap then
    v_allowed := false;
    v_reason := 'account_week_cap_reached';
  elsif v_global_day_consumed >= v_global_day_cap then
    v_allowed := false;
    v_reason := 'global_day_cap_reached';
  elsif v_global_month_consumed >= v_global_month_cap then
    v_allowed := false;
    v_reason := 'global_month_cap_reached';
  else
    v_allowed := true;
    v_reason := null;
  end if;

  -- A refusal consumes no budget in any window it was checked against
  -- (AC-2). Only an allowed call bumps `consumed_count`, on all three rows.
  if v_allowed then
    update public.usage_gate_counter
       set consumed_count = consumed_count + 1
     where call_type = p_call_type and scope = 'global' and period = 'day'
       and period_start = v_day_start;

    update public.usage_gate_counter
       set consumed_count = consumed_count + 1
     where call_type = p_call_type and scope = 'global' and period = 'month'
       and period_start = v_month_start;

    update public.usage_gate_counter
       set consumed_count = consumed_count + 1
     where call_type = p_call_type and scope = 'account'
       and profile_id = v_account_id and period = 'week'
       and period_start = v_week_start;
  end if;

  return query select true, v_allowed, v_reason;
end;
$$;

comment on function public.check_usage_gate(text) is
  'Spec 0011: the one atomic decision behind the usage gate. Checks and '
  'updates the account weekly, global daily and global monthly windows for '
  'one call_type together, in one transaction. security definer because it '
  'writes global scope rows no authenticated caller could write under row '
  'level security.';

-- WRITTEN OUT RATHER THAN INHERITED. `create function` grants EXECUTE to
-- PUBLIC by default, and a `security definer` function reachable by the
-- wrong role is a different risk class from an invoker function.
revoke execute on function public.check_usage_gate(text) from public;
grant execute on function public.check_usage_gate(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: nothing reaches these tables except the function above
-- ---------------------------------------------------------------------------

-- `usage_cap`: no `anon`/`authenticated` privilege at all. `service_role`
-- gets `select` only, for dashboard debugging without a direct database
-- connection; nothing writes it through the Data API, ever.
revoke all on public.usage_cap from anon, authenticated;
grant select on public.usage_cap to service_role;

-- `usage_gate_counter`: no grant to any Data API role, not even
-- `service_role`. The `security definer` function above is the only reader
-- and writer, by construction rather than by an easily forgotten check.
revoke all on public.usage_gate_counter from anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row level security: enabled and forced on both, no policy on either
-- ---------------------------------------------------------------------------

-- `enable` turns policies on; `force` applies them to the table owner too, so
-- a bug running as the owner cannot quietly read or change everything. No
-- policy exists on either table, so row level security denies every role
-- that respects it, which is every role except the one carrying BYPASSRLS
-- that `check_usage_gate` itself runs as.
alter table public.usage_cap enable row level security;
alter table public.usage_cap force row level security;
alter table public.usage_gate_counter enable row level security;
alter table public.usage_gate_counter force row level security;
