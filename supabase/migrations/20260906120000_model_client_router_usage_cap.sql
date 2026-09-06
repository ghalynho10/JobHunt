-- Spec 0012 (model client router), AC-8: the six usage_cap seed rows this
-- feature's two tiers need before either can be called. `check_usage_gate`
-- treats a call_type missing any one of its three required rows the same as
-- a call_type with none at all, so both tiers get all three together.
--
-- Values are job_search's own cadence numbers (25 / 66 / 2000 searches)
-- multiplied by RESULTS_PER_PAGE (src/features/search/adzuna.ts:36, = 20),
-- because each usage_cap row counts gated calls and this feature's call shape
-- is one ai_scoring call per listing, not one per search (spec 0012's
-- rationale, "Budget derivation"). ai_check mirrors ai_scoring at its own
-- sample rate of 1.0.
insert into public.usage_cap (call_type, scope, period, cap_value) values
  ('ai_scoring', 'account', 'week', 500),
  ('ai_scoring', 'global', 'day', 1320),
  ('ai_scoring', 'global', 'month', 40000),
  ('ai_check', 'account', 'week', 500),
  ('ai_check', 'global', 'day', 1320),
  ('ai_check', 'global', 'month', 40000);
