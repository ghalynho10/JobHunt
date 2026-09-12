-- Spec 0020: the strictly read only counterpart to `check_usage_gate`, so a
-- signed in caller can see their own `job_search` usage against their account
-- week cap before a refusal ever surprises them.
--
-- WHY A SECOND FUNCTION RATHER THAN A GRANT. `usage_gate_counter` has no grant
-- to any Data API role and no policy, and `usage_cap` has `select` for
-- `service_role` alone (spec 0011). That is the property this migration keeps:
-- it adds no grant to either table, so both stay reachable only through a
-- `security definer` function, by construction rather than by a check somebody
-- has to remember. The new function reads them through its own definer
-- privilege.
--
-- IT TAKES NO PARAMETER, ON PURPOSE (spec 0020, Decision). A `p_call_type`
-- parameter would let any signed in caller read `usage_cap` and the
-- `configured` state for a call type this feature never shows, which is a
-- wider readable surface than the unchanged table grants suggest. Showing a
-- second call type later is a spec change, not something a caller can reach
-- by passing a different string.
--
-- IT IS READ ONLY, AND THAT IS THE DIFFERENCE FROM `check_usage_gate`. There
-- is no `insert`, `update` or `delete` anywhere in this body. The gate upserts
-- window rows into existence as part of deciding; a caller merely looking at
-- their own number must never create one, or a bare `/search` visit would
-- start writing counter rows for somebody who has not searched (AC-3).

create function public.get_job_search_usage_summary()
returns table (
  configured boolean,
  consumed_count integer,
  cap_value integer,
  period_start date
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  -- AC-4: THE IDENTICAL EXPRESSION `check_usage_gate` USES, character for
  -- character, and schema qualified for the same reason (`search_path = ''`).
  -- If these two ever diverge, the number shown and the number enforced
  -- disagree at a week boundary, which is the one moment a usage display is
  -- most likely to be read.
  v_week_start date := pg_catalog.date_trunc(
    'week', pg_catalog.now() at time zone 'utc'
  )::date;
  v_global_day_cap integer;
  v_global_month_cap integer;
  v_account_week_cap integer;
  v_consumed integer;
begin
  -- THE SAME ALL OR NOTHING CONFIGURATION RULE `check_usage_gate` APPLIES, and
  -- in one statement for the same reason: three separate `select`s each take
  -- their own snapshot under `read committed`, so a concurrent admin edit to
  -- `usage_cap` could be seen half applied. Only the account week value is
  -- ever returned, but a `job_search` missing either global row is a call type
  -- the gate itself would refuse to decide, and reporting a cheerful "18 of
  -- 25" beside a gate that is about to fail closed would be the default that
  -- reads like success.
  select
    pg_catalog.max(cap.cap_value) filter (
      where cap.scope = 'global' and cap.period = 'day'
    ),
    pg_catalog.max(cap.cap_value) filter (
      where cap.scope = 'global' and cap.period = 'month'
    ),
    pg_catalog.max(cap.cap_value) filter (
      where cap.scope = 'account' and cap.period = 'week'
    )
    into v_global_day_cap, v_global_month_cap, v_account_week_cap
    from public.usage_cap as cap
   where cap.call_type = 'job_search';

  if v_global_day_cap is null
     or v_global_month_cap is null
     or v_account_week_cap is null then
    -- NEVER RAISES TO SIGNAL A NORMAL OUTCOME, matching `check_usage_gate`: a
    -- Postgres exception arrives at the Supabase client as `{ data: null,
    -- error }` and would pass straight through `attempt()` as an unparsed
    -- success. `configured` is an ordinary output column instead.
    return query select false, null::integer, null::integer, null::date;
    return;
  end if;

  -- AC-2: `consumed_count`, NEVER `attempt_count`. The attempt counter also
  -- counts refused attempts, which spent no budget, so showing it would
  -- overstate how much of the cap is actually gone.
  --
  -- AC-3: NO ROW YET IS AN ORDINARY OUTCOME, NOT AN ERROR AND NOT AN INSERT.
  -- Nobody has searched this week, so `v_consumed` stays null and the caller
  -- is told zero. Every column below is qualified by the table alias because
  -- three of them share a name with this function's own `returns table`
  -- outputs, which would otherwise be ambiguous inside plpgsql.
  select counter.consumed_count
    into v_consumed
    from public.usage_gate_counter as counter
   where counter.call_type = 'job_search'
     and counter.scope = 'account'
     and counter.profile_id = v_account_id
     and counter.period = 'week'
     and counter.period_start = v_week_start;

  return query select
    true,
    coalesce(v_consumed, 0),
    v_account_week_cap,
    v_week_start;
end;
$$;

comment on function public.get_job_search_usage_summary() is
  'Spec 0020: the caller''s own job_search usage for the current account week, '
  'read only. Derives the account from auth.uid() internally and computes '
  'period_start with the identical expression check_usage_gate uses, so the '
  'number shown and the number enforced cannot disagree. security definer '
  'because usage_cap and usage_gate_counter carry no grant reachable from the '
  'Data API; this function adds none.';

-- WRITTEN OUT RATHER THAN INHERITED, the same reasoning `check_usage_gate`'s
-- own grants carry: `create function` grants EXECUTE to PUBLIC by default, and
-- a `security definer` function reachable by the wrong role is a different
-- risk class from an invoker function.
revoke execute on function public.get_job_search_usage_summary() from public;
grant execute on function public.get_job_search_usage_summary() to authenticated;

-- AC-8: NO NEW GRANT ON EITHER TABLE. Stated as an absence on purpose, so a
-- later reader of this migration can see that the omission was deliberate
-- rather than forgotten. `usage_gate_counter` keeps no Data API grant at all,
-- and `usage_cap` keeps its existing, unrelated `select` for `service_role`.
